import { BasicVariables } from "./components/basic-variables.js"
import { useExtMessage } from "./hooks/use-vscode-api.js"

export function App() {
  const message = useExtMessage()
  const snapshot = message?.type === "snapshot" ? message.snapshot : null
  return (
    <main>
      <h1>BASIC Variables</h1>
      <BasicVariables view={snapshot?.variables ?? null} />
    </main>
  )
}
