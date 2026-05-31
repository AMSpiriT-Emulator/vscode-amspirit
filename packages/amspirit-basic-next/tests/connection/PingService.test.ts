import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { PingService } from "../../src/connection/PingService.js"

describe("PingService", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("does not call the listener on first ping if the state matches its initial assumption", async () => {
    // The service has no initial state; the very first tick is always reported.
    const ping = vi.fn().mockResolvedValue(true)
    const listener = vi.fn()
    const svc = new PingService(ping, listener)
    const state = await svc.pingNow()
    expect(state).toBe("connected")
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith("connected")
  })

  it("notifies only on state transitions", async () => {
    const ping = vi
      .fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
    const listener = vi.fn()
    const svc = new PingService(ping, listener)
    await svc.pingNow()
    await svc.pingNow()
    await svc.pingNow()
    expect(listener).toHaveBeenCalledTimes(2)
    expect(listener).toHaveBeenNthCalledWith(1, "connected")
    expect(listener).toHaveBeenNthCalledWith(2, "disconnected")
  })

  it("reports false when ping rejects? — no: ping is expected to swallow errors and return bool", async () => {
    const ping = vi.fn().mockResolvedValue(false)
    const listener = vi.fn()
    const svc = new PingService(ping, listener)
    await svc.pingNow()
    expect(listener).toHaveBeenCalledWith("disconnected")
  })

  it("starts a periodic timer at the configured interval", async () => {
    const ping = vi.fn().mockResolvedValue(true)
    const listener = vi.fn()
    const svc = new PingService(ping, listener, { intervalMs: 100 })
    svc.start()
    await vi.advanceTimersByTimeAsync(350)
    expect(ping).toHaveBeenCalledTimes(3)
    svc.stop()
  })

  it("start is idempotent", () => {
    const setIntervalSpy = vi.fn().mockReturnValue(1 as unknown as NodeJS.Timeout)
    const svc = new PingService(vi.fn().mockResolvedValue(true), vi.fn(), {
      intervalMs: 100,
      setInterval: setIntervalSpy as unknown as typeof globalThis.setInterval,
      clearInterval: vi.fn() as unknown as typeof globalThis.clearInterval,
    })
    svc.start()
    svc.start()
    expect(setIntervalSpy).toHaveBeenCalledTimes(1)
  })

  it("stop cancels the timer", () => {
    const clearIntervalSpy = vi.fn()
    const svc = new PingService(vi.fn().mockResolvedValue(true), vi.fn(), {
      intervalMs: 100,
      setInterval: vi
        .fn()
        .mockReturnValue(
          42 as unknown as NodeJS.Timeout,
        ) as unknown as typeof globalThis.setInterval,
      clearInterval: clearIntervalSpy as unknown as typeof globalThis.clearInterval,
    })
    svc.start()
    svc.stop()
    expect(clearIntervalSpy).toHaveBeenCalledWith(42)
  })

  it("stop is a no-op when not started", () => {
    const clearIntervalSpy = vi.fn()
    const svc = new PingService(vi.fn().mockResolvedValue(true), vi.fn(), {
      intervalMs: 100,
      setInterval: vi.fn() as unknown as typeof globalThis.setInterval,
      clearInterval: clearIntervalSpy as unknown as typeof globalThis.clearInterval,
    })
    svc.stop()
    expect(clearIntervalSpy).not.toHaveBeenCalled()
  })
})
