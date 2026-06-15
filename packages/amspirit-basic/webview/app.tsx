import { Registers } from "./components/registers.js"
import { useExtMessage } from "./hooks/use-vscode-api.js"

export function App() {
  const message = useExtMessage()
  const view = message?.type === "registers" ? message.view : null
  return (
    <main>
      <h1>Z80 Registers</h1>
      <Registers view={view} />
    </main>
  )
}
