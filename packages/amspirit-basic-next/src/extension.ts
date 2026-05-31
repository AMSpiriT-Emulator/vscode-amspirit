import { basename } from "node:path"
import { EmulatorClient, errorMessage, spawnEmulator } from "@amspirit/shared"
import * as vscode from "vscode"

import { type InjectMode, performInject } from "./commands/inject.js"
import { readSettingsWithWarnings } from "./config/Settings.js"
import { vsCodeConfigReader } from "./config/vsCodeConfigReader.js"
import { PingService } from "./connection/PingService.js"
import type { ConnectionState } from "./connection/PingService.js"
import { registerBasicDiagnostics } from "./diagnostics/registerBasicDiagnostics.js"
import { EmulatorLauncher } from "./lifecycle/EmulatorLauncher.js"
import { StatusBarPresenter } from "./statusBar/StatusBarPresenter.js"

export function activate(context: vscode.ExtensionContext): void {
  const out = vscode.window.createOutputChannel("AMSpiriT")
  context.subscriptions.push(out)

  registerBasicDiagnostics(context)

  const reader = vsCodeConfigReader()

  function loadSettings() {
    const { settings, warnings } = readSettingsWithWarnings(reader)
    for (const w of warnings) out.appendLine(`[settings] ${w}`)
    return settings
  }

  let settings = loadSettings()
  let client = new EmulatorClient({ port: settings.webPort })

  const presenter = new StatusBarPresenter(client.port)
  context.subscriptions.push(presenter)

  const launcher = new EmulatorLauncher((path, port, args) => spawnEmulator(path, port, args))
  context.subscriptions.push({ dispose: () => launcher.dispose() })

  let connectionState: ConnectionState = "disconnected"
  const pinger = new PingService(
    () => client.ping(),
    (s) => {
      connectionState = s
      presenter.setState(s)
    },
  )
  pinger.start()
  context.subscriptions.push({ dispose: () => pinger.stop() })

  function syncActiveBasicFile(): void {
    const editor = vscode.window.activeTextEditor
    const fileName =
      editor?.document.languageId === "amstrad-basic"
        ? basename(editor.document.fileName)
        : undefined
    presenter.setActiveBasicFileName(fileName)
  }

  syncActiveBasicFile()
  context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(() => syncActiveBasicFile()))

  function rebuildClient(): void {
    settings = loadSettings()
    client = new EmulatorClient({ port: settings.webPort })
    presenter.setPort(client.port)
  }

  async function cmdLaunch(): Promise<void> {
    settings = loadSettings()
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

    try {
      launcher.launch(binaryPath, settings.webPort, settings.emulatorArgs, {
        onExit: (code) => {
          out.appendLine(`Emulator exited (code ${code})`)
          connectionState = "disconnected"
          presenter.setState("disconnected")
        },
        onError: (err) => {
          out.appendLine(`Emulator error: ${errorMessage(err)}`)
        },
      })
      out.appendLine(
        `Launching: ${binaryPath} --web-server --web-port ${settings.webPort} ${settings.emulatorArgs.join(" ")}`,
      )
      vscode.window.showInformationMessage(`AMSpiriT launched on port ${settings.webPort}.`)
    } catch (e: unknown) {
      vscode.window.showErrorMessage(`AMSpiriT: launch failed — ${errorMessage(e)}`)
    }
  }

  async function cmdConnect(): Promise<void> {
    rebuildClient()
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
    if (editor.document.languageId !== "amstrad-basic") {
      vscode.window.showErrorMessage(
        "AMSpiriT: active file is not Amstrad CPC BASIC (expected .bas).",
      )
      return undefined
    }
    return editor.document.getText()
  }

  async function runInject(mode: InjectMode): Promise<void> {
    const source = activeSource()
    if (source === undefined) return // user already notified
    const result = await performInject(
      { client, source, connected: connectionState === "connected" },
      mode,
    )
    switch (result.kind) {
      case "success":
        vscode.window.showInformationMessage(result.message)
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
    vscode.commands.registerCommand("amspirit.openSettings", () =>
      vscode.commands.executeCommand(
        "workbench.action.openSettings",
        "@ext:amspirit-emulator.amspirit-basic-next",
      ),
    ),
  )

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration("amspirit")) return
      if (e.affectsConfiguration("amspirit.webPort")) {
        rebuildClient()
        void pinger.pingNow()
      } else {
        settings = loadSettings()
      }
    }),
  )

  void pinger.pingNow().then((s) => {
    if (s === "disconnected" && settings.autoLaunch) {
      void cmdLaunch()
    }
  })
}

export function deactivate(): void {
  // Subscriptions registered via context.subscriptions handle teardown.
}
