import { HistoryList } from "./components/history-list.js"
import type { HistoryExtToWebview } from "./history-messaging.js"
import { useExtMessage } from "./hooks/use-vscode-api.js"

/**
 * Instruction-history panel shell: the extension posts a snapshot each tick and
 * we render the decoded rows. No pointer navigation — this view is read-only.
 */
export function HistoryApp() {
  const message = useExtMessage<HistoryExtToWebview>()
  const rows = message?.type === "snapshot" ? message.payload.rows : null
  return <HistoryList rows={rows} />
}
