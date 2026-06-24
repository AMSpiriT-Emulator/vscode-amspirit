import { describe, expect, it } from "vitest"
import { EmulatorEventHub } from "../src/emulator-event-hub.js"
import type { EmulatorEvents } from "../src/emulator-events.js"

/** A controllable stand-in for EmulatorEvents that records lifecycle + lets a test drive it. */
class FakeEvents {
  started = false
  closed = false
  private openCbs = new Set<() => void>()
  private errorCbs = new Set<(e: Error) => void>()
  private listeners = new Map<string, Set<(p: unknown) => void>>()

  constructor(
    readonly host: string,
    readonly port: number,
  ) {}

  // biome-ignore lint/suspicious/noExplicitAny: mirrors the typed map under test
  on(type: string, cb: any): () => void {
    let set = this.listeners.get(type)
    if (!set) {
      set = new Set()
      this.listeners.set(type, set)
    }
    set.add(cb)
    return () => set?.delete(cb)
  }
  onOpen(cb: () => void): () => void {
    this.openCbs.add(cb)
    return () => this.openCbs.delete(cb)
  }
  onError(cb: (e: Error) => void): () => void {
    this.errorCbs.add(cb)
    return () => this.errorCbs.delete(cb)
  }
  start(): void {
    this.started = true
  }
  close(): void {
    this.closed = true
  }

  // Test drivers:
  fireOpen(): void {
    for (const cb of this.openCbs) cb()
  }
  fireError(): void {
    for (const cb of this.errorCbs) cb(new Error("drop"))
  }
  emit(type: string, payload: unknown): void {
    for (const cb of this.listeners.get(type) ?? []) cb(payload)
  }
}

function makeHub() {
  const created: FakeEvents[] = []
  const factory = (host: string, port: number): EmulatorEvents => {
    const f = new FakeEvents(host, port)
    created.push(f)
    return f as unknown as EmulatorEvents
  }
  const hub = new EmulatorEventHub(factory, "127.0.0.1", 8765)
  return { hub, created, last: () => created.at(-1) as FakeEvents }
}

describe("EmulatorEventHub", () => {
  it("starts a single connection to the configured target", () => {
    const { hub, created, last } = makeHub()
    hub.start()
    expect(created).toHaveLength(1)
    expect(last().host).toBe("127.0.0.1")
    expect(last().port).toBe(8765)
    expect(last().started).toBe(true)
  })

  it("fans pause(paused:true) / z80_bp / basic_bp out as a single stop signal", () => {
    const { hub, last } = makeHub()
    let stops = 0
    hub.onStop(() => stops++)
    hub.start()
    last().emit("pause", { paused: true })
    last().emit("z80_bp", {})
    last().emit("basic_bp", {})
    expect(stops).toBe(3)
  })

  it("does not treat pause(paused:false) as a stop", () => {
    const { hub, last } = makeHub()
    let stops = 0
    hub.onStop(() => stops++)
    hub.start()
    last().emit("pause", { paused: false })
    expect(stops).toBe(0)
  })

  it("forwards frame events with their payload", () => {
    const { hub, last } = makeHub()
    const frames: unknown[] = []
    hub.onFrame((p) => frames.push(p))
    hub.start()
    last().emit("frame", { pc: "0x4000", paused: false })
    expect(frames).toEqual([{ pc: "0x4000", paused: false }])
  })

  it("reports connection transitions, de-duplicated", () => {
    const { hub, last } = makeHub()
    const states: string[] = []
    hub.onConnectionChange((s) => states.push(s))
    hub.start()
    expect(hub.connected).toBe(false)
    last().fireOpen()
    last().fireOpen() // no duplicate transition
    expect(hub.connected).toBe(true)
    last().fireError()
    expect(hub.connected).toBe(false)
    expect(states).toEqual(["connected", "disconnected"])
  })

  it("retarget closes the old connection and opens a new one, keeping listeners", () => {
    const { hub, created, last } = makeHub()
    let stops = 0
    hub.onStop(() => stops++)
    hub.start()
    const first = last()
    hub.retarget("127.0.0.1", 9000)
    expect(first.closed).toBe(true)
    expect(created).toHaveLength(2)
    expect(last().port).toBe(9000)
    // The listener registered before retarget still fires on the new connection.
    last().emit("z80_bp", {})
    expect(stops).toBe(1)
  })

  it("retarget to the same target is a no-op", () => {
    const { hub, created } = makeHub()
    hub.start()
    hub.retarget("127.0.0.1", 8765)
    expect(created).toHaveLength(1)
  })

  it("marks disconnected on retarget until the new stream opens", () => {
    const { hub, last } = makeHub()
    const states: string[] = []
    hub.onConnectionChange((s) => states.push(s))
    hub.start()
    last().fireOpen()
    hub.retarget("127.0.0.1", 9000)
    expect(hub.connected).toBe(false)
    expect(states).toEqual(["connected", "disconnected"])
  })

  it("dispose closes the active connection", () => {
    const { hub, last } = makeHub()
    hub.start()
    hub.dispose()
    expect(last().closed).toBe(true)
  })

  it("pulseStop fires stop listeners without an SSE event (for DAP-driven stops)", () => {
    const { hub } = makeHub()
    let stops = 0
    hub.onStop(() => stops++)
    hub.start()
    hub.pulseStop()
    expect(stops).toBe(1)
  })

  it("unsubscribes a stop listener via its disposer", () => {
    const { hub, last } = makeHub()
    let stops = 0
    const off = hub.onStop(() => stops++)
    hub.start()
    off()
    last().emit("pause", { paused: true })
    expect(stops).toBe(0)
  })
})
