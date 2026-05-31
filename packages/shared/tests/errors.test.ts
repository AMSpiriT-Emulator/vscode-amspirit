import { describe, expect, it } from "vitest"
import { errorMessage } from "../src/errors.js"

describe("errorMessage", () => {
  it("returns the message of an Error", () => {
    expect(errorMessage(new Error("boom"))).toBe("boom")
  })

  it("returns strings as-is", () => {
    expect(errorMessage("plain")).toBe("plain")
  })

  it("JSON-stringifies plain objects", () => {
    expect(errorMessage({ code: 42 })).toBe('{"code":42}')
  })

  it("falls back to String() on values that cannot be stringified", () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular
    expect(errorMessage(circular)).toBe("[object Object]")
  })

  it("handles null and undefined", () => {
    expect(errorMessage(null)).toBe("null")
    expect(errorMessage(undefined)).toBe("undefined")
  })
})
