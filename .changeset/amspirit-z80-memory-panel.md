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
(`/api/config`). Addresses and input are bare hex (no `0x`/`&` prefix).
