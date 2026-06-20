import { randomBytes } from "node:crypto"
import type { EmulatorClient } from "@amspirit/shared"
import * as vscode from "vscode"
import type {
  RegistersExtToWebview,
  RegistersWebviewToExt,
} from "../../webview/registers-messaging.js"
import { buildRegisterScopes, buildStackScope, type RegisterScope } from "../registers-view.js"
import { buildWebviewHtml } from "./html.js"

const POLL_INTERVAL_MS = 500
/** Stack words peeked at SP and shown in the Stack scope. */
const STACK_DEPTH = 8

/**
 * Webview *view* showing the Z80 registers (the four scopes Registers / Flags /
 * Shadow / Interrupts) as a compact 8-bit panel — the dedicated replacement for
 * VS Code's generic DAP Variables tree, which carried no value for assembler
 * debugging. Docked in the AMSpiriT Z80 activity-bar container. Thin shell: it
 * polls `getZ80` while visible and posts the formatted scopes; clicking a
 * pointer register asks the Memory view to jump there (via `onGoto`).
 */
export class RegistersPanel implements vscode.WebviewViewProvider {
  /** View id contributed in package.json (and its `<id>.focus` command). */
  static readonly viewId = "amspirit.z80.registers"

  private view: vscode.WebviewView | undefined
  private timer: ReturnType<typeof setInterval> | undefined
  /** Last snapshot posted, serialized — skip posting identical snapshots. */
  private lastPosted = ""
  private readonly disposables: vscode.Disposable[] = []

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly makeClient: () => EmulatorClient,
    /** Reveal the Memory view at `address` when a pointer register is clicked. */
    private readonly onGoto: (address: number) => void,
  ) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, "out", "webview")],
    }
    view.webview.html = this.render(view.webview)
    this.disposables.push(
      view.webview.onDidReceiveMessage((m: RegistersWebviewToExt) => {
        if (m.type === "ready") this.startPolling()
        else if (m.type === "goto") this.onGoto(m.address & 0xffff)
      }),
      // Don't poll a hidden view; resume when it comes back into view.
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
      view: "registers",
    })
  }

  private startPolling(): void {
    if (this.timer) return
    void this.tick()
    this.timer = setInterval(() => void this.tick(), POLL_INTERVAL_MS)
  }

  private stopPolling(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = undefined
  }

  private async tick(): Promise<void> {
    this.post({ type: "snapshot", snapshot: { scopes: await this.readScopes() } })
  }

  /**
   * Format the register snapshot. Returns `null` when the emulator is
   * unreachable. Gated on reachability (`ok`) like the other views — `/api/ping`'s
   * pause flag is unreliable, and `getZ80` succeeds whenever reachable.
   */
  private async readScopes(): Promise<RegisterScope[] | null> {
    const client = this.makeClient()
    try {
      const { ok } = await client.pingState()
      if (!ok) return null
      const r = await client.getZ80()
      // The stack peek is best-effort: a failed read just yields an empty scope.
      const stackBytes = await client
        .readRam(r.SP, STACK_DEPTH * 2, { cpuView: true })
        .catch(() => [])
      return [...buildRegisterScopes(r), buildStackScope(r.SP, stackBytes, STACK_DEPTH)]
    } catch {
      return null
    }
  }

  /** Post a snapshot, skipping the round-trip when it's identical to the last. */
  private post(payload: RegistersExtToWebview): void {
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
