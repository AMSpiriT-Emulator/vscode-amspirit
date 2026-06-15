---
"amspirit-basic": minor
---

Add a BASIC source debugger (Debug Adapter) for AMSpiriT. Set breakpoints in the
`.bas` gutter, continue/pause, step by statement (Step Into) or by line (Step
Over), and run to cursor — execution control maps to the emulator's native BASIC
debug endpoints (`/api/basic_listing`, `/api/basic_bp`, `/api/basic_step`,
`/api/config`) with the current line surfaced in the editor. Start it via the
`amspirit-basic` debug type (Attach to a running emulator, or Launch to inject
the current file first). Z80 register / disassembly / variable views come next.
