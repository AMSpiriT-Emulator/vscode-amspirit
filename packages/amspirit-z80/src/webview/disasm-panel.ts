import { randomBytes } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import {
  disassemble,
  type EmulatorClient,
  RefreshScheduler,
  type RefreshTriggerSource,
} from "@amspirit/shared"
import * as vscode from "vscode"
import type { DisasmExtToWebview, DisasmWebviewToExt } from "../../webview/disasm-messaging.js"
import {
  type ByteReader,
  buildDisasmRows,
  type DisasmRow,
  stepBase,
} from "../disasm-view/disasm-view-model.js"
import { firmwareLabel } from "../firmware-labels.js"
import { formatDisassembly } from "../memory-view/disasm-export.js"
import { type BankOption, memoryBanks } from "../memory-view/memory-model.js"
import { parseSymbolMap } from "../symbol-map/parse-symbol-map.js"
import type { SymbolMap } from "../symbol-map/symbol-map.js"
import { buildWebviewHtml } from "./html.js"

/** Instruction rows shown at once. */
const ROWS = 28
/** Context instructions kept above the anchor (so the anchor isn't the top row). */
const LEAD = 4
/** Longest Z80 instruction is 4 bytes; pad reads so the last row decodes whole. */
const MAX_INSTR_LEN = 4
/** Default anchor before anything runs: the common Amstrad user-program area. */
const DEFAULT_BASE = 0x4000
/** Bytes read around the anchor to decode the window (generous; trimmed by count). */
const READ_SPAN = (ROWS + LEAD) * MAX_INSTR_LEN

/** Default view before the machine config is known: the CPU-visible mapping. */
const CPU_VIEW: BankOption = { id: "cpu", label: "CPU view", bank: 0, cpuView: true }

/**
 * Resolve the symbol-map path for label-aware disassembly: an explicit
 * `mapFile`, else the first existing sjasmplus SLD / rasm map sitting next to
 * `program` (mirrors the debug session's auto-detection).
 */
function symbolMapPath(mapFile?: string, program?: string): string | undefined {
  if (mapFile) return mapFile
  if (!program) return undefined
  const stem = program.replace(/\.[^.]+$/, "")
  return [`${stem}.sld`, `${program}.sld`, `${stem}.map`, `${program}.map`].find((p) =>
    existsSync(p),
  )
}

/**
 * Webview *view* showing a live, label-aware Z80 disassembly (React) — the rich
 * replacement for VS Code's built-in DAP disassembly, with the same care as the
 * Memory View: Follow PC, machine-driven bank selector, wheel/keyboard paging,
 * current-PC highlight, code-coverage shading and firmware/symbol-map labels.
 * Docked in the AMSpiriT Z80 activity-bar container. Thin shell: it polls memory
 * while visible and posts a snapshot; the React app only renders.
 */
export class DisasmPanel implements vscode.WebviewViewProvider {
  /** View id contributed in package.json (and its `<id>.focus` command). */
  static readonly viewId = "amspirit.z80.disassembly"

