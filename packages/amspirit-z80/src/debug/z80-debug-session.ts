import { existsSync, readFileSync } from "node:fs"
import { basename, dirname, isAbsolute, resolve } from "node:path"
import {
  type DisasmInstruction,
  decodeInstruction,
  type EmulatorClient,
  StopPoller,
} from "@amspirit/shared"
import {
  ContinuedEvent,
  InitializedEvent,
  LoggingDebugSession,
  Source,
  StackFrame,
  StoppedEvent,
  TerminatedEvent,
  Thread,
} from "@vscode/debugadapter"
import type { DebugProtocol } from "@vscode/debugprotocol"
import { type ReadMem, reconstructCallStack } from "../call-stack.js"
import { firmwareLabel } from "../firmware-labels.js"
import { launchEntryReached, stepSettled } from "../step-landing.js"
import { planStepOver, returnAddress } from "../step-targets.js"
import { parseSymbolMap } from "../symbol-map/parse-symbol-map.js"
import type { SymbolMap } from "../symbol-map/symbol-map.js"

const THREAD_ID = 1
/**
 * After a resume/step, ignore the emulator's `paused` flag briefly so we don't
 * read the stale pre-resume freeze (it applies pending actions a frame later).
 */
const STOP_SETTLE_MS = 150
/**
 * Max PC polls (~100 ms each) before a single step gives up waiting for the PC
 * to settle — covers instructions that don't move the PC (`jr $`, `HALT`).
 */
const STEP_SETTLE_MAX_POLLS = 30
/** Longest Z80 instruction is 4 bytes; read a small window to decode at PC. */
const MAX_INSTR_LEN = 4
/**
 * Upper bound on raw steps for the launch-entry first step. The dirty prefetch
 * latch lands the first one or two steps mid-instruction before the PC re-syncs;
 * a handful of steps always clears a 4-byte instruction. Caps a pathological
 * entry (e.g. `jr $`) instead of looping forever.
 */
const LAUNCH_ENTRY_MAX_STEPS = 8

interface Z80DebugConfig {
  program?: string
  mapFile?: string
  /** Assembled flat binary to load (defaults to `<program>.bin`). */
  binary?: string
  /** Address to load the binary at (defaults to the map's lowest address). */
  loadAddress?: number
  /** PC to jump to after loading (defaults to `loadAddress`). */
  entry?: number
  host?: string
  port?: number
  stopOnEntry?: boolean
}

/** Reads a file's text; injectable for testing the (otherwise pure) modules. */
export type FileReader = (path: string) => string
/** Reads a file's raw bytes; injectable for testing. */
export type BinaryReader = (path: string) => number[]

/**
 * A one-shot promise gate. `wait()` blocks until `open()`; once open it stays
 * open. Used to sequence the launch handshake (set breakpoints -> run).
 */
class Gate {
  private resolveFn: (() => void) | undefined
  readonly promise: Promise<void> = new Promise<void>((resolve) => {
    this.resolveFn = resolve
  })
  open(): void {
    this.resolveFn?.()
    this.resolveFn = undefined
  }
}

/**
 * Debug Adapter for Z80 assembler programs running in AMSpiriT. Thin imperative
 * shell: the source<->address mapping (`SymbolMap`), register formatting
 * (`buildRegisterScopes`), step-target maths (`step-targets`) and stop polling
 * (`StopPoller`) all live in pure, tested modules. The emulator has no push
 * channel, so resume/run-to are followed by a paused-state poll.
 *
 * Supports `attach` (to an already-running program) and `launch` (load the
 * assembled binary into RAM, arm breakpoints, then run it).
 */
