import { describe, expect, it } from "vitest"
import {
  buildMemoryRows,
  followBase,
  parseAddress,
  pointerMarks,
} from "../src/memory-view/memory-model.js"

// A "parking" address outside every window the tests use, so only the
// registers a test sets explicitly land inside the window under test.
const PARK = 0x8000
const NO_POINTERS = { BC: PARK, DE: PARK, HL: PARK, IX: PARK, IY: PARK, SP: PARK, PC: PARK }

describe("parseAddress", () => {
  it("parses bare hex", () => {
    expect(parseAddress("C000")).toBe(0xc000)
  })
  it("parses 0x-prefixed and &-prefixed (Amstrad) hex, case-insensitively", () => {
    expect(parseAddress("0xc000")).toBe(0xc000)
    expect(parseAddress("&C000")).toBe(0xc000)
  })
  it("trims surrounding whitespace", () => {
    expect(parseAddress("  4000  ")).toBe(0x4000)
  })
  it("masks to the 16-bit space", () => {
    expect(parseAddress("1FFFF")).toBe(0xffff)
  })
  it("returns undefined for non-hex input", () => {
    expect(parseAddress("")).toBeUndefined()
    expect(parseAddress("xyz")).toBeUndefined()
  })
})

describe("buildMemoryRows", () => {
  it("renders one full row of 16 bytes with address, hex and ascii", () => {
    const bytes = [
      0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x00, 0x01, 0x02, 0xff, 0xfe, 0x41, 0x42, 0x43, 0x44, 0x45,
      0x46,
    ]
    const rows = buildMemoryRows(bytes, { base: 0xc000, columns: 16 })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toEqual({
      addr: 0xc000,
      address: "C000",
      hex: [
        "48",
        "65",
        "6c",
        "6c",
        "6f",
        "00",
        "01",
        "02",
        "ff",
        "fe",
        "41",
        "42",
        "43",
        "44",
        "45",
        "46",
      ],
      // non-printable bytes (< 0x20 or >= 0x7f) render as '.'  (0x00 0x01 0x02 0xff 0xfe -> 5 dots)
      ascii: "Hello.....ABCDEF",
    })
  })

  it("splits into multiple rows, advancing the address by the column count", () => {
    const bytes = Array.from({ length: 20 }, (_, i) => i)
    const rows = buildMemoryRows(bytes, { base: 0x8000, columns: 16 })
    expect(rows).toHaveLength(2)
    expect(rows[0]?.address).toBe("8000")
    expect(rows[1]?.address).toBe("8010")
    expect(rows[1]?.hex).toEqual(["10", "11", "12", "13"])
    expect(rows[1]?.ascii).toBe("....")
  })

  it("wraps the 16-bit address space", () => {
    const bytes = Array.from({ length: 16 }, () => 0)
    const rows = buildMemoryRows(bytes, { base: 0xfff8, columns: 16 })
    expect(rows[0]?.address).toBe("FFF8")
    // second row would start at 0x10008 -> wraps to 0x0008
    const rows2 = buildMemoryRows(
      Array.from({ length: 24 }, () => 0),
      { base: 0xfff8, columns: 16 },
    )
    expect(rows2[1]?.address).toBe("0008")
  })

  it("honours a non-default column width", () => {
    const bytes = Array.from({ length: 16 }, (_, i) => i)
    const rows = buildMemoryRows(bytes, { base: 0x4000, columns: 8 })
    expect(rows).toHaveLength(2)
    expect(rows[1]?.address).toBe("4008")
  })
})

describe("pointerMarks", () => {
  it("marks a register that points inside the window at its byte offset", () => {
    const regs = { ...NO_POINTERS, HL: 0x4010 }
    expect(pointerMarks(regs, { base: 0x4000, length: 256 })).toEqual([
      { offset: 0x10, registers: ["HL"] },
    ])
  })

  it("ignores registers that point outside the window", () => {
    const regs = { ...NO_POINTERS, HL: 0x4010, DE: 0x8000 }
    expect(pointerMarks(regs, { base: 0x4000, length: 256 })).toEqual([
      { offset: 0x10, registers: ["HL"] },
    ])
  })

  it("groups several registers pointing at the same byte, in canonical order", () => {
    const regs = { ...NO_POINTERS, PC: 0x4000, BC: 0x4000, HL: 0x4000 }
    expect(pointerMarks(regs, { base: 0x4000, length: 256 })).toEqual([
      { offset: 0, registers: ["BC", "HL", "PC"] },
    ])
  })

  it("sorts marks by ascending offset", () => {
    const regs = { ...NO_POINTERS, SP: 0x40ff, PC: 0x4000, HL: 0x4080 }
    expect(pointerMarks(regs, { base: 0x4000, length: 256 })).toEqual([
      { offset: 0x00, registers: ["PC"] },
      { offset: 0x80, registers: ["HL"] },
      { offset: 0xff, registers: ["SP"] },
    ])
  })

  it("handles a window that wraps the 16-bit space", () => {
    const regs = { ...NO_POINTERS, HL: 0x0008 }
    // window starts at 0xFFF8, length 256 -> 0x0008 is offset 0x10
    expect(pointerMarks(regs, { base: 0xfff8, length: 256 })).toEqual([
      { offset: 0x10, registers: ["HL"] },
    ])
  })
})

describe("followBase", () => {
  it("centres a 256-byte window on PC, row-aligned", () => {
    // PC 0x8000, half window 0x80 -> 0x7F80 (already 16-aligned)
    expect(followBase(0x8000, 256, 16)).toBe(0x7f80)
  })

  it("aligns the base down to the column width", () => {
    // 0x8008 - 0x80 = 0x7F88 -> aligned down to 0x7F80
    expect(followBase(0x8008, 256, 16)).toBe(0x7f80)
  })

  it("wraps below 0x0000 into the 16-bit space", () => {
    // 0x0040 - 0x80 = -0x40 -> 0xFFC0
    expect(followBase(0x0040, 256, 16)).toBe(0xffc0)
  })
})
