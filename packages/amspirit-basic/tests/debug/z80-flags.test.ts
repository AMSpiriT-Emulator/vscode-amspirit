import { describe, expect, it } from "vitest"
import { decodeFlags, formatFlags } from "../../src/debug/z80-flags.js"

describe("decodeFlags", () => {
  it("decodes all flags clear", () => {
    expect(decodeFlags(0x00)).toEqual({
      S: false,
      Z: false,
      H: false,
      PV: false,
      N: false,
      C: false,
    })
  })

  it("decodes all documented flags set", () => {
    // S(7) Z(6) H(4) P/V(2) N(1) C(0) = 1101 0111 = 0xD7
    expect(decodeFlags(0xd7)).toEqual({ S: true, Z: true, H: true, PV: true, N: true, C: true })
  })

  it("ignores the undocumented bits 5 and 3", () => {
    expect(decodeFlags(0x28)).toEqual({
      S: false,
      Z: false,
      H: false,
      PV: false,
      N: false,
      C: false,
    })
  })

  it("decodes carry only", () => {
    expect(decodeFlags(0x01).C).toBe(true)
    expect(decodeFlags(0x01).Z).toBe(false)
  })

  it("decodes zero flag only", () => {
    expect(decodeFlags(0x40)).toMatchObject({ Z: true, S: false })
  })
})

describe("formatFlags", () => {
  it("renders set flags as letters and clear flags as dots, in SZHPNC order", () => {
    expect(formatFlags(0xd7)).toBe("SZHPNC")
    expect(formatFlags(0x00)).toBe("······")
  })

  it("renders a mix", () => {
    // Z + C set -> ·Z···C
    expect(formatFlags(0x41)).toBe("·Z···C")
  })
})
