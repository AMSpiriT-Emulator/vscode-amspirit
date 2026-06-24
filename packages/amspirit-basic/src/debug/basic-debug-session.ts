import { readFileSync } from "node:fs"
import { basename } from "node:path"
import { type EmulatorClient, EmulatorEvents, StopWatcher } from "@amspirit/shared"
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
import { readResolvedBasicVars } from "./basic-vars-reader.js"
import { breakpointAddresses, resolveBreakpoints } from "./breakpoint-mapper.js"
import {
  buildStackFrame,
  buildStateVariables,
  type StepRequest,
  stepByLine,
} from "./dap-handlers.js"

const THREAD_ID = 1
const VARS_REF = 1
const STATE_REF = 2
/**
 * After issuing a resume/step, ignore the emulator's `paused` flag for this long
 * so we don't read the stale pre-resume freeze (the emulator applies pending
 * actions on its frame thread, ~1-2 frames later).
 */
const STOP_SETTLE_MS = 150

/**
 * A one-shot promise gate. `wait()` blocks until someone calls `open()`; once
 * open it stays open so later `wait()`s resolve immediately. Used to sequence
 * the DAP launch handshake (tokenize -> set breakpoints -> run).
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

interface BasicDebugConfig {
  program?: string
  host?: string
  port?: number
  stopOnEntry?: boolean
}

/** Reads a `.bas` file into its lines; injectable for testing. */
export type LineReader = (path: string) => string[]

const defaultLineReader: LineReader = (path) => readFileSync(path, "utf-8").split(/\r?\n/)

/**
 * Debug Adapter for BASIC programs running in AMSpiriT. Thin imperative shell:
 * the line<->address mapping, stop detection and DAP formatting live in pure,
 * tested modules (`BreakpointMapper`, `StopWatcher`, `dapHandlers`). Resume/run-to
 * are watched via the emulator's SSE push channel (`EmulatorEvents`), with
 * paused-state polling as the fallback when the stream is unavailable.
 */
export class BasicDebugSession extends LoggingDebugSession {
  private client: EmulatorClient | undefined
  /** SSE push channel; stop events let the watcher react without polling. */
  private events: EmulatorEvents | undefined
  private programPath: string | undefined
  private poller: StopWatcher | undefined
  private disposed = false
  private stopOnEntry = false
  /** True once the program is running and a stop is expected (arms the monitor). */
  private running = false
  /** Reason for the first stop after start ("entry" when stopping on entry). */
  private firstStopReason = "breakpoint"
  /** Internal one-shot breakpoint on the program's first line (stop-on-entry). */
  private entryAddr: number | undefined
  /** Last user breakpoint addresses, so the entry bp can be merged then dropped. */
  private userBpAddrs: number[] = []
  /**
   * Opens once the program is tokenized and `getBasicListing` will return it, so
   * `setBreakPointsRequest` can resolve editor lines to addresses. (Opened
   * immediately on attach: the program is already in memory.)
   */
  private tokenized = new Gate()
  /** Opens when VS Code sends `configurationDone`, gating the program's RUN. */
  private configured = new Gate()

  constructor(
    private readonly createClient: (host: string, port: number) => EmulatorClient,
    private readonly readLines: LineReader = defaultLineReader,
    private readonly createEvents: (host: string, port: number) => EmulatorEvents | undefined = (
      host,
      port,
    ) => new EmulatorEvents({ host, port, topics: ["basic_bp", "pause"] }),
    /**
     * Notified whenever the session reports a stop. A BASIC step re-freezes the
     * emulator without an SSE event, so this is the authoritative signal the
     * Debugger panel refreshes on (the variable zone is final here).
     */
    private readonly onStopped: () => void = () => {},
  ) {
    super("amspirit-basic-debug.log")
    this.setDebuggerLinesStartAt1(true)
    this.setDebuggerColumnsStartAt1(true)
  }

  /** Emit a DAP `stopped` event and notify {@link onStopped} so the views refresh. */
  private sendStopped(reason: string): void {
    this.sendEvent(new StoppedEvent(reason, THREAD_ID))
    this.onStopped()
  }

  protected override initializeRequest(response: DebugProtocol.InitializeResponse): void {
    response.body = response.body ?? {}
    response.body.supportsConfigurationDoneRequest = true
    response.body.supportsTerminateRequest = true
    this.sendResponse(response)
    this.sendEvent(new InitializedEvent())
  }

  protected override async attachRequest(
    response: DebugProtocol.AttachResponse,
    args: DebugProtocol.AttachRequestArguments & BasicDebugConfig,
  ): Promise<void> {
    this.connect(args)
    // The program is already tokenized in memory, so breakpoints can resolve now.
    this.tokenized.open()
    if (this.stopOnEntry && this.client) {
      // Attach freezes whatever the program is doing right now.
      try {
        await this.client.setPaused(true)
      } catch {
        // best effort
      }
      this.sendStopped("entry")
    } else {
      this.running = true
    }
    this.sendResponse(response)
  }

