---
"amspirit-basic": patch
---

The BASIC launch now waits until the listing **differs from the one read before
injecting** (and matches the source's line numbers) before resolving
breakpoints. An edit that keeps every line number, such as a line that grew,
used to be accepted from the previous program's listing, so a breakpoint could
be verified at its old statement address.
