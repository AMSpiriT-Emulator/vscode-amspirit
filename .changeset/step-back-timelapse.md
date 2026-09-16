---
"@amspirit/shared": minor
"amspirit-z80": minor
"amspirit-basic": minor
---

**Step Back** in both debuggers (lite parity Phase 3). With the emulator
started with `--enable-timelapse` (add it to `emulatorArgs`), VS Code's Step
Back button undoes the last Z80 or BASIC step by restoring the snapshot the
emulator saved before it (`POST /api/tl_back`). The request is refused with a
message when the timelapse is off, when its newest snapshots are of another
kind (a frame after Continue, a BASIC step in the Z80 debugger), or when
nothing is left to undo. Reverse Continue is declined explicitly (no emulator
endpoint yet).

`EmulatorClient` gains `getTimelapse()` (`emu.tl_*` via `/api/ping`) and
`tlBack()`; `EmuState` carries `timelapse`; the pure `checkStepBack` /
`stepBackApplied` helpers and the `TimelapseState` type are exported.
