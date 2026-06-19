---
"@amspirit/shared": minor
---

`EmulatorClient.getCodemap()` — read the Z80 execution bitmap from
`GET /api/codemap` (8192 bytes as hex; bit `addr` set once an instruction has
started at `addr`). Returns `""` when the emulator omits it. Decode window
offsets with the Memory View's `executedOffsets` helper.
