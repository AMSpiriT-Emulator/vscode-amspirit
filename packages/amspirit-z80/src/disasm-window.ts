import { disassemble } from "@amspirit/shared"

/** Reads `len` bytes at `addr` (16-bit wrap); maps to the emulator's RAM read. */
export type ByteReader = (addr: number, len: number) => number[]

/** One row of a DAP disassemble response. */
export interface DisasmLine {
  /** `0x`-prefixed hex address of the instruction. */
  address: string
  /** Space-separated lowercase hex bytes (absent for placeholder rows). */
  instructionBytes?: string
  /** Rendered mnemonic, or `"..."` for a placeholder row. */
  instruction: string
}

/** Longest Z80 instruction is 4 bytes. */
const MAX_INSTR_LEN = 4
/** Shown for rows we couldn't decode (only near address 0, where there is no
 * room to decode backwards). */
const PLACEHOLDER = "..."

const addrHex = (n: number): string => `0x${(n & 0xffff).toString(16)}`
const bytesHex = (bytes: number[]): string =>
  bytes.map((b) => b.toString(16).padStart(2, "0")).join(" ")

/** Where to start a backward decode so it can reach `base` in ≤ `lead` steps. */
const windowStart = (base: number, lead: number): number => Math.max(0, base - lead * MAX_INSTR_LEN)

/**
 * Build a DAP disassembly window of exactly `instructionCount` rows around
 * `base`, honouring `instructionOffset` (in instructions): negative means start
 * that many instructions *before* `base`. Z80 instructions are variable length
 * with no exact backward decode, so the rows before `base` are obtained by
 * decoding forward from a point ahead of the window and keeping the
 * instructions that land just before `base` (the stream self-synchronises).
 * Placeholder rows only appear when there is no room to decode backwards (near
 * address 0). A positive offset skips that many decoded instructions first.
 */
export function buildDisassemblyWindow(
  read: ByteReader,
  base: number,
  instructionOffset: number,
  instructionCount: number,
): DisasmLine[] {
  if (instructionCount <= 0) return []

  const lead = Math.min(Math.max(-instructionOffset, 0), instructionCount)
  const lines = lead > 0 ? rowsBeforeBase(read, base, lead) : []

  let cursor = base & 0xffff
  for (let skip = Math.max(instructionOffset, 0); skip > 0; skip--) {
    cursor = (cursor + decodeLen(read, cursor)) & 0xffff
  }
  while (lines.length < instructionCount) {
    const [ins] = disassemble(read(cursor, MAX_INSTR_LEN), cursor, 1)
    if (!ins) break
    lines.push(toLine(ins))
    cursor = (cursor + ins.bytes.length) & 0xffff
  }
  return lines
}

/**
 * The `lead` rows immediately before `base`: decode forward from `windowStart`,
 * collect every instruction that ends at/before `base`, and keep the last
 * `lead`. Pad the front with placeholders if the window couldn't supply enough.
 */
function rowsBeforeBase(read: ByteReader, base: number, lead: number): DisasmLine[] {
  const decoded: DisasmLine[] = []
  let cursor = windowStart(base, lead)
  while (cursor < base) {
    const [ins] = disassemble(read(cursor, MAX_INSTR_LEN), cursor, 1)
    if (!ins) break
    if (cursor + ins.bytes.length <= base) decoded.push(toLine(ins))
    cursor += ins.bytes.length
  }
  const kept = decoded.slice(-lead)
  const padCount = lead - kept.length
  if (padCount === 0) return kept

  const earliest = kept[0] ? Number(kept[0].address) : base
  const pad: DisasmLine[] = []
  for (let i = 0; i < padCount; i++) {
    pad.push({ address: addrHex(earliest - (padCount - i)), instruction: PLACEHOLDER })
  }
  return [...pad, ...kept]
}

/** Byte length of the instruction at `addr` (at least 1, to guarantee progress). */
function decodeLen(read: ByteReader, addr: number): number {
  const [ins] = disassemble(read(addr, MAX_INSTR_LEN), addr, 1)
  return ins ? ins.bytes.length : 1
}

function toLine(ins: { address: number; bytes: number[]; text: string }): DisasmLine {
  return {
    address: addrHex(ins.address),
    instructionBytes: bytesHex(ins.bytes),
    instruction: ins.text,
  }
}
