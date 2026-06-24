import { randomBytes } from "node:crypto"
import { type EmulatorClient, RefreshScheduler, type RefreshTriggerSource } from "@amspirit/shared"
import * as vscode from "vscode"
import type { ExtToWebview } from "../../webview/messaging.js"
import { readResolvedBasicVars } from "../debug/basic-vars-reader.js"
import { type BasicVarsView, buildBasicVarsView } from "../debug/basic-vars-view.js"
import { buildWebviewHtml } from "./html.js"

/**
 * Singleton webview panel showing the live Locomotive BASIC variables (React),
 * styled after the amspirit-lite web debugger. Thin shell: it polls the
 * emulator while visible and posts a snapshot; the React app only renders.
 * The variable data is only meaningful while the emulator is paused, so the
 * poll skips the (multi-request) read when the program is running.
 */
export class DebuggerPanel {
  private static current: DebuggerPanel | undefined

  /** Drives refresh from the SSE hub; variables are coherent only while paused,
   * so it refreshes on stop signals (not per-frame). */
  private readonly scheduler: RefreshScheduler
  /** Last snapshot posted, serialized — skip posting identical snapshots. */
  private lastPosted = ""
  private readonly disposables: vscode.Disposable[] = []

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly extensionUri: vscode.Uri,
    private readonly makeClient: () => EmulatorClient,
    triggers: RefreshTriggerSource,
  ) {
    this.scheduler = new RefreshScheduler(triggers, () => void this.tick(), { onFrame: false })
    this.panel.webview.html = this.render()
    this.disposables.push(
      this.panel.webview.onDidReceiveMessage((m: { type?: string }) => {
        if (m.type === "ready") this.startPolling()
      }),
      // Don't poll a hidden panel; resume when it comes back into view.
      this.panel.onDidChangeViewState(() => {
        if (this.panel.visible) this.startPolling()
        else this.stopPolling()
      }),
    )
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables)
  }

  static show(
    extensionUri: vscode.Uri,
    makeClient: () => EmulatorClient,
    triggers: RefreshTriggerSource,
  ): void {
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
    DebuggerPanel.current = new DebuggerPanel(panel, extensionUri, makeClient, triggers)
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
    this.scheduler.start()
  }

  private stopPolling(): void {
    this.scheduler.stop()
  }

  private async tick(): Promise<void> {
    const client = this.makeClient()
    // The variable zone is only coherent while paused; a cheap ping gate avoids
    // the multi-request read (state + chains + per-string) while the program
    // runs free.
    const { paused } = await client.pingState()
    const variables = paused ? await this.readVariables(client) : null
    this.post({ type: "snapshot", snapshot: { variables } })
  }

  /** Post a snapshot, skipping the round-trip when it's identical to the last. */
  private post(payload: ExtToWebview): void {
    const json = JSON.stringify(payload)
    if (json === this.lastPosted) return
    this.lastPosted = json
    void this.panel.webview.postMessage(payload)
  }

  /** Read + decode the Locomotive BASIC variables (shared with the DAP Variables scope). */
  private async readVariables(client: EmulatorClient): Promise<BasicVarsView | null> {
    try {
      const { state, vars } = await readResolvedBasicVars(client)
      return buildBasicVarsView(state, vars)
    } catch {
      return null
    }
  }

  private dispose(): void {
    DebuggerPanel.current = undefined
    this.stopPolling()
    this.panel.dispose()
    for (const d of this.disposables) d.dispose()
  }
}
