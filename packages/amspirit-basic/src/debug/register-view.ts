import type { Z80Registers } from "@amspirit/shared"
import { formatFlags } from "./z80-flags.js"

/**
 * Pure formatter turning a Z80 register snapshot into display rows for the
 * registers webview. Keeps the React layer dumb: it only renders these rows.
 */

interface RegisterRow {
  name: string
  value: string
}

export interface RegisterView {
  registers: RegisterRow[]
  flags: string
  interrupts: RegisterRow[]
}

const word = (n: number): string => `0x${(n & 0xffff).toString(16).toUpperCase().padStart(4, "0")}`
const byte = (n: number): string => `0x${(n & 0xff).toString(16).toUpperCase().padStart(2, "0")}`
const pair = (hi: number, lo: number): number => ((hi & 0xff) << 8) | (lo & 0xff)

export function buildRegisterView(z: Z80Registers): RegisterView {
  return {
    registers: [
      { name: "PC", value: word(z.PC) },
      { name: "SP", value: word(z.SP) },
      { name: "AF", value: word(pair(z.A, z.F)) },
      { name: "BC", value: word(pair(z.B, z.C)) },
      { name: "DE", value: word(pair(z.D, z.E)) },
      { name: "HL", value: word(pair(z.H, z.L)) },
      { name: "IX", value: word(z.IX) },
      { name: "IY", value: word(z.IY) },
      { name: "I", value: byte(z.I) },
      { name: "R", value: byte(z.R) },
    ],
    flags: formatFlags(z.F),
    interrupts: [
      { name: "IFF1", value: String(z.IFF1) },
      { name: "IFF2", value: String(z.IFF2) },
      { name: "IM", value: String(z.IM) },
    ],
  }
}
