import { randomBytes } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import {
  disassemble,
  type EmulatorClient,
  RefreshScheduler,
  type RefreshTriggerSource,
} from "@amspirit/shared"
import * as vscode from "vscode"
import type { ExtToWebview, WebviewToExt } from "../../webview/messaging.js"
import { firmwareLabel } from "../firmware-labels.js"
import { formatDisassembly } from "../memory-view/disasm-export.js"
import {
  type BankOption,
  buildMemoryRows,
  executedOffsets,
  followBase,
  memoryBanks,
  type PointerMark,
  pointerMarks,
} from "../memory-view/memory-model.js"
import { parseSymbolMap } from "../symbol-map/parse-symbol-map.js"
import type { SymbolMap } from "../symbol-map/symbol-map.js"
import { buildWebviewHtml } from "./html.js"

const COLUMNS = 16
const ROWS = 16
const WINDOW_BYTES = COLUMNS * ROWS
/** Default window start: the common Amstrad user-program area. */
const DEFAULT_BASE = 0x4000
/** Extra bytes read past a disassembly selection so the last instruction (≤4 bytes) is whole. */
const MAX_INSTR_PAD = 3

/** Combine a hi/lo register byte pair into a 16-bit value. */
const pair = (hi: number, lo: number): number => ((hi & 0xff) << 8) | (lo & 0xff)

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
 * Webview *view* showing a live Z80 memory dump (React) — a hex+ASCII grid
 * tailored to the 8-bit machine, without the native inspector's multi-byte and
 * float widgets. Docked in the AMSpiriT Z80 activity-bar container alongside the
 * Registers and Disassembly views. Thin shell: it polls `readRam` while visible
 * and posts a snapshot; the React app only renders. Memory is only coherent
 * while paused, so the poll skips the read when the program runs free.
 */
export class MemoryPanel implements vscode.WebviewViewProvider {
  /** View id contributed in package.json (and its `<id>.focus` command). */
  static readonly viewId = "amspirit.z80.memory"

  private view: vscode.WebviewView | undefined
  private base = DEFAULT_BASE
  /** When set, each tick re-centres the window on the program counter. */
  private followPc = false
  /** Selectable views/banks; populated once from `/api/config`. */
  private banks: BankOption[] = []
  /** The currently selected view (defaults to the CPU-visible mapping). */
  private bankView: BankOption = CPU_VIEW
  /** Drives refresh from the SSE hub; memory is only coherent while paused, so
   * it refreshes on stop signals (not per-frame). */
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
      view.webview.onDidReceiveMessage((m: WebviewToExt) => {
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
        } else if (m.type === "disassemble") {
          void this.disassembleRange(m.start, m.end)
        } else if (m.type === "write") {
          void this.writeByte(m.address, m.value)
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

  /**
   * Reveal the Memory view focused on `address` (used by the Registers view's
   * pointer-register links). Disables Follow PC so the jump sticks.
   */
  goto(address: number): void {
    this.base = address & 0xffff
    this.followPc = false
    void vscode.commands.executeCommand(`${MemoryPanel.viewId}.focus`)
    void this.tick()
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
    const { rows, marks, executed } = await this.readWindow(client)
    this.post({
      type: "snapshot",
      // Editing writes central RAM (`/api/ram` has no bank arg), so it's only
      // offered on the central-bank views (CPU view / Main RAM).
      snapshot: { rows, marks, executed, banks: this.banks, editable: this.bankView.bank === 0 },
    })
  }

  /**
   * Write a single byte to central RAM (`writeRam`) and refresh. No-op on
   * extended banks (the write endpoint can't target them). The changed byte
   * flashes on the next tick via the grid's diff highlight.
   */
  private async writeByte(address: number, value: number): Promise<void> {
    if (this.bankView.bank !== 0) return
    try {
      await this.makeClient().writeRam(address, [value])
      await this.tick()
    } catch {
      void vscode.window.showWarningMessage("AMSpiriT Z80: could not write memory.")
    }
  }

  /**
   * Read the selected byte range from the current view, disassemble it and open
   * the listing in a new editor (an `.asm`-shaped untitled document the user can
   * save). Reads a few extra bytes so the last instruction isn't truncated, then
   * keeps only instructions that start inside the selection.
   */
  private async disassembleRange(start: number, end: number): Promise<void> {
    const client = this.makeClient()
    const span = (end - start) & 0xffff
    try {
      const bytes = await client.readRam(start, span + 1 + MAX_INSTR_PAD, {
        cpuView: this.bankView.cpuView,
        bank: this.bankView.bank,
      })
      const instructions = disassemble(bytes, start, span + 1).filter(
        (ins) => ((ins.address - start) & 0xffff) <= span,
      )
      const content = formatDisassembly(instructions, { start, end, resolve: this.labelResolver() })
      const doc = await vscode.workspace.openTextDocument({ content, language: "z80-asm" })
      await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside)
    } catch {
      void vscode.window.showWarningMessage("AMSpiriT Z80: could not disassemble the selection.")
    }
  }

  /**
   * Address→label resolver for the disassembly: the active debug session's
   * symbol map (user labels) first, then the firmware jumpblock (`CALL &BBxx`).
   * `disasm-export` invents `Lxxxx` labels for in-range targets this can't name.
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

  /**
   * Read the current window as the CPU sees it, plus the pointer registers that
   * land in it. `rows: null` when the emulator is unreachable; `marks` empty then.
   *
   * Gated on reachability (`ok`), not `emu.paused`: `/api/ping`'s pause flag is
   * unreliable (the documented response is `{"ok":true}` only, and step landing
   * is detected by PC-polling, not the flag), so gating on it left the view
   * blank even while stopped at a breakpoint. Memory is most meaningful while
   * paused, but showing the live snapshot whenever reachable is strictly better
   * than "No data" at a breakpoint, and `readRam` succeeds in both states.
   */
  private async readWindow(client: EmulatorClient): Promise<{
    rows: ReturnType<typeof buildMemoryRows> | null
    marks: PointerMark[]
    executed: number[]
  }> {
    try {
      const { ok } = await client.pingState()
      if (!ok) return { rows: null, marks: [], executed: [] }
      await this.ensureBanks(client)
      const r = await client.getZ80()
      // Follow PC: re-centre the window on the program counter before reading.
      if (this.followPc) this.base = followBase(r.PC, WINDOW_BYTES, COLUMNS)
      const bytes = await client.readRam(this.base, WINDOW_BYTES, {
        cpuView: this.bankView.cpuView,
        bank: this.bankView.bank,
      })
      const rows = buildMemoryRows(bytes, { base: this.base, columns: COLUMNS })
      // Pointer registers and the execution bitmap are indexed by CPU address;
      // on an extended bank the same offsets aren't those addresses, so omit
      // both there. The codemap is best-effort (older emulators may lack it).
      const central = this.bankView.bank === 0
      const marks = central
        ? pointerMarks(
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
        : []
      const bitmap = central ? await client.getCodemap().catch(() => "") : ""
      const executed = executedOffsets(bitmap, this.base, WINDOW_BYTES)
      return { rows, marks, executed }
    } catch {
      return { rows: null, marks: [], executed: [] }
    }
  }

  /** Post a snapshot, skipping the round-trip when it's identical to the last. */
  private post(payload: ExtToWebview): void {
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
