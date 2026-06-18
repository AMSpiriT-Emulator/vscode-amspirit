import { randomBytes } from "node:crypto"
import type { EmulatorClient } from "@amspirit/shared"
import * as vscode from "vscode"
import type { ExtToWebview, WebviewToExt } from "../../webview/messaging.js"
import { buildMemoryRows, type PointerMark, pointerMarks } from "../memory-view/memory-model.js"
import { buildWebviewHtml } from "./html.js"

const POLL_INTERVAL_MS = 500
const COLUMNS = 16
const ROWS = 16
const WINDOW_BYTES = COLUMNS * ROWS
/** Default window start: the common Amstrad user-program area. */
const DEFAULT_BASE = 0x4000

const addrHex = (n: number): string =>
  `0x${(n & 0xffff).toString(16).toUpperCase().padStart(4, "0")}`
/** Combine a hi/lo register byte pair into a 16-bit value. */
const pair = (hi: number, lo: number): number => ((hi & 0xff) << 8) | (lo & 0xff)

/**
 * Singleton webview panel showing a live Z80 memory dump (React) — a hex+ASCII
 * grid tailored to the 8-bit machine, without the native inspector's multi-byte
 * and float widgets. Thin shell: it polls `readRam` while visible and paused
 * and posts a snapshot; the React app only renders. Memory is only coherent
 * while paused, so the poll skips the read when the program runs free.
 */
export class MemoryPanel {
  private static current: MemoryPanel | undefined

  private base = DEFAULT_BASE
  private timer: ReturnType<typeof setInterval> | undefined
  /** Last snapshot posted, serialized — skip posting identical snapshots. */
  private lastPosted = ""
  private readonly disposables: vscode.Disposable[] = []

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly extensionUri: vscode.Uri,
    private readonly makeClient: () => EmulatorClient,
  ) {
    this.panel.webview.html = this.render()
    this.disposables.push(
      this.panel.webview.onDidReceiveMessage((m: WebviewToExt) => {
        if (m.type === "ready") this.startPolling()
        else if (m.type === "goto") {
          this.base = m.address & 0xffff
          void this.tick()
        }
      }),
      // Don't poll a hidden panel; resume when it comes back into view.
      this.panel.onDidChangeViewState(() => {
        if (this.panel.visible) this.startPolling()
        else this.stopPolling()
      }),
    )
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables)
  }

  static show(extensionUri: vscode.Uri, makeClient: () => EmulatorClient): void {
    if (MemoryPanel.current) {
      MemoryPanel.current.panel.reveal()
      return
    }
    const panel = vscode.window.createWebviewPanel(
      "amspiritZ80Memory",
      "Z80 Memory",
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, "out", "webview")],
      },
    )
    MemoryPanel.current = new MemoryPanel(panel, extensionUri, makeClient)
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
    void this.tick()
    this.timer = setInterval(() => void this.tick(), POLL_INTERVAL_MS)
  }

  private stopPolling(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = undefined
  }

  private async tick(): Promise<void> {
    const client = this.makeClient()
    const { rows, marks } = await this.readWindow(client)
    this.post({ type: "snapshot", snapshot: { base: addrHex(this.base), rows, marks } })
  }

  /**
   * Read the current window as the CPU sees it, plus the pointer registers that
   * land in it. `rows: null` when not paused/reachable; `marks` is empty then.
   */
  private async readWindow(
    client: EmulatorClient,
  ): Promise<{ rows: ReturnType<typeof buildMemoryRows> | null; marks: PointerMark[] }> {
    try {
      const { paused } = await client.pingState()
      if (!paused) return { rows: null, marks: [] }
      const bytes = await client.readRam(this.base, WINDOW_BYTES, { cpuView: true })
      const rows = buildMemoryRows(bytes, { base: this.base, columns: COLUMNS })
      const r = await client.getZ80()
      const marks = pointerMarks(
        {
          BC: pair(r.B, r.C),
          DE: pair(r.D, r.E),
          HL: pair(r.H, r.L),
          IX: r.IX,
          IY: r.IY,
          SP: r.SP,
          PC: r.PC,
        },
        { base: this.base, length: WINDOW_BYTES },
      )
      return { rows, marks }
    } catch {
      return { rows: null, marks: [] }
    }
  }

  /** Post a snapshot, skipping the round-trip when it's identical to the last. */
  private post(payload: ExtToWebview): void {
    const json = JSON.stringify(payload)
    if (json === this.lastPosted) return
    this.lastPosted = json
    void this.panel.webview.postMessage(payload)
  }

  private dispose(): void {
    MemoryPanel.current = undefined
    this.stopPolling()
    this.panel.dispose()
    for (const d of this.disposables) d.dispose()
  }
}
