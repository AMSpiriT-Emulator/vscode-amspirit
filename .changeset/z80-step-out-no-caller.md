---
"amspirit-z80": patch
---

Step Out is refused, with a message, when the return address on the stack is
not an instruction of the debugged program (its top level, where the stack
holds the firmware's return address). It used to run the whole program to its
final `RET` and stop inside the firmware. Without a symbol map the plain run-to
is kept.