  protected override async launchRequest(
    response: DebugProtocol.LaunchResponse,
    args: DebugProtocol.LaunchRequestArguments & BasicDebugConfig,
  ): Promise<void> {
    this.connect(args)
    const client = this.client
    if (!client || !args.program) {
      // Nothing to load; unblock any pending setBreakPointsRequest.
      this.tokenized.open()
      this.sendResponse(response)
      return
    }
    this.programPath = args.program
    const source = this.readLines(args.program).join("\n")
    try {
      // Tokenize WITHOUT running so `getBasicListing` can resolve addresses and
      // every breakpoint is armed before the program starts — otherwise line 1
      // executes before the breakpoints are set and we sail past them.
      await client.injectBasic(source, false, false)
      if (this.stopOnEntry) {
        this.entryAddr = await this.resolveEntryAddr(client)
        this.firstStopReason = "entry"
      }
    } catch {
      // Surface nothing fatal; the user can still attach to current memory.
    } finally {
      // Let setBreakPointsRequest proceed even if tokenizing failed.
      this.tokenized.open()
    }
    try {
      // Wait until VS Code has sent all breakpoints (setBreakPointsRequest, which
      // posts them) plus configurationDone — only then is it safe to RUN.
      await this.configured.promise
      await client.setBasicBreakpoints(this.bpAddrsToPost())
      await client.injectBasic(source, false, true)
      this.running = true
      // The program is now running; watch for the first freeze (entry/user bp).
      this.monitorStop(this.firstStopReason, 0)
    } catch {
      // best effort; the session stays attached to current memory
    }
    this.sendResponse(response)
  }

