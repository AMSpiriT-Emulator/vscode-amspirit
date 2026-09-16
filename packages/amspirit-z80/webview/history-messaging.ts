import type { HistoryRow } from "../src/history-view/history-view-model.js"

/**
 * One poll tick's view of the Z80 instruction history. `rows` is `null` when the
 * emulator is unreachable (running/detached), an empty array when it simply has
 * no history yet.
 */
export type HistoryPayload = { rows: HistoryRow[] | null }

/** Messages the extension posts to the history webview. */
export type HistoryExtToWebview = { type: "snapshot"; payload: HistoryPayload }

/** Messages the history webview posts back to the extension. */
export type HistoryWebviewToExt = { type: "ready" }
