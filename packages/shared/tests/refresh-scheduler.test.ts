import { describe, expect, it } from "vitest"
import type { ConnectionState } from "../src/ping-service.js"
import { RefreshScheduler, type RefreshSchedulerOptions } from "../src/refresh-scheduler.js"

/** A controllable trigger source mimicking the hub a scheduler subscribes to. */
function fakeSource(connected = true) {
  const stop = new Set<() => void>()
  const frame = new Set<(p: unknown) => void>()
  const conn = new Set<(s: ConnectionState) => void>()
  const source = {
    connected,
    onStop: (cb: () => void) => {
      stop.add(cb)
      return () => stop.delete(cb)
    },
    onFrame: (cb: (p: unknown) => void) => {
      frame.add(cb)
      return () => frame.delete(cb)
    },
    onConnectionChange: (cb: (s: ConnectionState) => void) => {
      conn.add(cb)
      return () => conn.delete(cb)
    },
  }
  return {
    source,
    emitStop: () => {
      for (const cb of stop) cb()
    },
    emitFrame: () => {
      for (const cb of frame) cb({})
    },
    setConnected: (s: ConnectionState) => {
      source.connected = s === "connected"
      for (const cb of conn) cb(s)
    },
    counts: () => ({ stop: stop.size, frame: frame.size, conn: conn.size }),
  }
}

/** Manual setInterval/clearInterval + a controllable clock for throttle tests. */
function fakeTimers() {
  let cb: (() => void) | undefined
  let cleared = false
  let nowMs = 0
  const opts: Pick<RefreshSchedulerOptions, "setInterval" | "clearInterval" | "now"> = {
    setInterval: ((fn: () => void) => {
      cb = fn
      return 1 as unknown as ReturnType<typeof globalThis.setInterval>
    }) as typeof globalThis.setInterval,
    clearInterval: (() => {
      cleared = true
      cb = undefined
    }) as typeof globalThis.clearInterval,
    now: () => nowMs,
  }
  return {
    opts,
    fire: () => cb?.(),
    cleared: () => cleared,
    running: () => cb !== undefined,
    advance: (ms: number) => {
      nowMs += ms
    },
  }
}

describe("RefreshScheduler", () => {
  it("refreshes once immediately on start", () => {
    const src = fakeSource(true)
    const t = fakeTimers()
    let n = 0
    new RefreshScheduler(src.source, () => n++, t.opts).start()
    expect(n).toBe(1)
  })

  it("refreshes immediately on a stop signal", () => {
    const src = fakeSource(true)
    const t = fakeTimers()
    let n = 0
    new RefreshScheduler(src.source, () => n++, t.opts).start()
    src.emitStop()
    expect(n).toBe(2)
  })

  it("ignores frame events unless onFrame is enabled", () => {
    const src = fakeSource(true)
    const t = fakeTimers()
    let n = 0
    new RefreshScheduler(src.source, () => n++, t.opts).start()
    src.emitFrame()
    expect(n).toBe(1) // only the initial refresh
  })

  it("refreshes on frame, throttled to the configured window", () => {
    const src = fakeSource(true)
    const t = fakeTimers()
    let n = 0
    new RefreshScheduler(src.source, () => n++, {
      ...t.opts,
      onFrame: true,
      frameThrottleMs: 100,
    }).start()
    expect(n).toBe(1) // initial (resets the throttle window)
    src.emitFrame() // within window -> dropped
    expect(n).toBe(1)
    t.advance(100)
    src.emitFrame() // window elapsed -> refresh
    expect(n).toBe(2)
    src.emitFrame() // immediately after -> dropped
    expect(n).toBe(2)
  })

  it("runs a safety poll while disconnected", () => {
    const src = fakeSource(false)
    const t = fakeTimers()
    let n = 0
    new RefreshScheduler(src.source, () => n++, t.opts).start()
    expect(t.running()).toBe(true)
    t.fire()
    expect(n).toBe(2) // initial + one poll tick
  })

  it("runs a safety poll even while connected (a view can never freeze)", () => {
    const src = fakeSource(true)
    const t = fakeTimers()
    let n = 0
    new RefreshScheduler(src.source, () => n++, t.opts).start()
    expect(t.running()).toBe(true) // connected: a slow safety poll still runs
    t.fire()
    expect(n).toBe(2)
  })

  it("snaps to current state and keeps polling on (re)connect", () => {
    const src = fakeSource(false)
    const t = fakeTimers()
    let n = 0
    new RefreshScheduler(src.source, () => n++, t.opts).start()
    const before = n
    src.setConnected("connected")
    expect(n).toBe(before + 1) // immediate refresh on connect
    expect(t.running()).toBe(true) // safety poll continues (at the slow rate)
  })

  it("keeps polling when the connection drops", () => {
    const src = fakeSource(true)
    const t = fakeTimers()
    let n = 0
    new RefreshScheduler(src.source, () => n++, t.opts).start()
    src.setConnected("disconnected")
    expect(t.running()).toBe(true)
    t.fire()
    expect(n).toBeGreaterThan(1)
  })

  it("stop() unsubscribes everything and clears the fallback timer", () => {
    const src = fakeSource(false)
    const t = fakeTimers()
    let n = 0
    const s = new RefreshScheduler(src.source, () => n++, t.opts)
    s.start()
    s.stop()
    expect(src.counts()).toEqual({ stop: 0, frame: 0, conn: 0 })
    expect(t.cleared()).toBe(true)
    const after = n
    src.emitStop()
    t.fire()
    expect(n).toBe(after) // nothing fires after stop
  })
})
