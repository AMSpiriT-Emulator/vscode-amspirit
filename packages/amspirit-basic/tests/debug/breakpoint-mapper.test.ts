import type { BasicListing } from "@amspirit/shared"
import { describe, expect, it } from "vitest"
import {
  breakpointAddresses,
  editorLineForBasicLine,
  indexListingByLine,
  parseBasicLineNumber,
  resolveBreakpoints,
} from "../../src/debug/breakpoint-mapper.js"

const listing: BasicListing = {
  lines: [
    {
      addr: 368,
      num: 10,
      stmts: [{ addr: 371, end: 378, colon: false, text: "A=1", vars: ["A"] }],
    },
    {
      addr: 378,
      num: 20,
      stmts: [
        { addr: 381, end: 388, colon: false, text: "A=A+1", vars: ["A"] },
        { addr: 388, end: 395, colon: true, text: "GOTO 20", vars: [] },
      ],
    },
    { addr: 395, num: 100, stmts: [{ addr: 398, end: 402, colon: false, text: "END", vars: [] }] },
  ],
}

const doc = ["10 A=1", "20 A=A+1:GOTO 20", "100 END"]

describe("parseBasicLineNumber", () => {
  it("extracts the leading line number", () => {
    expect(parseBasicLineNumber("10 PRINT")).toBe(10)
    expect(parseBasicLineNumber("  20 A=1")).toBe(20)
  })

  it("returns undefined when no leading number", () => {
    expect(parseBasicLineNumber("REM no number")).toBeUndefined()
    expect(parseBasicLineNumber("")).toBeUndefined()
  })
})

describe("indexListingByLine", () => {
  it("maps each BASIC line number to its line record", () => {
    const idx = indexListingByLine(listing)
    expect(idx.get(20)?.stmts).toHaveLength(2)
    expect(idx.get(100)?.addr).toBe(395)
  })
})

describe("resolveBreakpoints", () => {
  it("maps an editor line to the first statement address of its BASIC line", () => {
    const [bp] = resolveBreakpoints([2], doc, listing)
    expect(bp).toEqual({ line: 2, verified: true, basicLine: 20, addr: 381 })
  })

  it("marks lines absent from the listing as unverified", () => {
    const [bp] = resolveBreakpoints([5], doc, listing)
    expect(bp).toEqual({ line: 5, verified: false })
  })

  it("marks a numbered line not present in the listing as unverified but keeps basicLine", () => {
    const docWithExtra = [...doc, "30 PRINT"]
    const [bp] = resolveBreakpoints([4], docWithExtra, listing)
    expect(bp).toEqual({ line: 4, verified: false, basicLine: 30 })
  })

  it("resolves several breakpoints at once", () => {
    const res = resolveBreakpoints([1, 3], doc, listing)
    expect(res.map((r) => r.addr)).toEqual([371, 398])
  })
})

describe("breakpointAddresses", () => {
  it("collects only verified addresses", () => {
    const res = resolveBreakpoints([1, 5, 3], doc, listing)
    expect(breakpointAddresses(res)).toEqual([371, 398])
  })
})

describe("editorLineForBasicLine", () => {
  it("finds the 1-based editor line declaring a BASIC line number", () => {
    expect(editorLineForBasicLine(20, doc)).toBe(2)
    expect(editorLineForBasicLine(100, doc)).toBe(3)
  })

  it("returns undefined when the BASIC line is not in the document", () => {
    expect(editorLineForBasicLine(999, doc)).toBeUndefined()
  })
})
