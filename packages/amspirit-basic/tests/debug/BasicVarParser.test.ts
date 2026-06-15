import { describe, expect, it } from "vitest"
import { decodeCpcFloat, decodeCpcString, parseBasicVars } from "../../src/debug/BasicVarParser.js"

/** 54-byte chain-head table with one chain (0-based letter index) pointing at ptr. */
function chainHeads(letterIndex: number, ptr: number): number[] {
  const heads = new Array<number>(54).fill(0)
  heads[letterIndex * 2] = ptr & 0xff
  heads[letterIndex * 2 + 1] = (ptr >> 8) & 0xff
  return heads
}

describe("decodeCpcString", () => {
  it("maps printable bytes to ASCII", () => {
    expect(decodeCpcString([72, 69, 76, 76, 79])).toBe("HELLO")
  })

  it("masks bit 7", () => {
    expect(decodeCpcString([193])).toBe("A")
  })
})

describe("decodeCpcFloat", () => {
  it("decodes 1.0", () => {
    expect(decodeCpcFloat([0x00, 0x00, 0x00, 0x00, 0x81], 0)).toBe("1")
  })

  it("decodes a zero exponent as 0", () => {
    expect(decodeCpcFloat([0x00, 0x00, 0x00, 0x00, 0x00], 0)).toBe("0")
  })

  it("decodes a negative value (sign bit set)", () => {
    expect(decodeCpcFloat([0x00, 0x00, 0x00, 0x80, 0x81], 0)).toBe("-1")
  })
})

describe("parseBasicVars", () => {
  it("returns nothing when all chains are empty", () => {
    expect(parseBasicVars(new Array(54).fill(0), [])).toEqual([])
  })

  it("decodes an integer variable A% = 5", () => {
    const vars = parseBasicVars(chainHeads(0, 1), [0x00, 0x00, 0x80, 0x01, 0x05, 0x00])
    expect(vars).toHaveLength(1)
    expect(vars[0]).toMatchObject({ name: "A%", baseName: "A", type: "int", value: "5" })
  })

  it("decodes a negative integer (two's complement)", () => {
    const vars = parseBasicVars(chainHeads(0, 1), [0x00, 0x00, 0x80, 0x01, 0xff, 0xff])
    expect(vars[0]?.value).toBe("-1")
  })

  it("decodes a multi-letter integer name AB%", () => {
    // name suffix "B" with bit 7 set on the last char = 0x42 | 0x80 = 0xC2
    const vars = parseBasicVars(chainHeads(0, 1), [0x00, 0x00, 0xc2, 0x01, 0x07, 0x00])
    expect(vars[0]).toMatchObject({ name: "AB%", baseName: "AB", value: "7" })
  })

  it("decodes a string descriptor B$ (length + address, no content)", () => {
    const vars = parseBasicVars(chainHeads(1, 1), [0x00, 0x00, 0x80, 0x02, 0x03, 0x34, 0x12])
    expect(vars[0]).toMatchObject({
      name: "B$",
      type: "string",
      strLen: 3,
      strAddr: 0x1234,
      value: "(len 3)",
    })
  })

  it("decodes a real variable C = 1", () => {
    const vars = parseBasicVars(
      chainHeads(2, 1),
      [0x00, 0x00, 0x80, 0x04, 0x00, 0x00, 0x00, 0x00, 0x81],
    )
    expect(vars[0]).toMatchObject({ name: "C", type: "real", value: "1" })
  })

  it("stops a corrupt self-referential chain (visited guard)", () => {
    // next offset points back to the same node (ptr 1) -> must not loop forever
    const vars = parseBasicVars(chainHeads(0, 1), [0x01, 0x00, 0x80, 0x01, 0x09, 0x00])
    expect(vars).toHaveLength(1)
    expect(vars[0]?.value).toBe("9")
  })
})
