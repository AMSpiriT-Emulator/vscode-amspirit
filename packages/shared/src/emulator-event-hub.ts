import type { EmulatorEvents } from "./emulator-events.js"
import type { ConnectionState } from "./ping-service.js"

/**
 * A single, shared, retargetable SSE connection for the webview side.
 *
 * The emulator caps SSE clients (8), and we have many views (Registers, Memory,
 * Disassembly, four peripheral chips). So instead of each view opening its own
 * `/api/events` stream, they all subscribe to one hub: it fans `frame` out for
 * live refresh, collapses `pause`/`z80_bp`/`basic_bp` into a single "stop"
 * signal, and surfaces connection state (replacing the `/api/ping` poll that
 * drove the status bar). `retarget` swaps the emulator target — e.g. when the
 * configured web port changes — without consumers having to re-subscribe.
 */

/** Builds the underlying stream; injectable so the hub tests without sockets. */
export type EventsFactory = (host: string, port: number) => EmulatorEvents

export class EmulatorEventHub {
  private host: string
  private port: number
  private events: EmulatorEvents | undefined
  private disposed = false

  private readonly stopListeners = new Set<() => void>()
  private readonly frameListeners = new Set<(payload: unknown) => void>()
  private readonly connListeners = new Set<(state: ConnectionState) => void>()
  private connection: ConnectionState = "disconnected"

  constructor(
    private readonly makeEvents: EventsFactory,
    host: string,
    port: number,
  ) {
    this.host = host
    this.port = port
  }

  /** True while the SSE stream is connected. */
  get connected(): boolean {
    return this.connection === "connected"
  }

  /** Subscribe to the collapsed stop signal (breakpoint / pause / step landing). */
  onStop(listener: () => void): () => void {
    this.stopListeners.add(listener)
    return () => this.stopListeners.delete(listener)
  }

  /**
   * Fire the stop signal directly, without an SSE event. Single-instruction
   * steps don't emit an SSE `pause`/`bp` event (the emulator just re-freezes), so
   * the debug adapter pulses this when it reports a DAP `stopped` — the
   * authoritative moment the registers/memory are final.
   */
  pulseStop(): void {
    this.fireStop()
  }

  /** Subscribe to raw per-frame snapshots (~50 Hz while running). */
  onFrame(listener: (payload: unknown) => void): () => void {
    this.frameListeners.add(listener)
    return () => this.frameListeners.delete(listener)
  }

  /** Subscribe to connection-state transitions (de-duplicated). */
  onConnectionChange(listener: (state: ConnectionState) => void): () => void {
    this.connListeners.add(listener)
    return () => this.connListeners.delete(listener)
  }

  /** Open the stream to the current target. */
  start(): void {
    if (this.disposed || this.events) return
    this.connect()
  }

  /** Point the hub at a different emulator; a no-op when the target is unchanged. */
  retarget(host: string, port: number): void {
    if (host === this.host && port === this.port) return
    this.host = host
    this.port = port
    const wasRunning = this.events !== undefined
    this.teardown()
    if (wasRunning && !this.disposed) this.connect()
  }

  /** Close the stream for good. */
  dispose(): void {
    this.disposed = true
    this.teardown()
  }

  private connect(): void {
    const events = this.makeEvents(this.host, this.port)
    this.events = events
    events.onOpen(() => this.setConnection("connected"))
    events.onError(() => this.setConnection("disconnected"))
    events.on("frame", (p) => {
      for (const l of this.frameListeners) l(p)
    })
    events.on("pause", (p) => {
      if (p.paused) this.fireStop()
    })
    events.on("z80_bp", () => this.fireStop())
    events.on("basic_bp", () => this.fireStop())
    events.start()
  }

  private teardown(): void {
    this.events?.close()
    this.events = undefined
    this.setConnection("disconnected")
  }

  private fireStop(): void {
    for (const l of this.stopListeners) l()
  }

  private setConnection(state: ConnectionState): void {
    if (state === this.connection) return
    this.connection = state
    for (const l of this.connListeners) l(state)
  }
}
