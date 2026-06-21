import {
  EmulatorClient,
  EmulatorEventHub,
  EmulatorEvents,
  EmulatorLauncher,
  errorMessage,
  readSettings,
  spawnEmulator,
} from "@amspirit/shared"
import * as vscode from "vscode"
import { vsCodeConfigReader } from "./config/vs-code-config-reader.js"
import { Z80DebugSession } from "./debug/z80-debug-session.js"
import { buildCrtcScopes, buildFdcScopes, buildGateArrayScopes } from "./hardware/hardware-views.js"
import { buildPsgViewModel } from "./hardware/psg-view-model.js"
import { Z80StatusBar } from "./status-bar/z80-status-bar.js"
import { DisasmPanel } from "./webview/disasm-panel.js"
import { HardwarePanel } from "./webview/hardware-panel.js"
import { MemoryPanel } from "./webview/memory-panel.js"
import { RegistersPanel } from "./webview/registers-panel.js"

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

  // The views and the status bar all share ONE SSE stream (the emulator caps
  // clients): `frame` drives live refresh, `pause`/`z80_bp` snap the views to a
  // stop, and the stream's liveness drives the status bar (replacing the ping
  // poll). It tracks whichever emulator the views talk to (see `currentTarget`).
  const hub = new EmulatorEventHub(
    (host, port) => new EmulatorEvents({ host, port, topics: ["frame", "z80_bp", "pause"] }),
    client.host,
    client.port,
  )
  hub.onConnectionChange((state) => statusBar.setState(state))
  hub.start()
  context.subscriptions.push({ dispose: () => hub.dispose() })

  const launcher = new EmulatorLauncher((path, port, args) => spawnEmulator(path, port, args))
  context.subscriptions.push({ dispose: () => launcher.dispose() })

  function rebuildClient(): void {
    settings = loadSettings()
    client = new EmulatorClient({ port: settings.webPort })
    statusBar.setPort(client.port)
    hub.retarget(client.host, client.port)
  }

  // The views must talk to whichever emulator the active debug session is
  // attached to (its launch config may override host/port); fall back to the
  // status-bar client when no Z80 session is running.
  function currentTarget(): { host: string; port: number } {
    const cfg = vscode.debug.activeDebugSession?.configuration as
      | { type?: string; host?: string; port?: number }
      | undefined
    if (cfg?.type !== DEBUG_TYPE) return { host: client.host, port: client.port }
    return { host: cfg.host ?? client.host, port: cfg.port ?? client.port }
  }

  function debugAwareClient(): EmulatorClient {
    const { host, port } = currentTarget()
    if (host === client.host && port === client.port) return client
    return new EmulatorClient({ host, port })
  }

  // Keep the shared SSE stream pointed at the same emulator the views read from.
  context.subscriptions.push(
    vscode.debug.onDidChangeActiveDebugSession(() => {
      const { host, port } = currentTarget()
      hub.retarget(host, port)
    }),
  )

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
    if (await client.ping()) {
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

  const memoryPanel = new MemoryPanel(context.extensionUri, debugAwareClient, hub)
  const disasmPanel = new DisasmPanel(context.extensionUri, debugAwareClient, hub)
  const registersPanel = new RegistersPanel(
    context.extensionUri,
    debugAwareClient,
    hub,
    (address) => memoryPanel.goto(address),
  )

  // The peripheral-chip views all share HardwarePanel; each is parameterised by
  // its view id, the bundle `data-view` to mount, and the pure scope formatter.
  const scopePayload = (scopes: ReturnType<typeof buildGateArrayScopes>) =>
    ({ kind: "scopes", scopes }) as const
  const emptyScopes = { kind: "scopes", scopes: null } as const
  const hardwarePanels = [
    new HardwarePanel(context.extensionUri, debugAwareClient, hub, {
      viewId: "amspirit.z80.gateArray",
      dataView: "gate-array",
      needsMemmap: true,
      build: (s, m) => scopePayload(buildGateArrayScopes(s.ga, m)),
      emptyPayload: emptyScopes,
    }),
    new HardwarePanel(context.extensionUri, debugAwareClient, hub, {
      viewId: "amspirit.z80.psg",
      dataView: "psg",
      build: (s) => ({ kind: "psg", psg: buildPsgViewModel(s.psg) }),
      emptyPayload: { kind: "psg", psg: null },
    }),
    new HardwarePanel(context.extensionUri, debugAwareClient, hub, {
      viewId: "amspirit.z80.fdc",
      dataView: "fdc",
      build: (s) => scopePayload(buildFdcScopes(s.fdc)),
      emptyPayload: emptyScopes,
    }),
    new HardwarePanel(context.extensionUri, debugAwareClient, hub, {
      viewId: "amspirit.z80.crtc",
      dataView: "crtc",
      build: (s) => scopePayload(buildCrtcScopes(s.emu, s.ga)),
      emptyPayload: emptyScopes,
    }),
  ]

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(RegistersPanel.viewId, registersPanel, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.window.registerWebviewViewProvider(MemoryPanel.viewId, memoryPanel, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.window.registerWebviewViewProvider(DisasmPanel.viewId, disasmPanel, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    ...hardwarePanels.map((panel) =>
      vscode.window.registerWebviewViewProvider(panel.config.viewId, panel, {
        webviewOptions: { retainContextWhenHidden: true },
      }),
    ),
    vscode.commands.registerCommand("amspirit.z80.launch", cmdLaunch),
    vscode.commands.registerCommand("amspirit.z80.connect", cmdConnect),
    // The views live in the AMSpiriT Z80 activity-bar container; the commands
    // just reveal (focus) them so they stay discoverable from the palette.
    vscode.commands.registerCommand("amspirit.z80.memoryView", () =>
      vscode.commands.executeCommand(`${MemoryPanel.viewId}.focus`),
    ),
    vscode.commands.registerCommand("amspirit.z80.disassemblyView", () =>
      vscode.commands.executeCommand(`${DisasmPanel.viewId}.focus`),
    ),
  )

  const debugFactory: vscode.DebugAdapterDescriptorFactory = {
    createDebugAdapterDescriptor() {
      return new vscode.DebugAdapterInlineImplementation(
        // A single-instruction step re-freezes the emulator without an SSE event,
        // so the session pulses the hub on every stop (step/breakpoint/pause) —
        // the authoritative moment the views' /api/z80 etc. are final.
        new Z80DebugSession(
          (host, port) => new EmulatorClient({ host, port }),
          undefined,
          undefined,
          undefined,
          undefined,
          () => hub.pulseStop(),
        ),
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
      } else {
        settings = loadSettings()
      }
    }),
  )

  void client.ping().then((ok) => {
    if (!ok && settings.autoLaunch) void cmdLaunch()
  })
}

export function deactivate(): void {
  // Subscriptions registered via context.subscriptions handle teardown.
}
