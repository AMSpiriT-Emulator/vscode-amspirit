# AMSpiriT Z80

A Z80 assembler debugger for the [AMSpiriT Lite](https://github.com/AMSpiriT/amspirit-lite)
Amstrad CPC emulator. It speaks the Debug Adapter Protocol and drives the
emulator's HTTP web-debug server, giving you source-level debugging of Z80
assembly straight from VS Code.

## Features

- **Source-level breakpoints** — set them in the margin of your `.asm`; they are
  resolved to PC addresses through the assembler's symbol map.
- **Execution control** — continue, pause, step-into, step-over (runs over
  `CALL`/`RST`) and step-out.
- **A dedicated tool suite** — open the **AMSpiriT Z80** view container in the
  Activity Bar to dock three purpose-built panels side by side, rather than
  scattered across VS Code's generic debug UI:
  - **Registers** — the full Z80 state grouped into Registers, Flags, Shadow and
    Interrupts; click a pointer register (BC/DE/HL/IX/IY/SP/PC) to jump the
    Memory view to the address it holds.
  - **Memory** — an octet-only hex+ASCII dump with Go-to, Follow PC, bank
    selector, pointer-register highlight, code-coverage shading, inline byte
    editing and range-select → label-aware disassembly.
  - **Disassembly** — a live, label-aware listing (firmware + symbol-map labels,
    code-vs-data) with Follow PC, paging and range-export to `.asm`.

## Requirements

- An AMSpiriT Lite build that exposes the web-debug server (`--web-server`).
- A symbol map produced by your assembler. Supported:
  - **sjasmplus** — SLD (`sjasmplus --sld=out.sld`), a `.sld` file.
  - **rasm** — the `-map` listing (`rasm src.asm -ob src.bin -map > src.map`), a
    `.map` file.

  Point `mapFile` at it, or drop it next to the program (`.sld`/`.map`) so it is
  auto-detected; the adapter is chosen by file type.

## Getting started

1. Assemble with a symbol map (and a flat binary):
   `sjasmplus --sld=game.sld game.asm` (use `SAVEBIN` to emit `game.bin`).
2. Start the emulator with the web server — or click the **AMSpiriT Z80** status
   bar item to launch it (set `amspirit-z80.emulatorPath` first, or you'll be
   prompted).
3. Add a **launch** configuration to load and run the binary:

   ```json
   {
     "type": "amspirit-z80",
     "request": "launch",
     "name": "Launch Z80 program",
     "program": "${workspaceFolder}/game.asm",
     "mapFile": "${workspaceFolder}/game.sld",
     "binary": "${workspaceFolder}/game.bin",
     "stopOnEntry": true,
     "port": 8765
   }
   ```

   The binary is loaded at the assembler ORG (taken from the symbol map unless
   you set `loadAddress`) and run from `entry` (defaults to the load address).

4. Set a breakpoint in your `.asm` and start debugging. To debug a program that
   is already running in the emulator, use `"request": "attach"` instead.
