---
"amspirit-z80": minor
---

Reworked the Z80 debugging UI into a dedicated **AMSpiriT Z80** tool suite docked
in the Activity Bar, instead of relying on VS Code's generic debug surfaces. The
Memory and Disassembly panels are now webview *views* docked together with a new
**Registers** view: values shown as bare hex, flags as a lit/dim chip strip, a
live **Stack** peek at SP (each slot clickable to jump the Memory view to the
address it holds), the refresh register R grouped with the registers rather than
the interrupt state, and pointer registers clickable to jump the Memory view to
their address. Removed the
redundant built-in DAP Disassembly view and the generic Variables tree (neither
added value for assembler debugging) — the debug session now exposes execution
control only (breakpoints, stepping, call stack, current line).
