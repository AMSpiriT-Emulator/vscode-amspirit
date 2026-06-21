import { randomBytes } from "node:crypto"
import type {
  EmulatorClient,
  EmulatorState,
  MemmapState,
  RefreshTriggerSource,
} from "@amspirit/shared"
import { RefreshScheduler } from "@amspirit/shared"
import * as vscode from "vscode"
import type {
  HardwareExtToWebview,
  HardwarePayload,
  HardwareWebviewToExt,
} from "../../webview/hardware-messaging.js"
import { buildWebviewHtml } from "./html.js"

/** Per-chip wiring: which view it backs and how to build its payload. */
export interface HardwarePanelConfig {
  /** View id contributed in package.json (and its `<id>.focus` command). */
  viewId: string
  /** `data-view` the shared bundle mounts (`gate-array` | `psg` | `fdc` | `crtc`). */
  dataView: string
  /** Whether this chip's builder needs the `/api/memmap` snapshot too. */
  needsMemmap?: boolean
  /** Build the view payload from a snapshot. Pure. */
  build: (state: EmulatorState, memmap: MemmapState) => HardwarePayload
  /** Payload posted when the emulator is unreachable (carries the right kind). */
  emptyPayload: HardwarePayload
}

const EMPTY_MEMMAP: MemmapState = { regions: [], rmr: 0, ramMode: 0, ramPage: 0 }

/**
 * A docked webview view for one CPC peripheral chip (Gate Array, PSG, FDC or
 * CRTC). Generic shell shared by all four: polls `/api/state` (and `/api/memmap`
 * when the chip needs it) while visible, formats the snapshot via the injected
 * pure builder, and posts the scopes to the shared React bundle. Mirrors
 * {@link RegistersPanel} but is parameterised by {@link HardwarePanelConfig}.
 */
export class HardwarePanel implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined
  /** Drives refresh from the SSE hub; chip state tracks frame events live. */
  private readonly scheduler: RefreshScheduler
  /** Last snapshot posted, serialized — skip posting identical snapshots. */
  private lastPosted = ""
  private readonly disposables: vscode.Disposable[] = []

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly makeClient: () => EmulatorClient,
    triggers: RefreshTriggerSource,
    /** Public so the activation code can read the `viewId` when registering. */
    readonly config: HardwarePanelConfig,
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
      view.webview.onDidReceiveMessage((m: HardwareWebviewToExt) => {
        if (m.type === "ready") this.startPolling()
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
      view: this.config.dataView,
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
   * Build the chip payload. Returns the configured empty payload when the
   * emulator is unreachable. Gated on reachability (`ok`) like the other views —
   * `/api/ping`'s pause flag is unreliable, and the state read succeeds whenever
   * reachable.
   */
  private async readPayload(): Promise<HardwarePayload> {
    const client = this.makeClient()
    try {
      const { ok } = await client.pingState()
      if (!ok) return this.config.emptyPayload
      const state = await client.getState()
      const memmap = this.config.needsMemmap ? await client.getMemmap() : EMPTY_MEMMAP
      return this.config.build(state, memmap)
    } catch {
      return this.config.emptyPayload
    }
  }

  /** Post a snapshot, skipping the round-trip when it's identical to the last. */
  private post(payload: HardwareExtToWebview): void {
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
