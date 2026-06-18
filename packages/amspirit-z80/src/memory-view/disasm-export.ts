import type { DisasmInstruction } from "@amspirit/shared"

const hex4 = (n: number): string => (n & 0xffff).toString(16).toUpperCase().padStart(4, "0")
const hex2 = (n: number): string => (n & 0xff).toString(16).toUpperCase().padStart(2, "0")

/** Mnemonic column width before the address/bytes comment. */
const MNEMONIC_COL = 24

/**
 * Render decoded instructions as an assemblable `.asm` listing: a header
 * comment with the selected range, an `ORG` at the first instruction, then one
 * line per instruction (mnemonic + a `; addr: raw bytes` comment). Pure; the
 * panel reads the bytes, disassembles them and writes the result to a new file.
 */
export function formatDisassembly(
  instructions: readonly DisasmInstruction[],
  range: { start: number; end: number },
): string {
  const bytes = ((range.end - range.start) & 0xffff) + 1
  const org = instructions[0]?.address ?? range.start
  const lines = [
    `; AMSpiriT Z80 — disassembly ${hex4(range.start)}-${hex4(range.end)} (${bytes} bytes)`,
    `        ORG 0x${hex4(org)}`,
    "",
  ]
  for (const ins of instructions) {
    const raw = ins.bytes.map(hex2).join(" ")
    lines.push(`        ${ins.text.padEnd(MNEMONIC_COL)}; ${hex4(ins.address)}: ${raw}`)
  }
  return `${lines.join("\n")}\n`
}
