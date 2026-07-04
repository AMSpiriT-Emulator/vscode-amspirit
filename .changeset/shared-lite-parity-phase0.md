---
"@amspirit/shared": minor
---

Add the `EmulatorClient` wrappers that unblock the lite debug-webview parity
work: `getHistory()` (`/api/history`, last 20 executed instructions),
`execAt()` (`/api/exec`, PC redirect), the CSL/Lua scripting trio
`runScript()`/`getScriptState()`/`abortScript()` (`/api/script`), `setConfig()`
(model/CRTC/ROM-language/soft+hard reset via `/api/config`), and the input
helpers `keytype()`/`keypress()`. All TDD'd against the `FakeEmulator`.
