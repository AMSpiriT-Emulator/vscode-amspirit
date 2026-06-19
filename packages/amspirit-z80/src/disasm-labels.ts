/**
 * Shared label resolution for the disassembly listings — used both by the
 * Memory View's `.asm` export and by the live Disassembly View. Keeps a single
 * definition of how firmware/symbol labels, synthetic `Lxxxx` targets and the
 * operand hex literals emitted by the shared disassembler are recognised.
 */

const hex4 = (n: number): string => (n & 0xffff).toString(16).toUpperCase().padStart(4, "0")

/** Matches a hex literal as rendered by the shared disassembler (`0xNN` / `0xNNNN`). */
export const HEX_LITERAL = /0x([0-9A-Fa-f]+)/g

/** Turn a raw label (e.g. `"TXT OUTPUT"`) into a valid assembler identifier. */
function sanitizeLabel(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9_.]/g, "_")
  return /^[A-Za-z_.]/.test(cleaned) ? cleaned : `_${cleaned}`
}

/** Auto-label for an address with no symbol, e.g. `0x9006` → `L9006`. */
const autoLabel = (addr: number): string => `L${hex4(addr & 0xffff)}`

/**
 * Build a label resolver over a set of decoded instructions. A real symbol
 * (firmware jumpblock / user symbol map, via `resolve`) wins; otherwise an
 * address that is both referenced as a 16-bit operand somewhere in the listing
 * *and* is the start of one of these instructions gets a synthetic `Lxxxx`
 * label. Everything else is `undefined` (the caller shows the literal).
 */
export function labelIndex(
  instructions: readonly { address: number; text: string }[],
  resolve?: (addr: number) => string | undefined,
): (addr: number) => string | undefined {
  const instrAddrs = new Set(instructions.map((i) => i.address))
  const referenced = new Set<number>()
  for (const ins of instructions) {
    for (const m of ins.text.matchAll(HEX_LITERAL)) {
      const digits = m[1] ?? ""
      if (digits.length === 4) referenced.add(Number.parseInt(digits, 16) & 0xffff)
    }
  }
  return (addr) => {
    const real = resolve?.(addr)
    if (real) return sanitizeLabel(real)
    if (referenced.has(addr) && instrAddrs.has(addr)) return autoLabel(addr)
    return undefined
  }
}
