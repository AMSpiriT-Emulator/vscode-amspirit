import { disassemble } from "@amspirit/shared"

/** Reads `len` bytes at `addr` (16-bit wrap); maps to the emulator's RAM read. */
export type ByteReader = (addr: number, len: number) => number[]

/**
 * One decoded row of a disassembly window: either a real instruction (numeric
 * address + raw bytes + mnemonic) or a placeholder near address 0 where there
 * is no room to decode backwards. The numeric form is consumed by the webview
 * disassembly view (enriched with labels / PC / coverage), so the tricky
 * backward-decode logic lives in one place.
 */
export type WindowRow =
  | { addr: number; bytes: number[]; text: string }
  | { addr: number; placeholder: true }

/** Longest Z80 instruction is 4 bytes. */
const MAX_INSTR_LEN = 4

/** Where to start a backward decode so it can reach `base` in ≤ `lead` steps. */
const windowStart = (base: number, lead: number): number => Math.max(0, base - lead * MAX_INSTR_LEN)

/** Did this row decode to a real instruction (vs a near-zero placeholder)? */
export function isInstructionRow(
  row: WindowRow,
): row is { addr: number; bytes: number[]; text: string } {
  return !("placeholder" in row)
}

/**
 * Build a disassembly window of exactly `instructionCount` numeric rows around
 * `base`, honouring `instructionOffset` (in instructions): negative means start
 * that many instructions *before* `base`. Z80 instructions are variable length
 * with no exact backward decode, so the rows before `base` are obtained by
 * decoding forward from a point ahead of the window and keeping the
 * instructions that land just before `base` (the stream self-synchronises).
 * Placeholder rows only appear when there is no room to decode backwards (near
 * address 0). A positive offset skips that many decoded instructions first.
 */
export function decodeWindow(
  read: ByteReader,
  base: number,
  instructionOffset: number,
  instructionCount: number,
): WindowRow[] {
  if (instructionCount <= 0) return []

  const lead = Math.min(Math.max(-instructionOffset, 0), instructionCount)
  const rows = lead > 0 ? rowsBeforeBase(read, base, lead) : []

  let cursor = base & 0xffff
  for (let skip = Math.max(instructionOffset, 0); skip > 0; skip--) {
    cursor = (cursor + decodeLen(read, cursor)) & 0xffff
  }
  while (rows.length < instructionCount) {
    const [ins] = disassemble(read(cursor, MAX_INSTR_LEN), cursor, 1)
    if (!ins) break
    rows.push(toRow(ins))
    cursor = (cursor + ins.bytes.length) & 0xffff
  }
  return rows
}

/**
 * The `lead` rows immediately before `base`: decode forward from `windowStart`,
 * collect every instruction that ends at/before `base`, and keep the last
 * `lead`. Pad the front with placeholders if the window couldn't supply enough.
 */
function rowsBeforeBase(read: ByteReader, base: number, lead: number): WindowRow[] {
  const decoded: WindowRow[] = []
  let cursor = windowStart(base, lead)
  while (cursor < base) {
    const [ins] = disassemble(read(cursor, MAX_INSTR_LEN), cursor, 1)
    if (!ins) break
    if (cursor + ins.bytes.length <= base) decoded.push(toRow(ins))
    cursor += ins.bytes.length
  }
  const kept = decoded.slice(-lead)
  const padCount = lead - kept.length
  if (padCount === 0) return kept

  const earliest = kept[0]?.addr ?? base
  const pad: WindowRow[] = []
  for (let i = 0; i < padCount; i++) {
    pad.push({ addr: (earliest - (padCount - i)) & 0xffff, placeholder: true })
  }
  return [...pad, ...kept]
}

/** Byte length of the instruction at `addr` (at least 1, to guarantee progress). */
function decodeLen(read: ByteReader, addr: number): number {
  const [ins] = disassemble(read(addr, MAX_INSTR_LEN), addr, 1)
  return ins ? ins.bytes.length : 1
}

function toRow(ins: { address: number; bytes: number[]; text: string }): WindowRow {
  return { addr: ins.address, bytes: ins.bytes, text: ins.text }
}
