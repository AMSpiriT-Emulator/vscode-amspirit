import { randomBytes } from "node:crypto"
import type { EmulatorClient } from "@amspirit/shared"
import * as vscode from "vscode"
import type { ExtToWebview } from "../../webview/messaging.js"
import { decodeCpcString, parseBasicVars } from "../debug/basic-var-parser.js"
import { type BasicVarsView, buildBasicVarsView } from "../debug/basic-vars-view.js"
import { buildWebviewHtml } from "./html.js"

const POLL_INTERVAL_MS = 500
/** Cap the variable-zone read (matches the amspirit-lite web debugger). */
const MAX_VAR_BYTES = 8192
const CHAIN_HEADS_BYTES = 54

/**
 * Singleton webview panel showing the live Locomotive BASIC variables (React),
 * styled after the amspirit-lite web debugger. Thin shell: it polls the
 * emulator each tick and posts a snapshot; the React app only renders.
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
      const variables = await this.readVariables(this.makeClient())
      const payload: ExtToWebview = { type: "snapshot", snapshot: { variables } }
      void this.panel.webview.postMessage(payload)
    }
    void tick()
    this.timer = setInterval(() => void tick(), POLL_INTERVAL_MS)
  }

  /** Read + decode the Locomotive BASIC variables (mirrors the DAP Variables scope). */
  private async readVariables(client: EmulatorClient): Promise<BasicVarsView | null> {
    try {
      const state = await client.getBasicState()
      const [chainBytes, varBytes] = await Promise.all([
        client.readRam(state.chain_heads_addr, CHAIN_HEADS_BYTES),
        client.readRam(state.txttop, Math.min(state.var_size, MAX_VAR_BYTES)),
      ])
      const parsed = parseBasicVars(chainBytes, varBytes)
      await Promise.all(
        parsed.map(async (v) => {
          if (v.type === "string" && v.strLen > 0) {
            try {
              v.value = `"${decodeCpcString(await client.readRam(v.strAddr, v.strLen))}"`
            } catch {
              // keep the "(len N)" placeholder on read failure
            }
          }
        }),
      )
      return buildBasicVarsView(state, parsed)
    } catch {
      return null
    }
  }

  private dispose(): void {
    DebuggerPanel.current = undefined
    if (this.timer) clearInterval(this.timer)
    this.timer = undefined
    this.panel.dispose()
    for (const d of this.disposables) d.dispose()
  }
}
