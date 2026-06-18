import type { MemoryRow } from "../src/memory-view/memory-model.js"

/** One poll tick's view of memory. `rows: null` = unavailable (running/detached). */
interface MemoryViewSnapshot {
  /** Address of the first byte of the window (for the header / future use). */
  base: string
  rows: MemoryRow[] | null
}

/** Messages the extension posts to the webview. */
export type ExtToWebview = { type: "snapshot"; snapshot: MemoryViewSnapshot }

/** Messages the webview posts back to the extension. */
export type WebviewToExt = { type: "ready" } | { type: "goto"; address: number }
