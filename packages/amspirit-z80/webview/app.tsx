import { MemoryGrid } from "./components/memory-grid.js"
import { postToExt, useExtMessage } from "./hooks/use-vscode-api.js"

export function App() {
  const message = useExtMessage()
  const snapshot = message?.type === "snapshot" ? message.snapshot : null
  return (
    <main>
      <h1>Z80 Memory</h1>
      <MemoryGrid
        rows={snapshot?.rows ?? null}
        base={snapshot?.base}
        marks={snapshot?.marks ?? []}
        onGoto={(address) => postToExt({ type: "goto", address })}
      />
    </main>
  )
}
