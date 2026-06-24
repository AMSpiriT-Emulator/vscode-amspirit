/**
 * Detects an emulator stop (breakpoint / pause / step / run-to completion) the
 * instant it happens, with polling as a safety net.
 *
 * The emulator now pushes `pause` / `z80_bp` / `basic_bp` over SSE (see
 * {@link EmulatorEvents}), so a stop is known immediately instead of within one
 * poll interval. But the stream may be absent (older emulator), filtered or
 * momentarily dropped — so a {@link StopPoller} runs in parallel and whichever
 * fires first wins. Same `start()/cancel()` contract as `StopPoller`, so callers
 * swap one for the other unchanged.
 */
import {
  type PausedProbe,
  StopPoller,
  type StopPollerOptions,
  type StopReason,
} from "./stop-poller.js"

/** The subset of {@link EmulatorEvents} a watcher needs: subscribe to stop events. */
export interface StopWatcherEventSource {
  on(type: "pause", listener: (payload: { paused: boolean }) => void): () => void
  on(type: "z80_bp", listener: (payload: unknown) => void): () => void
  on(type: "basic_bp", listener: (payload: unknown) => void): () => void
}

export interface StopWatcherOptions {
  /** Push channel; omit to rely on polling alone. */
  events?: StopWatcherEventSource
  /** Polling fallback probe — resolves true once the emulator is paused. */
  probe: PausedProbe
  /** Timer injection passed through to the underlying {@link StopPoller}. */
  poller?: StopPollerOptions
}

export class StopWatcher {
  private readonly poller: StopPoller
  private readonly events: StopWatcherEventSource | undefined
  private unsubscribes: (() => void)[] = []
  private done = false
  private resolveFn: ((reason: StopReason) => void) | undefined
  private pending: Promise<StopReason> = Promise.resolve("cancelled")

  constructor(options: StopWatcherOptions) {
    this.poller = new StopPoller(options.probe, options.poller)
    this.events = options.events
  }

  /** Resolves `"stopped"` on the first stop signal, or `"cancelled"` via {@link cancel}. */
  start(): Promise<StopReason> {
    if (this.resolveFn) return this.pending
    this.done = false
    this.pending = new Promise<StopReason>((resolve) => {
      this.resolveFn = resolve
    })

    if (this.events) {
      this.unsubscribes.push(
        this.events.on("pause", (p) => {
          if (p.paused) this.finish("stopped")
        }),
        this.events.on("z80_bp", () => this.finish("stopped")),
        this.events.on("basic_bp", () => this.finish("stopped")),
      )
    }

    void this.poller.start().then((reason) => this.finish(reason))
    return this.pending
  }

  /** Stop watching and resolve a pending {@link start} with `"cancelled"`. */
  cancel(): void {
    this.finish("cancelled")
  }

  private finish(reason: StopReason): void {
    if (this.done) return
    this.done = true
    for (const off of this.unsubscribes) off()
    this.unsubscribes = []
    this.poller.cancel()
    const resolve = this.resolveFn
    this.resolveFn = undefined
    resolve?.(reason)
  }
}
