---
"amspirit-z80": minor
---

New extension: a Z80 assembler debugger (`amspirit-z80`) for AMSpiriT Lite.
Source-level breakpoints via the sjasmplus SLD symbol map, continue/pause,
step-into/over/out, a Z80 registers view (Registers/Flags/Shadow/Interrupts),
and memory read + disassembly — all over the emulator's HTTP web-debug server.
Supports **attach** (to a running program) and **launch** (load the assembled
binary into RAM and run it, with stop-on-entry). Includes a connection status
bar item that can launch the emulator. Symbol maps come from **sjasmplus** (SLD)
or **rasm** (`-map` listing), selected automatically by file type.
