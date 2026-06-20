import type { Z80Registers } from "@amspirit/shared"
import { describe, expect, it } from "vitest"
import { buildRegisterScopes, buildStackScope, type RegisterScope } from "../src/registers-view.js"

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

  it("renders 16-bit register pairs as bare hex words (no 0x prefix)", () => {
    const s = buildRegisterScopes(REGS)
    expect(value(s, "Registers", "AF")).toBe("12C1")
    expect(value(s, "Registers", "BC")).toBe("3456")
    expect(value(s, "Registers", "DE")).toBe("789A")
    expect(value(s, "Registers", "HL")).toBe("BCDE")
    expect(value(s, "Registers", "IX")).toBe("1111")
    expect(value(s, "Registers", "IY")).toBe("2222")
    expect(value(s, "Registers", "SP")).toBe("C000")
    expect(value(s, "Registers", "PC")).toBe("8000")
  })

  it("places R (the refresh register) in Registers, not in Interrupts", () => {
    const s = buildRegisterScopes(REGS)
    expect(value(s, "Registers", "R")).toBe("40")
    expect(value(s, "Interrupts", "R")).toBeUndefined()
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
    expect(value(s, "Shadow", "AF'")).toBe("0102")
    expect(value(s, "Shadow", "BC'")).toBe("0304")
    expect(value(s, "Shadow", "DE'")).toBe("0506")
    expect(value(s, "Shadow", "HL'")).toBe("0708")
  })

  it("renders the interrupt state (I, IFF1/2, IM — without R)", () => {
    const s = buildRegisterScopes(REGS)
    expect(value(s, "Interrupts", "I")).toBe("3F")
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

describe("buildStackScope", () => {
  // Little-endian words at SP: [SP]=0x8003, [SP+2]=0x1234, [SP+4]=0xBEEF
  const BYTES = [0x03, 0x80, 0x34, 0x12, 0xef, 0xbe]

  it("labels each slot by its absolute address and shows the word it holds", () => {
    const scope = buildStackScope(0xc000, BYTES)
    expect(scope.name).toBe("Stack")
    expect(scope.variables[0]).toMatchObject({ name: "C000", value: "8003" })
    expect(scope.variables[1]).toMatchObject({ name: "C002", value: "1234" })
    expect(scope.variables[2]).toMatchObject({ name: "C004", value: "BEEF" })
  })

  it("exposes the held word as a memoryReference so a click jumps memory there", () => {
    const scope = buildStackScope(0xc000, BYTES)
    expect(scope.variables[0]?.memoryReference).toBe("0x8003")
    expect(scope.variables[2]?.memoryReference).toBe("0xBEEF")
  })

  it("wraps slot addresses at the 16-bit boundary", () => {
    const scope = buildStackScope(0xfffe, [0x00, 0x00, 0x11, 0x22])
    expect(scope.variables[0]?.name).toBe("FFFE")
    expect(scope.variables[1]?.name).toBe("0000")
  })

  it("stops at the bytes available (a short read yields fewer rows)", () => {
    expect(buildStackScope(0xc000, [0x03, 0x80]).variables).toHaveLength(1)
    expect(buildStackScope(0xc000, []).variables).toHaveLength(0)
    // a trailing odd byte can't form a word, so it's dropped
    expect(buildStackScope(0xc000, [0x03, 0x80, 0x34]).variables).toHaveLength(1)
  })

  it("caps the depth to the requested number of words", () => {
    const many = Array.from({ length: 64 }, () => 0)
    expect(buildStackScope(0x8000, many, 4).variables).toHaveLength(4)
  })
})
