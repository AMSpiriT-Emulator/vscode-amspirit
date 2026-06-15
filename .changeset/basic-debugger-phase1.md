---
"amspirit-basic": minor
---

Add a BASIC source debugger (Debug Adapter) for AMSpiriT. Set breakpoints in the
`.bas` gutter, continue/pause, step by statement (Step Into) or by line (Step
Over), and run to cursor — execution control maps to the emulator's native BASIC
debug endpoints (`/api/basic_listing`, `/api/basic_bp`, `/api/basic_step`,
`/api/config`) with the current line surfaced in the editor. Start it via the
`amspirit-basic` debug type (Attach to a running emulator, or Launch to inject
the current file first). The Variables view decodes live Locomotive BASIC
variables (integers, reals, strings) straight from CPC RAM. A React webview
("AMSpiriT: Open Debug Panel") shows the live Z80 registers, flags and interrupt
state. A disassembly view comes next.
