import type { Z80Registers } from "@amspirit/shared"
import { describe, expect, it } from "vitest"
import { buildRegisterView } from "../../src/debug/register-view.js"

const regs: Z80Registers = {
  PC: 0x1234,
  SP: 0x4000,
  A: 0xff,
  F: 0x40,
  B: 0x12,
  C: 0x34,
  D: 0x56,
  E: 0x78,
  H: 0x9a,
  L: 0xbc,
  IX: 0x1000,
  IY: 0x2000,
  I: 0x10,
  R: 0x7f,
  IFF1: 1,
  IFF2: 0,
  IM: 2,
}

describe("buildRegisterView", () => {
  it("formats 16-bit registers and pairs as hex words", () => {
    const view = buildRegisterView(regs)
    const byName = Object.fromEntries(view.registers.map((r) => [r.name, r.value]))
    expect(byName.PC).toBe("0x1234")
    expect(byName.SP).toBe("0x4000")
    expect(byName.AF).toBe("0xFF40")
    expect(byName.BC).toBe("0x1234")
    expect(byName.DE).toBe("0x5678")
    expect(byName.HL).toBe("0x9ABC")
    expect(byName.IX).toBe("0x1000")
    expect(byName.IY).toBe("0x2000")
  })

  it("formats I and R as hex bytes", () => {
    const byName = Object.fromEntries(
      buildRegisterView(regs).registers.map((r) => [r.name, r.value]),
    )
    expect(byName.I).toBe("0x10")
    expect(byName.R).toBe("0x7F")
  })

  it("derives the flags string from F", () => {
    expect(buildRegisterView(regs).flags).toBe("·Z····")
  })

  it("lists the interrupt state", () => {
    const byName = Object.fromEntries(
      buildRegisterView(regs).interrupts.map((r) => [r.name, r.value]),
    )
    expect(byName.IFF1).toBe("1")
    expect(byName.IFF2).toBe("0")
    expect(byName.IM).toBe("2")
  })
})
