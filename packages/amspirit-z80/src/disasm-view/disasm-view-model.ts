import { HEX_LITERAL, labelIndex } from "../disasm-labels.js"
import { type ByteReader, decodeWindow, isInstructionRow } from "../disasm-window.js"
import { isExecuted } from "../memory-view/memory-model.js"

export type { ByteReader }

/** One rendered row of the live Disassembly View (rendering-agnostic). */
export interface DisasmRow {
  /** 16-bit address of the instruction's first byte (keys, PC, coverage). */
  addr: number
  /** Display form of {@link addr}: bare, upper-case, 4-digit hex (no prefix). */
  address: string
  /** Space-separated upper-case hex bytes, or `""` for a placeholder row. */
  bytes: string
  /**
   * What to show in the instruction column: a mnemonic with `#`-hex operands /
   * resolved labels for code; a `DB #xx,#xx` data directive for un-reached bytes
   * (see {@link data}); or `"..."` for a placeholder row.
   */
  text: string
  /** A label landing on this address (firmware/symbol/synthetic), if any. */
  label?: string
  /** Whether this is the current program-counter instruction. */
  isPc: boolean
  /** Whether the Z80 has executed this instruction (code-coverage shading). */
  executed: boolean
  /**
   * Likely data, not code: coverage is known yet the Z80 never reached this
   * instruction (and it isn't the imminent PC). `false` when coverage is
   * unavailable — we can't tell code from data without it.
   */
  data: boolean
}

export interface DisasmRowsOptions {
  /** Reads bytes from the emulator's memory (16-bit wrap). */
  read: ByteReader
  /** Address the window is anchored at. */
  base: number
  /** Instructions to start before (negative) / after (positive) `base`. */
  instructionOffset: number
  /** Number of rows to produce. */
  instructionCount: number
  /** Current program counter — its row is flagged `isPc`. */
  pc?: number
  /** Execution bitmap (`/api/codemap` hex) for coverage shading. */
  codemapHex?: string
  /** Resolve an address to a firmware/symbol label (operand + definition naming). */
  resolve?: (addr: number) => string | undefined
}

const hex4 = (n: number): string => (n & 0xffff).toString(16).toUpperCase().padStart(4, "0")
const hex2 = (n: number): string => (n & 0xff).toString(16).toUpperCase().padStart(2, "0")

/**
 * The window base after scrolling by `deltaInstructions` (negative = up). Z80
 * instructions are variable length, so paging steps whole instructions rather
 * than fixed byte rows: forward decodes that many instructions from `base`,
 * backward re-derives the instructions just above `base` and takes the first.
 * Wraps the 16-bit space. Pure; the panel applies it on wheel/keyboard paging.
 */
export function stepBase(read: ByteReader, base: number, deltaInstructions: number): number {
  if (deltaInstructions === 0) return base & 0xffff
  const window =
    deltaInstructions > 0
      ? decodeWindow(read, base, deltaInstructions, 1)
      : decodeWindow(read, base, deltaInstructions, -deltaInstructions)
  return window[0]?.addr ?? base & 0xffff
}

/**
 * Build a window of disassembly rows around `base`, enriched for the webview
 * view: 16-bit operands that resolve to a firmware/symbol label (or to an
 * in-window branch target) are shown as that label, with the definition surfaced
 * on the target row; the current PC and executed instructions are flagged.
 * Pure; the panel reads the bytes and acts on the rows.
 */
export function buildDisasmRows(opts: DisasmRowsOptions): DisasmRow[] {
  const { read, base, instructionOffset, instructionCount, pc, codemapHex = "", resolve } = opts
  const window = decodeWindow(read, base, instructionOffset, instructionCount)
  const instructions = window
    .filter(isInstructionRow)
    .map((r) => ({ address: r.addr, text: r.text }))
  const labelFor = labelIndex(instructions, resolve)

  // Render operands the Amstrad way: `#`-prefixed hex (matching the `.asm`
  // export), with resolved 16-bit operands shown as their label instead.
  const rewrite = (text: string): string =>
    text.replace(HEX_LITERAL, (_literal, digits: string) => {
      if (digits.length === 4) {
        const label = labelFor(Number.parseInt(digits, 16) & 0xffff)
        if (label) return label
      }
      return `#${digits.toUpperCase()}`
    })

  // Coverage is "known" only when the emulator returned a full bitmap; without
  // it we can't classify code vs data, so nothing is marked as data.
  const coverageKnown = codemapHex.length >= 16384

  return window.map((row) => {
    const label = labelFor(row.addr)
    const isPc = pc !== undefined && row.addr === (pc & 0xffff)
    const executed = isExecuted(codemapHex, row.addr)
    const common = {
      addr: row.addr,
      address: hex4(row.addr),
      isPc,
      executed,
      data: coverageKnown && !executed && !isPc && isInstructionRow(row),
      ...(label ? { label } : {}),
    }
    if (!isInstructionRow(row)) return { ...common, bytes: "", text: "..." }
    // Bytes the Z80 never reached are shown as a `DB` data directive rather than
    // a (probably meaningless) decoded mnemonic.
    const text = common.data
      ? `DB ${row.bytes.map((b) => `#${hex2(b)}`).join(",")}`
      : rewrite(row.text)
    return { ...common, bytes: row.bytes.map(hex2).join(" "), text }
  })
}
