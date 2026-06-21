import type { PsgViewModel } from "../src/hardware/psg-view-model.js"
import type { RegisterScope } from "../src/registers-view.js"

/**
 * One poll tick's view of a peripheral chip. Most chips post `scopes` (rendered
 * by the shared scope table); the PSG posts a structured model for its dedicated
 * view. The inner data is `null` when the emulator is unreachable.
 */
export type HardwarePayload =
  | { kind: "scopes"; scopes: RegisterScope[] | null }
  | { kind: "psg"; psg: PsgViewModel | null }

/** Messages the extension posts to a hardware (chip) webview. */
export type HardwareExtToWebview = { type: "snapshot"; payload: HardwarePayload }

/** Messages a hardware webview posts back to the extension. */
export type HardwareWebviewToExt = { type: "ready" }
