import { disassemble } from "@amspirit/shared"
import { describe, expect, it } from "vitest"
import { formatDisassembly } from "../src/memory-view/disasm-export.js"

describe("formatDisassembly", () => {
  // 8000: LD HL,0x1234 (21 34 12) ; 8003: LD A,0x05 (3E 05)
  const instrs = disassemble([0x21, 0x34, 0x12, 0x3e, 0x05], 0x8000, 8)

  it("emits a header with the selected range and an ORG directive", () => {
    const asm = formatDisassembly(instrs, { start: 0x8000, end: 0x8004 })
    expect(asm).toContain("disassembly 8000-8004 (5 bytes)")
    expect(asm).toContain("ORG 0x8000")
  })

  it("lists each instruction with an address + raw bytes comment", () => {
    const asm = formatDisassembly(instrs, { start: 0x8000, end: 0x8004 })
    const lines = asm.split("\n")
    expect(lines.some((l) => l.includes("LD HL,0x1234") && l.includes("; 8000: 21 34 12"))).toBe(
      true,
    )
    expect(lines.some((l) => l.includes("LD A,0x05") && l.includes("; 8003: 3E 05"))).toBe(true)
  })

  it("derives ORG from the first instruction and ends with a newline", () => {
    const asm = formatDisassembly(disassemble([0x00], 0xc000, 1), { start: 0xc000, end: 0xc000 })
    expect(asm).toContain("ORG 0xC000")
    expect(asm.endsWith("\n")).toBe(true)
  })
})