export class Z80DebugSession extends LoggingDebugSession {
  private client: EmulatorClient | undefined
  private symbols: SymbolMap | undefined
  private programPath: string | undefined
  private poller: StopPoller | undefined
  /** Bumped by every monitor start; the launch-entry loop stops if superseded. */
  private monitorRun = 0
  private disposed = false
  private stopOnEntry = false
  /** True once running and a stop is expected (arms the persistent monitor). */
  private running = false
  /** Reason for the first stop ("entry" when stopping on entry). */
  private firstStopReason = "breakpoint"
  /**
   * Set after a launch stop-on-entry. The emulator leaves a pre-fetched exec
   * state at the entry, so the first *raw* step only advances one byte. Run to
   * the next instruction boundary for that first step instead. Cleared once any
   * execution resumes.
   */
  private atLaunchEntry = false
  /** One-shot breakpoint at the program entry (stop-on-entry), dropped after. */
  private entryAddr: number | undefined
  /** Last user breakpoint addresses; a temporary bp is merged then dropped. */
  private userBpAddrs: number[] = []
  /** Opens on `configurationDone`, gating the launch RUN until breakpoints are set. */
  private readonly configured = new Gate()

  constructor(
    private readonly createClient: (host: string, port: number) => EmulatorClient,
    private readonly readFile: FileReader = (p) => readFileSync(p, "utf-8"),
    private readonly fileExists: (p: string) => boolean = existsSync,
    private readonly readBinary: BinaryReader = (p) => Array.from(readFileSync(p)),
  ) {
    super("amspirit-z80-debug.log")
    this.setDebuggerLinesStartAt1(true)
    this.setDebuggerColumnsStartAt1(true)
  }

  protected override initializeRequest(response: DebugProtocol.InitializeResponse): void {
    response.body = response.body ?? {}
    response.body.supportsConfigurationDoneRequest = true
    response.body.supportsTerminateRequest = true
    response.body.supportsSteppingGranularity = true
    this.sendResponse(response)
    this.sendEvent(new InitializedEvent())
  }

  protected override async attachRequest(
    response: DebugProtocol.AttachResponse,
    args: DebugProtocol.AttachRequestArguments & Z80DebugConfig,
  ): Promise<void> {
    const host = args.host ?? "127.0.0.1"
    const port = args.port ?? 8765
    this.client = this.createClient(host, port)
    this.stopOnEntry = args.stopOnEntry === true
    if (args.program) this.programPath = args.program
    this.loadSymbols(args)

    if (this.stopOnEntry && this.client) {
      try {
        await this.client.setPaused(true)
      } catch {
        // best effort
      }
      this.sendEvent(new StoppedEvent("entry", THREAD_ID))
    } else {
      // The program is (or will be) running; arm a stop monitor at
      // configurationDone so a breakpoint the emulator hits on its own surfaces.
      this.running = true
    }
    this.sendResponse(response)
  }

  protected override async launchRequest(
    response: DebugProtocol.LaunchResponse,
    args: DebugProtocol.LaunchRequestArguments & Z80DebugConfig,
  ): Promise<void> {
    const host = args.host ?? "127.0.0.1"
    const port = args.port ?? 8765
    const client = this.createClient(host, port)
    this.client = client
    this.stopOnEntry = args.stopOnEntry === true
    if (args.program) this.programPath = args.program
    this.loadSymbols(args)

    const binaryPath = this.resolveBinaryPath(args)
    let bytes: number[] | undefined
    if (binaryPath) {
      try {
        bytes = this.readBinary(binaryPath)
      } catch {
        // No binary to load; fall through and just respond.
      }
    }
    if (bytes === undefined) {
      this.configured.open()
      this.sendResponse(response)
      return
    }

    const loadAddress = args.loadAddress ?? this.symbols?.lowestAddress() ?? 0
    const entry = args.entry ?? loadAddress
    if (this.stopOnEntry) {
      this.entryAddr = entry
      this.firstStopReason = "entry"
      this.atLaunchEntry = true
    }

    try {
      // Only RUN once VS Code has sent every breakpoint plus configurationDone,
      // so all breakpoints (incl. the one-shot entry bp) are armed before exec.
      await this.configured.promise
      await client.setZ80Breakpoints(this.bpAddrsToPost())
      await client.writeRam(loadAddress, bytes, { exec: true, entry })
      this.running = true
      this.monitorStop(this.firstStopReason, STOP_SETTLE_MS)
    } catch {
      // best effort; the session stays attached to current memory
    }
    this.sendResponse(response)
  }