  private view: vscode.WebviewView | undefined
  private base = DEFAULT_BASE
  /** When set, each tick re-centres the window on the program counter. */
  private followPc = true
  /** Selectable views/banks; populated once from `/api/config`. */
  private banks: BankOption[] = []
  /** The currently selected view (defaults to the CPU-visible mapping). */
  private bankView: BankOption = CPU_VIEW
  /** Last window rendered, kept so paging/export know the visible range. */
  private rows: DisasmRow[] = []
  /** Drives refresh from the SSE hub; the listing re-anchors on stop signals. */
  private readonly scheduler: RefreshScheduler
  /** Last snapshot posted, serialized — skip posting identical snapshots. */
  private lastPosted = ""
  private readonly disposables: vscode.Disposable[] = []

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly makeClient: () => EmulatorClient,
    triggers: RefreshTriggerSource,
  ) {
    this.scheduler = new RefreshScheduler(triggers, () => void this.tick(), { onFrame: false })
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, "out", "webview")],
    }
    view.webview.html = this.render(view.webview)
    this.disposables.push(
      view.webview.onDidReceiveMessage((m: DisasmWebviewToExt) => {
        if (m.type === "ready") this.startPolling()
        else if (m.type === "goto") {
          this.base = m.address & 0xffff
          void this.tick()
        } else if (m.type === "followPc") {
          this.followPc = m.enabled
          void this.tick()
        } else if (m.type === "selectBank") {
          this.bankView = this.banks.find((b) => b.id === m.id) ?? CPU_VIEW
          void this.tick()
        } else if (m.type === "page") {
          void this.scroll(m.delta)
        } else if (m.type === "exportAsm") {
          void this.exportRange(m.start, m.end)
        }
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
      view: "disasm",
    })
  }

  private startPolling(): void {
    this.scheduler.start()
  }

  private stopPolling(): void {
    this.scheduler.stop()
  }

  /** Scroll the anchor by `delta` instructions, then refresh. */
  private async scroll(delta: number): Promise<void> {
    if (this.followPc) this.followPc = false
    const reader = await this.snapshotReader(this.makeClient(), this.base)
    if (reader) this.base = stepBase(reader, this.base, delta)
    await this.tick()
  }

  private async tick(): Promise<void> {
    const client = this.makeClient()
    const rows = await this.readWindow(client)
    this.rows = rows ?? []
    this.post({ type: "snapshot", snapshot: { rows, banks: this.banks } })
  }

  /**
   * Read the window around the anchor and decode it into label-aware rows.
   * Returns `null` when the emulator is unreachable (the view shows a
   * placeholder). Gated on reachability (`ok`) like the Memory View — `/api/ping`'s
   * pause flag is unreliable, and `readRam` succeeds whenever reachable.
   */
  private async readWindow(client: EmulatorClient): Promise<DisasmRow[] | null> {
    try {
      const { ok } = await client.pingState()
      if (!ok) return null
      await this.ensureBanks(client)
      const r = await client.getZ80()
      if (this.followPc) this.base = r.PC & 0xffff
      const read = await this.snapshotReader(client, this.base)
      if (!read) return null
      // Coverage/PC are CPU addresses; meaningful only on the central views.
      const central = this.bankView.bank === 0
      const codemapHex = central ? await client.getCodemap().catch(() => "") : ""
      return buildDisasmRows({
        read,
        base: this.base,
        instructionOffset: -LEAD,
        instructionCount: ROWS,
        codemapHex,
        resolve: this.labelResolver(),
        // PC is a CPU address; only flag it on the central views.
        ...(central ? { pc: r.PC } : {}),
      })
    } catch {
      return null
    }
  }

  /**
   * A {@link ByteReader} backed by a single snapshot read centred on `anchor`,
   * wide enough for the window's backward + forward decode. `null` if the read
   * fails. Reused by paging so `stepBase` decodes against real memory.
   */
  private async snapshotReader(
    client: EmulatorClient,
    anchor: number,
  ): Promise<ByteReader | undefined> {
    const start = (anchor - LEAD * MAX_INSTR_LEN) & 0xffff
    try {
      const snapshot = await client.readRam(start, READ_SPAN + LEAD * MAX_INSTR_LEN, {
        cpuView: this.bankView.cpuView,
        bank: this.bankView.bank,
      })
      return (addr, len) => {
        const out: number[] = []
        for (let i = 0; i < len; i++) {
          const idx = ((addr + i - start) & 0xffff) % snapshot.length
          out.push(snapshot[idx] ?? 0)
        }
        return out
      }
    } catch {
      return undefined
    }
  }

  /**
   * Export instructions to an `.asm` listing editor: the selected `[start, end]`
   * range when supplied, else the currently visible window. The range read is
   * disassembled from scratch (independent of the live window) so a selection
   * spanning more than one screen is exported whole.
   */
  private async exportRange(rangeStart?: number, rangeEnd?: number): Promise<void> {
    const bounds = this.exportBounds(rangeStart, rangeEnd)
    if (!bounds) return
    const { start, span } = bounds
    try {
      const bytes = await this.makeClient().readRam(start, span + 1 + MAX_INSTR_LEN, {
        cpuView: this.bankView.cpuView,
        bank: this.bankView.bank,
      })
      const instructions = disassemble(bytes, start, span + 1).filter(
        (ins) => ((ins.address - start) & 0xffff) <= span,
      )
      const end = (start + span) & 0xffff
      const content = formatDisassembly(instructions, { start, end, resolve: this.labelResolver() })
      const doc = await vscode.workspace.openTextDocument({ content, language: "z80-asm" })
      await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside)
    } catch {
      void vscode.window.showWarningMessage("AMSpiriT Z80: could not export the disassembly.")
    }
  }

  /**
   * The `{ start, span }` to export: the explicit selection, else the visible
   * instruction window. `undefined` when neither yields a range.
   */
  private exportBounds(
    rangeStart?: number,
    rangeEnd?: number,
  ): { start: number; span: number } | undefined {
    if (rangeStart !== undefined && rangeEnd !== undefined) {
      const start = rangeStart & 0xffff
      return { start, span: (rangeEnd - rangeStart) & 0xffff }
    }
    const instrRows = this.rows.filter((row) => row.bytes !== "")
    const first = instrRows[0]
    const last = instrRows[instrRows.length - 1]
    if (!first || !last) return undefined
    return { start: first.addr, span: (last.addr - first.addr) & 0xffff }
  }

  /**
   * Address→label resolver: the active debug session's symbol map (user labels)
   * first, then the firmware jumpblock (`CALL &BBxx`).
   */
  private labelResolver(): (addr: number) => string | undefined {
    const symbols = this.activeSymbols()
    return (addr) => symbols?.addressToLabel(addr) ?? firmwareLabel(addr)
  }

  /** Parse the symbol map of the active session (explicit `mapFile`, else next to `program`). */
  private activeSymbols(): SymbolMap | undefined {
    const cfg = vscode.debug.activeDebugSession?.configuration
    const mapPath = symbolMapPath(cfg?.mapFile, cfg?.program)
    if (!mapPath) return undefined
    try {
      return parseSymbolMap(mapPath, readFileSync(mapPath, "utf-8"))
    } catch {
      return undefined
    }
  }

  /** Fetch the machine config once to learn how many banks exist. Best-effort. */
  private async ensureBanks(client: EmulatorClient): Promise<void> {
    if (this.banks.length > 0) return
    try {
      this.banks = memoryBanks((await client.getConfig()).extendedRam)
    } catch {
      // leave empty; retried next tick
    }
  }

  /** Post a snapshot, skipping the round-trip when it's identical to the last. */
  private post(payload: DisasmExtToWebview): void {
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
