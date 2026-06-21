import type { ConnectionState } from "./ping-service.js"

/**
 * Drives a webview view's refresh from the {@link EmulatorEventHub}. A stop
 * signal (breakpoint / pause / step landing — including the debugger's
 * authoritative `stopped`, which a single-instruction step does NOT surface over
 * SSE) refreshes immediately, so a view snaps to the stopped state the moment
 * execution halts. Frame events optionally drive a throttled live refresh while
 * running (for the views that show continuously-changing state — registers, the
 * peripheral chips).
 *
 * A safety poll always runs underneath as a floor, so a view can never freeze on
 * stale state even if the push channel is silent (e.g. an emulator build that
 * doesn't emit per-frame snapshots while paused) or absent: it polls slowly when
 * the stream is connected (the push events do the real work) and fast when it is
 * not (polling is then the only signal).
 *
 * Pure orchestration: the event source and timers are injected, so it tests
 * deterministically (mirrors `StopPoller` / `PingService`).
 */

/** The hub surface a scheduler subscribes to. {@link EmulatorEventHub} satisfies it. */
export interface RefreshTriggerSource {
  onStop(listener: () => void): () => void
  onFrame(listener: (payload: unknown) => void): () => void
  onConnectionChange(listener: (state: ConnectionState) => void): () => void
  readonly connected: boolean
}

export interface RefreshSchedulerOptions {
  /** Refresh on frame events (throttled). For live-while-running views. Default false. */
  onFrame?: boolean
  /** Minimum gap between frame-driven refreshes (default 150 ms). */
  frameThrottleMs?: number
  /** Safety-poll interval while the SSE stream is connected (default 2000 ms). */
  connectedPollMs?: number
  /** Poll interval while the SSE stream is unavailable (default 500 ms). */
  disconnectedPollMs?: number
  setInterval?: typeof globalThis.setInterval
  clearInterval?: typeof globalThis.clearInterval
  now?: () => number
}

const DEFAULT_FRAME_THROTTLE_MS = 150
const DEFAULT_CONNECTED_POLL_MS = 2000
const DEFAULT_DISCONNECTED_POLL_MS = 500

export class RefreshScheduler {
  private readonly onFrameEnabled: boolean
  private readonly frameThrottleMs: number
  private readonly connectedPollMs: number
  private readonly disconnectedPollMs: number
  private readonly setIntervalFn: typeof globalThis.setInterval
  private readonly clearIntervalFn: typeof globalThis.clearInterval
  private readonly now: () => number

  private unsubscribes: (() => void)[] = []
  private pollTimer: ReturnType<typeof globalThis.setInterval> | undefined
  private lastRefresh = Number.NEGATIVE_INFINITY
  private active = false

  constructor(
    private readonly source: RefreshTriggerSource,
    private readonly refresh: () => void,
    options: RefreshSchedulerOptions = {},
  ) {
    this.onFrameEnabled = options.onFrame ?? false
    this.frameThrottleMs = options.frameThrottleMs ?? DEFAULT_FRAME_THROTTLE_MS
    this.connectedPollMs = options.connectedPollMs ?? DEFAULT_CONNECTED_POLL_MS
    this.disconnectedPollMs = options.disconnectedPollMs ?? DEFAULT_DISCONNECTED_POLL_MS
    this.setIntervalFn = options.setInterval ?? globalThis.setInterval
    this.clearIntervalFn = options.clearInterval ?? globalThis.clearInterval
    this.now = options.now ?? (() => Date.now())
  }

  /** Begin driving refreshes; refreshes once immediately for the current state. */
  start(): void {
    if (this.active) return
    this.active = true

    this.unsubscribes.push(
      this.source.onStop(() => this.doRefresh()),
      this.source.onConnectionChange((state) => this.onConnectionChange(state)),
    )
    if (this.onFrameEnabled) {
      this.unsubscribes.push(this.source.onFrame(() => this.onFrameTick()))
    }

    this.doRefresh()
    this.startPoll(this.source.connected ? this.connectedPollMs : this.disconnectedPollMs)
  }

  /** Stop driving refreshes and release all subscriptions/timers. */
  stop(): void {
    if (!this.active) return
    this.active = false
    for (const off of this.unsubscribes) off()
    this.unsubscribes = []
    this.stopPoll()
  }

  private onConnectionChange(state: ConnectionState): void {
    if (state === "connected") {
      // The push channel is live: snap to current state, and slow the safety poll.
      this.doRefresh()
      this.startPoll(this.connectedPollMs)
    } else {
      // No push channel: polling is the only signal, so poll faster.
      this.startPoll(this.disconnectedPollMs)
    }
  }

  private onFrameTick(): void {
    if (this.now() - this.lastRefresh >= this.frameThrottleMs) this.doRefresh()
  }

  private doRefresh(): void {
    this.lastRefresh = this.now()
    this.refresh()
  }

  /** (Re)start the safety poll at the given interval. */
  private startPoll(intervalMs: number): void {
    this.stopPoll()
    this.pollTimer = this.setIntervalFn(() => this.doRefresh(), intervalMs)
  }

  private stopPoll(): void {
    if (this.pollTimer === undefined) return
    this.clearIntervalFn(this.pollTimer)
    this.pollTimer = undefined
  }
}