  /** Explicit `binary`, else `<program-without-ext>.bin`. */
  private resolveBinaryPath(args: Z80DebugConfig): string | undefined {
    if (args.binary) return args.binary
    return args.program ? args.program.replace(/\.[^.]+$/, ".bin") : undefined
  }

  protected override configurationDoneRequest(
    response: DebugProtocol.ConfigurationDoneResponse,
    args: DebugProtocol.ConfigurationDoneArguments,
  ): void {
    super.configurationDoneRequest(response, args)
    // Release launchRequest to RUN now that all breakpoints have been sent.
    this.configured.open()
    // On attach the program is already running; arm the monitor so a breakpoint
    // the emulator hits on its own surfaces (no current line / stepping without).
    if (this.running) this.monitorStop(this.firstStopReason, 0)
  }

  /** Load the SLD symbol map from `mapFile`, or auto-detect next to `program`. */
  private loadSymbols(args: Z80DebugConfig): void {
    const mapPath = this.resolveMapPath(args)
    if (!mapPath) return
    try {
      this.symbols = parseSymbolMap(mapPath, this.readFile(mapPath))
    } catch {
      // No map: breakpoints stay unverified, frames fall back to addresses.
    }
  }

  /**
   * Explicit `mapFile`, else auto-detect next to `program`: the sjasmplus SLD
   * (`.sld`) or the rasm map (`.map`), with or without the source extension.
   */
  private resolveMapPath(args: Z80DebugConfig): string | undefined {
    if (args.mapFile) return args.mapFile
    const program = args.program
    if (!program) return undefined
    const stem = program.replace(/\.[^.]+$/, "")
    const candidates = [`${stem}.sld`, `${program}.sld`, `${stem}.map`, `${program}.map`]
    return candidates.find((p) => this.fileExists(p))
  }

  protected override threadsRequest(response: DebugProtocol.ThreadsResponse): void {
    response.body = { threads: [new Thread(THREAD_ID, "Z80")] }
    this.sendResponse(response)
  }

  protected override async setBreakPointsRequest(
    response: DebugProtocol.SetBreakpointsResponse,
    args: DebugProtocol.SetBreakpointsArguments,
  ): Promise<void> {
    const path = args.source.path
    if (path) this.programPath ??= path
    const requested = args.breakpoints ?? []

    const verified: DebugProtocol.Breakpoint[] = []
    const addrs: number[] = []
    for (const bp of requested) {
      const resolved = path && this.symbols ? this.symbols.lineToAddresses(path, bp.line) : []
      addrs.push(...resolved)
      verified.push({ verified: resolved.length > 0, line: bp.line })
    }
    this.userBpAddrs = dedupe(addrs)

    if (this.client) {
      try {
        await this.client.setZ80Breakpoints(this.bpAddrsToPost())
      } catch {
        // leave verification as computed; the emulator may be unreachable
      }
    }

    response.body = { breakpoints: verified }
    this.sendResponse(response)
  }

  /** User breakpoints plus the internal one-shot entry breakpoint (deduped). */
  private bpAddrsToPost(): number[] {
    if (this.entryAddr === undefined || this.userBpAddrs.includes(this.entryAddr)) {
      return this.userBpAddrs
    }
    return [...this.userBpAddrs, this.entryAddr]
  }

  /**
   * Drop the one-shot entry breakpoint after the entry stop, re-syncing the core
   * to just the user's breakpoints so it doesn't re-break at the entry address.
   */
  private consumeEntryBreakpoint(): void {
    if (this.entryAddr === undefined) return
    this.entryAddr = undefined
    this.firstStopReason = "breakpoint"
    const client = this.client
    if (client) void client.setZ80Breakpoints(this.userBpAddrs).catch(() => {})
  }

