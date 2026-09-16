import { randomBytes } from "node:crypto"
import type { EmulatorClient, RefreshTriggerSource } from "@amspirit/shared"
import { RefreshScheduler } from "@amspirit/shared"
import * as vscode from "vscode"
import type {
  HistoryExtToWebview,
  HistoryPayload,
  HistoryWebviewToExt,
} from "../../webview/history-messaging.js"
import { buildHistoryRows } from "../history-view/history-view-model.js"
import { buildWebviewHtml } from "./html.js"

/**
 * The Z80 instruction-history docked webview: polls `/api/history` while visible
 * (driven off the shared SSE-fed {@link RefreshScheduler}, so it snaps to a stop
 * and throttles per-frame), decodes each entry via {@link buildHistoryRows}, and
 * posts newest-first rows to the shared React bundle. Mirrors
 * {@link HardwarePanel} but reads a single endpoint and carries no chip config.
 */
export class HistoryPanel implements vscode.WebviewViewProvider {
  static readonly viewId = "amspirit.z80.history"

  private view: vscode.WebviewView | undefined
  private readonly scheduler: RefreshScheduler
  /** Last snapshot posted, serialized — skip posting identical snapshots. */
  private lastPosted = ""
  private readonly disposables: vscode.Disposable[] = []

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly makeClient: () => EmulatorClient,
    triggers: RefreshTriggerSource,
  ) {
    this.scheduler = new RefreshScheduler(triggers, () => void this.tick(), { onFrame: true })
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, "out", "webview")],
    }
    view.webview.html = this.render(view.webview)
    this.disposables.push(
      view.webview.onDidReceiveMessage((m: HistoryWebviewToExt) => {
        if (m.type === "ready") this.startPolling()
      }),
      view.onDidChangeVisibility(() => {
        if (view.visible) this.startPolling()
        else this.stopPolling()
      }),
    )
    view.onDidDispose(() => this.disposeView(), null, this.disposables)
  }

  private render(webview: vscode.Webview): string {
    const asset = (name: string): string =>
      webview
        .asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "out", "webview", name))
        .toString()
    return buildWebviewHtml({
      scriptUri: asset("webview.js"),
      styleUri: asset("webview.css"),
      cspSource: webview.cspSource,
      nonce: randomBytes(16).toString("hex"),
      view: "history",
    })
  }

  private startPolling(): void {
    this.scheduler.start()
  }

  private stopPolling(): void {
    this.scheduler.stop()
  }

  private async tick(): Promise<void> {
    this.post({ type: "snapshot", payload: await this.readPayload() })
  }

  /**
   * Read the instruction history. Returns `{ rows: null }` when the emulator is
   * unreachable — the read itself is the reachability test, so this view needs
   * no ping. The history is valid whether the emulator runs or is paused.
   */
  private async readPayload(): Promise<HistoryPayload> {
    try {
      return { rows: buildHistoryRows(await this.makeClient().getHistory()) }
    } catch {
      return { rows: null }
    }
  }

  private post(payload: HistoryExtToWebview): void {
    const json = JSON.stringify(payload)
    if (json === this.lastPosted) return
    this.lastPosted = json
    void this.view?.webview.postMessage(payload)
  }

  private disposeView(): void {
    this.stopPolling()
    this.view = undefined
    this.lastPosted = ""
    for (const d of this.disposables.splice(0)) d.dispose()
  }
}
