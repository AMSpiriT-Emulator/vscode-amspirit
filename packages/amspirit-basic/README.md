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
- **Debug your BASIC** — breakpoints in the gutter, step by line or statement,
  run-to-cursor, current-line highlight, and a live **Variables** view (see
  [Debugging](#debugging)).

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

## Debugging

Debug a Locomotive BASIC program running in the emulator with the native VS Code
debugger. The debug type is `amspirit-basic`; there are two ways to start it:

- **Attach** — debug a program already running in the emulator.
- **Launch** — inject the current `.bas`, run it, and break on entry.

In the **Run and Debug** view, *create a launch.json* offers both as snippets,
or use the built-in **Attach to AMSpiriT** default. A typical
`.vscode/launch.json`:

```jsonc
{
  "configurations": [
    { "type": "amspirit-basic", "request": "attach", "name": "Attach to AMSpiriT", "port": 8765 },
    { "type": "amspirit-basic", "request": "launch", "name": "Launch current BASIC", "program": "${file}", "stopOnEntry": true }
  ]
}
```

What you get:

- **Breakpoints** in the `.bas` gutter — set on the line number.
- **Continue / Pause**, **Step Over** (advance one line), **Step Into** (advance
  one statement), and **Run to Cursor**.
- The **current line** is highlighted as execution advances.
- The **Variables** view decodes the live Locomotive BASIC variables — integers,
  reals and strings — straight from CPC RAM.
- **AMSpiriT: Open Debug Panel (BASIC Variables)** opens a richer card that
  mirrors the emulator's own Variables panel: the BASIC memory layout (TXTTOP,
  program size, variable/array zones, free RAM, statement address, version) plus
  a name/type/value table whose cells flash when a value changes. It refreshes
  while the emulator is paused.

| Config attribute | Applies to | Default | Description |
|---|---|---|---|
| `program` | launch | `${file}` | `.bas` file injected before debugging |
| `host` | attach / launch | `127.0.0.1` | Emulator web-debug host |
| `port` | attach / launch | `8765` | Emulator web-debug port (matches `amspirit.webPort`) |
| `stopOnEntry` | attach / launch | `true` (launch) / `false` (attach) | Pause as soon as debugging starts |

> Stepping operates at the BASIC level. The emulator interprets BASIC, so the
> Z80 program counter stays inside the firmware while you step statements — the
> highlighted line and the Variables view are the source of truth for *where*
> the program is, not the Z80 registers.

## Commands

| Command | Default key | Description |
|---|---|---|
| AMSpiriT: Inject & Run BASIC | `F6` | Tokenise + inject the file, then `RUN` |
| AMSpiriT: Reset & Run BASIC | `Shift+F6` | Hard-reset, inject after boot, then `RUN` |
| AMSpiriT: Inject BASIC (no run) | `Ctrl+F6` | Inject without running |
| AMSpiriT: Reset & Inject BASIC (no run) | — | Hard-reset, inject without running |
| AMSpiriT: Pull BASIC from Emulator | — | Read memory into a new `.bas` editor |
| AMSpiriT: Open Debug Panel (BASIC Variables) | — | Live BASIC variables card (memory layout + values) |
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
