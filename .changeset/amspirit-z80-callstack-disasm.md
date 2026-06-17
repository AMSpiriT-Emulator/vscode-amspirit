---
"amspirit-z80": minor
---

Richer Z80 debugging: a multi-frame call stack reconstructed from the stack
(scanning for CALL/RST return addresses, no frame pointers needed), CPC
firmware jumpblock labels (&BB00–&BD37) shown in stack frames, a working VS Code
Disassembly View (anchored on the program counter with real backward decode),
and more robust single-stepping (waits for the PC to settle, and works around
the launch stop-on-entry phantom step).
