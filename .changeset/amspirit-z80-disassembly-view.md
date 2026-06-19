---
"amspirit-z80": minor
---

Z80 Disassembly View: a dedicated React webview panel (command **AMSpiriT Z80:
Open Disassembly View**) giving the live instruction listing the same care as
the Memory View, rather than VS Code's built-in DAP disassembly. It polls the
emulator while reachable and renders a label-aware listing — branch/call
operands resolve to **labels** (the firmware jumpblock and the active session's
symbol map), in-window targets with no symbol get an auto-generated `Lxxxx:`
definition line, and remaining hex operands are shown the Amstrad way with a
`#` prefix. A **Follow PC** checkbox keeps the window centred on the program
counter as you step, the current instruction is highlighted with a `▶` marker,
and instructions the Z80 has **executed** are shaded as code (from
`/api/codemap`). With coverage known, bytes the CPU never reached are rendered
as a **`DB` data directive** (`DB #3C`) instead of a decoded mnemonic — the
classic code-vs-data distinction — while leaving the imminent PC as code. The listing **scrolls** by
whole instructions with the mouse wheel and the keyboard (arrows step a row,
PageUp/PageDown a screen, Home jumps to `0000`), a **"Go to"** field accepts
hex/`0x`/`&`-prefixed addresses, and a **view selector** switches between the
CPU-visible mapping, the raw main RAM and each extended bank (machine-driven
from `/api/config`). Select a row range (click + shift-click) and **Export**
disassembles the whole selection to a new `.asm` listing (the visible window
when nothing is selected). The webview bundle now hosts both panels, chosen by
the HTML shell's `data-view`.
