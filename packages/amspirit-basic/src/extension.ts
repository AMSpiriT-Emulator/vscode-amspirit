import type * as cp from "node:child_process"
import { EmulatorClient, spawnEmulator } from "@amspirit/shared"
import * as vscode from "vscode"

let statusBar: vscode.StatusBarItem
let client: EmulatorClient
let emulatorProc: cp.ChildProcess | undefined
let pingTimer: ReturnType<typeof setInterval> | undefined
let connected = false
let out: vscode.OutputChannel

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cfg() {
  return vscode.workspace.getConfiguration("amspirit")
}

function buildClient(): EmulatorClient {
  return new EmulatorClient({ port: cfg().get<number>("webPort", 8765) })
}

function setConnected(state: boolean): void {
  connected = state
  if (state) {
    statusBar.text = "$(vm-active) AMSpiriT"
    statusBar.tooltip = `Connected to AMSpiriT on port ${client.port}`
    statusBar.backgroundColor = undefined
    statusBar.color = undefined
  } else {
    statusBar.text = "$(vm) AMSpiriT"
    statusBar.tooltip = "Not connected — click to connect or launch the emulator"
    statusBar.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground")
  }
}

async function ping(): Promise<void> {
  const ok = await client.ping()
  if (ok !== connected) setConnected(ok)
}

function startPing(): void {
  pingTimer = setInterval(ping, 3000)
}

function stopPing(): void {
  if (pingTimer) {
    clearInterval(pingTimer)
    pingTimer = undefined
  }
}

function getSource(): string | undefined {
  const editor = vscode.window.activeTextEditor
  if (!editor) {
    vscode.window.showErrorMessage("AMSpiriT: no active editor.")
    return undefined
  }
  return editor.document.getText()
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function cmdLaunch(): Promise<void> {
  const config = cfg()
  let binaryPath = config.get<string>("emulatorPath", "")

  if (!binaryPath) {
    const picked = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      openLabel: "Select amspirit-lite-sdl binary",
    })
    if (!picked?.[0]) return
    binaryPath = picked[0].fsPath
    await config.update("emulatorPath", binaryPath, vscode.ConfigurationTarget.Global)
  }

  if (emulatorProc && !emulatorProc.killed) {
    vscode.window.showWarningMessage("AMSpiriT: emulator is already running.")
    return
  }

  const port = config.get<number>("webPort", 8765)
  const extra = config.get<string[]>("emulatorArgs", [])
  out.appendLine(`Launching: ${binaryPath} --web-ui --web-port ${port} ${extra.join(" ")}`)

  emulatorProc = spawnEmulator(binaryPath, port, extra)
  emulatorProc.on("exit", (code) => {
    out.appendLine(`Emulator exited (code ${code})`)
    emulatorProc = undefined
    setConnected(false)
  })
  vscode.window.showInformationMessage(`AMSpiriT launched on port ${port}.`)
}

async function cmdConnect(): Promise<void> {
  client = buildClient()
  const ok = await client.ping()
  setConnected(ok)
  if (ok) {
    vscode.window.showInformationMessage(`AMSpiriT: connected on port ${client.port}.`)
  } else {
    const choice = await vscode.window.showWarningMessage(
      `AMSpiriT: cannot reach emulator on port ${client.port}.`,
      "Launch Emulator",
      "Cancel",
    )
    if (choice === "Launch Emulator") await cmdLaunch()
  }
}

async function doInject(resetFirst: boolean, runAfter: boolean): Promise<void> {
  const src = getSource()
  if (src === undefined) return
  if (!connected) {
    vscode.window.showErrorMessage("AMSpiriT: not connected. Launch or connect first.")
    return
  }
  try {
    await client.injectBasic(src, resetFirst, runAfter)
    if (resetFirst) {
      vscode.window.showInformationMessage(
        `AMSpiriT: hard reset — BASIC will inject after boot (~3 s)${runAfter ? ", then RUN" : ""}.`,
      )
    } else {
      vscode.window.showInformationMessage(
        runAfter ? "AMSpiriT: BASIC injected — running…" : "AMSpiriT: BASIC injected — type RUN.",
      )
    }
  } catch (e: unknown) {
    vscode.window.showErrorMessage(`AMSpiriT: inject failed — ${(e as Error).message}`)
  }
}

const cmdInject = () => doInject(false, false)
const cmdInjectAndRun = () => doInject(false, true)
const cmdResetAndInject = () => doInject(true, false)
const cmdResetAndRun = () => doInject(true, true)

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

export function activate(context: vscode.ExtensionContext): void {
  out = vscode.window.createOutputChannel("AMSpiriT")
  context.subscriptions.push(out)

  statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100)
  statusBar.command = "amspirit.connect"
  context.subscriptions.push(statusBar)
  statusBar.show()

  client = buildClient()
  setConnected(false)

  context.subscriptions.push(
    vscode.commands.registerCommand("amspirit.launch", cmdLaunch),
    vscode.commands.registerCommand("amspirit.connect", cmdConnect),
    vscode.commands.registerCommand("amspirit.inject", cmdInject),
    vscode.commands.registerCommand("amspirit.injectAndRun", cmdInjectAndRun),
    vscode.commands.registerCommand("amspirit.resetAndInject", cmdResetAndInject),
    vscode.commands.registerCommand("amspirit.resetAndRun", cmdResetAndRun),
  )

  // Rebuild client if port changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("amspirit.webPort")) {
        client = buildClient()
        ping()
      }
    }),
  )

  // Initial ping + optional auto-launch
  ping().then(() => {
    if (!connected && cfg().get<boolean>("autoLaunch", false)) {
      cmdLaunch()
    }
  })
  startPing()
}

export function deactivate(): void {
  stopPing()
  if (emulatorProc && !emulatorProc.killed) emulatorProc.kill()
}
