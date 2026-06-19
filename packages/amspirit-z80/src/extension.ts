import {
  EmulatorClient,
  EmulatorLauncher,
  errorMessage,
  PingService,
  readSettings,
  spawnEmulator,
} from "@amspirit/shared"
import * as vscode from "vscode"
import { vsCodeConfigReader } from "./config/vs-code-config-reader.js"
import { Z80DebugSession } from "./debug/z80-debug-session.js"
import { Z80StatusBar } from "./status-bar/z80-status-bar.js"
import { DisasmPanel } from "./webview/disasm-panel.js"
import { MemoryPanel } from "./webview/memory-panel.js"

const DEBUG_TYPE = "amspirit-z80"

export function activate(context: vscode.ExtensionContext): void {
  const out = vscode.window.createOutputChannel("AMSpiriT Z80")
  context.subscriptions.push(out)

  const reader = vsCodeConfigReader("amspirit-z80")
  const loadSettings = () => readSettings(reader)

  let settings = loadSettings()
  let client = new EmulatorClient({ port: settings.webPort })

  const statusBar = new Z80StatusBar(client.port)
  context.subscriptions.push(statusBar)

  const pinger = new PingService(
    () => client.ping(),
    (state) => statusBar.setState(state),
  )
  pinger.start()
  context.subscriptions.push({ dispose: () => pinger.stop() })

  const launcher = new EmulatorLauncher((path, port, args) => spawnEmulator(path, port, args))
  context.subscriptions.push({ dispose: () => launcher.dispose() })

  function rebuildClient(): void {
    settings = loadSettings()
    client = new EmulatorClient({ port: settings.webPort })
    statusBar.setPort(client.port)
  }

  // The Memory View must talk to whichever emulator the active debug session is
  // attached to (its launch config may override host/port); fall back to the
  // status-bar client when no Z80 session is running.
  function debugAwareClient(): EmulatorClient {
    const cfg = vscode.debug.activeDebugSession?.configuration as
      | { type?: string; host?: string; port?: number }
      | undefined
    if (cfg?.type !== DEBUG_TYPE) return client
    if ((cfg.host ?? client.host) === client.host && (cfg.port ?? client.port) === client.port) {
      return client
    }
    return new EmulatorClient(
      cfg.host !== undefined
        ? { host: cfg.host, port: cfg.port ?? client.port }
        : { port: cfg.port ?? client.port },
    )
  }

  async function cmdLaunch(): Promise<void> {
    settings = loadSettings()
    let binaryPath = settings.emulatorPath
    if (!binaryPath) {
      const picked = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        openLabel: "Select the AMSpiriT Lite binary",
      })
      if (!picked?.[0]) return
      binaryPath = picked[0].fsPath
      await vscode.workspace
        .getConfiguration("amspirit-z80")
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
          statusBar.setState("disconnected")
        },
        onError: (err) => out.appendLine(`Emulator error: ${errorMessage(err)}`),
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
    const state = await pinger.pingNow()
    if (state === "connected") {
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

  context.subscriptions.push(
    vscode.commands.registerCommand("amspirit.z80.launch", cmdLaunch),
    vscode.commands.registerCommand("amspirit.z80.connect", cmdConnect),
    vscode.commands.registerCommand("amspirit.z80.memoryView", () =>
      MemoryPanel.show(context.extensionUri, debugAwareClient),
    ),
    vscode.commands.registerCommand("amspirit.z80.disassemblyView", () =>
      DisasmPanel.show(context.extensionUri, debugAwareClient),
    ),
  )

  const debugFactory: vscode.DebugAdapterDescriptorFactory = {
    createDebugAdapterDescriptor() {
      return new vscode.DebugAdapterInlineImplementation(
        new Z80DebugSession((host, port) => new EmulatorClient({ host, port })),
      )
    },
  }

  const debugConfigProvider: vscode.DebugConfigurationProvider = {
    resolveDebugConfiguration(_folder, config) {
      // No launch.json (or empty): synthesize an attach for the active .asm.
      if (!config.type && !config.request && !config.name) {
        const editor = vscode.window.activeTextEditor
        if (editor?.document.languageId === "z80-asm") {
          config.type = DEBUG_TYPE
          config.name = "Attach to AMSpiriT (Z80)"
          config.request = "attach"
          config.program = editor.document.fileName
        }
      }
      if (config.type === DEBUG_TYPE && config.port === undefined) {
        config.port = loadSettings().webPort
      }
      return config
    },
  }

  context.subscriptions.push(
    vscode.debug.registerDebugAdapterDescriptorFactory(DEBUG_TYPE, debugFactory),
    vscode.debug.registerDebugConfigurationProvider(DEBUG_TYPE, debugConfigProvider),
  )

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration("amspirit-z80")) return
      if (e.affectsConfiguration("amspirit-z80.webPort")) {
        rebuildClient()
        void pinger.pingNow()
      } else {
        settings = loadSettings()
      }
    }),
  )

  void pinger.pingNow().then((state) => {
    if (state === "disconnected" && settings.autoLaunch) void cmdLaunch()
  })
}

export function deactivate(): void {
  // Subscriptions registered via context.subscriptions handle teardown.
}
