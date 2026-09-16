import type { BasicListing, EmulatorClient } from "@amspirit/shared"
import type { DebugProtocol } from "@vscode/debugprotocol"
import { describe, expect, it } from "vitest"
import { BasicDebugSession } from "../../src/debug/basic-debug-session.js"

/** Listing mirroring the program below; line 20's first stmt lives at addr 381. */
const listing: BasicListing = {
  lines: [
    {
      addr: 368,
      num: 10,
      stmts: [{ addr: 371, end: 378, colon: false, text: "A=1", vars: ["A"] }],
    },
    {
      addr: 378,
      num: 20,
      stmts: [
        { addr: 381, end: 388, colon: false, text: "A=A+1", vars: ["A"] },
        { addr: 388, end: 395, colon: true, text: "GOTO 20", vars: [] },
      ],
    },
    { addr: 395, num: 100, stmts: [{ addr: 398, end: 402, colon: false, text: "END", vars: [] }] },
  ],
}

const PROGRAM = "/tmp/test.bas"
const doc = ["10 A=1", "20 A=A+1:GOTO 20", "100 END"]

interface Call {
  method: string
  args: readonly unknown[]
}

/** The same program before line 10 grew: same line numbers, line 20 at addr 381 (now 423). */
const staleListing: BasicListing = {
  lines: [
    {
      addr: 368,
      num: 10,
      stmts: [{ addr: 371, end: 378, colon: false, text: "A=1", vars: ["A"] }],
    },
    {
      addr: 378,
      num: 20,
      stmts: [{ addr: 381, end: 395, colon: false, text: "A=A+1:GOTO 20", vars: ["A"] }],
    },
    { addr: 395, num: 100, stmts: [{ addr: 398, end: 402, colon: false, text: "END", vars: [] }] },
  ],
}
const freshListing: BasicListing = {
  lines: [
    {
      addr: 368,
      num: 10,
      stmts: [{ addr: 371, end: 420, colon: false, text: 'A=1:PRINT "LONGER LINE"', vars: ["A"] }],
    },
    {
      addr: 420,
      num: 20,
      stmts: [{ addr: 423, end: 437, colon: false, text: "A=A+1:GOTO 20", vars: ["A"] }],
    },
    { addr: 437, num: 100, stmts: [{ addr: 440, end: 444, colon: false, text: "END", vars: [] }] },
  ],
}

/**
 * `listingLag` = how many listing reads return `lagging` (an empty decode by
 * default) before the real one.
 */
function makeFake(
  calls: Call[],
  listingLag = 0,
  lagging: BasicListing = { lines: [] },
): EmulatorClient {
  const rec =
    (method: string, result: unknown) =>
    (...args: unknown[]): Promise<unknown> => {
      calls.push({ method, args })
      return Promise.resolve(result)
    }
  let listingReads = 0
  return {
    injectBasic: rec("injectBasic", undefined),
    getBasicListing: (...args: unknown[]): Promise<BasicListing> => {
      calls.push({ method: "getBasicListing", args })
      listingReads += 1
      return Promise.resolve(listingReads > listingLag ? listing : lagging)
    },
    setBasicBreakpoints: rec("setBasicBreakpoints", undefined),
    pingState: rec("pingState", { ok: true, paused: false }),
    setPaused: rec("setPaused", undefined),
  } as unknown as EmulatorClient
}

/** Exposes the protected DAP handlers so a test can drive the request sequence. */
class Harness extends BasicDebugSession {
  initialize(): void {
    this.initializeRequest(resp<DebugProtocol.InitializeResponse>())
  }
  launch(args: { program: string; stopOnEntry?: boolean }): Promise<void> {
    return this.launchRequest(
      resp<DebugProtocol.LaunchResponse>(),
      args as DebugProtocol.LaunchRequestArguments,
    )
  }
  async setBreakpoints(lines: number[]): Promise<DebugProtocol.Breakpoint[]> {
    const response = resp<DebugProtocol.SetBreakpointsResponse>()
    await this.setBreakPointsRequest(response, {
      source: { path: PROGRAM },
      breakpoints: lines.map((line) => ({ line })),
    })
    return response.body?.breakpoints ?? []
  }
  configurationDone(): void {
    this.configurationDoneRequest(
      resp<DebugProtocol.ConfigurationDoneResponse>(),
      {} as DebugProtocol.ConfigurationDoneArguments,
    )
  }
  attach(args: { program?: string; stopOnEntry?: boolean }): Promise<void> {
    return this.attachRequest(
      resp<DebugProtocol.AttachResponse>(),
      args as DebugProtocol.AttachRequestArguments,
    )
  }
  disconnect(): Promise<void> {
    return this.disconnectRequest(resp<DebugProtocol.DisconnectResponse>())
  }
}

function resp<T>(): T {
  return {} as unknown as T
}

function makeHarness(
  calls: Call[],
  onStopped?: () => void,
  listingLag = 0,
  lagging?: BasicListing,
): Harness {
  return new Harness(
    () => makeFake(calls, listingLag, lagging),
    () => doc,
    // No SSE push channel under test: exercise the polling fallback deterministically.
    () => undefined,
    onStopped,
  )
}

/** True when run=true was passed to injectBasic. */
function isRun(call: Call): boolean {
  return call.method === "injectBasic" && call.args[2] === true
}

