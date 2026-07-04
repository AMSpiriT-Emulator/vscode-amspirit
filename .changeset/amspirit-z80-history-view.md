---
"amspirit-z80": minor
---

Add an **Instruction History** docked view (lite parity, Phase 1.1). A new
`amspirit.z80.history` webview lists the last executed Z80 instructions
newest-first, each decoded from the emulator's `/api/history` fetch window into
`address · bytes · mnemonic` (via the shared disassembler), with the current PC
highlighted. Refreshes off the shared SSE-fed `RefreshScheduler` (snaps to a
stop, throttles per-frame). Pure `history-view-model` + RTL `HistoryList` (TDD).
