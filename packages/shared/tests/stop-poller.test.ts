import { describe, expect, it } from "vitest"
import { StopPoller, type StopPollerOptions } from "../src/stop-poller.js"

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

/** Let queued microtasks (the awaited probe) settle. */
const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

describe("StopPoller", () => {
  it("resolves 'stopped' as soon as the probe reports paused", async () => {
    const poller = new StopPoller(async () => true, fakeTimer())
    await expect(poller.start()).resolves.toBe("stopped")
  })

  it("keeps polling until the probe reports paused", async () => {
    let calls = 0
    const probe = async () => {
      calls++
      return calls >= 3
    }
    const timer = fakeTimer()
    const poller = new StopPoller(probe, timer)

    const result = poller.start() // immediate tick -> call 1 (false)
    await flush()
    timer.fire() // call 2 (false)
    await flush()
    timer.fire() // call 3 (true)
    await flush()

    await expect(result).resolves.toBe("stopped")
    expect(timer.cleared()).toBe(true)
  })

  it("cancel() resolves 'cancelled' and stops the timer", async () => {
    const timer = fakeTimer()
    const poller = new StopPoller(async () => false, timer)
    const result = poller.start()
    await flush()
    poller.cancel()
    await expect(result).resolves.toBe("cancelled")
    expect(timer.cleared()).toBe(true)
  })

  it("coalesces overlapping ticks (one probe in flight at a time)", async () => {
    let calls = 0
    let resolveProbe: ((paused: boolean) => void) | undefined
    const probe = () => {
      calls++
      return new Promise<boolean>((r) => {
        resolveProbe = r
      })
    }
    const timer = fakeTimer()
    const poller = new StopPoller(probe, timer)

    poller.start() // tick 1: calls = 1, now in flight (pending)
    timer.fire() // tick 2: skipped because a probe is in flight
    expect(calls).toBe(1)

    resolveProbe?.(false)
    await flush()
    timer.fire() // tick 3: previous settled, runs
    expect(calls).toBe(2)
    poller.cancel()
  })

  it("returns the same pending promise when started twice", async () => {
    const poller = new StopPoller(async () => false, fakeTimer())
    const a = poller.start()
    const b = poller.start()
    expect(a).toBe(b)
    poller.cancel()
    await a
  })
})
