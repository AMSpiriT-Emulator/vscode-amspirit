import { randomBytes } from "node:crypto"
import type { EmulatorClient } from "@amspirit/shared"
import * as vscode from "vscode"
import type { ExtToWebview } from "../../webview/messaging.js"
import { buildRegisterView } from "../debug/register-view.js"
import { buildWebviewHtml } from "./html.js"

const POLL_INTERVAL_MS = 500

/**
 * Singleton webview panel showing the Z80 registers (React). Thin shell: it
 * polls the emulator and posts register snapshots; the React app only renders.
 */
export class DebuggerPanel {
  private static current: DebuggerPanel | undefined

  private timer: ReturnType<typeof setInterval> | undefined
  private readonly disposables: vscode.Disposable[] = []

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly extensionUri: vscode.Uri,
    private readonly makeClient: () => EmulatorClient,
  ) {
    this.panel.webview.html = this.render()
    this.disposables.push(
      this.panel.webview.onDidReceiveMessage((m: { type?: string }) => {
        if (m.type === "ready") this.startPolling()
      }),
    )
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables)
  }

  static show(extensionUri: vscode.Uri, makeClient: () => EmulatorClient): void {
    if (DebuggerPanel.current) {
      DebuggerPanel.current.panel.reveal()
      return
    }
    const panel = vscode.window.createWebviewPanel(
      "amspiritDebugger",
      "AMSpiriT Debugger",
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, "out", "webview")],
      },
    )
    DebuggerPanel.current = new DebuggerPanel(panel, extensionUri, makeClient)
  }

  private render(): string {
    const webview = this.panel.webview
    const asset = (name: string): string =>
      webview
        .asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "out", "webview", name))
        .toString()
    return buildWebviewHtml({
      scriptUri: asset("webview.js"),
      styleUri: asset("webview.css"),
      cspSource: webview.cspSource,
      nonce: randomBytes(16).toString("hex"),
    })
  }

  private startPolling(): void {
    if (this.timer) return
    const tick = async (): Promise<void> => {
      let payload: ExtToWebview
      try {
        const z = await this.makeClient().getZ80()
        payload = { type: "registers", view: buildRegisterView(z) }
      } catch {
        payload = { type: "registers", view: null }
      }
      void this.panel.webview.postMessage(payload)
    }
    void tick()
    this.timer = setInterval(() => void tick(), POLL_INTERVAL_MS)
  }

  private dispose(): void {
    DebuggerPanel.current = undefined
    if (this.timer) clearInterval(this.timer)
    this.timer = undefined
    this.panel.dispose()
    for (const d of this.disposables) d.dispose()
  }
}
