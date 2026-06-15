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
import { breakpointAddresses, resolveBreakpoints } from "./BreakpointMapper.js"
import {
  buildStackFrame,
  buildStateVariables,
  type StepRequest,
  stepByLine,
} from "./dapHandlers.js"
import { StopPoller } from "./StopPoller.js"

const THREAD_ID = 1
const STATE_REF = 1

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
    if (args.program) this.programPath = args.program
    if (args.stopOnEntry && this.client) {
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
    response.body = { scopes: [new Scope("State", STATE_REF, false)] }
    this.sendResponse(response)
  }

  protected override async variablesRequest(
    response: DebugProtocol.VariablesResponse,
    args: DebugProtocol.VariablesArguments,
  ): Promise<void> {
    const variables: DebugProtocol.Variable[] = []
    if (this.client && args.variablesReference === STATE_REF) {
      try {
        const state = await this.client.getBasicState()
        for (const v of buildStateVariables(state)) {
          variables.push({ name: v.name, value: v.value, variablesReference: 0 })
        }
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
    this.sendResponse(response)
    await this.resumeAndWait("breakpoint")
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
    this.sendResponse(response)
    if (!this.client) {
      this.sendEvent(new StoppedEvent("step", THREAD_ID))
      return
    }
    try {
      await this.client.basicStep(stepByLine(request))
    } catch {
      // ignore; still report a stop so the UI stays consistent
    }
    const result = await this.waitForPause()
    if (result !== "cancelled") this.sendEvent(new StoppedEvent("step", THREAD_ID))
  }

  private async resumeAndWait(reason: string): Promise<void> {
    if (!this.client) return
    this.poller?.cancel()
    try {
      await this.client.setPaused(false)
    } catch {
      return
    }
    this.sendEvent(new ContinuedEvent(THREAD_ID))
    const result = await this.waitForPause()
    if (result === "stopped") this.sendEvent(new StoppedEvent(reason, THREAD_ID))
  }

  private async waitForPause(): Promise<"stopped" | "cancelled"> {
    const client = this.client
    if (!client) return "cancelled"
    this.poller = new StopPoller(async () => (await client.pingState()).paused)
    return this.poller.start()
  }
}
