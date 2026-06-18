import { useState } from "react"
import { MemoryGrid } from "./components/memory-grid.js"
import { postToExt, useExtMessage } from "./hooks/use-vscode-api.js"

export function App() {
  const message = useExtMessage()
  const snapshot = message?.type === "snapshot" ? message.snapshot : null
  const [followPc, setFollowPc] = useState(false)
  const [bankId, setBankId] = useState("cpu")

  const changeFollowPc = (enabled: boolean): void => {
    setFollowPc(enabled)
    postToExt({ type: "followPc", enabled })
  }

  const changeBank = (id: string): void => {
    setBankId(id)
    postToExt({ type: "selectBank", id })
  }

  return (
    <main>
      <MemoryGrid
        rows={snapshot?.rows ?? null}
        marks={snapshot?.marks ?? []}
        banks={snapshot?.banks ?? []}
        selectedBankId={bankId}
        onSelectBank={changeBank}
        followPc={followPc}
        onFollowPcChange={changeFollowPc}
        onGoto={(address) => postToExt({ type: "goto", address })}
        onDisassemble={(start, end) => postToExt({ type: "disassemble", start, end })}
      />
    </main>
  )
}