  protected override async stackTraceRequest(
    response: DebugProtocol.StackTraceResponse,
  ): Promise<void> {
    const frames: StackFrame[] = []
    const client = this.client
    if (client) {
      try {
        const regs = await client.getZ80()
        // Always surface the current line first. The call-stack reconstruction
        // below is best-effort (it reads a large memory snapshot); a failure
        // there must never drop this frame, or the current-line highlight blanks.
        frames.push(this.frameFor(0, regs.PC))
        try {
          // No frame pointers, so reconstruct the stack by scanning memory for
          // CALL/RST return addresses. Snapshot the CPU-visible 64 KB once and
          // read it synchronously (PC often sits in ROM).
          const snapshot = await client.readRam(0, 0x10000, { cpuView: true })
          const read: ReadMem = (addr, len) => {
            const out: number[] = []
            for (let i = 0; i < len; i++) out.push(snapshot[(addr + i) & 0xffff] ?? 0)
            return out
          }
          for (const frame of reconstructCallStack(regs.PC, regs.SP, read).slice(1)) {
            frames.push(this.frameFor(frames.length, frame.address))
          }
        } catch {
          // best-effort call stack; the current-line frame stands alone
        }
      } catch {
        // no registers -> no frame
      }
    }
    response.body = { stackFrames: frames, totalFrames: frames.length }
    this.sendResponse(response)
  }

  /**
   * A DAP frame for `addr`: a source line when the map knows it, else a CPC
   * firmware routine name when the address is a jumpblock entry, else the bare
   * hex address.
   */
  private frameFor(id: number, addr: number): StackFrame {
    const hex = `0x${addr.toString(16).toUpperCase().padStart(4, "0")}`
    const loc = this.symbols?.addressToLine(addr)
    const fw = firmwareLabel(addr)
    const frame = loc
      ? new StackFrame(id, hex, this.sourceFor(loc.file), loc.line, 1)
      : new StackFrame(id, fw ? `${fw} (${hex})` : hex)
    // Anchor VS Code's Disassembly View at this frame's address.
    frame.instructionPointerReference = hex
    return frame
  }

  /** Resolve an SLD source path (often relative) against the program directory. */
  private sourceFor(file: string): Source | undefined {
    if (isAbsolute(file)) return new Source(basename(file), file)
    const base = this.programPath ? dirname(this.programPath) : undefined
    const abs = base ? resolve(base, file) : file
    return new Source(basename(file), abs)
  }

  protected override async continueRequest(
    response: DebugProtocol.ContinueResponse,
  ): Promise<void> {
    this.atLaunchEntry = false
    if (this.client) {
      try {
        await this.client.setPaused(false)
      } catch {
        // best effort
      }
      this.sendEvent(new ContinuedEvent(THREAD_ID))
    }
    this.sendResponse(response)
    this.monitorStop("breakpoint", STOP_SETTLE_MS)
  }

  protected override async pauseRequest(response: DebugProtocol.PauseResponse): Promise<void> {
    this.poller?.cancel()
    if (this.client) {
      try {
        await this.client.setPaused(true)
      } catch {
        // best effort
      }
    }
    this.sendResponse(response)
    this.sendEvent(new StoppedEvent("pause", THREAD_ID))
  }

  protected override async stepInRequest(response: DebugProtocol.StepInResponse): Promise<void> {
    await this.stepOne(response)
  }

  protected override async nextRequest(response: DebugProtocol.NextResponse): Promise<void> {
    const client = this.client
    if (!client) {
      this.sendResponse(response)
      return
    }
    try {
      const instr = await this.decodeAtPc(client)
      const plan = instr ? planStepOver(instr) : { kind: "stepOne" as const }
      if (plan.kind === "runTo") {
        this.sendResponse(response)
        await this.runToTemp(plan.addr, "step")
        return
      }
    } catch {
      // fall through to a single step
    }
    await this.stepOne(response)
  }

  protected override async stepOutRequest(response: DebugProtocol.StepOutResponse): Promise<void> {
    const client = this.client
    if (client) {
      try {
        const sp = (await client.getZ80()).SP
        const ret = returnAddress(await client.readRam(sp, 2, { cpuView: true }))
        if (ret !== undefined) {
          this.sendResponse(response)
          await this.runToTemp(ret, "step")
          return
        }
      } catch {
        // fall through to a single step
      }
    }
    await this.stepOne(response)
  }

