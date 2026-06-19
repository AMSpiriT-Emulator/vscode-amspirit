import type { DisasmRow } from "../src/disasm-view/disasm-view-model.js"
import type { BankOption } from "../src/memory-view/memory-model.js"

/** One poll tick's view of the disassembly. `rows: null` = unavailable. */
interface DisasmViewSnapshot {
  rows: DisasmRow[] | null
  /** Selectable views/banks for this machine (machine-driven; empty until known). */
  banks: BankOption[]
}

/** Messages the extension posts to the disassembly webview. */
export type DisasmExtToWebview = { type: "snapshot"; snapshot: DisasmViewSnapshot }

/** Messages the disassembly webview posts back to the extension. */
export type DisasmWebviewToExt =
  | { type: "ready" }
  | { type: "goto"; address: number }
  | { type: "followPc"; enabled: boolean }
  | { type: "selectBank"; id: string }
  /** Scroll by N instructions (negative = up). */
  | { type: "page"; delta: number }
  /** Export to an `.asm` listing: the selected `[start, end]` range, else the
   * visible window when no range is given. */
  | { type: "exportAsm"; start?: number; end?: number }
