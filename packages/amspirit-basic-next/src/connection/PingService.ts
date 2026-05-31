export type Pinger = () => Promise<boolean>
export type StateListener = (state: "connected" | "disconnected") => void

export interface PingServiceOptions {
  intervalMs?: number
  setInterval?: typeof globalThis.setInterval
  clearInterval?: typeof globalThis.clearInterval
}

const DEFAULT_INTERVAL_MS = 3000

/**
 * Periodically pings the emulator and notifies listeners only on state transitions.
 * Pure timer-and-callback orchestration; the actual HTTP call is injected.
 */
export class PingService {
  private readonly intervalMs: number
  private readonly setIntervalFn: typeof globalThis.setInterval
  private readonly clearIntervalFn: typeof globalThis.clearInterval
  private timer: ReturnType<typeof globalThis.setInterval> | undefined
  private lastState: "connected" | "disconnected" | undefined

  constructor(
    private readonly ping: Pinger,
    private readonly listener: StateListener,
    options: PingServiceOptions = {},
  ) {
    this.intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS
    this.setIntervalFn = options.setInterval ?? globalThis.setInterval
    this.clearIntervalFn = options.clearInterval ?? globalThis.clearInterval
  }

  start(): void {
    if (this.timer !== undefined) return
    this.timer = this.setIntervalFn(() => {
      void this.tick()
    }, this.intervalMs)
  }

  stop(): void {
    if (this.timer === undefined) return
    this.clearIntervalFn(this.timer)
    this.timer = undefined
  }

  async pingNow(): Promise<"connected" | "disconnected"> {
    return this.tick()
  }

  private async tick(): Promise<"connected" | "disconnected"> {
    const ok = await this.ping()
    const state = ok ? "connected" : "disconnected"
    if (state !== this.lastState) {
      this.lastState = state
      this.listener(state)
    }
    return state
  }
}
