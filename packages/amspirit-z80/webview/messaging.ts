import type { BankOption, MemoryRow, PointerMark } from "../src/memory-view/memory-model.js"

/** One poll tick's view of memory. `rows: null` = unavailable (running/detached). */
interface MemoryViewSnapshot {
  rows: MemoryRow[] | null
  /** Pointer registers (BC/DE/HL/IX/IY/SP/PC) landing in the window, by offset. */
  marks: PointerMark[]
  /** Selectable views/banks for this machine (machine-driven; empty until known). */
  banks: BankOption[]
}

/** Messages the extension posts to the webview. */
export type ExtToWebview = { type: "snapshot"; snapshot: MemoryViewSnapshot }

/** Messages the webview posts back to the extension. */
export type WebviewToExt =
  | { type: "ready" }
  | { type: "goto"; address: number }
  | { type: "followPc"; enabled: boolean }
  | { type: "selectBank"; id: string }