  /**
   * Execute exactly one instruction. The emulator stays paused and applies the
   * step a frame later, so we poll the PC until it settles at a new address
   * rather than trusting a fixed delay (which can read a mid-instruction PC).
   */
  private async stepOne(response: DebugProtocol.Response): Promise<void> {
    const client = this.client
    // First step after a launch stop-on-entry: the `exec` leaves a dirty prefetch
    // latch that lands the first raw step mid-instruction. Step (bounded) until
    // the PC clears the entry instruction, rather than a free-running temp
    // breakpoint — which escapes into firmware on the rare run where the latch
    // shifts boundaries so the temp address is never hit.
    if (this.atLaunchEntry && client) {
      this.atLaunchEntry = false
      try {
        const instr = await this.decodeAtPc(client)
        if (instr) {
          this.sendResponse(response)
          this.monitorLaunchEntry(client, instr.address, instr.bytes.length)
          return
        }
      } catch {
        // fall through to a raw step
      }
    }
    this.atLaunchEntry = false

    let prePc: number | undefined
    if (client) {
      try {
        prePc = (await client.getZ80()).PC
        await client.step()
      } catch {
        // ignore; the monitor below still reports the stop
      }
    }
    this.sendResponse(response)
    if (client && prePc !== undefined) this.monitorStepSettled(client, prePc)
    else this.monitorStop("step", STOP_SETTLE_MS)
  }

  /**
   * Poll the PC until the step has settled ({@link stepSettled}): moved off
   * `prePc` and stable across two polls. Falls back to reporting a stop after a
   * bounded number of attempts so a self-loop (`jr $`) or `HALT` still resolves.
   */
  private monitorStepSettled(client: EmulatorClient, prePc: number): void {
    this.poller?.cancel()
    this.monitorRun += 1
    let prevPc: number | undefined
    let attempts = 0
    const poller = new StopPoller(async () => {
      attempts += 1
      try {
        const pc = (await client.getZ80()).PC
        if (stepSettled(prePc, pc, prevPc)) return true
        prevPc = pc
      } catch {
        // transient read error; keep polling
      }
      return attempts >= STEP_SETTLE_MAX_POLLS
    })
    this.poller = poller
    if (this.disposed) return
    void poller.start().then((result) => {
      if (result === "stopped" && this.poller === poller && !this.disposed) {
        this.consumeEntryBreakpoint()
        this.sendEvent(new StoppedEvent("step", THREAD_ID))
      }
    })
  }

  /**
   * Drive the launch-entry first step: raw-step (bounded) until the PC clears
   * the entry instruction ({@link launchEntryReached}), then report one stop.
   * Each step is a single instruction, so it can never run away — unlike the old
   * free-running temp breakpoint, which escaped into firmware when the dirty
   * launch latch shifted instruction boundaries past the temp address.
   */
  private monitorLaunchEntry(client: EmulatorClient, startPc: number, instrLen: number): void {
    this.poller?.cancel()
    const run = ++this.monitorRun
    const loop = async (): Promise<void> => {
      let pc = startPc
      for (let i = 0; i < LAUNCH_ENTRY_MAX_STEPS; i += 1) {
        if (this.disposed || this.monitorRun !== run) return
        if (launchEntryReached(startPc, instrLen, pc)) break
        try {
          await client.step()
        } catch {
          // ignore; the settle below still reads the PC
        }
        pc = await this.waitForStablePc(client, pc, run)
      }
      if (!this.disposed && this.monitorRun === run) {
        this.consumeEntryBreakpoint()
        this.sendEvent(new StoppedEvent("step", THREAD_ID))
      }
    }
    void loop()
  }

