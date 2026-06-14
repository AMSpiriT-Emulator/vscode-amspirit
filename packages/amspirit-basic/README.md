# AMSpiriT BASIC

Write Amstrad CPC **Locomotive BASIC** in VS Code and run it on the
[AMSpiriT Lite](https://amspirit.fr) emulator without leaving your editor —
inject the current file, run it, or pull back the program that's already in
the emulator's memory.

## Features

- **Syntax highlighting** for Amstrad CPC BASIC (`.bas`).
- **Inject & Run** the active file into a running emulator (`F6`).
- **Reset & Run** — hard-reset, inject after boot, then `RUN` (`Shift+F6`).
- **Inject only** — no `RUN`, useful for `LIST` (`Ctrl+F6`).
- **Pull BASIC from Emulator** — read the program currently in memory into a
  new editor (the inverse of inject).
- **Launch the emulator** from VS Code and a **status-bar connection
  indicator**.
- **Line-number diagnostics** for statements missing a line number.

## Requirements

The [AMSpiriT Lite](https://amspirit.fr) emulator, started with its web debug
server enabled. The extension talks to the emulator purely over HTTP, so **any
build that exposes the web debug server works** — currently the **SDL**
(`amspirit-lite-sdl`) and **Qt** (`amspirit-lite-qt`) desktop builds:

```bash
amspirit-lite-sdl --web-server --web-port 8765   # or: amspirit-lite-qt --web-server
```

Point the extension at the binary via `amspirit.emulatorPath`, or run
**AMSpiriT: Launch Emulator** and pick it on first use.

## Commands

| Command | Default key | Description |
|---|---|---|
| AMSpiriT: Inject & Run BASIC | `F6` | Tokenise + inject the file, then `RUN` |
| AMSpiriT: Reset & Run BASIC | `Shift+F6` | Hard-reset, inject after boot, then `RUN` |
| AMSpiriT: Inject BASIC (no run) | `Ctrl+F6` | Inject without running |
| AMSpiriT: Reset & Inject BASIC (no run) | — | Hard-reset, inject without running |
| AMSpiriT: Pull BASIC from Emulator | — | Read memory into a new `.bas` editor |
| AMSpiriT: Launch Emulator | — | Start `amspirit-lite-sdl --web-server` |
| AMSpiriT: Connect to Emulator | — | Ping and update the status bar |
| AMSpiriT: Open Documentation | — | Open the online documentation in your browser |
| AMSpiriT: Open Settings | — | Jump to the extension settings |
| AMSpiriT: Get Started | — | Open the Get Started walkthrough |

## Settings

| Setting | Default | Description |
|---|---|---|
| `amspirit.emulatorPath` | _(empty)_ | Absolute path to the `amspirit-lite-sdl` binary |
| `amspirit.webPort` | `8765` | Port of the emulator's web debug server (`--web-port`) |
| `amspirit.autoLaunch` | `false` | Launch the emulator at activation if unreachable |
| `amspirit.emulatorArgs` | `[]` | Extra args appended after `--web-server --web-port <port>` |

## License

[MIT](LICENSE)
