import type { BasicVarsView } from "../src/debug/basic-vars-view.js"

/** One poll tick's view of the paused machine. `null` = unavailable. */
interface DebugSnapshot {
  variables: BasicVarsView | null
}

/** Messages the extension posts to the webview. */
export type ExtToWebview = { type: "snapshot"; snapshot: DebugSnapshot }

/** Messages the webview posts back to the extension. */
export type WebviewToExt = { type: "ready" }
