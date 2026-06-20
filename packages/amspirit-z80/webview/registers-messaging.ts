import type { RegisterScope } from "../src/registers-view.js"

/** One poll tick's view of the Z80 registers. `scopes: null` = unavailable. */
interface RegistersSnapshot {
  scopes: RegisterScope[] | null
}

/** Messages the extension posts to the Registers webview. */
export type RegistersExtToWebview = { type: "snapshot"; snapshot: RegistersSnapshot }

/** Messages the Registers webview posts back to the extension. */
export type RegistersWebviewToExt = { type: "ready" } | { type: "goto"; address: number }
