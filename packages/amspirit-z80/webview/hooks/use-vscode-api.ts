import { useEffect, useState } from "react"

interface VsCodeApi {
  postMessage(message: unknown): void
}

declare function acquireVsCodeApi(): VsCodeApi

const vscode = acquireVsCodeApi()

/** Post a message from the webview back to the extension. */
export function postToExt<TOut>(message: TOut): void {
  vscode.postMessage(message)
}

/** Subscribe to extension→webview messages; signals readiness on mount. */
export function useExtMessage<TIn>(): TIn | undefined {
  const [message, setMessage] = useState<TIn>()
  useEffect(() => {
    const handler = (e: MessageEvent): void => setMessage(e.data as TIn)
    window.addEventListener("message", handler)
    vscode.postMessage({ type: "ready" })
    return () => window.removeEventListener("message", handler)
  }, [])
  return message
}
