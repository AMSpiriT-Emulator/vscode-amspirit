import { useEffect, useState } from "react"
import type { ExtToWebview, WebviewToExt } from "../messaging.js"

interface VsCodeApi {
  postMessage(message: WebviewToExt): void
}

declare function acquireVsCodeApi(): VsCodeApi

const vscode = acquireVsCodeApi()

/** Subscribe to extension→webview messages; signals readiness on mount. */
export function useExtMessage(): ExtToWebview | undefined {
  const [message, setMessage] = useState<ExtToWebview>()
  useEffect(() => {
    const handler = (e: MessageEvent): void => setMessage(e.data as ExtToWebview)
    window.addEventListener("message", handler)
    vscode.postMessage({ type: "ready" })
    return () => window.removeEventListener("message", handler)
  }, [])
  return message
}
