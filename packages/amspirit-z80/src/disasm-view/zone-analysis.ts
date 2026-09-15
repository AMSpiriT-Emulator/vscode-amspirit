import { decodeInstruction } from "@amspirit/shared"
import type { ByteReader } from "../disasm-window.js"

/** Result of a flow trace: which addresses start an instruction the CPU can reach. */
export interface ZoneAnalysis {
  /** Addresses where the trace decoded a reachable instruction. */
  code: ReadonlySet<number>
  /** The trace hit the instruction budget, so `code` is incomplete. */
  truncated: boolean
}

/** Longest Z80 instruction is 4 bytes. */
const MAX_INSTR_LEN = 4

/** Default instruction budget, as the emulator's own analyser uses. */
const DEFAULT_LIMIT = 8000

/** Unconditional `JP nn` — the only 3-byte jump that never falls through. */
const JP_NN = 0xc3
/** `JP cc,nn` (8 conditions), `CALL cc,nn` (8) and `CALL nn`: 16-bit operand. */
const JP_CC = new Set([0xc2, 0xca, 0xd2, 0xda, 0xe2, 0xea, 0xf2, 0xfa])
const CALL_NN = 0xcd
const CALL_CC = new Set([0xc4, 0xcc, 0xd4, 0xdc, 0xe4, 0xec, 0xf4, 0xfc])
/** Unconditional `JR e`. */
const JR_E = 0x18
/** `JR cc,e` and `DJNZ e`: relative operand, and the flow falls through. */
const JR_CC = new Set([0x20, 0x28, 0x30, 0x38, 0x10])
/** `RET`, `HALT` and `JP (HL)`: the flow ends, or goes somewhere we cannot compute. */
const RET = 0xc9
const HALT = 0x76
const JP_HL = 0xe9
/** `RST p`: the target is the vector in the opcode itself. */
const RST_MASK = 0xc7
const RST_TARGET = 0x38
/** `RETN` / `RETI`, after the `ED` prefix. */
const ED_RET = new Set([0x45, 0x4d, 0x55, 0x5d, 0x65, 0x6d, 0x75, 0x7d])
/** `JP (IX)` / `JP (IY)`, after the `DD` / `FD` prefix. */
const INDEX_PREFIX = new Set([0xdd, 0xfd])
const ED_PREFIX = 0xed

const word = (bytes: readonly number[], at: number): number =>
  ((bytes[at] ?? 0) | ((bytes[at + 1] ?? 0) << 8)) & 0xffff

/** Signed displacement of a relative jump, measured from the next instruction. */
const relative = (addr: number, bytes: readonly number[]): number =>
  (addr + 2 + (((bytes[1] ?? 0) << 24) >> 24)) & 0xffff

/**
 * Addresses the flow can reach from the instruction at `addr`, whose successor
 * in memory is `next`. Mirrors the emulator's own `z80analyze`: both paths of a
 * conditional branch, the RST vector, and a stop at `RET` / `HALT` / an
 * indirect jump.
 */
function successorsOf(addr: number, next: number, bytes: readonly number[]): number[] {
  const op = bytes[0] ?? 0
  if (op === JP_NN) return [word(bytes, 1)]
  if (JP_CC.has(op) || CALL_CC.has(op) || op === CALL_NN) return [word(bytes, 1), next]
  if (op === JR_E) return [relative(addr, bytes)]
  if (JR_CC.has(op)) return [relative(addr, bytes), next]
  if ((op & RST_MASK) === RST_MASK) return [op & RST_TARGET, next]
  if (op === RET || op === HALT || op === JP_HL) return []
  if (op === ED_PREFIX && ED_RET.has(bytes[1] ?? 0)) return []
  if (INDEX_PREFIX.has(op) && bytes[1] === JP_HL) return []
  return [next]
}

/**
 * Trace the reachable instructions from `entries` and return their addresses.
 * The trace follows every computable branch — both paths of a conditional one —
 * and stops at `RET`, at an indirect jump, and at the instruction budget. The
 * caller reads the bytes, so the trace sees the mapping the view shows (a bank,
 * or the CPU-visible memory). Pure; the panel keeps the result and passes it to
 * {@link buildDisasmRows}.
 */
export function analyzeZones(
  read: ByteReader,
  entries: readonly number[],
  opts: { limit?: number } = {},
): ZoneAnalysis {
  const limit = opts.limit ?? DEFAULT_LIMIT
  const code = new Set<number>()
  const pending = entries.map((a) => a & 0xffff)
  let truncated = false

  for (let addr = pending.pop(); addr !== undefined; addr = pending.pop()) {
    if (code.has(addr)) continue
    if (code.size >= limit) {
      truncated = true
      break
    }
    const bytes = read(addr, MAX_INSTR_LEN)
    if (bytes.length === 0) continue
    const instr = decodeInstruction(bytes, addr)
    code.add(addr)
    pending.push(...successorsOf(addr, (addr + instr.bytes.length) & 0xffff, bytes))
  }
  return { code, truncated }
}
