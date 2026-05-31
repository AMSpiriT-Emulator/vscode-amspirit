import { EmulatorClient, spawnEmulator } from "@amspirit/shared"
import * as vscode from "vscode"

import { performInject } from "./commands/inject.js"
import { readSettings } from "./config/Settings.js"
import { PingService } from "./connection/PingService.js"
import { EmulatorLauncher } from "./lifecycle/EmulatorLauncher.js"
import { type ConnectionState, buildIndicator } from "./statusBar/ConnectionIndicator.js"

const WARNING_BG = new vscode.ThemeColor("statusBarItem.warningBackground")

export function activate(context: vscode.ExtensionContext): void {
  const out = vscode.window.createOutputChannel("AMSpiriT")
  context.subscriptions.push(out)

  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100)
  statusBar.command = "amspirit.connect"
  statusBar.show()
  context.subscriptions.push(statusBar)

  const launcher = new EmulatorLauncher((path, port, args) => spawnEmulator(path, port, args))
  context.subscriptions.push({ dispose: () => launcher.dispose() })

  let state: ConnectionState = "disconnected"
  let client = buildClient()

  function buildClient(): EmulatorClient {
    return new EmulatorClient({ port: readSettings(amspiritConfig()).webPort })
  }

  function amspiritConfig() {
    const cfg = vscode.workspace.getConfiguration("amspirit")
    return {
      get<T>(key: string, defaultValue: T): T {
        return cfg.get<T>(key, defaultValue)
      },
    }
  }

  function renderStatusBar(): void {
    const view = buildIndicator(state, client.port)
    statusBar.text = view.text
    statusBar.tooltip = view.tooltip
    statusBar.backgroundColor = view.useWarningBackground ? WARNING_BG : undefined
  }

  renderStatusBar()

  const pinger = new PingService(
    () => client.ping(),
    (s) => {
      state = s
      renderStatusBar()
    },
  )
  pinger.start()
  context.subscriptions.push({ dispose: () => pinger.stop() })

  async function cmdLaunch(): Promise<void> {
    const settings = readSettings(amspiritConfig())
    let binaryPath = settings.emulatorPath
    if (!binaryPath) {
      const picked = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        openLabel: "Select amspirit-lite-sdl binary",
      })
      if (!picked?.[0]) return
      binaryPath = picked[0].fsPath
      await vscode.workspace
        .getConfiguration("amspirit")
        .update("emulatorPath", binaryPath, vscode.ConfigurationTarget.Global)
    }

    if (launcher.isRunning) {
      vscode.window.showWarningMessage("AMSpiriT: emulator is already running.")
      return
    }

    out.appendLine(
      `Launching: ${binaryPath} --web-server --web-port ${settings.webPort} ${settings.emulatorArgs.join(" ")}`,
    )

    try {
      launcher.launch(binaryPath, settings.webPort, settings.emulatorArgs, {
        onExit: (code) => {
          out.appendLine(`Emulator exited (code ${code})`)
          state = "disconnected"
          renderStatusBar()
        },
      })
      vscode.window.showInformationMessage(`AMSpiriT launched on port ${settings.webPort}.`)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      vscode.window.showErrorMessage(`AMSpiriT: launch failed — ${msg}`)
    }
  }

  async function cmdConnect(): Promise<void> {
    client = buildClient()
    const s = await pinger.pingNow()
    if (s === "connected") {
      vscode.window.showInformationMessage(`AMSpiriT: connected on port ${client.port}.`)
      return
    }
    const choice = await vscode.window.showWarningMessage(
      `AMSpiriT: cannot reach emulator on port ${client.port}.`,
      "Launch Emulator",
      "Cancel",
    )
    if (choice === "Launch Emulator") await cmdLaunch()
  }

  function activeSource(): string | undefined {
    const editor = vscode.window.activeTextEditor
    if (!editor) {
      vscode.window.showErrorMessage("AMSpiriT: no active editor.")
      return undefined
    }
    return editor.document.getText()
  }

  async function runInject(mode: Parameters<typeof performInject>[1]): Promise<void> {
    const result = await performInject(
      { client, source: activeSource(), connected: state === "connected" },
      mode,
    )
    switch (result.kind) {
      case "success":
        vscode.window.showInformationMessage(result.message)
        return
      case "noEditor":
        // performInject only returns this when source is undefined; activeSource()
        // already showed an error above.
        return
      case "notConnected":
        vscode.window.showErrorMessage("AMSpiriT: not connected. Launch or connect first.")
        return
      case "error":
        vscode.window.showErrorMessage(`AMSpiriT: inject failed — ${result.message}`)
        return
    }
  }

  context.subscriptions.push(
    vscode.commands.registerCommand("amspirit.launch", cmdLaunch),
    vscode.commands.registerCommand("amspirit.connect", cmdConnect),
    vscode.commands.registerCommand("amspirit.inject", () => runInject("inject")),
    vscode.commands.registerCommand("amspirit.injectAndRun", () => runInject("injectAndRun")),
    vscode.commands.registerCommand("amspirit.resetAndInject", () => runInject("resetAndInject")),
    vscode.commands.registerCommand("amspirit.resetAndRun", () => runInject("resetAndRun")),
  )

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("amspirit.webPort")) {
        client = buildClient()
        void pinger.pingNow()
      }
    }),
  )

  void pinger.pingNow().then((s) => {
    if (s === "disconnected" && readSettings(amspiritConfig()).autoLaunch) {
      void cmdLaunch()
    }
  })
}

export function deactivate(): void {
  // Subscriptions registered via context.subscriptions handle teardown.
}
