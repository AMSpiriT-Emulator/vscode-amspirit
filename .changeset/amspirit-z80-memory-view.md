---
"amspirit-z80": minor
---

Memory view: the pointer registers (BC, DE, HL, IX, IY, SP, PC) now carry a
`memoryReference`, so "View Binary Data" on them opens VS Code's native hex
inspector at the address they hold (the `readMemory` support was already wired,
it just lacked an entry point in the UI).
