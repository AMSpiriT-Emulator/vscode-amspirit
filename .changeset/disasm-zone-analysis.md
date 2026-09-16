---
"@amspirit/shared": minor
"amspirit-z80": minor
---

Disassembly View: static code-zone analysis. "Analyze from PC" traces the code
the Z80 can reach from the program counter — both paths of a conditional
branch, CALL and RST targets — and marks those instructions as code. The
listing unions them with the runtime coverage of `/api/codemap`, and renders
the rest as `DB` data. "Reset zones" drops the analysis and clears the
emulator's coverage (new `EmulatorClient.clearCodemap()`). The trace reads the
selected view, so it follows the bank mapping the listing shows.
