---
"amspirit-z80": patch
---

Fix the first step after a launch stop-on-entry occasionally running away (PC
jumping many bytes, e.g. `&8000 → &8007`, or escaping into firmware). The launch
`exec` leaves a dirty Z80 prefetch latch that shifts the first instruction
boundaries; the previous workaround resumed to a temporary breakpoint at the
decoded next address, which the shifted boundary could skip — letting execution
run free. The first step now advances with bounded single-instruction steps
until the PC clears the entry instruction, so it can never run away.
