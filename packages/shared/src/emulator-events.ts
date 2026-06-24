import * as http from "node:http"
import { SseParser } from "./sse-parse.js"

/**
 * Server-Sent-Events client for the emulator's `GET /api/events` push channel.
 * Replaces polling: the emulator emits `pause` / `z80_bp` / `basic_bp` the moment
 * execution stops, and `frame` per video frame. Transport-agnostic by design —
 * the HTTP call is injected (mirroring `PingService`/`StopPoller`), so the parse,
 * dispatch and reconnect logic test without sockets.
 *
 * Payload shapes mirror `format_sse_event` in the emulator's `web_server.cpp`.
 */

/** Per-frame Z80 snapshot (`frame`). 16-bit regs are hex strings, 8-bit numeric. */
export interface FrameEvent {
  pc: string
  sp: string
  a: number
  f: number
  b: number
  c: number
  d: number
  e: number
  h: number
  l: number
  ix: string
  iy: string
  fps: number
  frame: number
  paused: boolean
}

/** Z80 PC-breakpoint hit (`z80_bp`). */
export interface Z80BreakEvent {
  pc: string
  a: number
  f: number
  b: number
  c: number
  d: number
  e: number
  h: number
  l: number
  sp: string
  ix: string
  iy: string
}

/** BASIC statement-breakpoint hit (`basic_bp`). */
export interface BasicBreakEvent {
  line: number
  addr: string
}

/** Pause/resume transition (`pause`). */
export interface PauseEvent {
  paused: boolean
}

/** Machine reset (`reset`). */
export interface ResetEvent {
  hard: boolean
}

/** The emulator's SSE event types mapped to their decoded payloads. */
export interface EmulatorEventMap {
  frame: FrameEvent
  z80_bp: Z80BreakEvent
  basic_bp: BasicBreakEvent
  pause: PauseEvent
  reset: ResetEvent
}

export type EmulatorEventType = keyof EmulatorEventMap

/** A live connection the client can tear down. */
export interface SseConnection {
  close(): void
}

/** Callbacks a transport drives as the stream produces data / ends / fails. */
export interface SseTransportHandlers {
  onChunk(text: string): void
  onEnd(): void
  onError(err: Error): void
}

/** Opens one SSE request and feeds its body to the handlers. Injectable for tests. */
export type SseTransport = (
  url: { host: string; port: number; path: string },
  handlers: SseTransportHandlers,
) => SseConnection

export interface EmulatorEventsOptions {
  host?: string
  port?: number
  /** Server-side `?topics=` filter; omit for all events (includes 50 Hz `frame`). */
  topics?: readonly EmulatorEventType[]
  /** Reconnect after the stream drops (default true). */
  reconnect?: boolean
  /** Delay before a reconnect attempt (default 1000 ms). */
  reconnectDelayMs?: number
  transport?: SseTransport
  setTimeout?: typeof globalThis.setTimeout
  clearTimeout?: typeof globalThis.clearTimeout
}

const DEFAULTS = {
  host: "127.0.0.1",
  port: 8765,
  reconnect: true,
  reconnectDelayMs: 1000,
} as const

// biome-ignore lint/suspicious/noExplicitAny: heterogeneous listener map
type AnyListener = (payload: any) => void

export class EmulatorEvents {
  private readonly host: string
  private readonly port: number
  private readonly path: string
  private readonly reconnect: boolean
  private readonly reconnectDelayMs: number
  private readonly transport: SseTransport
  private readonly setTimeoutFn: typeof globalThis.setTimeout
  private readonly clearTimeoutFn: typeof globalThis.clearTimeout

  private readonly listeners = new Map<EmulatorEventType, Set<AnyListener>>()
  private readonly openListeners = new Set<() => void>()
  private readonly errorListeners = new Set<(err: Error) => void>()

  private connection: SseConnection | undefined
  private parser = new SseParser()
  private reconnectTimer: ReturnType<typeof globalThis.setTimeout> | undefined
  private closed = false
  private open = false

