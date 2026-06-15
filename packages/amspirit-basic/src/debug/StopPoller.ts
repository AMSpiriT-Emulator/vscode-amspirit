/**
 * Polls the emulator until it reports a paused state, then resolves.
 *
 * The emulator has no push channel (no SSE/WebSocket): after a `continue` or a
 * `run-to`, the only way to learn that execution hit a breakpoint is to poll
 * `/api/ping` for `emu.paused`. This is pure timer-and-callback orchestration;
 * the probe (the HTTP call) is injected, so it tests with a fake clock.
 */

/** Resolves to true once the emulator is paused. */
export type PausedProbe = () => Promise<boolean>

export type StopReason = "stopped" | "cancelled"

export interface StopPollerOptions {
  intervalMs?: number
  setInterval?: typeof globalThis.setInterval
  clearInterval?: typeof globalThis.clearInterval
}

const DEFAULT_INTERVAL_MS = 100

export class StopPoller {
  private readonly intervalMs: number
  private readonly setIntervalFn: typeof globalThis.setInterval
  private readonly clearIntervalFn: typeof globalThis.clearInterval
  private timer: ReturnType<typeof globalThis.setInterval> | undefined
  private inFlight = false
  private done = false
  private resolveFn: ((reason: StopReason) => void) | undefined

  constructor(
    private readonly probe: PausedProbe,
    options: StopPollerOptions = {},
  ) {
    this.intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS
    this.setIntervalFn = options.setInterval ?? globalThis.setInterval
    this.clearIntervalFn = options.clearInterval ?? globalThis.clearInterval
  }

  /**
   * Start polling. Resolves `"stopped"` when the emulator pauses, or
   * `"cancelled"` if {@link cancel} is called first. Calling start twice
   * returns the same in-flight result.
   */
  start(): Promise<StopReason> {
    if (this.resolveFn) return this.pending
    this.done = false
    this.pending = new Promise<StopReason>((resolve) => {
      this.resolveFn = resolve
    })
    this.timer = this.setIntervalFn(() => {
      void this.tick()
    }, this.intervalMs)
    void this.tick()
    return this.pending
  }

  /** Stop polling and resolve a pending {@link start} with `"cancelled"`. */
  cancel(): void {
    this.finish("cancelled")
  }

  private pending: Promise<StopReason> = Promise.resolve("cancelled")

  private async tick(): Promise<void> {
    if (this.done || this.inFlight) return
    this.inFlight = true
    try {
      const paused = await this.probe()
      if (!this.done && paused) this.finish("stopped")
    } finally {
      this.inFlight = false
    }
  }

  private finish(reason: StopReason): void {
    if (this.done) return
    this.done = true
    if (this.timer !== undefined) {
      this.clearIntervalFn(this.timer)
      this.timer = undefined
    }
    const resolve = this.resolveFn
    this.resolveFn = undefined
    resolve?.(reason)
  }
}
