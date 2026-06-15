---
"amspirit-basic": patch
---

Fix: breakpoints set before starting a debug session (Launch) are now honored.
The debug adapter previously ran the program immediately on launch, racing the
breakpoint setup, so execution sailed past any pre-set breakpoint. Launch now
follows the standard DAP handshake — tokenize the program, apply all breakpoints,
then run — so the first run stops at your breakpoints.
