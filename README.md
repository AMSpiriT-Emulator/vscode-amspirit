# AMSpiriT Lite — VS Code Extension

Edit Amstrad CPC BASIC in VS Code and send it directly to the [AMSpiriT Lite](https://github.com/AMSpiriT/amspirit-lite) emulator with one keystroke.

## Features

- Syntax highlighting for Amstrad CPC BASIC (`.bas` files)
- Inject the current file into a running emulator
- Hard-reset the emulator then inject after boot
- Auto-execute (`RUN`) after injection
- Launch the emulator from VS Code
- Status bar indicator showing the connection state

## Requirements

- AMSpiriT Lite built with `--web-server` support (SDL2 frontend: `amspirit-lite-sdl`)
- VS Code 1.80+ or VSCodium 1.80+

## Installation

### From VSIX (recommended)

Download the latest `amspirit-lite-x.y.z.vsix` from the [releases page](../../releases), then:

```
Ctrl+Shift+P → Extensions: Install from VSIX → select the .vsix file
```

### Build from source

Requires Node.js 18+ and npm.

```bash
git clone <this-repo>
cd amspirit-lite-vscode
npm install
npm run compile
npm run package          # produces amspirit-lite-x.y.z.vsix
```

Then install the generated `.vsix` as above.

## Configuration

Open **Settings** (`Ctrl+,`) and search for `amspirit`.

| Setting | Default | Description |
|---|---|---|
| `amspirit.emulatorPath` | _(empty)_ | Full path to `amspirit-lite-sdl`. If empty, a file picker appears on first launch. |
| `amspirit.webPort` | `8765` | Port of the emulator's web debug server (`--web-port`). |
| `amspirit.autoLaunch` | `false` | Launch the emulator automatically when VS Code starts and no emulator is reachable. |
| `amspirit.emulatorArgs` | `[]` | Extra arguments appended to the emulator command line (e.g. `["--cpc", "6128"]`). |

## Usage

### Starting the emulator

The emulator must be started with the `--web-server` flag to expose the HTTP API used by this extension:

```bash
amspirit-lite-sdl --web-server
# custom port:
amspirit-lite-sdl --web-server --web-port 9000
```

Or use the **AMSpiriT: Launch Emulator** command from VS Code — it starts the emulator with `--web-server` automatically.

### Sending BASIC to the emulator

Open a `.bas` file. Three actions are available via the editor title bar buttons, the Command Palette (`Ctrl+Shift+P`), or keyboard shortcuts:

| Action | Shortcut | Title bar | Description |
|---|---|---|---|
| **Inject & Run** | **F6** | ▶ | Tokenize and inject the current file, then type `RUN`. |
| **Reset & Run** | **Shift+F6** | ↺ | Hard-reset the CPC, inject after boot (~3 s), then `RUN`. |
| **Inject only** | **Ctrl+F6** | → | Inject without executing (useful for `LIST` or stepping). |

> **Tip:** Use **Reset & Run** (`Shift+F6`) for a clean start — it guarantees the CPC BASIC ROM has fully initialised before the program is loaded.

Keyboard shortcuts are active only when a `.bas` file is the active editor, so they do not interfere with other file types.

### Status bar

The **AMSpiriT** item in the bottom status bar shows the connection state:

- Normal background → emulator reachable on the configured port
- Orange background → not connected

Click it to attempt reconnection or launch the emulator.

## Commands (Command Palette)

| Command | Description |
|---|---|
| `AMSpiriT: Launch Emulator` | Start `amspirit-lite-sdl --web-server` as a child process |
| `AMSpiriT: Connect to Emulator` | Ping the emulator and refresh the status bar |
| `AMSpiriT: Inject & Run BASIC` | Inject current file and execute it |
| `AMSpiriT: Reset & Run BASIC` | Hard-reset then inject and execute |
| `AMSpiriT: Inject BASIC (no run)` | Inject without executing |
| `AMSpiriT: Reset & Inject BASIC (no run)` | Hard-reset then inject without executing |

## Development

```bash
npm install
npm run watch       # recompile on save
```

Then open this folder in VS Code and press **F5** to launch an Extension Development Host window with the extension loaded. After editing a source file, press `Ctrl+Shift+P → Developer: Reload Window` in the host window to pick up the changes.

## License

MIT
