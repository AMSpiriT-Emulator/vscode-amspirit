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
 * Concurrent calls to `tick` are coalesced: only one ping is in flight at a time.
 */
export class PingService {
  private readonly intervalMs: number
  private readonly setIntervalFn: typeof globalThis.setInterval
  private readonly clearIntervalFn: typeof globalThis.clearInterval
  private timer: ReturnType<typeof globalThis.setInterval> | undefined
  private lastState: "connected" | "disconnected" | undefined
  private inFlight: Promise<"connected" | "disconnected"> | undefined

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
    void this.tick()
  }

  stop(): void {
    if (this.timer === undefined) return
    this.clearIntervalFn(this.timer)
    this.timer = undefined
  }

  async pingNow(): Promise<"connected" | "disconnected"> {
    return this.tick()
  }

  private tick(): Promise<"connected" | "disconnected"> {
    if (this.inFlight) return this.inFlight
    this.inFlight = (async () => {
      try {
        const ok = await this.ping()
        const state = ok ? "connected" : "disconnected"
        if (state !== this.lastState) {
          this.lastState = state
          this.listener(state)
        }
        return state
      } finally {
        this.inFlight = undefined
      }
    })()
    return this.inFlight
  }
}