  /**
   * Address of the first statement, retried because injection is async — the
   * listing is empty until the emulator finishes tokenizing (a frame or two).
   */
  private async resolveEntryAddr(client: EmulatorClient): Promise<number | undefined> {
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        const listing = await client.getBasicListing()
        const addr = listing.lines[0]?.stmts[0]?.addr
        if (addr !== undefined) return addr
      } catch {
        // retry
      }
      await new Promise((resolve) => setTimeout(resolve, 60))
    }
    return undefined
  }

  private connect(args: BasicDebugConfig): void {
    const host = args.host ?? "127.0.0.1"
    const port = args.port ?? 8765
    this.client = this.createClient(host, port)
    this.events = this.createEvents(host, port)
    this.events?.start()
    this.stopOnEntry = args.stopOnEntry === true
    if (args.program) this.programPath = args.program
  }

  protected override async setBreakPointsRequest(
    response: DebugProtocol.SetBreakpointsResponse,
    args: DebugProtocol.SetBreakpointsArguments,
  ): Promise<void> {
    const path = args.source.path
    if (path) this.programPath ??= path
    const requested = (args.breakpoints ?? []).map((b) => b.line)
    let verified = requested.map((line) => ({ line, verified: false }))

    if (this.client && path) {
      try {
        // Wait until the program is tokenized, else the listing is empty and no
        // breakpoint resolves (the race that made pre-run breakpoints vanish).
        await this.tokenized.promise
        const listing = await this.client.getBasicListing()
        const resolved = resolveBreakpoints(requested, this.readLines(path), listing)
        this.userBpAddrs = breakpointAddresses(resolved)
        await this.client.setBasicBreakpoints(this.bpAddrsToPost())
        verified = resolved.map((r) => ({ line: r.line, verified: r.verified }))
      } catch {
        // leave all unverified
      }
    }

    response.body = { breakpoints: verified }
    this.sendResponse(response)
  }

  /** User breakpoints plus the internal entry breakpoint (deduped). */
  private bpAddrsToPost(): number[] {
    if (this.entryAddr === undefined || this.userBpAddrs.includes(this.entryAddr)) {
      return this.userBpAddrs
    }
    return [...this.userBpAddrs, this.entryAddr]
  }

  protected override configurationDoneRequest(
    response: DebugProtocol.ConfigurationDoneResponse,
    args: DebugProtocol.ConfigurationDoneArguments,
  ): void {
    super.configurationDoneRequest(response, args)
    // Release launchRequest to RUN now that all breakpoints have been sent.
    this.configured.open()
    // On attach the program is already running; start watching for the first
    // freeze. (Launch arms its own monitor once it actually RUNs the program.)
    if (this.running) this.monitorStop(this.firstStopReason, 0)
  }

  protected override threadsRequest(response: DebugProtocol.ThreadsResponse): void {
    response.body = { threads: [new Thread(THREAD_ID, "BASIC")] }
    this.sendResponse(response)
  }

  protected override async stackTraceRequest(
    response: DebugProtocol.StackTraceResponse,
  ): Promise<void> {
    const frames: StackFrame[] = []
    if (this.client) {
      try {
        const state = await this.client.getBasicState()
        const lines = this.programPath ? this.readLines(this.programPath) : []
        const info = buildStackFrame(state, lines)
        const source = this.programPath
          ? new Source(basename(this.programPath), this.programPath)
          : undefined
        frames.push(new StackFrame(0, info.name, source, info.line, info.column))
      } catch {
        // no frame available
      }
    }
    response.body = { stackFrames: frames, totalFrames: frames.length }
    this.sendResponse(response)
  }

  protected override scopesRequest(response: DebugProtocol.ScopesResponse): void {
    response.body = {
      scopes: [new Scope("Variables", VARS_REF, false), new Scope("State", STATE_REF, false)],
    }
    this.sendResponse(response)
  }

  protected override async variablesRequest(
    response: DebugProtocol.VariablesResponse,
    args: DebugProtocol.VariablesArguments,
  ): Promise<void> {
    let variables: DebugProtocol.Variable[] = []
    if (this.client && args.variablesReference === STATE_REF) {
      try {
        const state = await this.client.getBasicState()
        variables = buildStateVariables(state).map((v) => ({
          name: v.name,
          value: v.value,
          variablesReference: 0,
        }))
      } catch {
        // empty
      }
    } else if (this.client && args.variablesReference === VARS_REF) {
      try {
        variables = await this.readBasicVariables()
      } catch {
        // empty
      }
    }
    response.body = { variables }
    this.sendResponse(response)
  }

  /** Read + decode the Locomotive BASIC variable chains, resolving string contents. */
  private async readBasicVariables(): Promise<DebugProtocol.Variable[]> {
    const client = this.client
    if (!client) return []
    const { vars } = await readResolvedBasicVars(client)
    return vars.map((v) => ({ name: v.name, value: v.value, variablesReference: 0 }))
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
    this.sendStopped("pause")
  }

  protected override async nextRequest(response: DebugProtocol.NextResponse): Promise<void> {
    await this.step(response, "next")
  }

  protected override async stepInRequest(response: DebugProtocol.StepInResponse): Promise<void> {
    await this.step(response, "stepIn")
  }

  protected override async stepOutRequest(response: DebugProtocol.StepOutResponse): Promise<void> {
    await this.step(response, "stepOut")
  }

  protected override async disconnectRequest(
    response: DebugProtocol.DisconnectResponse,
  ): Promise<void> {
    this.disposed = true
    this.poller?.cancel()
    this.closeEvents()
    if (this.client) {
      try {
        await this.client.setBasicBreakpoints([])
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
    this.closeEvents()
    if (this.client) {
      try {
        await this.client.setBasicBreakpoints([])
        await this.client.setPaused(false)
      } catch {
        // best effort
      }
    }
    this.sendResponse(response)
    this.sendEvent(new TerminatedEvent())
  }

  private async step(response: DebugProtocol.Response, request: StepRequest): Promise<void> {
    if (this.client) {
      try {
        await this.client.basicStep(stepByLine(request))
      } catch {
        // ignore; the monitor will still report a stop
      }
    }
    this.sendResponse(response)
    // A step always re-pauses within a frame or two; settle past the stale read.
    this.monitorStop("step", STOP_SETTLE_MS)
  }

  /**
   * Watch the emulator until it freezes (breakpoint, step or run-to completion)
   * and emit a single `stopped` event. The emulator pauses *itself*; we only
   * detect the transition by polling `ping.paused`. `settleMs` skips the window
   * right after a resume where that flag is still the stale pre-resume value.
   */
  private monitorStop(reason: string, settleMs: number): void {
    this.poller?.cancel()
    const client = this.client
    if (!client) return
    const watcher = new StopWatcher({
      probe: async () => (await client.pingState()).paused,
      ...(this.events ? { events: this.events } : {}),
    })
    this.poller = watcher
    const begin = (): void => {
      if (this.disposed || this.poller !== watcher) return
      void watcher.start().then((result) => {
        if (result === "stopped" && this.poller === watcher && !this.disposed) {
          this.consumeEntryBreakpoint()
          this.sendStopped(reason)
        }
      })
    }
    if (settleMs > 0) setTimeout(begin, settleMs)
    else begin()
  }

  /**
   * Drop the one-shot entry breakpoint after the entry stop, re-syncing the
   * core to just the user's breakpoints so it doesn't re-break at line 1.
   */
  private consumeEntryBreakpoint(): void {
    if (this.entryAddr === undefined) return
    this.entryAddr = undefined
    this.firstStopReason = "breakpoint"
    const client = this.client
    if (client) void client.setBasicBreakpoints(this.userBpAddrs).catch(() => {})
  }

  /** Tear down the SSE push channel. */
  private closeEvents(): void {
    this.events?.close()
    this.events = undefined
  }
}
