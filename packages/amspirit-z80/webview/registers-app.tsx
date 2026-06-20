import { RegistersTable } from "./components/registers-table.js"
import { postToExt, useExtMessage } from "./hooks/use-vscode-api.js"
import type { RegistersExtToWebview, RegistersWebviewToExt } from "./registers-messaging.js"

/** Type-checked post against the Registers view's message contract. */
const post = (message: RegistersWebviewToExt): void => postToExt(message)

export function RegistersApp() {
  const message = useExtMessage<RegistersExtToWebview>()
  const scopes = message?.type === "snapshot" ? message.snapshot.scopes : null

  return <RegistersTable scopes={scopes} onGoto={(address) => post({ type: "goto", address })} />
}