/** True when this setBasicBreakpoints call carried the given statement address. */
function postsAddr(call: Call, addr: number): boolean {
  if (call.method !== "setBasicBreakpoints") return false
  const addrs = call.args[0]
  return Array.isArray(addrs) && addrs.includes(addr)
}

describe("BasicDebugSession launch sequence", () => {
  it("posts user breakpoints to the emulator before starting the program", async () => {
    const calls: Call[] = []
    const session = makeHarness(calls)

    // VS Code's launch order: initialize (-> InitializedEvent), then launch,
    // then setBreakpoints (reacting to InitializedEvent), then configurationDone.
    session.initialize()
    const launching = session.launch({ program: PROGRAM, stopOnEntry: false })
    await session.setBreakpoints([2]) // breakpoint on "20 A=A+1" -> addr 381
    session.configurationDone()
    await launching

    const runIndex = calls.findIndex(isRun)
    const bpIndex = calls.findIndex((c) => postsAddr(c, 381))

    expect(bpIndex).toBeGreaterThanOrEqual(0)
    expect(runIndex).toBeGreaterThanOrEqual(0)
    // The breakpoint must reach the emulator BEFORE the program runs, otherwise
    // execution sails past it (the reported bug).
    expect(bpIndex).toBeLessThan(runIndex)

    await session.disconnect()
  })

  it("resolves breakpoints requested before the program is tokenized", async () => {
    const calls: Call[] = []
    const session = makeHarness(calls)

    session.initialize()
    // launch connects and starts tokenizing (still in flight); setBreakpoints
    // arrives meanwhile and must wait for the listing rather than reading an
    // empty one and marking every breakpoint unverified.
    const launching = session.launch({ program: PROGRAM, stopOnEntry: false })
    const verified = await session.setBreakpoints([2])
    session.configurationDone()
    await launching

    expect(verified).toEqual([{ line: 2, verified: true }])
    // The listing that resolved the breakpoints was read after the tokenize
    // (run=false) injection (the read before it only captures the old program).
    const listingIndex = calls.map((c) => c.method).lastIndexOf("getBasicListing")
    const tokenizeIndex = calls.findIndex((c) => c.method === "injectBasic" && c.args[2] === false)
    expect(tokenizeIndex).toBeGreaterThanOrEqual(0)
    expect(listingIndex).toBeGreaterThan(tokenizeIndex)

    await session.disconnect()
  })

  it("waits for the listing to reflect the injected program before resolving breakpoints", async () => {
    // injectBasic acks the queued injection; the emulator tokenizes a frame or
    // two later. Without stopOnEntry nothing used to wait, so a breakpoint set
    // meanwhile read an empty listing and stayed unverified for good.
    const calls: Call[] = []
    const session = makeHarness(calls, undefined, 2)

    session.initialize()
    const launching = session.launch({ program: PROGRAM, stopOnEntry: false })
    const verified = await session.setBreakpoints([2])
    session.configurationDone()
    await launching

    expect(verified).toEqual([{ line: 2, verified: true }])
    const runIndex = calls.findIndex(isRun)
    expect(calls.findIndex((c) => postsAddr(c, 381))).toBeLessThan(runIndex)

    await session.disconnect()
  })

  it("does not trust the previous program's listing when only a line's content changed", async () => {
    // Line 10 grew without renumbering: the old listing has the same line
    // numbers, so line 20 would resolve to its OLD address (381) if the wait
    // only compared line numbers. The new address is 423.
    const calls: Call[] = []
    const session = makeHarness(calls, undefined, 2, staleListing)
    const original = listing.lines
    listing.lines = freshListing.lines
    try {
      session.initialize()
      const launching = session.launch({ program: PROGRAM, stopOnEntry: false })
      const verified = await session.setBreakpoints([2])
      session.configurationDone()
      await launching

      expect(verified).toEqual([{ line: 2, verified: true }])
      expect(calls.some((c) => postsAddr(c, 423))).toBe(true)
      expect(calls.some((c) => postsAddr(c, 381))).toBe(false)
    } finally {
      listing.lines = original
      await session.disconnect()
    }
  })

  it("arms the entry breakpoint before running when stopOnEntry is set", async () => {
    const calls: Call[] = []
    const session = makeHarness(calls)

    session.initialize()
    const launching = session.launch({ program: PROGRAM, stopOnEntry: true })
    await session.setBreakpoints([])
    session.configurationDone()
    await launching

    const runIndex = calls.findIndex(isRun)
    // The entry stmt (line 10 -> addr 371) must be posted before the program runs.
    const entryIndex = calls.findIndex((c) => postsAddr(c, 371))
    expect(entryIndex).toBeGreaterThanOrEqual(0)
    expect(entryIndex).toBeLessThan(runIndex)

    await session.disconnect()
  })

  it("notifies onStopped on every reported stop so the views refresh", async () => {
    // A step re-freezes the emulator without an SSE event, so the views rely on
    // this callback (wired to the event hub) to refresh — without it, registers
    // stay stale while stepping.
    const calls: Call[] = []
    let stops = 0
    const session = makeHarness(calls, () => stops++)

    session.initialize()
    await session.attach({ program: PROGRAM, stopOnEntry: true })

    expect(stops).toBe(1) // the stop-on-entry freeze fired the callback

    await session.disconnect()
  })
})
