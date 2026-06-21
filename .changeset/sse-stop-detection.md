---
"amspirit-z80": minor
"amspirit-basic": minor
---

Use the emulator's new **Server-Sent Events** stream (`GET /api/events`) to
detect execution stops, instead of polling.

After a continue / run-to / breakpoint, the debugger now learns the moment the
emulator stops from a pushed `pause` / `z80_bp` / `basic_bp` event — breakpoint
hits surface immediately rather than up to a poll interval later, and there's no
steady stream of `/api/ping` requests while the program runs. Paused-state
polling is kept as an automatic fallback, so debugging still works against an
emulator without the events endpoint or if the stream drops (the client
reconnects on its own).
