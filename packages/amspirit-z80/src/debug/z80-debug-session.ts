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
  Scope,
  Source,
  StackFrame,
  StoppedEvent,
  TerminatedEvent,
  Thread,
} from "@vscode/debugadapter"
import type { DebugProtocol } from "@vscode/debugprotocol"
import { buildRegisterScopes } from "../registers-view.js"
import { planStepOver, returnAddress } from "../step-targets.js"
import { parseSymbolMap } from "../symbol-map/parse-symbol-map.js"
import type { SymbolMap } from "../symbol-map/symbol-map.js"

const THREAD_ID = 1
/** Variables references: one per register scope (Registers/Flags/Shadow/Interrupts). */
const FIRST_SCOPE_REF = 1
/**
 * After a resume/step, ignore the emulator's `paused` flag briefly so we don't
 * read the stale pre-resume freeze (it applies pending actions a frame later).
 */
const STOP_SETTLE_MS = 150
/** Longest Z80 instruction is 4 bytes; read a small window to decode at PC. */
const MAX_INSTR_LEN = 4

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
  private disposed = false
  private stopOnEntry = false
  /** True once running and a stop is expected (arms the persistent monitor). */
  private running = false
  /** Reason for the first stop ("entry" when stopping on entry). */
  private firstStopReason = "breakpoint"
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
    response.body.supportsReadMemoryRequest = true
    response.body.supportsDisassembleRequest = true
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
        const pc = (await client.getZ80()).PC
        const loc = this.symbols?.addressToLine(pc)
        const name = `0x${pc.toString(16).toUpperCase().padStart(4, "0")}`
        if (loc) {
          const source = this.sourceFor(loc.file)
          frames.push(new StackFrame(0, name, source, loc.line, 1))
        } else {
          frames.push(new StackFrame(0, name))
        }
      } catch {
        // no frame available
      }
    }
    response.body = { stackFrames: frames, totalFrames: frames.length }
    this.sendResponse(response)
  }

  /** Resolve an SLD source path (often relative) against the program directory. */
  private sourceFor(file: string): Source | undefined {
    if (isAbsolute(file)) return new Source(basename(file), file)
    const base = this.programPath ? dirname(this.programPath) : undefined
    const abs = base ? resolve(base, file) : file
    return new Source(basename(file), abs)
  }

  protected override scopesRequest(response: DebugProtocol.ScopesResponse): void {
    const names = buildRegisterScopes(EMPTY_REGS).map((s) => s.name)
    response.body = {
      scopes: names.map((name, i) => new Scope(name, FIRST_SCOPE_REF + i, false)),
    }
    this.sendResponse(response)
  }

  protected override async variablesRequest(
    response: DebugProtocol.VariablesResponse,
    args: DebugProtocol.VariablesArguments,
  ): Promise<void> {
    let variables: DebugProtocol.Variable[] = []
    const client = this.client
    const index = args.variablesReference - FIRST_SCOPE_REF
    if (client && index >= 0) {
      try {
        const scope = buildRegisterScopes(await client.getZ80())[index]
        variables = (scope?.variables ?? []).map((v) => ({
          name: v.name,
          value: v.value,
          variablesReference: 0,
        }))
      } catch {
        // empty
      }
    }
    response.body = { variables }
    this.sendResponse(response)
  }

  protected override async continueRequest(
    response: DebugProtocol.ContinueResponse,
  ): Promise<void> {
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

  /** Execute exactly one instruction; the emulator re-pauses synchronously. */
  private async stepOne(response: DebugProtocol.Response): Promise<void> {
    if (this.client) {
      try {
        await this.client.step()
      } catch {
        // ignore; the monitor below still reports the stop
      }
    }
    this.sendResponse(response)
    this.monitorStop("step", STOP_SETTLE_MS)
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

  protected override async readMemoryRequest(
    response: DebugProtocol.ReadMemoryResponse,
    args: DebugProtocol.ReadMemoryArguments,
  ): Promise<void> {
    const client = this.client
    const base = Number(args.memoryReference) + (args.offset ?? 0)
    if (client && Number.isFinite(base) && args.count > 0) {
      try {
        const bytes = await client.readRam(base & 0xffff, args.count, { cpuView: true })
        response.body = {
          address: `0x${(base & 0xffff).toString(16)}`,
          data: Buffer.from(bytes).toString("base64"),
        }
      } catch {
        // empty body
      }
    }
    this.sendResponse(response)
  }

  protected override async disassembleRequest(
    response: DebugProtocol.DisassembleResponse,
    args: DebugProtocol.DisassembleArguments,
  ): Promise<void> {
    const client = this.client
    const count = args.instructionCount
    const start = (Number(args.memoryReference) + (args.offset ?? 0)) & 0xffff
    const instructions: DebugProtocol.DisassembledInstruction[] = []
    if (client && Number.isFinite(start)) {
      try {
        const bytes = await client.readRam(start, count * MAX_INSTR_LEN, { cpuView: true })
        let pos = 0
        for (let i = 0; i < count; i++) {
          const ins = decodeOne(bytes.slice(pos), (start + pos) & 0xffff)
          if (!ins) break
          instructions.push({
            address: `0x${ins.address.toString(16)}`,
            instructionBytes: ins.bytes.map((b) => b.toString(16).padStart(2, "0")).join(" "),
            instruction: ins.text,
          })
          pos += ins.bytes.length
        }
      } catch {
        // empty
      }
    }
    response.body = { instructions }
    this.sendResponse(response)
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

/** Zeroed registers, used only to derive the static scope names/order. */
const EMPTY_REGS = {
  PC: 0,
  SP: 0,
  A: 0,
  F: 0,
  B: 0,
  C: 0,
  D: 0,
  E: 0,
  H: 0,
  L: 0,
  A2: 0,
  F2: 0,
  B2: 0,
  C2: 0,
  D2: 0,
  E2: 0,
  H2: 0,
  L2: 0,
  IX: 0,
  IY: 0,
  I: 0,
  R: 0,
  IFF1: 0,
  IFF2: 0,
  IM: 0,
} as const
