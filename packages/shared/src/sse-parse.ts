/**
 * Pure, incremental parser for the `text/event-stream` (SSE) wire format, as
 * served by the emulator's `/api/events`. Transport-agnostic: feed it raw string
 * chunks (in any split) and it yields complete events once their terminating
 * blank line arrives. Comment lines (`: ready`, `: ping` heartbeats) are skipped.
 *
 * Only the fields the emulator uses are honoured (`event`, `data`); `id` and
 * `retry` are accepted and ignored. See the SSE spec for the field grammar:
 * https://html.spec.whatwg.org/multipage/server-sent-events.html
 */

/** One decoded SSE event: its type name and the concatenated `data` payload. */
export interface SseEvent {
  /** The `event:` field, or `"message"` when the stream omits it. */
  event: string
  /** The `data:` field(s), joined with `\n`. */
  data: string
}

export class SseParser {
  /** Bytes received but not yet terminated by a newline. */
  private buffer = ""
  /** `event:` value for the event currently being assembled. */
  private eventType = ""
  /** `data:` lines for the event currently being assembled. */
  private dataLines: string[] = []

  /** Feed a chunk of stream text; returns every event completed by it. */
  feed(chunk: string): SseEvent[] {
    this.buffer += chunk
    const events: SseEvent[] = []
    let nl = this.buffer.indexOf("\n")
    while (nl !== -1) {
      // Strip a trailing CR so CRLF streams parse like LF ones.
      let line = this.buffer.slice(0, nl)
      if (line.endsWith("\r")) line = line.slice(0, -1)
      this.buffer = this.buffer.slice(nl + 1)
      const event = this.handleLine(line)
      if (event) events.push(event)
      nl = this.buffer.indexOf("\n")
    }
    return events
  }

  /** Process one complete line; returns an event when the line dispatches one. */
  private handleLine(line: string): SseEvent | undefined {
    if (line === "") return this.dispatch()
    // A line starting with ':' is a comment (used for heartbeats); ignore it.
    if (line.startsWith(":")) return undefined

    const colon = line.indexOf(":")
    const field = colon === -1 ? line : line.slice(0, colon)
    let value = colon === -1 ? "" : line.slice(colon + 1)
    // The spec strips a single leading space after the colon.
    if (value.startsWith(" ")) value = value.slice(1)

    if (field === "event") this.eventType = value
    else if (field === "data") this.dataLines.push(value)
    // `id` / `retry` and unknown fields are accepted and ignored.
    return undefined
  }

  /** Emit the assembled event (if any) and reset for the next one. */
  private dispatch(): SseEvent | undefined {
    if (this.dataLines.length === 0 && this.eventType === "") return undefined
    const event: SseEvent = {
      event: this.eventType === "" ? "message" : this.eventType,
      data: this.dataLines.join("\n"),
    }
    this.eventType = ""
    this.dataLines = []
    return event
  }
}
