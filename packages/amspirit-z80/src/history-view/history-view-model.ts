import { decodeInstruction, type Z80HistoryEntry } from "@amspirit/shared"

/** One rendered row of the instruction-history view. */
export interface HistoryRow {
  /** 16-bit PC of the instruction, 4-digit uppercase hex (no sigil). */
  address: string
  /** Opcode bytes the instruction consumes, space-separated uppercase hex. */
  bytes: string
  /** Decoded mnemonic (empty when the fetch window carried no bytes). */
  text: string
  /** True for the most recent instruction (row 0). */
  current: boolean
}

const hex4 = (n: number): string => (n & 0xffff).toString(16).toUpperCase().padStart(4, "0")
const hex2 = (n: number): string => (n & 0xff).toString(16).toUpperCase().padStart(2, "0")

/** Parse a contiguous uppercase-hex string into bytes, dropping a stray nibble. */
function parseBytes(hex: string): number[] {
  const out: number[] = []
  for (let i = 0; i + 2 <= hex.length; i += 2) {
    out.push(Number.parseInt(hex.slice(i, i + 2), 16))
  }
  return out
}

/**
 * Turn the emulator's last-executed-instruction history into rendered rows.
 * Each entry's `hex` is a 4-byte CPU fetch window; we decode the instruction at
 * `pc` and show only the bytes it actually consumes (so the mnemonic matches
 * the disassembly). Returned newest-first — row 0 is the most recent
 * instruction and the only one flagged `current` — so the current PC stays
 * visible at the top of a narrow docked view without scrolling. Pure.
 */
export function buildHistoryRows(entries: Z80HistoryEntry[]): HistoryRow[] {
  const rows: HistoryRow[] = []
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const entry = entries[i]
    if (!entry) continue
    const raw = parseBytes(entry.hex)
    if (raw.length === 0) {
      rows.push({ address: hex4(entry.pc), bytes: "", text: "", current: rows.length === 0 })
      continue
    }
    const insn = decodeInstruction(raw, entry.pc)
    rows.push({
      address: hex4(entry.pc),
      bytes: insn.bytes.map(hex2).join(" "),
      text: insn.text,
      current: rows.length === 0,
    })
  }
  return rows
}
