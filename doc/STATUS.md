# STATUS — resume point

> Canonical resume point for multi-session work in this repo. Read this first,
> then the latest report in `doc/sessions/`. Close every step with the
> `/session-report` skill so this file and the session log stay authoritative.

## Where we are

- **Branch:** `main` — the **`amspirit-z80` extension** (Z80 assembler DAP
  debugger) is **merged** via **PR #5** (merge commit `65ac1d5`). Full gate
  green, **live-validated on a real emulator** (stepping + current line confirmed
  for both sjasmplus and rasm). Two changesets pending release (`amspirit-z80:
  minor` × 2). See `doc/sessions/2026-06-16-amspirit-z80-phase1.md` and
  `doc/amspirit-z80-plan.md`.
- **What works:** `attach` to a running program, and `launch` (load the `.bin`
  into RAM via `/api/ram` + run, stop-on-entry); source-level breakpoints,
  current-line highlight, step in/over/out (temp breakpoints); Z80 registers view
  (Registers/Flags/Shadow/Interrupts); `readMemory` + `disassemble`; a status-bar
  widget that can launch the emulator (own `amspirit-z80.*` settings namespace).
  Symbol maps come from **sjasmplus SLD** (`.sld`) or **rasm `-map`** (`.map`,
  ANSI-stripped), via a `SymbolMapParser` adapter chosen by file type.
- **Tooling installed locally** (for the sandbox assemble tasks): **sjasmplus
  v1.23.1** and **rasm v3.0.8** (both on PATH). Emulator: build amspirit-lite
  `feat/z80-breakpoints` and run from `amspirit-lite/src` (ROMs are CWD-relative).
