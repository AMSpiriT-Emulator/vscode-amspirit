import type { ConnectionState } from "@amspirit/shared"
import * as vscode from "vscode"
import { buildZ80Indicator } from "./z80-indicator.js"

const WARNING_BG = new vscode.ThemeColor("statusBarItem.warningBackground")

/**
 * Thin VS Code adapter around `buildZ80Indicator`. Owns the `StatusBarItem`
 * and applies the pure view-model to it; disposed via `context.subscriptions`.
 */
export class Z80StatusBar implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem
  private state: ConnectionState = "disconnected"
  private port: number

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

  private render(): void {
    const view = buildZ80Indicator(this.state, this.port)
    this.item.text = view.text
    this.item.tooltip = view.tooltip
    this.item.command = view.command
    this.item.backgroundColor = this.state === "connected" ? undefined : WARNING_BG
  }

  dispose(): void {
    this.item.dispose()
  }
}
