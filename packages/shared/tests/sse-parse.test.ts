import { describe, expect, it } from "vitest"
import { SseParser } from "../src/sse-parse.js"

/** Collect every event the parser yields for the given chunks. */
function parseAll(chunks: readonly string[]): { event: string; data: string }[] {
  const parser = new SseParser()
  const out: { event: string; data: string }[] = []
  for (const chunk of chunks) out.push(...parser.feed(chunk))
  return out
}

describe("SseParser", () => {
  it("parses a single event with an explicit name", () => {
    expect(parseAll(['event: pause\ndata: {"paused":true}\n\n'])).toEqual([
      { event: "pause", data: '{"paused":true}' },
    ])
  })

  it("defaults the event name to `message` when none is given", () => {
    expect(parseAll(["data: hello\n\n"])).toEqual([{ event: "message", data: "hello" }])
  })

  it("emits nothing until the terminating blank line", () => {
    const parser = new SseParser()
    expect(parser.feed("event: pause\ndata: {}\n")).toEqual([])
    expect(parser.feed("\n")).toEqual([{ event: "pause", data: "{}" }])
  })

  it("reassembles an event split across feed() boundaries mid-field", () => {
    const parser = new SseParser()
    expect(parser.feed("event: z8")).toEqual([])
    expect(parser.feed('0_bp\ndata: {"pc":"0x4000"')).toEqual([])
    expect(parser.feed("}\n\n")).toEqual([{ event: "z80_bp", data: '{"pc":"0x4000"}' }])
  })

  it("ignores comment lines (`: ready`, `: ping` heartbeats)", () => {
    expect(
      parseAll([": ready\n\n", ": ping\n\n", 'event: reset\ndata: {"hard":true}\n\n']),
    ).toEqual([{ event: "reset", data: '{"hard":true}' }])
  })

  it("joins multiple data lines with newlines per the SSE spec", () => {
    expect(parseAll(["data: line1\ndata: line2\n\n"])).toEqual([
      { event: "message", data: "line1\nline2" },
    ])
  })

  it("strips only the single leading space after the colon", () => {
    expect(parseAll(["data:  two-leading-spaces\n\n"])).toEqual([
      { event: "message", data: " two-leading-spaces" },
    ])
  })

  it("handles several events in one chunk", () => {
    expect(
      parseAll(['event: pause\ndata: {"paused":false}\n\nevent: pause\ndata: {"paused":true}\n\n']),
    ).toEqual([
      { event: "pause", data: '{"paused":false}' },
      { event: "pause", data: '{"paused":true}' },
    ])
  })

  it("tolerates CRLF line endings", () => {
    expect(parseAll(['event: pause\r\ndata: {"paused":true}\r\n\r\n'])).toEqual([
      { event: "pause", data: '{"paused":true}' },
    ])
  })
})
