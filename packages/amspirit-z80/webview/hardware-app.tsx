import { PsgView } from "./components/psg-view.js"
import { RegistersTable } from "./components/registers-table.js"
import type { HardwareExtToWebview } from "./hardware-messaging.js"
import { useExtMessage } from "./hooks/use-vscode-api.js"

/**
 * One peripheral-chip view. Each chip is a separate docked webview but they
 * share this shell: the panel posts a payload and we render it. Most chips post
 * `scopes` (the shared scope table); the PSG posts a structured model for its
 * dedicated columns view. Chips carry no pointer registers, so navigation is a
 * no-op.
 */
export function HardwareApp() {
  const message = useExtMessage<HardwareExtToWebview>()
  const payload = message?.type === "snapshot" ? message.payload : null
  if (payload?.kind === "psg") return <PsgView psg={payload.psg} />
  const scopes = payload?.kind === "scopes" ? payload.scopes : null
  return <RegistersTable scopes={scopes} onGoto={() => undefined} />
}
