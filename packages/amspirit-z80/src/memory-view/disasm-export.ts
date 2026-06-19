import type { DisasmInstruction } from "@amspirit/shared"
import { HEX_LITERAL, labelIndex } from "../disasm-labels.js"

const hex4 = (n: number): string => (n & 0xffff).toString(16).toUpperCase().padStart(4, "0")
const hex2 = (n: number): string => (n & 0xff).toString(16).toUpperCase().padStart(2, "0")

/** Mnemonic column width before the address/bytes comment. */
const MNEMONIC_COL = 24

export interface DisassemblyOptions {
  /** Inclusive start of the selected range (for the header). */
  start: number
  /** Inclusive end of the selected range (for the header). */
  end: number
  /**
   * Resolve an address to a label (firmware jumpblock + user symbol map). Used
   * both to emit label definitions and to name operands. Synthetic `Lxxxx`
   * labels are generated for in-range branch targets this doesn't resolve.
   */
  resolve?: (addr: number) => string | undefined
}

/**
 * Render decoded instructions as an assemblable listing: a header comment with
 * the selected range, an `ORG` at the first instruction, then one line per
 * instruction. Hex is `#`-prefixed; 16-bit operands that resolve to a label
 * (firmware/symbol map) or to an in-range branch target are shown as that
 * label, with a definition line emitted where the label lands. Pure; the panel
 * reads the bytes, disassembles them and writes the result to a new file.
 */
export function formatDisassembly(
  instructions: readonly DisasmInstruction[],
  opts: DisassemblyOptions,
): string {
  const { start, end, resolve } = opts

  // A label name for an address: a real symbol wins; otherwise a synthetic
  // `Lxxxx` for an in-range branch target. `undefined` = show the literal.
  const labelFor = labelIndex(instructions, resolve)

  const rewrite = (text: string): string =>
    text.replace(HEX_LITERAL, (_m, digits: string) => {
      if (digits.length === 4) {
        const label = labelFor(Number.parseInt(digits, 16) & 0xffff)
        if (label) return label
      }
      return `#${digits.toUpperCase()}`
    })

  const bytes = ((end - start) & 0xffff) + 1
  const org = instructions[0]?.address ?? start
  const lines = [
    `; AMSpiriT Z80 — disassembly ${hex4(start)}-${hex4(end)} (${bytes} bytes)`,
    `        ORG #${hex4(org)}`,
    "",
  ]
  for (const ins of instructions) {
    const def = labelFor(ins.address)
    if (def) lines.push(`${def}:`)
    const raw = ins.bytes.map(hex2).join(" ")
    lines.push(`        ${rewrite(ins.text).padEnd(MNEMONIC_COL)}; ${hex4(ins.address)}: ${raw}`)
  }
  return `${lines.join("\n")}\n`
}
