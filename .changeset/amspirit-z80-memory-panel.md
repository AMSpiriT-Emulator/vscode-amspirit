---
"amspirit-z80": minor
---

Z80 Memory View: a dedicated React webview panel (command **AMSpiriT Z80: Open
Memory View**) showing a hex + ASCII dump tailored to the 8-bit machine — octets
only, no multi-byte/float widgets like VS Code's native hex inspector. It polls
the emulator while paused, refreshes live, and has a "Go to" field accepting
hex/`0x`/`&`-prefixed addresses. Bytes targeted by a pointer register
(BC/DE/HL/IX/IY/SP/PC) are highlighted, with the register name(s) in a tooltip,
and bytes that change between paused ticks flash briefly. A **Follow PC**
checkbox keeps the window centred on the program counter as you step, and a
**view selector** switches between the CPU-visible mapping, the raw main RAM and
each extended bank — the bank count is derived from the machine's expansion RAM
(`/api/config`). Addresses and input are bare hex (no `0x`/`&` prefix). Select a
byte range (click + shift-click) and **Disassemble** it to a new `.asm` listing:
hex is rendered with a `#` prefix, branch/call operands are shown as **labels**
(the firmware jumpblock and the active session's symbol map), and in-range
targets with no symbol get an auto-generated `Lxxxx:` label so the output
assembles back.
The window **scrolls** the whole 64 KB space with the mouse wheel and the
keyboard (arrows step a row, PageUp/PageDown a screen, Home/End jump to the
ends). Bytes the Z80 has **executed** are shaded as code (from `/api/codemap`),
and on the central-RAM views a byte can be **edited in place** — double-click,
type a new hex value, Enter to write it back to the emulator (read-only on
extended banks).
