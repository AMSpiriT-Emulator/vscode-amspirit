import { MemoryGrid } from "./components/memory-grid.js"
import { postToExt, useExtMessage } from "./hooks/use-vscode-api.js"

export function App() {
  const message = useExtMessage()
  const rows = message?.type === "snapshot" ? message.snapshot.rows : null
  return (
    <main>
      <h1>Z80 Memory</h1>
      <MemoryGrid rows={rows} onGoto={(address) => postToExt({ type: "goto", address })} />
    </main>
  )
}
