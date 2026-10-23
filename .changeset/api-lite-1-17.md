---
"amspirit-z80": patch
"amspirit-basic": patch
---

Follow the amspirit-lite 1.17 HTTP API. The extensions now need lite 1.17 or
later.

- **BASIC injection and RAM writes work again.** lite 1.17 acknowledges a
  command with `{"cmd_seq":N}` and no `ok` field, and the extensions read that
  as a refusal. A refusal is now the emulator's `400` (or an explicit
  `ok:false` from an older build).
- **Step Back works again.** It calls `POST /api/rewind/back` (was
  `/api/tl_back`) and reads the rewind state from `emu.rw_*` (was `emu.tl_*`).
- **Step Back asks for `--enable-rewind`.** lite 1.17 removed
  `--enable-timelapse` and refuses to start with it: replace it in
  `emulatorArgs`.
- The FDC view shows the active drive the emulator names (`"A"`/`"B"`).
