import { useState } from "react"
import { MemoryGrid } from "./components/memory-grid.js"
import { postToExt, useExtMessage } from "./hooks/use-vscode-api.js"

export function App() {
  const message = useExtMessage()
  const snapshot = message?.type === "snapshot" ? message.snapshot : null
  const [followPc, setFollowPc] = useState(false)

  const changeFollowPc = (enabled: boolean): void => {
    setFollowPc(enabled)
    postToExt({ type: "followPc", enabled })
  }

  return (
    <main>
      <MemoryGrid
        rows={snapshot?.rows ?? null}
        marks={snapshot?.marks ?? []}
        followPc={followPc}
        onFollowPcChange={changeFollowPc}
        onGoto={(address) => postToExt({ type: "goto", address })}
      />
    </main>
  )
}
