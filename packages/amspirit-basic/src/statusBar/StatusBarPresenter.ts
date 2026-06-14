import * as vscode from "vscode"
import { buildIndicator, type ConnectionState } from "./ConnectionIndicator.js"

const WARNING_BG = new vscode.ThemeColor("statusBarItem.warningBackground")

/**
 * Thin VS Code adapter around `buildIndicator`. Owns the `StatusBarItem`
 * and applies the pure view-model to it. Exposed as a class so the
 * extension can dispose it through `context.subscriptions`.
 */
export class StatusBarPresenter implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem
  private state: ConnectionState = "disconnected"
  private port: number
  private activeBasicFileName: string | undefined

  constructor(initialPort: number) {
    this.port = initialPort
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100)
    this.item.show()
    this.render()
  }

  setState(state: ConnectionState): void {
    if (state === this.state) return
    this.state = state
    this.render()
  }

  setPort(port: number): void {
    if (port === this.port) return
    this.port = port
    this.render()
  }

  setActiveBasicFileName(activeBasicFileName: string | undefined): void {
    if (activeBasicFileName === this.activeBasicFileName) return
    this.activeBasicFileName = activeBasicFileName
    this.render()
  }

  private render(): void {
    const view = buildIndicator(this.state, this.port, this.activeBasicFileName)
    this.item.text = view.text
    this.item.tooltip = view.tooltip
    this.item.command = view.command
    this.item.backgroundColor = view.useWarningBackground ? WARNING_BG : undefined
  }

  dispose(): void {
    this.item.dispose()
  }
}