  /**
   * Poll until the PC moves off `prePc` and is stable across two polls (or a
   * bounded number of attempts), resolving the settled PC. Stops early if the
   * session is disposed or a newer monitor (`run`) superseded this one.
   */
  private waitForStablePc(client: EmulatorClient, prePc: number, run: number): Promise<number> {
    let prevPc: number | undefined
    let lastPc = prePc
    let attempts = 0
    const poller = new StopPoller(async () => {
      attempts += 1
      if (this.disposed || this.monitorRun !== run) return true
      try {
        const pc = (await client.getZ80()).PC
        lastPc = pc
        if (stepSettled(prePc, pc, prevPc)) return true
        prevPc = pc
      } catch {
        // transient read error; keep polling
      }
      return attempts >= STEP_SETTLE_MAX_POLLS
    })
    this.poller = poller
    return poller.start().then(() => lastPc)
  }

  /** Set a one-shot breakpoint at `addr` (plus user bps), resume, restore on stop. */
  private async runToTemp(addr: number, reason: string): Promise<void> {
    const client = this.client
    if (!client) return
    const withTemp = this.userBpAddrs.includes(addr)
      ? this.userBpAddrs
      : [...this.userBpAddrs, addr]
    try {
      await client.setZ80Breakpoints(withTemp)
      await client.setPaused(false)
      this.sendEvent(new ContinuedEvent(THREAD_ID))
    } catch {
      // best effort
    }
    this.monitorStop(reason, STOP_SETTLE_MS, () => {
      void client.setZ80Breakpoints(this.userBpAddrs).catch(() => {})
    })
  }

  /** Read + decode the instruction at the current PC (for step-over). */
  private async decodeAtPc(client: EmulatorClient): Promise<DisasmInstruction | undefined> {
    const pc = (await client.getZ80()).PC
    const bytes = await client.readRam(pc, MAX_INSTR_LEN, { cpuView: true })
    return decodeOne(bytes, pc)
  }

  protected override async disconnectRequest(
    response: DebugProtocol.DisconnectResponse,
  ): Promise<void> {
    this.disposed = true
    this.poller?.cancel()
    if (this.client) {
      try {
        await this.client.setZ80Breakpoints([])
      } catch {
        // best effort
      }
    }
    this.sendResponse(response)
  }

  protected override async terminateRequest(
    response: DebugProtocol.TerminateResponse,
  ): Promise<void> {
    this.disposed = true
    this.poller?.cancel()
    if (this.client) {
      try {
        await this.client.setZ80Breakpoints([])
        await this.client.setPaused(false)
      } catch {
        // best effort
      }
    }
    this.sendResponse(response)
    this.sendEvent(new TerminatedEvent())
  }

  /**
   * Watch the emulator until it freezes (breakpoint, step or run-to completion)
   * and emit a single `stopped` event. `settleMs` skips the window right after a
   * resume where `ping.paused` is still the stale pre-resume value. `onStopped`
   * runs first (e.g. to drop a temporary breakpoint).
   */
  private monitorStop(reason: string, settleMs: number, onStopped?: () => void): void {
    this.poller?.cancel()
    this.monitorRun += 1
    const client = this.client
    if (!client) return
    const poller = new StopPoller(async () => (await client.pingState()).paused)
    this.poller = poller
    const begin = (): void => {
      if (this.disposed || this.poller !== poller) return
      void poller.start().then((result) => {
        if (result === "stopped" && this.poller === poller && !this.disposed) {
          onStopped?.()
          this.consumeEntryBreakpoint()
          this.sendEvent(new StoppedEvent(reason, THREAD_ID))
        }
      })
    }
    if (settleMs > 0) setTimeout(begin, settleMs)
    else begin()
  }
}

/** Decode a single instruction; `undefined` when bytes are empty/truncated. */
function decodeOne(bytes: number[], address: number): DisasmInstruction | undefined {
  if (bytes.length === 0) return undefined
  try {
    return decodeInstruction(bytes, address)
  } catch {
    return undefined
  }
}

/** Drop duplicate addresses while preserving order. */
function dedupe(addrs: number[]): number[] {
  return [...new Set(addrs)]
}
