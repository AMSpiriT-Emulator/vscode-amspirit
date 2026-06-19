import { useState } from "react"
import { DisasmList } from "./components/disasm-list.js"
import type { DisasmExtToWebview, DisasmWebviewToExt } from "./disasm-messaging.js"
import { postToExt, useExtMessage } from "./hooks/use-vscode-api.js"

/** Type-checked post against the Disassembly View's message contract. */
const post = (message: DisasmWebviewToExt): void => postToExt(message)

export function DisasmApp() {
  const message = useExtMessage<DisasmExtToWebview>()
  const snapshot = message?.type === "snapshot" ? message.snapshot : null
  const [followPc, setFollowPc] = useState(true)
  const [bankId, setBankId] = useState("cpu")

  const changeFollowPc = (enabled: boolean): void => {
    setFollowPc(enabled)
    post({ type: "followPc", enabled })
  }

  const changeBank = (id: string): void => {
    setBankId(id)
    post({ type: "selectBank", id })
  }

  return (
    <main>
      <DisasmList
        rows={snapshot?.rows ?? null}
        banks={snapshot?.banks ?? []}
        selectedBankId={bankId}
        onSelectBank={changeBank}
        followPc={followPc}
        onFollowPcChange={changeFollowPc}
        onGoto={(address) => post({ type: "goto", address })}
        onPage={(delta) => post({ type: "page", delta })}
        onExportAsm={(start, end) =>
          post(
            start !== undefined && end !== undefined
              ? { type: "exportAsm", start, end }
              : { type: "exportAsm" },
          )
        }
      />
    </main>
  )
}