- **Latest (2026-06-18):** **dedicated Z80 Memory View** shipped — the first
  React webview in `amspirit-z80`. A hex+ASCII dump tailored to the 8-bit machine
  (octets only, none of the native inspector's multi-byte/float widgets), opened
  via command **AMSpiriT Z80: Open Memory View**. Pure `memory-view/memory-model`
  (`buildMemoryRows`/`parseAddress`, TDD) + RTL `memory-grid.tsx`; thin
  `webview/memory-panel.ts` polls `readRam` while paused, "Go to" field accepts
  hex/`0x`/`&`. Reuses the `amspirit-basic` Vite+CSP webview pattern (added Vite
  to this package). Full gate green; changeset `amspirit-z80-memory-panel.md`
  (`minor`). **Uncommitted, on `main`.** See
  `doc/sessions/2026-06-18-amspirit-z80-memory-panel.md`.
- **Prior (2026-06-17):** memory-view quick win — pointer regs (BC/DE/HL/IX/IY/SP/PC)
  expose a `memoryReference` in `registers-view.ts` so "View Binary Data" opens
  the native hex inspector at the held address. TDD; changeset
  `amspirit-z80-memory-view.md` (`minor`). **Also uncommitted, on `main`.** See
  `doc/sessions/2026-06-17-amspirit-z80-memory-view.md`. (Prior 2026-06-17 slice —
  call-stack + firmware labels + Disassembly View + step robustness — is **merged
  in PR #5**; see `doc/sessions/2026-06-17-amspirit-z80-callstack-disasm-step.md`.)
- **Next step:** commit + branch the working tree (**2 pending changesets**: the
  two memory ones above), live-validate the Memory View on a real
  emulator, then continue parity follow-ups: pointer-register highlight + diff-flash
  + label-aware "Go to" in the new panel, then code coverage via `/api/codemap`,
  SNA/DSK load via `/api/script`, conditional/hit-count breakpoints + logpoints,
  then writeMemory / reverse-debug / watchpoints (the last needs an emulator
  endpoint). rasm trailing-`ret` quirk still open.
- **Known emulator root cause (worked around in-extension, not fixed):** on
  `launch`, `POST /api/ram {exec}` does `Core_z80_Write_Register(PC, entry)` +
  `set_paused(false)` while the core is mid-instruction (emulator was running),
  leaving a dirty M-cycle latch. The first raw `/api/step` then completes that
  stale partial → PC lands one byte in (e.g. `&8000→&8001→&8004`). Attach is
  clean because stop-on-entry uses `setPaused(true)` (boundary-aligned). The
  amspirit-z80 extension works around it (first launch-entry step = run-to-next-
  boundary). Proper fix would be in amspirit-lite's `exec` path (align to an
  instruction boundary before/after the PC override). **Decided: keep the
  workaround, no emulator change.**
- **Prior effort (done, merged):** BASIC debugger in `amspirit-basic` — shipped
  via **PR #3 (merged**, merge commit `fcf5a91`).
- **BASIC debugger context:** `amspirit-basic` extension —
  bringing the features of the amspirit-lite web debugger (breakpoints, step,
  continue/pause, run-to, current-line highlight, variables) into VS Code.
- **Approach:** Hybrid **DAP + Webview**. Phase 1 = DAP execution control
  (breakpoints, continue/pause, step line & statement, run-to-cursor, current
  line) — **no emulator changes needed**. Phase 2 = Webview (Z80 registers,
  disassembly) + Locomotive BASIC variable inspection.
- **Done & validated** (real emulator, dev host): Phases 1, 2a, 2b — breakpoints,
  current-line highlight, variables (`A`), step, Attach **and** Launch with real
  stop-on-entry all confirmed working. The webview now shows **only a BASIC
  Variables card** (amspirit-lite style); the Z80 registers + disassembly views
  were **removed** from the extension (not needed for a BASIC extension), and the
  Z80 disassembler lives in `@amspirit/shared` for reuse. The Variables card is
  unit/RTL-green but **not yet validated on a real emulator**. Latest report:
  `doc/sessions/2026-06-15-debugger-phase2c-disassembly.md`.
- **Why this shape:** the amspirit-lite HTTP API exposes native BASIC debug
  endpoints (`/api/basic_state`, `/api/basic_listing`, `/api/basic_step`,
  `/api/basic_bp`, `/api/basic_runto`, `/api/config`); the emulator pauses
  *itself* on a hit (`freeze=true`) so the adapter runs a persistent stop monitor.
  `doc/debugger-plan.md` predates this API and is stale.
- **Latest fix (branch `fix/debugger-prerun-breakpoints`):** breakpoints set
  *before* launch were ignored — `launchRequest` ran the program (`run=true`)
  immediately, racing `setBreakPointsRequest`. Now gated on the DAP handshake
  (tokenize → set breakpoints → `configurationDone` → run) via two one-shot
  gates; first unit test for `BasicDebugSession` added. **Validated on a real
  emulator.** See `doc/sessions/2026-06-15-debugger-prerun-breakpoints.md`.
- **Next step (open follow-ups):** (1) validate the BASIC Variables card against
  a real emulator (only unit/RTL-green so far); (2) optionally wire the card
  refresh to DAP `stopped` events instead of the paused-gated 500 ms poll.

## Roadmap

| Item | Status | Notes |
|---|---|---|
| Monorepo pnpm + Biome + TS strict | ✅ | |
| `@amspirit/shared` (`EmulatorClient`, `spawnEmulator`) + tests | ✅ | |
| `amspirit-basic` TDD (inject/pull/ping/launch/diagnostics) | ✅ | |
| esbuild bundling + Changesets release pipeline | ✅ | |
| Debug HTTP methods on `EmulatorClient` (+ tests) | ✅ | basic_state/listing/step/bp/runto/config/pingState |
| Pure debug modules (BreakpointMapper / StopPoller / dapHandlers) | ✅ | line↔addr mapping, paused polling, DAP responses |
| `BasicDebugSession` (DAP) + manifest contributes | ✅ | breakpoints + debuggers + activation (inline adapter) |
| Phase 2a: Locomotive BASIC variable inspection (DAP Variables) | ✅ | pure `basic-var-parser` + `readRam`; strings resolved |
| Phase 2b: React/TSX webview (Vite + CSP nonce) | ✅ | webview scaffold kept; Z80 registers view **removed** (see below) |
| Stop-detection / variables / Launch fixes | ✅ | persistent monitor; name A≠AA; Launch injects+runs w/ stop-on-entry |
| End-to-end manual validation vs real emulator | ✅ | breakpoints, step, variables, Launch stop-on-entry confirmed in dev host |
| Z80 disassembler → `@amspirit/shared` | ✅ | pure, TDD (main + CB/ED/DD-FD/DDCB); reusable lib API (`disassemble`/`decodeInstruction`). Not used by the BASIC extension UI |
| `readRam` CPU-visible read (`view=cpu`) | ✅ | reads memory as the Z80 sees it (ROM mapped); kept in shared API |
| BASIC Variables card (amspirit-lite style) | ✅ | **the** webview content now: `basic-vars-view` (pure, TDD) + `basic-variables.tsx` (RTL, value-flash); panel reads `getBasicState`+`parseBasicVars` each tick; memory-layout header + name/type/value table |
| Z80 registers + disassembly webview views | ❌ removed | not needed for a BASIC extension; modules/tests deleted from `amspirit-basic`. Disassembler stays in shared for reuse |
| Pre-run breakpoints honored on Launch | ✅ | DAP handshake gated (tokenize→setBreakpoints→configurationDone→run); first `BasicDebugSession` unit test. Real-emulator validated |
| Wire webview to DAP `stopped` events (not just 500 ms poll) | ⬜ | refresh variables card on stop instead of bare 500 ms poll |
| Push branch + open PR | ✅ | PR #3 **merged** to `main` (`fcf5a91`) |
| **`amspirit-z80`** package — Z80 assembler DAP debugger | ✅ | TDD: shared `setZ80Breakpoints`/`step`/`writeRam` + shadow regs; `StopPoller`/`PingService`/`EmulatorLauncher`/settings moved to shared; pure modules `registers-view`/`step-targets`/symbol-map adapters; `Z80DebugSession` (attach + launch) + extension + status bar. Committed `616b93f`/`13bc03b`, gate green |
| `amspirit-z80` attach + launch (load `.bin` via `/api/ram`, stop-on-entry) | ✅ | DAP handshake gates RUN until breakpoints set; one-shot entry bp; persistent stop monitor (emulator self-freezes on a Z80 PC bp) |
| Symbol-map adapters: sjasmplus SLD + rasm `-map` | ✅ | `TraceSymbolMap` shared; `SjasmplusSldParser` (8-field SLD) + `RasmMapParser` (ANSI-stripped); selected by extension/sniff; TDD vs real output |
| `amspirit-z80` status-bar widget + launch emulator | ✅ | `PingService`-driven indicator; click launches/connects; `amspirit-z80.*` settings namespace (no clash with `amspirit-basic`) |
| Live-validate `amspirit-z80` vs real emulator | ✅ | breakpoint stop at PC, step in/over/out + current-line confirmed for sjasmplus **and** rasm |
| Call-stack reconstruction + firmware jumpblock labels | ✅ | pure `call-stack` (CALL/RST scan) + `firmware-labels` (&BB00–&BD37); multi-frame `stackTrace`, `TXT OUTPUT (0xBBxx)` labels. TDD |
| VS Code Disassembly View working | ✅ | `instructionPointerReference` anchor (was blank without it) + pure `disasm-window` (real backward decode, PC centred); reuses shared `disassemble()`. TDD |
| Step robustness | ✅ | `step-landing.stepSettled` (PC moves + stable) replaces fixed settle; launch stop-on-entry phantom step worked around (first step = run-to-boundary). Live-validated |
| `stackTrace` resilience | ✅ | current-line frame 0 always emitted, even if the 64 KB call-stack snapshot read fails |
| Push `amspirit-z80` + open PR to `main` | ✅ | **PR #5 merged** (`65ac1d5`); 2 changesets `amspirit-z80: minor` pending release |
| rasm trailing-`ret` line-attribution quirk | ⬜ | rasm maps a `ret` before a label/EOF to the previous line; parsed as-is, refine later |
| Memory view (expose `memoryReference` on pointer regs) | ✅ | `registers-view.ts` sets `memoryReference` on BC/DE/HL/IX/IY/SP/PC (reusing the hex-word value); `variablesRequest` forwards it → "View Binary Data" opens the native hex inspector. TDD; changeset `minor`. Not yet live-validated |
| Dedicated Memory View React webview panel | ✅ | first React webview in `amspirit-z80` (Vite + CSP, mirrors `amspirit-basic`); octets-only hex+ASCII grid, "Go to" (hex/`0x`/`&`); pure `memory-model` (TDD) + RTL `memory-grid`; `memory-panel` polls `readRam` while paused. Command `amspirit.z80.memoryView`. Changeset `minor`. Not yet live-validated. Follow-ups: pointer highlight, diff-flash, label-aware goto |
| Code coverage via `/api/codemap` | ⬜ | DeZog parity |
| rasm SNA/DSK load modes via `/api/script` | ⬜ | DeZog parity |
| Conditional / hit-count breakpoints + logpoints | ⬜ | client-side (re-`continue` on unmet condition); logpoints via `OutputEvent` |
| `writeMemory` (`supportsWriteMemoryRequest`) | ⬜ | needs a RAM-write endpoint |
| Reverse-debug (`stepBack`/`reverseContinue`) | ⬜ | emulator already records Z80 history (`session_record_z80_history`); expose via API then wire |
| Memory watchpoints (read/write) | ⬜ | **needs an emulator data-breakpoint endpoint** (none today) — costliest |

## Guardrail baseline

`pnpm precommit` is the gate (build → Biome → typecheck → test:coverage → knip);
CI adds `pnpm audit:prod`. Keep all green; don't lower coverage thresholds.
