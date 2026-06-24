---
"amspirit-z80": minor
"amspirit-basic": minor
---

Drive the webview views and the status bar from the emulator's SSE stream
instead of polling.

All views in a window now share a single `/api/events` connection (the emulator
caps SSE clients). A breakpoint, pause or step **snaps the views to the new
state immediately** rather than on the next poll tick, and the peripheral-chip
and register views refresh live (throttled) from per-frame snapshots while the
program runs. The status bar's connected/disconnected indicator now reflects the
stream's liveness, replacing the periodic `/api/ping`. A safety poll always runs
underneath as a floor (slow while the stream is connected, fast when it is not),
so a view can never freeze on stale state — including against an emulator build
that doesn't emit per-frame snapshots while paused, or one without `/api/events`
at all.

A single-instruction step re-freezes the emulator without emitting an SSE event,
so the debug session also pulses a refresh on its `stopped` event — the
authoritative moment register/memory state is final — which fixes stale register
values shown while stepping.
