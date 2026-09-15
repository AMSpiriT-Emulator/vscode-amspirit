---
"@amspirit/shared": minor
"amspirit-z80": minor
"amspirit-basic": minor
---

Catch up with the amspirit-lite 1.14/1.15 HTTP API:

- **Default web-debug port is now `6128`** (was `8765`) — `amspirit.webPort`,
  `amspirit-z80.webPort`, the `port` launch attribute, and the client defaults.
  Set the port explicitly if you run an older emulator.
- **`/api/ram` `bank` counts 16 KB banks** (0–3 = central 64 KB, 4+ =
  extension). The Memory and Disassembly bank selectors now address each
  extended bank64 by its first 16 KB bank (`Bank 1 (B04-B07)`, …) and derive the
  bank count from the new `ram_kb` total (`EmulatorConfig.ramKb`).
- **Mutating calls surface the emulator's error.** The emulator answers `400
  {"error":…,"field":…}` for a request it cannot apply; `POST`/`DELETE` wrappers
  now reject with that message (or `HTTP <status>`) instead of resolving
  silently.
- `writeRam()` / `execAt()` resolve with the apply `seq`, and `EmuState` gains
  `ramApplySeq` (`emu.ram_apply_seq`) so a caller can wait for a queued write
  before reading back. `EmuState.frame` is renamed `frames` (`emu.frames`).