  constructor(options: EmulatorEventsOptions = {}) {
    this.host = options.host ?? DEFAULTS.host
    this.port = options.port ?? DEFAULTS.port
    this.path = buildEventsPath(options.topics)
    this.reconnect = options.reconnect ?? DEFAULTS.reconnect
    this.reconnectDelayMs = options.reconnectDelayMs ?? DEFAULTS.reconnectDelayMs
    this.transport = options.transport ?? httpTransport
    this.setTimeoutFn = options.setTimeout ?? globalThis.setTimeout
    this.clearTimeoutFn = options.clearTimeout ?? globalThis.clearTimeout
  }

  /** True while the stream is connected (first byte received, not yet dropped). */
  get connected(): boolean {
    return this.open
  }

  /** Subscribe to a typed emulator event; returns an unsubscribe function. */
  on<T extends EmulatorEventType>(
    type: T,
    listener: (payload: EmulatorEventMap[T]) => void,
  ): () => void {
    let set = this.listeners.get(type)
    if (!set) {
      set = new Set()
      this.listeners.set(type, set)
    }
    set.add(listener as AnyListener)
    return () => set?.delete(listener as AnyListener)
  }

  /** Notified when the stream connects (first bytes arrive). */
  onOpen(listener: () => void): () => void {
    this.openListeners.add(listener)
    return () => this.openListeners.delete(listener)
  }

  /** Notified on a transport error (a reconnect is scheduled separately). */
  onError(listener: (err: Error) => void): () => void {
    this.errorListeners.add(listener)
    return () => this.errorListeners.delete(listener)
  }

  /** Open the stream. A no-op if already connecting/connected. */
  start(): void {
    if (this.connection || this.closed) return
    this.connect()
  }

  /** Close the stream for good; cancels any pending reconnect. */
  close(): void {
    this.closed = true
    this.open = false
    if (this.reconnectTimer !== undefined) {
      this.clearTimeoutFn(this.reconnectTimer)
      this.reconnectTimer = undefined
    }
    this.connection?.close()
    this.connection = undefined
  }

  private connect(): void {
    this.parser = new SseParser()
    let sawData = false
    this.connection = this.transport(
      { host: this.host, port: this.port, path: this.path },
      {
        onChunk: (text) => {
          if (!sawData) {
            sawData = true
            this.open = true
            for (const l of this.openListeners) l()
          }
          for (const evt of this.parser.feed(text)) this.dispatch(evt.event, evt.data)
        },
        onEnd: () => this.handleDrop(),
        onError: (err) => {
          for (const l of this.errorListeners) l(err)
          this.handleDrop()
        },
      },
    )
  }

  private dispatch(type: string, data: string): void {
    const set = this.listeners.get(type as EmulatorEventType)
    if (!set || set.size === 0) return
    let payload: unknown
    try {
      payload = JSON.parse(data)
    } catch {
      return // ignore malformed payloads rather than crash the stream
    }
    for (const l of set) l(payload)
  }

  private handleDrop(): void {
    this.open = false
    this.connection = undefined
    if (this.closed || !this.reconnect) return
    this.reconnectTimer = this.setTimeoutFn(() => {
      this.reconnectTimer = undefined
      if (!this.closed) this.connect()
    }, this.reconnectDelayMs)
  }
}

/** Build `/api/events` with an optional `?topics=` filter. */
function buildEventsPath(topics?: readonly EmulatorEventType[]): string {
  if (!topics || topics.length === 0) return "/api/events"
  return `/api/events?topics=${topics.join(",")}`
}

/** Default transport: a long-lived `http.get` whose body chunks feed the parser. */
const httpTransport: SseTransport = (url, handlers) => {
  const req = http.get(
    {
      hostname: url.host,
      port: url.port,
      path: url.path,
      headers: { Accept: "text/event-stream" },
    },
    (res) => {
      const status = res.statusCode ?? 0
      if (status < 200 || status >= 300) {
        res.resume()
        handlers.onError(new Error(`HTTP ${status}`))
        return
      }
      res.setEncoding("utf-8")
      res.on("data", (chunk: string) => handlers.onChunk(chunk))
      res.on("end", () => handlers.onEnd())
      res.on("error", (err) => handlers.onError(err))
    },
  )
  req.on("error", (err) => handlers.onError(err))
  return {
    close: () => req.destroy(),
  }
}
