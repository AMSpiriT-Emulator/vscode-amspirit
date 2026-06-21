import { describe, expect, it } from "vitest"
import {
  EmulatorEvents,
  type EmulatorEventsOptions,
  type SseConnection,
  type SseTransport,
  type SseTransportHandlers,
} from "../src/emulator-events.js"

/** A setTimeout/clearTimeout pair whose scheduled callback can be fired manually. */
function fakeTimer(): Pick<EmulatorEventsOptions, "setTimeout" | "clearTimeout"> & {
  scheduled: () => number
  fire: () => void
} {
  let cb: (() => void) | undefined
  let count = 0
  return {
    setTimeout: ((fn: () => void) => {
      cb = fn
      count++
      return 0 as unknown as ReturnType<typeof globalThis.setTimeout>
    }) as typeof globalThis.setTimeout,
    clearTimeout: (() => {
      cb = undefined
    }) as typeof globalThis.clearTimeout,
    scheduled: () => count,
    fire: () => cb?.(),
  }
}

/**
 * A controllable fake transport: records each connection's target + handlers so
 * a test can push chunks, end or error the stream on demand, and assert reconnects.
 */
class FakeTransport {
  connections: {
    url: { host: string; port: number; path: string }
    handlers: SseTransportHandlers
    closed: boolean
  }[] = []

  readonly transport: SseTransport = (url, handlers) => {
    const entry = { url, handlers, closed: false }
    this.connections.push(entry)
    const conn: SseConnection = {
      close: () => {
        entry.closed = true
      },
    }
    return conn
  }

  /** The most recently opened connection. */
  get last() {
    const c = this.connections.at(-1)
    if (!c) throw new Error("no connection opened")
    return c
  }
}

function makeEvents(fake: FakeTransport, opts: EmulatorEventsOptions = {}) {
  return new EmulatorEvents({
    host: "127.0.0.1",
    port: 8765,
    transport: fake.transport,
    ...opts,
  })
}

describe("EmulatorEvents", () => {
  it("opens GET /api/events on start, honouring the topics filter", () => {
    const fake = new FakeTransport()
    const ev = makeEvents(fake, { topics: ["z80_bp", "basic_bp", "pause"] })
    ev.start()
    expect(fake.connections).toHaveLength(1)
    expect(fake.last.url).toMatchObject({ host: "127.0.0.1", port: 8765 })
    expect(fake.last.url.path).toBe("/api/events?topics=z80_bp,basic_bp,pause")
  })

  it("requests all topics when none are specified", () => {
    const fake = new FakeTransport()
    makeEvents(fake).start()
    expect(fake.last.url.path).toBe("/api/events")
  })

  it("parses a `pause` event and notifies its typed listener", () => {
    const fake = new FakeTransport()
    const ev = makeEvents(fake)
    const seen: unknown[] = []
    ev.on("pause", (p) => seen.push(p))
    ev.start()
    fake.last.handlers.onChunk('event: pause\ndata: {"paused":true}\n\n')
    expect(seen).toEqual([{ paused: true }])
  })

  it("routes z80_bp / basic_bp payloads to the right listeners", () => {
    const fake = new FakeTransport()
    const ev = makeEvents(fake)
    const z80: unknown[] = []
    const basic: unknown[] = []
    ev.on("z80_bp", (p) => z80.push(p))
    ev.on("basic_bp", (p) => basic.push(p))
    ev.start()
    fake.last.handlers.onChunk('event: z80_bp\ndata: {"pc":"0x4000"}\n\n')
    fake.last.handlers.onChunk('event: basic_bp\ndata: {"line":20,"addr":"0x1234"}\n\n')
    expect(z80).toEqual([{ pc: "0x4000" }])
    expect(basic).toEqual([{ line: 20, addr: "0x1234" }])
  })

  it("unsubscribes a listener via the returned disposer", () => {
    const fake = new FakeTransport()
    const ev = makeEvents(fake)
    const seen: unknown[] = []
    const off = ev.on("pause", (p) => seen.push(p))
    ev.start()
    off()
    fake.last.handlers.onChunk('event: pause\ndata: {"paused":true}\n\n')
    expect(seen).toEqual([])
  })

  it("ignores malformed JSON payloads instead of throwing", () => {
    const fake = new FakeTransport()
    const ev = makeEvents(fake)
    const seen: unknown[] = []
    ev.on("pause", (p) => seen.push(p))
    ev.start()
    expect(() => fake.last.handlers.onChunk("event: pause\ndata: not-json\n\n")).not.toThrow()
    expect(seen).toEqual([])
  })

  it("fires onOpen and tracks connection state", () => {
    const fake = new FakeTransport()
    const ev = makeEvents(fake)
    const opens: number[] = []
    ev.onOpen(() => opens.push(1))
    expect(ev.connected).toBe(false)
    ev.start()
    fake.last.handlers.onChunk(": ready\n\n")
    expect(opens).toHaveLength(1)
    expect(ev.connected).toBe(true)
  })

  it("reconnects after the stream ends, on a delay", () => {
    const fake = new FakeTransport()
    const timer = fakeTimer()
    const ev = makeEvents(fake, { reconnectDelayMs: 500, ...timer })
    ev.start()
    fake.last.handlers.onEnd()
    expect(ev.connected).toBe(false)
    // A reconnect is scheduled, not opened immediately.
    expect(fake.connections).toHaveLength(1)
    expect(timer.scheduled()).toBe(1)
    // Fire the scheduled reconnect.
    timer.fire()
    expect(fake.connections).toHaveLength(2)
  })

  it("notifies onError and reconnects when the stream errors", () => {
    const fake = new FakeTransport()
    const timer = fakeTimer()
    const ev = makeEvents(fake, timer)
    const errors: Error[] = []
    ev.onError((e) => errors.push(e))
    ev.start()
    fake.last.handlers.onError(new Error("ECONNRESET"))
    expect(errors).toHaveLength(1)
    expect(timer.scheduled()).toBe(1)
  })

  it("does not reconnect once closed", () => {
    const fake = new FakeTransport()
    const timer = fakeTimer()
    const ev = makeEvents(fake, timer)
    ev.start()
    ev.close()
    expect(fake.last.closed).toBe(true)
    fake.last.handlers.onEnd()
    expect(timer.scheduled()).toBe(0)
    expect(fake.connections).toHaveLength(1)
  })

  it("cancels a pending reconnect when closed mid-backoff", () => {
    const fake = new FakeTransport()
    const timer = fakeTimer()
    const ev = makeEvents(fake, timer)
    ev.start()
    fake.last.handlers.onEnd() // schedules a reconnect
    expect(timer.scheduled()).toBe(1)
    ev.close()
    // Firing the (now-cleared) timer must not reopen the connection.
    timer.fire()
    expect(fake.connections).toHaveLength(1)
  })

  it("does not open a second connection if start is called twice", () => {
    const fake = new FakeTransport()
    const ev = makeEvents(fake)
    ev.start()
    ev.start()
    expect(fake.connections).toHaveLength(1)
  })
})
