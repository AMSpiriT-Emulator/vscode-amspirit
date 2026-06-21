import { describe, expect, it } from "vitest"
import type { StopPollerOptions } from "../src/stop-poller.js"
import { StopWatcher, type StopWatcherEventSource } from "../src/stop-watcher.js"

/** A setInterval/clearInterval pair whose callback can be fired manually. */
function fakeTimer(): StopPollerOptions & { fire: () => void; cleared: () => boolean } {
  let cb: (() => void) | undefined
  let cleared = false
  return {
    intervalMs: 10,
    setInterval: ((fn: () => void) => {
      cb = fn
      return 1 as unknown as ReturnType<typeof globalThis.setInterval>
    }) as typeof globalThis.setInterval,
    clearInterval: (() => {
      cleared = true
      cb = undefined
    }) as typeof globalThis.clearInterval,
    fire: () => cb?.(),
    cleared: () => cleared,
  }
}

/** A controllable stand-in for EmulatorEvents' stop-event subscription. */
function fakeEvents() {
  const listeners = new Map<string, Set<(p: unknown) => void>>()
  let unsubscribes = 0
  const source: StopWatcherEventSource = {
    // biome-ignore lint/suspicious/noExplicitAny: test stub mirrors the typed map
    on: (type: string, listener: any) => {
      let set = listeners.get(type)
      if (!set) {
        set = new Set()
        listeners.set(type, set)
      }
      set.add(listener)
      return () => {
        unsubscribes++
        set?.delete(listener)
      }
    },
  }
  return {
    source,
    emit: (type: string, payload: unknown) => {
      for (const l of listeners.get(type) ?? []) l(payload)
    },
    unsubscribes: () => unsubscribes,
  }
}

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

describe("StopWatcher", () => {
  it("resolves 'stopped' on a pause(paused:true) event, without polling", async () => {
    const ev = fakeEvents()
    const timer = fakeTimer()
    const probe = async () => false
    const w = new StopWatcher({ events: ev.source, probe, poller: timer })
    const result = w.start()
    ev.emit("pause", { paused: true })
    await expect(result).resolves.toBe("stopped")
    expect(timer.cleared()).toBe(true)
  })

  it("ignores pause(paused:false) — a resume is not a stop", async () => {
    const ev = fakeEvents()
    const w = new StopWatcher({ events: ev.source, probe: async () => false, poller: fakeTimer() })
    const result = w.start()
    ev.emit("pause", { paused: false })
    await flush()
    let settled = false
    void result.then(() => {
      settled = true
    })
    await flush()
    expect(settled).toBe(false)
    w.cancel()
    await expect(result).resolves.toBe("cancelled")
  })

  it("resolves 'stopped' on a z80_bp event", async () => {
    const ev = fakeEvents()
    const w = new StopWatcher({ events: ev.source, probe: async () => false, poller: fakeTimer() })
    const result = w.start()
    ev.emit("z80_bp", { pc: "0x4000" })
    await expect(result).resolves.toBe("stopped")
  })

  it("resolves 'stopped' on a basic_bp event", async () => {
    const ev = fakeEvents()
    const w = new StopWatcher({ events: ev.source, probe: async () => false, poller: fakeTimer() })
    const result = w.start()
    ev.emit("basic_bp", { line: 10, addr: "0x1234" })
    await expect(result).resolves.toBe("stopped")
  })

  it("falls back to polling when no events source is provided", async () => {
    const timer = fakeTimer()
    const w = new StopWatcher({ probe: async () => true, poller: timer })
    await expect(w.start()).resolves.toBe("stopped")
  })

  it("falls back to polling when the event stream stays silent", async () => {
    const ev = fakeEvents()
    const timer = fakeTimer()
    let calls = 0
    const probe = async () => {
      calls++
      return calls >= 2
    }
    const w = new StopWatcher({ events: ev.source, probe, poller: timer })
    const result = w.start() // immediate tick -> false
    await flush()
    timer.fire() // -> true
    await expect(result).resolves.toBe("stopped")
  })

  it("cancel() resolves 'cancelled', stops the poller and unsubscribes events", async () => {
    const ev = fakeEvents()
    const timer = fakeTimer()
    const w = new StopWatcher({ events: ev.source, probe: async () => false, poller: timer })
    const result = w.start()
    w.cancel()
    await expect(result).resolves.toBe("cancelled")
    expect(timer.cleared()).toBe(true)
    expect(ev.unsubscribes()).toBeGreaterThan(0)
  })

  it("ignores stop events arriving after cancel", async () => {
    const ev = fakeEvents()
    const w = new StopWatcher({ events: ev.source, probe: async () => false, poller: fakeTimer() })
    const result = w.start()
    w.cancel()
    ev.emit("z80_bp", { pc: "0x4000" })
    await expect(result).resolves.toBe("cancelled")
  })

  it("unsubscribes its event listeners once stopped", async () => {
    const ev = fakeEvents()
    const w = new StopWatcher({ events: ev.source, probe: async () => false, poller: fakeTimer() })
    const result = w.start()
    ev.emit("pause", { paused: true })
    await result
    expect(ev.unsubscribes()).toBeGreaterThan(0)
  })
})
