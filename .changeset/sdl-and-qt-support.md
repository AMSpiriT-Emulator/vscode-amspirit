---
"amspirit-basic": patch
---

Clarify that the extension works with any AMSpiriT Lite build that exposes the
web debug server — the SDL (`amspirit-lite-sdl`) and Qt (`amspirit-lite-qt`)
desktop builds today. The transport is plain HTTP, so connect/inject/pull/launch
are build-agnostic. Generalised the settings description, the binary picker
label, and the walkthrough/README wording (no behaviour change).
