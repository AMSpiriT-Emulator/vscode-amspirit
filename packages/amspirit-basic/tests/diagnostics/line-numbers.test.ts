import { describe, expect, it } from "vitest"
import { findLineNumberIssues } from "../../src/diagnostics/line-numbers.js"

describe("findLineNumberIssues", () => {
  it("returns no issues for properly numbered BASIC", () => {
    const src = `10 CLS\n20 PRINT "HI"\n30 END\n`
    expect(findLineNumberIssues(src)).toEqual([])
  })

  it("flags statements missing a line number", () => {
    const src = `10 CLS\nPRINT "oops"\n30 END\n`
    const issues = findLineNumberIssues(src)
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ line: 1, startColumn: 0, endColumn: 12 })
  })

  it("ignores blank lines", () => {
    expect(findLineNumberIssues("\n\n10 END\n\n")).toEqual([])
  })

  it("ignores REM and apostrophe comments", () => {
    const src = `REM hello\n' world\n10 END\n`
    expect(findLineNumberIssues(src)).toEqual([])
  })

  it("reports the trimmed range, not the leading whitespace", () => {
    const issues = findLineNumberIssues("    PRINT 1   \n")
    expect(issues).toHaveLength(1)
    expect(issues[0]?.startColumn).toBe(4)
    expect(issues[0]?.endColumn).toBe(11)
  })

  it("handles CRLF line endings", () => {
    const issues = findLineNumberIssues("10 CLS\r\nPRINT 1\r\n")
    expect(issues).toHaveLength(1)
    expect(issues[0]?.line).toBe(1)
  })

  it("accepts any digit prefix as a line number", () => {
    expect(findLineNumberIssues("65535 END\n")).toEqual([])
  })
})
