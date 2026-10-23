---
"amspirit-z80": patch
"amspirit-basic": patch
---

Follow the amspirit-lite 1.17 HTTP API. The extensions now need lite 1.17 or
later.

- **BASIC injection and RAM writes work again.** lite 1.17 acknowledges a
  command with `{"cmd_seq":N}` and no `ok` field, and the extensions read that
  as a refusal. A refusal is now the emulator's `400`.
- The FDC view shows the active drive the emulator names (`"A"`/`"B"`).
- `EmulatorConfig.cpcModel` and `EmuState.cpcModel` are the model names lite
  sends (`"6128"`, `"6128+"`…), and `setConfig` sends a name too.
