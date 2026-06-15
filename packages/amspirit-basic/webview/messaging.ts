import type { RegisterView } from "../src/debug/register-view.js"

/** Messages the extension posts to the webview. */
export type ExtToWebview = { type: "registers"; view: RegisterView | null }

/** Messages the webview posts back to the extension. */
export type WebviewToExt = { type: "ready" }
