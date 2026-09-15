---
"@amspirit/shared": minor
"amspirit-z80": patch
"amspirit-basic": patch
---

Debugger review fixes:

- **Z80 Memory view: edits follow the live mapping.** An inline edit in the
  CPU view now resolves the physical 16 KB bank the Z80 sees at that address
  (`/api/memmap`) and writes there, so a byte paged in from extended RAM is the
  byte that changes. An edit under a mapped ROM is refused with a message.
  Extended-bank views are editable too. `writeRam()` gains a `bank` option.
- **Z80: breakpoints of one file no longer erase the others.** Addresses are
  kept per source file and their union is posted to the emulator.
- **Z80: a manual pause disarms a pending step-over / step-out breakpoint**,
  which used to fire later as an unexplained stop.
- **Z80: a missing or unreadable binary fails the launch** with the file
  path, instead of a silent success that debugged whatever already ran.
- **BASIC: breakpoints set during launch resolve reliably.** The launch waits
  until the listing decodes the injected program (not an empty or previous
  one) before answering breakpoint requests, with or without `stopOnEntry`.
- **BASIC: the Variables panel follows the debug session's emulator** (its
  `host`/`port`), not only `amspirit.webPort`.
