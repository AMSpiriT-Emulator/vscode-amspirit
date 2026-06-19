import { disassemble } from "@amspirit/shared"
import { describe, expect, it } from "vitest"
import { formatDisassembly } from "../src/memory-view/disasm-export.js"

describe("formatDisassembly", () => {
  // 8000: LD HL,0x1234 (21 34 12) ; 8003: LD A,0x05 (3E 05)
  const instrs = disassemble([0x21, 0x34, 0x12, 0x3e, 0x05], 0x8000, 8)

  it("emits a header with the selected range and an ORG directive", () => {
    const asm = formatDisassembly(instrs, { start: 0x8000, end: 0x8004 })
    expect(asm).toContain("disassembly 8000-8004 (5 bytes)")
    expect(asm).toContain("ORG #8000")
  })

  it("renders hex with a # prefix (word and byte operands)", () => {
    const asm = formatDisassembly(instrs, { start: 0x8000, end: 0x8004 })
    const lines = asm.split("\n")
    expect(lines.some((l) => l.includes("LD HL,#1234") && l.includes("; 8000: 21 34 12"))).toBe(
      true,
    )
    expect(lines.some((l) => l.includes("LD A,#05") && l.includes("; 8003: 3E 05"))).toBe(true)
    // never leaves a 0x-style literal in the code column
    expect(asm).not.toMatch(/\b0x[0-9A-Fa-f]/)
  })

  it("derives ORG from the first instruction and ends with a newline", () => {
    const asm = formatDisassembly(disassemble([0x00], 0xc000, 1), { start: 0xc000, end: 0xc000 })
    expect(asm).toContain("ORG #C000")
    expect(asm.endsWith("\n")).toBe(true)
  })

  it("emits a label definition line at an address the resolver names", () => {
    const resolve = (addr: number): string | undefined => (addr === 0x8000 ? "start" : undefined)
    const asm = formatDisassembly(instrs, { start: 0x8000, end: 0x8004, resolve })
    const lines = asm.split("\n")
    const labelIdx = lines.indexOf("start:")
    expect(labelIdx).toBeGreaterThanOrEqual(0)
    // the label sits immediately above its instruction
    expect(lines[labelIdx + 1]).toContain("LD HL,#1234")
  })

  it("generates an address-derived label for an in-range branch target with no symbol", () => {
    // 9000: JP 0x9006 (C3 06 90), then NOPs through 9006 (the target).
    const code = disassemble([0xc3, 0x06, 0x90, 0x00, 0x00, 0x00, 0x00], 0x9000, 10)
    const asm = formatDisassembly(code, { start: 0x9000, end: 0x9006 })
    expect(asm).toContain("JP L9006")
    expect(asm.split("\n")).toContain("L9006:")
  })

  it("leaves an out-of-range target as a literal (no invented label)", () => {
    const code = disassemble([0xc3, 0x00, 0x40], 0x9000, 1) // JP 0x4000, outside the listing
    const asm = formatDisassembly(code, { start: 0x9000, end: 0x9002 })
    expect(asm).toContain("JP #4000")
    expect(asm).not.toContain("L4000:")
  })

  it("prefers a real symbol over a generated label for the same target", () => {
    const code = disassemble([0xc3, 0x06, 0x90, 0x00, 0x00, 0x00, 0x00], 0x9000, 10)
    const resolve = (addr: number): string | undefined => (addr === 0x9006 ? "loop" : undefined)
    const asm = formatDisassembly(code, { start: 0x9000, end: 0x9006, resolve })
    expect(asm).toContain("JP loop")
    expect(asm).not.toContain("L9006")
  })

  it("substitutes a label for a resolved 16-bit operand", () => {
    // CALL 0xBB5A -> CALL TXT_OUTPUT
    const call = disassemble([0xcd, 0x5a, 0xbb], 0x9000, 1)
    const resolve = (addr: number): string | undefined =>
      addr === 0xbb5a ? "TXT OUTPUT" : undefined
    const asm = formatDisassembly(call, { start: 0x9000, end: 0x9002, resolve })
    // spaces become underscores so the label is a valid identifier
    expect(asm).toContain("CALL TXT_OUTPUT")
    expect(asm).not.toContain("#BB5A")
  })

  it("keeps the literal when no label resolves the operand", () => {
    const call = disassemble([0xcd, 0x5a, 0xbb], 0x9000, 1)
    const asm = formatDisassembly(call, { start: 0x9000, end: 0x9002 })
    expect(asm).toContain("CALL #BB5A")
  })
})
