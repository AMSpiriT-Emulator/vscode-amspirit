import type { Z80Registers } from "@amspirit/shared"
import { describe, expect, it } from "vitest"
import { buildRegisterScopes, type RegisterScope } from "../src/registers-view.js"

const REGS: Z80Registers = {
  PC: 0x8000,
  SP: 0xc000,
  A: 0x12,
  F: 0xc1, // S=1 Z=1 H=0 P/V=0 N=0 C=1
  B: 0x34,
  C: 0x56,
  D: 0x78,
  E: 0x9a,
  H: 0xbc,
  L: 0xde,
  A2: 0x01,
  F2: 0x02,
  B2: 0x03,
  C2: 0x04,
  D2: 0x05,
  E2: 0x06,
  H2: 0x07,
  L2: 0x08,
  IX: 0x1111,
  IY: 0x2222,
  I: 0x3f,
  R: 0x40,
  IFF1: 1,
  IFF2: 0,
  IM: 2,
}

const value = (scopes: RegisterScope[], scope: string, name: string): string | undefined =>
  scopes.find((s) => s.name === scope)?.variables.find((v) => v.name === name)?.value

const memref = (scopes: RegisterScope[], scope: string, name: string): string | undefined =>
  scopes.find((s) => s.name === scope)?.variables.find((v) => v.name === name)?.memoryReference

describe("buildRegisterScopes", () => {
  it("groups registers into Registers / Flags / Shadow / Interrupts", () => {
    const scopes = buildRegisterScopes(REGS)
    expect(scopes.map((s) => s.name)).toEqual(["Registers", "Flags", "Shadow", "Interrupts"])
  })

  it("renders 16-bit register pairs as hex words", () => {
    const s = buildRegisterScopes(REGS)
    expect(value(s, "Registers", "AF")).toBe("0x12C1")
    expect(value(s, "Registers", "BC")).toBe("0x3456")
    expect(value(s, "Registers", "DE")).toBe("0x789A")
    expect(value(s, "Registers", "HL")).toBe("0xBCDE")
    expect(value(s, "Registers", "IX")).toBe("0x1111")
    expect(value(s, "Registers", "IY")).toBe("0x2222")
    expect(value(s, "Registers", "SP")).toBe("0xC000")
    expect(value(s, "Registers", "PC")).toBe("0x8000")
  })

  it("decodes the flags from F (S Z H P/V N C)", () => {
    const s = buildRegisterScopes(REGS)
    expect(value(s, "Flags", "S")).toBe("1")
    expect(value(s, "Flags", "Z")).toBe("1")
    expect(value(s, "Flags", "H")).toBe("0")
    expect(value(s, "Flags", "P/V")).toBe("0")
    expect(value(s, "Flags", "N")).toBe("0")
    expect(value(s, "Flags", "C")).toBe("1")
  })

  it("renders the shadow register pairs", () => {
    const s = buildRegisterScopes(REGS)
    expect(value(s, "Shadow", "AF'")).toBe("0x0102")
    expect(value(s, "Shadow", "BC'")).toBe("0x0304")
    expect(value(s, "Shadow", "DE'")).toBe("0x0506")
    expect(value(s, "Shadow", "HL'")).toBe("0x0708")
  })

  it("renders the interrupt state", () => {
    const s = buildRegisterScopes(REGS)
    expect(value(s, "Interrupts", "I")).toBe("0x3F")
    expect(value(s, "Interrupts", "R")).toBe("0x40")
    expect(value(s, "Interrupts", "IFF1")).toBe("1")
    expect(value(s, "Interrupts", "IFF2")).toBe("0")
    expect(value(s, "Interrupts", "IM")).toBe("2")
  })

  it("exposes a memoryReference on the pointer registers (for the hex inspector)", () => {
    const s = buildRegisterScopes(REGS)
    // The pointer registers point into RAM, so their value is the memory anchor.
    expect(memref(s, "Registers", "BC")).toBe("0x3456")
    expect(memref(s, "Registers", "DE")).toBe("0x789A")
    expect(memref(s, "Registers", "HL")).toBe("0xBCDE")
    expect(memref(s, "Registers", "IX")).toBe("0x1111")
    expect(memref(s, "Registers", "IY")).toBe("0x2222")
    expect(memref(s, "Registers", "SP")).toBe("0xC000")
    expect(memref(s, "Registers", "PC")).toBe("0x8000")
  })

  it("does not expose a memoryReference on non-pointer entries", () => {
    const s = buildRegisterScopes(REGS)
    expect(memref(s, "Registers", "AF")).toBeUndefined()
    expect(memref(s, "Flags", "Z")).toBeUndefined()
    expect(memref(s, "Shadow", "HL'")).toBeUndefined()
    expect(memref(s, "Interrupts", "I")).toBeUndefined()
  })

  it("decodes all flags set", () => {
    const s = buildRegisterScopes({ ...REGS, F: 0xff })
    for (const f of ["S", "Z", "H", "P/V", "N", "C"]) {
      expect(value(s, "Flags", f)).toBe("1")
    }
  })
})
