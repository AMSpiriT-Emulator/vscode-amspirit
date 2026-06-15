/**
 * Pure decoder for the Z80 F (flags) register, for the registers view.
 * Bit layout: S(7) Z(6) -(5) H(4) -(3) P/V(2) N(1) C(0); bits 5 and 3 are
 * undocumented and ignored.
 */

export interface Z80Flags {
  S: boolean
  Z: boolean
  H: boolean
  PV: boolean
  N: boolean
  C: boolean
}

export function decodeFlags(f: number): Z80Flags {
  return {
    S: (f & 0x80) !== 0,
    Z: (f & 0x40) !== 0,
    H: (f & 0x10) !== 0,
    PV: (f & 0x04) !== 0,
    N: (f & 0x02) !== 0,
    C: (f & 0x01) !== 0,
  }
}

/** Render the flags as a fixed `SZHPNC` string, dot (`·`) where clear. */
export function formatFlags(f: number): string {
  const flags = decodeFlags(f)
  const letters: [keyof Z80Flags, string][] = [
    ["S", "S"],
    ["Z", "Z"],
    ["H", "H"],
    ["PV", "P"],
    ["N", "N"],
    ["C", "C"],
  ]
  return letters.map(([key, label]) => (flags[key] ? label : "·")).join("")
}
