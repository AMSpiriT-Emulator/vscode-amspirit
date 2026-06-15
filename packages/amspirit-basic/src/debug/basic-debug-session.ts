import { readFileSync } from "node:fs"
import { basename } from "node:path"
import type { EmulatorClient } from "@amspirit/shared"
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
import { type BasicVar, decodeCpcString, parseBasicVars } from "./basic-var-parser.js"
import { breakpointAddresses, resolveBreakpoints } from "./breakpoint-mapper.js"
import {
  buildStackFrame,
  buildStateVariables,
  type StepRequest,
  stepByLine,
} from "./dap-handlers.js"
import { StopPoller } from "./stop-poller.js"

const THREAD_ID = 1
const VARS_REF = 1
const STATE_REF = 2
/** Cap on the variable zone read, mirroring the web debugger. */
const MAX_VAR_BYTES = 8192
/**
 * After issuing a resume/step, ignore the emulator's `paused` flag for this long
 * so we don't read the stale pre-resume freeze (the emulator applies pending
 * actions on its frame thread, ~1-2 frames later).
 */
const STOP_SETTLE_MS = 150

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
 * tested modules (`BreakpointMapper`, `StopPoller`, `dapHandlers`). The emulator
 * has no push channel, so resume/run-to are followed by a paused-state poll.
 */
export class BasicDebugSession extends LoggingDebugSession {
  private client: EmulatorClient | undefined
  private programPath: string | undefined
  private poller: StopPoller | undefined
  private disposed = false
  private stopOnEntry = false

  constructor(
    private readonly createClient: (host: string, port: number) => EmulatorClient,
    private readonly readLines: LineReader = defaultLineReader,
  ) {
    super("amspirit-basic-debug.log")
    this.setDebuggerLinesStartAt1(true)
    this.setDebuggerColumnsStartAt1(true)
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
    await this.connect(args)
    this.sendResponse(response)
  }

  protected override async launchRequest(
    response: DebugProtocol.LaunchResponse,
    args: DebugProtocol.LaunchRequestArguments & BasicDebugConfig,
  ): Promise<void> {
    await this.connect(args)
    if (this.client && args.program) {
      this.programPath = args.program
      const source = this.readLines(args.program).join("\n")
      try {
        await this.client.injectBasic(source, false, !args.stopOnEntry)
      } catch {
        // Surface nothing fatal; the user can still attach to current memory.
      }
    }
    this.sendResponse(response)
  }

  private async connect(args: BasicDebugConfig): Promise<void> {
    const host = args.host ?? "127.0.0.1"
    const port = args.port ?? 8765
    this.client = this.createClient(host, port)
    this.stopOnEntry = args.stopOnEntry === true
    if (args.program) this.programPath = args.program
    if (this.stopOnEntry && this.client) {
      try {
        await this.client.setPaused(true)
      } catch {
        // best effort
      }
      this.sendEvent(new StoppedEvent("entry", THREAD_ID))
    }
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
        const listing = await this.client.getBasicListing()
        const resolved = resolveBreakpoints(requested, this.readLines(path), listing)
        await this.client.setBasicBreakpoints(breakpointAddresses(resolved))
        verified = resolved.map((r) => ({ line: r.line, verified: r.verified }))
      } catch {
        // leave all unverified
      }
    }

    response.body = { breakpoints: verified }
    this.sendResponse(response)
  }

  protected override configurationDoneRequest(
    response: DebugProtocol.ConfigurationDoneResponse,
    args: DebugProtocol.ConfigurationDoneArguments,
  ): void {
    super.configurationDoneRequest(response, args)
    // When we didn't stop on entry the program is free-running; watch for the
    // first breakpoint hit (the emulator freezes itself, we only detect it).
    if (!this.stopOnEntry) this.monitorStop("breakpoint", 0)
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
    const state = await client.getBasicState()
    const [chainBytes, varBytes] = await Promise.all([
      client.readRam(state.chain_heads_addr, 54),
      client.readRam(state.txttop, Math.min(state.var_size, MAX_VAR_BYTES)),
    ])
    const parsed = parseBasicVars(chainBytes, varBytes)
    return Promise.all(parsed.map((v) => this.toVariable(client, v)))
  }

  private async toVariable(client: EmulatorClient, v: BasicVar): Promise<DebugProtocol.Variable> {
    let value = v.value
    if (v.type === "string" && v.strLen > 0) {
      try {
        value = `"${decodeCpcString(await client.readRam(v.strAddr, v.strLen))}"`
      } catch {
        // keep the "(len N)" placeholder on read failure
      }
    }
    return { name: v.name, value, variablesReference: 0 }
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
    const poller = new StopPoller(async () => (await client.pingState()).paused)
    this.poller = poller
    const begin = (): void => {
      if (this.disposed || this.poller !== poller) return
      void poller.start().then((result) => {
        if (result === "stopped" && this.poller === poller && !this.disposed) {
          this.sendEvent(new StoppedEvent(reason, THREAD_ID))
        }
      })
    }
    if (settleMs > 0) setTimeout(begin, settleMs)
    else begin()
  }
}
