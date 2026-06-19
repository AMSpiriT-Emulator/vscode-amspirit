import type { Z80Registers } from "@amspirit/shared"

/** A single register/flag entry rendered for the DAP Variables view. */
interface RegisterVariable {
  name: string
  value: string
  /**
   * For registers that point into RAM, a DAP memory anchor (the address as a
   * numeric string) so VS Code's "View Binary Data" opens the native hex
   * inspector there. Absent on flags, shadow and interrupt entries.
   */
  memoryReference?: string
}

/** A named group of register variables (one DAP scope). */
export interface RegisterScope {
  name: string
  variables: RegisterVariable[]
}

const word = (n: number): string => `0x${(n & 0xffff).toString(16).toUpperCase().padStart(4, "0")}`
const byte = (n: number): string => `0x${(n & 0xff).toString(16).toUpperCase().padStart(2, "0")}`
const pair = (hi: number, lo: number): string => word(((hi & 0xff) << 8) | (lo & 0xff))
const bit = (value: number, index: number): string => `${(value >> index) & 1}`

/**
 * Format a Z80 register snapshot into the four DAP scopes shown in the
 * Variables view: the main registers, the decoded flags, the shadow set and the
 * interrupt state. Pure: the session maps these to `DebugProtocol.Variable`s.
 */
export function buildRegisterScopes(r: Z80Registers): RegisterScope[] {
  return [
    {
      name: "Registers",
      // Pointer registers carry a memoryReference so the hex inspector can open
      // at the address they hold; AF is data, so it has none.
      variables: [
        { name: "AF", value: pair(r.A, r.F) },
        { name: "BC", value: pair(r.B, r.C), memoryReference: pair(r.B, r.C) },
        { name: "DE", value: pair(r.D, r.E), memoryReference: pair(r.D, r.E) },
        { name: "HL", value: pair(r.H, r.L), memoryReference: pair(r.H, r.L) },
        { name: "IX", value: word(r.IX), memoryReference: word(r.IX) },
        { name: "IY", value: word(r.IY), memoryReference: word(r.IY) },
        { name: "SP", value: word(r.SP), memoryReference: word(r.SP) },
        { name: "PC", value: word(r.PC), memoryReference: word(r.PC) },
      ],
    },
    {
      name: "Flags",
      // Z80 F layout: S Z - H - P/V N C (bits 7..0).
      variables: [
        { name: "S", value: bit(r.F, 7) },
        { name: "Z", value: bit(r.F, 6) },
        { name: "H", value: bit(r.F, 4) },
        { name: "P/V", value: bit(r.F, 2) },
        { name: "N", value: bit(r.F, 1) },
        { name: "C", value: bit(r.F, 0) },
      ],
    },
    {
      name: "Shadow",
      variables: [
        { name: "AF'", value: pair(r.A2, r.F2) },
        { name: "BC'", value: pair(r.B2, r.C2) },
        { name: "DE'", value: pair(r.D2, r.E2) },
        { name: "HL'", value: pair(r.H2, r.L2) },
      ],
    },
    {
      name: "Interrupts",
      variables: [
        { name: "I", value: byte(r.I) },
        { name: "R", value: byte(r.R) },
        { name: "IFF1", value: `${r.IFF1 & 1}` },
        { name: "IFF2", value: `${r.IFF2 & 1}` },
        { name: "IM", value: `${r.IM}` },
      ],
    },
  ]
}
