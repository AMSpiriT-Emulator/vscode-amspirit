# STATUS — resume point

> Canonical resume point for multi-session work in this repo. Read this first,
> then the latest report in `doc/sessions/`. Close every step with the
> `/session-report` skill so this file and the session log stay authoritative.

## Where we are

- **Latest (2026-09-15, branch `docs/lite-parity-plan`, commits `9b04fc8`…
  `f069cc9`): first dev-host validation + follow-ups.** Dev host unblocked
  (VS Code's `--experimental-network-inspection` + js-debug network view broke
  every HTTP request; fix = `debug.javascript.enableNetworkView: false`, see
  "Dev-host gotcha"). **Z80 launch validated live**; Step Back validated by DAP
  replay against headless 1.14.3 and Qt 1.15.2 (the reported "broken step
  back" was Step Out at top level). New `trace` launch attribute writes the DAP
  exchange to `<tmpdir>/amspirit-z80-dap.log`. Step Out is now **refused when
  the return address is outside the program** (`planStepOut`, pure). BASIC
  launch waits until the listing **differs from the pre-injection one**
  (`listingEquals`, pure) — closes the P1 where a same-numbered edit verified a
  breakpoint at its old address. Gate green (**shared 195 / basic 88 / z80
  238**). Changesets `z80-step-out-no-caller.md`,
  `basic-launch-waits-for-injection.md`. See
  `doc/sessions/2026-09-15-dev-host-validation.md`. **Next: click-through of
  Step Back / Step Out in the dev host (read the trace), then Phase 1.2.**
- **Latest (2026-09-15, branch `docs/lite-parity-plan`, commits `03250ee` +
  `bf505ae`): 6 debugger review fixes, then lite parity Phase 3 — Step Back.**
  Fixes (TDD): CPU-view memory edits resolve the physical bank via `getMemmap()`
  and the new `writeRam({bank})` (`writeTarget`, pure; ROM refused); Z80
  breakpoints kept **per source file** (`BreakpointSet`, pure); BASIC launch
  waits until the listing decodes the injected program (`listingMatchesSource`,
  pure) before answering breakpoints; the BASIC Variables panel follows the
  session's host/port; a manual pause disarms the run-to temp breakpoint; a
  missing binary **fails** the launch. Phase 3 (TDD): shared `TimelapseState`
  (`emu.tl_*`) in `EmuState`, `getTimelapse()`, `tlBack()`, pure
  `checkStepBack`/`stepBackApplied`; both DAP sessions expose `supportsStepBack`
  (gated on an active timelapse whose newest snapshots are of the session's
  kind; `reverseContinue` declined explicitly). Needs the emulator started with
  `--enable-timelapse` (documented). Gate green (**shared 195 / basic 84 / z80
  235**). Changesets `debugger-review-fixes.md`, `step-back-timelapse.md`.
  **Nothing live-validated.** See
  `doc/sessions/2026-09-15-review-fixes-and-step-back.md`. **Next: dev-host
  validation (History view, bank write, Step Back) on 6128, then Phase 1.2.**
- **Latest (2026-09-15, branch `docs/lite-parity-plan`, commit `d031b9b`): API
  catch-up with amspirit-lite 1.14/1.15.** The emulator moved to
  `~/Developer/z80/amspirit-lite` and its API evolved; deltas mapped in
  `doc/lite-parity-plan.md` §5. Landed (TDD): **default port `6128`** (was
  `8765`) across client/settings/manifests/docs; `send()` **rejects on non-2xx
  with the emulator's `{error}`** (the API now answers `400 {error,field}` /
  `405`); **`/api/ram` `bank` is 16 KB banks** → `memoryBanks(ramKb)` addresses
  extended bank64s by their first bank (`B04`…) from the new `EmulatorConfig.
  ramKb`; `EmuState.frame`→`frames` + `ramApplySeq`; `writeRam`/`execAt` return
  the apply `seq`. Shared client **live-validated read-only** vs a headless
  1.14.3 (`getHistory` 20 entries OK). Gate green (**shared 182 / basic 78 / z80
  226**). Changeset `api-catchup-lite-1-15.md` (3 packages, `minor`). **Step
  Back is now unblocked** upstream (`POST /api/tl_back` + `emu.tl_*`);
  `/api/media` loads SNA/DSK/BIN directly; `/api/screenshot` documented. See
  `doc/sessions/2026-09-15-api-catchup-lite-1-15.md`. **Next: dev-host
  validation of the History view on port 6128, then Phase 1.2 (or pull Phase 3
  forward).**
- **Latest (2026-07-04, branch `docs/lite-parity-plan`, commit `67626c3`): lite
  parity Phase 1.1 — instruction-history view landed (TDD).** New
  `amspirit.z80.history` docked webview listing the last executed Z80
  instructions **newest-first**, each decoded from `/api/history`'s 4-byte fetch
  window into `address · bytes · mnemonic` via the shared disassembler, current
  PC (row 0) highlighted. Pure `history-view-model` (`buildHistoryRows`, 5
  tests) + RTL `HistoryList` (3 tests) + dedicated `HistoryPanel` (mirrors
  `HardwarePanel`'s lifecycle, reads one endpoint, refreshes off the shared
  SSE-fed `RefreshScheduler`). Also exported `Z80HistoryEntry` from the shared
  barrel (Phase 0 left it internal). Gate green (**z80 226 tests**, 98.77%
  lines). Changeset `amspirit-z80-history-view.md` (`amspirit-z80`, `minor`).
  **Not live-validated.** See
  `doc/sessions/2026-07-04-lite-parity-phase1-history-view.md`. **Next:
  live-validate, then Phase 1.2 — disassembler zone analysis.**
- **Prior (2026-07-04, branch `docs/lite-parity-plan`, commit `078c749`): lite
  parity Phase 0 — `EmulatorClient` client foundations landed (TDD).** Added the missing
  wrappers that unblock the rest of the plan: `getHistory()` (`/api/history`,
  typed `Z80HistoryEntry[]`), `execAt()` (`/api/exec`), the scripting trio
  `runScript`/`getScriptState`/`abortScript` (`/api/script`, new `ScriptState`),
  `setConfig()` (`/api/config`, new `EmulatorConfigUpdate` — model/CRTC/ROM‑lang/
  soft+hard reset), and `keytype()`/`keypress()`. Extracted a private `send()` so
  `post`/new `del()` share transport (existing endpoints unchanged). RAM search is
  *not* here — the plan defers it to Phase 1 as a pure `readRam` helper. Gate green
  (**shared 174 tests**, 97.35% lines). Changeset `shared-lite-parity-phase0.md`
  (`@amspirit/shared`, `minor`). **Not live‑validated** (pure client, no UI yet).
  See `doc/sessions/2026-07-04-lite-parity-phase0.md`. **Next: Phase 1.1 — the
  `amspirit.z80.history` view fed by `getHistory()`.**
- **Prior (2026-07-04): lite debug‑webview parity — analysis & catch‑up plan.**
  amspirit‑lite's embedded debug UI grew to **10 tabs / ~40 endpoints**; we mapped
  the gap vs our 3 packages and wrote a phased plan in
  **`doc/lite-parity-plan.md`** (scope chosen: **Debug + scripting**; audio / disk
  / CRT‑shader / UI‑language are explicit non‑goals). Main gaps in scope:
  instruction history (`/api/history`), disassembler zone analysis, RAM search,
  live screen capture, CSL/Lua scripting (`/api/script`), and **memory‑mapping /
  banking awareness** (memmap bar + mapping‑aware search — `getMemmap()` today
  feeds only the Gate Array view). Step‑Back reconciles with the existing
  *reverse‑debug* roadmap item (blocked on an emulator history endpoint). No code
  yet — plan only. **Next: land Phase 0 (client wrappers, TDD) then Phase 1.**
- **Prior (2026-06-24, branch `feat/sse-integration`, UNCOMMITTED): CRTC view —
  full 6845 register file.** The emulator's `/api/state.crtc` now carries `regs`
  (R0–R13), `selected_reg`, `rasterline`, `vsync` (core `build_crtc_json`; doc
  verified up to date — R14–R17 / counters / HSYNC / VMA still commented out).
  Shared gained a typed `CrtcState` + `getState()` mapping (TDD); `buildCrtcScopes`
  went from a type-only placeholder to the real thing: **CRTC** (Type/Chip/Selected/
  Rasterline), **Registers** (R0–R13 named decimal), **Sync** (VSYNC chip). After a
  review pass the view was kept **strictly CRTC** — dropped the Machine context
  (model/frame/FPS, removed dead `CPC_MODEL`), the GA-proxy HSYNC chip (removed the
  `ga` param), and the whole Decoded scope (its `screenBase` was the raw 6845 MA
  start, not a CPU address → misleading). Gate green (**shared 160 / basic 78 /
  z80 218**). Changeset `crtc-register-file.md` (`@amspirit/shared` + `amspirit-z80`,
  `minor`). **Not live-validated.** See `doc/sessions/2026-06-24-crtc-register-file.md`.
  **Next: push `feat/sse-integration` + PR (SSE + CRTC together), then live-validate.**
- **Prior (2026-06-23, branch `feat/sse-integration`, off `main` @ `d5c1da1`,
  commit `1a2a8e1`, NOT pushed): SSE replaces polling for stop detection + live
  views.** New shared layer (all TDD): `SseParser`, `EmulatorEvents` (typed
  `/api/events` client, auto-reconnect), `EmulatorEventHub` (one shared
  connection fanned out — the emulator caps SSE clients at 8), `StopWatcher`
  (SSE stop signal racing a `StopPoller` fallback), `RefreshScheduler`
  (stop-immediate + throttled per-frame refresh + always-on safety poll). Debug
  sessions (z80/basic) watch resume/run-to via SSE with polling fallback and
  pulse the hub on every `stopped` (single steps emit no SSE event) so views snap
  to the stopped state. All webview views + the status bar share one hub;
  `PingService` removed in favour of stream liveness. **Two emulator bugs found &
  fixed in `amspirit-lite`** (user committed/packaged 1.12.0): the `exec`
  dirty-prefetch latch (`session_finish_instruction`) and `setZ80Breakpoints`
  wiping the bp-suppress so step/continue stuck on a breakpoint
  (`session_z80_suppress_after_set`). Full gate green (**shared 160 / basic 78 /
  z80 217**; shared 95.47% stmts, z80 98.04%). Changesets `sse-stop-detection.md`
  + `sse-webviews-and-status.md` (both extensions, `minor`). **Not yet
  live-validated end-to-end.** See `doc/sessions/2026-06-23-sse-integration.md`.
  **Next: push + PR, then live-validate.**
- **Prior (2026-06-21, branch `feat/amspirit-z80-hardware-views`, off `main`
  @ `133763e`, UNCOMMITTED): peripheral-chip views added to the tool suite.**
  Four new docked webview views in the `amspiritZ80` container — **Gate Array**,
  **PSG (AY)**, **FDC (765)**, **CRTC** — each polling `/api/state` (+`/api/memmap`
  for GA) and reusing the Registers scope table (decoded bit-groups render as the
  lit/dim chip strip via a new `kind:"flags"` scope field). Shared:
  `EmulatorClient.getState()` + `getMemmap()` with typed camelCase responses
  (TDD). z80: pure formatters `src/hardware/hardware-views.ts`
  (`buildGateArrayScopes`/`buildPsgScopes`/`buildFdcScopes`/`buildCrtcScopes`,
  TDD) + a generic `HardwarePanel`. **PPI is parked and CRTC is type-only** —
  both need an `/api/state` extension in `amspirit-lite` (user chose no emulator
  change this cycle; core readers `Core_CRTC_/PPI_Read_Internal_Value` already
  exist). Full gate green (**z80 201 tests**, 98.11% stmts / 91.42% br). Changeset
  `amspirit-z80-hardware-views.md` (`minor`). **Not yet live-validated.** See
  `doc/sessions/2026-06-21-amspirit-z80-hardware-views.md`. **Next: live-validate,
  then commit + push + PR.** (The tool suite itself merged via **PR #9**,
  `133763e`.)
- **Branch:** `feat/amspirit-z80-memory-view` — the Memory View slices that were
  uncommitted on `main` are now committed here (3 commits ahead of `main`, not
  pushed). The **`amspirit-z80` extension** (Z80 assembler DAP debugger) is
  **merged** via **PR #5** (merge commit `65ac1d5`). Full gate green,
  **live-validated on a real emulator** (stepping + current line confirmed for
  both sjasmplus and rasm). Two changesets pending release (`amspirit-z80:
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
- **Latest (2026-06-19, MERGED via PR #7, merge `6cbc93c`): dedicated
  Disassembly View webview panel** — brought the Memory View's care to
  disassembly. New React
  panel (command **AMSpiriT Z80: Open Disassembly View**) replacing reliance on
  VS Code's built-in DAP view: label-aware decode (`#`-hex, firmware + symbol-map
  labels, auto-`Lxxxx:`), Follow PC + `▶` marker, machine-driven bank selector,
  wheel/keyboard instruction paging (`stepBase`), code-coverage shading, and
  **code-vs-data** (un-reached bytes shown as `DB #xx` when `/api/codemap`
  coverage is known), plus **row range-select → Export `.asm`**. Refactored
  `disasm-window` to a shared numeric `decodeWindow` core (DAP + webview), new
  pure `disasm-view/disasm-view-model` + shared `disasm-labels` (TDD), RTL
  `disasm-list`; one webview bundle now hosts both panels via the HTML shell's
  `data-view`. Full z80 gate green (172 tests, 99.5% lines / 91.17% br).
  Changeset `amspirit-z80-disassembly-view.md` (`minor`). **Live-validated** on a
  real emulator (2026-06-19). See
  `doc/sessions/2026-06-19-amspirit-z80-disassembly-view.md`.
- **Prior (2026-06-19, branch `feat/amspirit-z80-memory-view`, UNCOMMITTED):**
  **Memory View finishing pass + label-aware disassembly — live-validated.**
  Added: 64 KB wheel/keyboard **scroll + paging** (`scrollBase`), **code-coverage
  shading** (new `EmulatorClient.getCodemap()` + pure `executedOffsets`, decoding
  `/api/codemap`), **inline byte editing** on central RAM (`writeRam`, `parseByte`;
  read-only on extended banks), and a rewritten **label-aware Disassemble** —
  `#` hex, firmware + symbol-map labels (new `SymbolMap.addressToLabel`),
  auto-`Lxxxx` for in-range targets, opened as `z80-asm`. Full gate green (z80 148
  tests, 97.74% stmts / 90.11% br). Changesets `amspirit-z80-memory-panel.md`
  (updated) + `shared-getcodemap.md` (new), both `minor`. See
  `doc/sessions/2026-06-19-amspirit-z80-memory-view-finished.md`.
- **Prior (2026-06-18, branch `feat/amspirit-z80-memory-view`):** committed the
  Memory View off `main` and added two parity follow-ups to the panel —
  **pointer-register highlight** (each byte a pointer reg BC/DE/HL/IX/IY/SP/PC
  targets is highlighted + named in a tooltip; pure `pointerMarks`, TDD) and
  **diff-flash** (bytes that change between paused ticks flash, keyed by absolute
  address so a "Go to" doesn't flash everything). 3 commits (`40d8961` panel +
  memoryReference, `646a8df` pointer highlight, `7ca3683` flash). Full gate green
  (z80 104 tests, 98.06% stmts). See
  `doc/sessions/2026-06-18-amspirit-z80-memory-pointer-flash.md`.
- **Prior (2026-06-18):** **dedicated Z80 Memory View** shipped — the first
  React webview in `amspirit-z80`. A hex+ASCII dump tailored to the 8-bit machine
  (octets only, none of the native inspector's multi-byte/float widgets), opened
  via command **AMSpiriT Z80: Open Memory View**. Pure `memory-view/memory-model`
  (`buildMemoryRows`/`parseAddress`, TDD) + RTL `memory-grid.tsx`; thin
  `webview/memory-panel.ts` polls `readRam` while paused, "Go to" field accepts
  hex/`0x`/`&`. Reuses the `amspirit-basic` Vite+CSP webview pattern (added Vite
  to this package). Changeset `amspirit-z80-memory-panel.md` (`minor`). See
  `doc/sessions/2026-06-18-amspirit-z80-memory-panel.md`.
- **Prior (2026-06-17):** memory-view quick win — pointer regs (BC/DE/HL/IX/IY/SP/PC)
  expose a `memoryReference` in `registers-view.ts` so "View Binary Data" opens
  the native hex inspector at the held address. TDD; changeset
  `amspirit-z80-memory-view.md` (`minor`). **Also uncommitted, on `main`.** See
  `doc/sessions/2026-06-17-amspirit-z80-memory-view.md`. (Prior 2026-06-17 slice —
  call-stack + firmware labels + Disassembly View + step robustness — is **merged
  in PR #5**; see `doc/sessions/2026-06-17-amspirit-z80-callstack-disasm-step.md`.)
- **Next step:** commit the 2026-06-19 finishing pass (currently uncommitted),
  then push `feat/amspirit-z80-memory-view` + open a PR (Memory View finished &
  **live-validated**; changesets ready). Remaining parity follow-ups: label-aware
  "Go to", "code vs data" colouring in the Disassembly View (reuse `getCodemap`),
  SNA/DSK load via `/api/script`, conditional/hit-count breakpoints + logpoints,
  DAP `writeMemoryRequest` / reverse-debug / watchpoints (the last needs an
  emulator endpoint). rasm trailing-`ret` quirk still open.
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
| VS Code Disassembly View working | ✅ | `instructionPointerReference` anchor (was blank without it) + pure `disasm-window` (real backward decode, PC centred); reuses shared `disassemble()`. TDD. **Refactored to a shared numeric `decodeWindow` core** consumed by the DAP adapter and the new webview panel |
| Dedicated Disassembly View React webview panel | ✅ | second React panel in `amspirit-z80`, parity with the Memory View. Command `amspirit.z80.disassemblyView`. Pure `disasm-view/disasm-view-model` (TDD) + shared `disasm-labels` + RTL `disasm-list`; thin `disasm-panel` polls memory. Label-aware (`#`-hex, firmware + symbol map, auto-`Lxxxx:`), Follow PC + `▶` marker, machine-driven bank selector, instruction-wise wheel/keyboard paging, coverage shading, **code-vs-data `DB` for un-reached bytes**, row range-select → Export `.asm`. One webview bundle hosts both panels (`data-view`). z80 gate green (172 tests). Changeset `minor`. **Live-validated** on a real emulator (2026-06-19). **Merged** via PR #7 (`6cbc93c`) |
| Step robustness | ✅ | `step-landing.stepSettled` (PC moves + stable) replaces fixed settle; launch stop-on-entry phantom step worked around (first step = run-to-boundary). Live-validated |
| `stackTrace` resilience | ✅ | current-line frame 0 always emitted, even if the 64 KB call-stack snapshot read fails |
| Push `amspirit-z80` + open PR to `main` | ✅ | **PR #5 merged** (`65ac1d5`); 2 changesets `amspirit-z80: minor` pending release |
| rasm trailing-`ret` line-attribution quirk | ⬜ | rasm maps a `ret` before a label/EOF to the previous line; parsed as-is, refine later |
| Memory view (expose `memoryReference` on pointer regs) | ✅ | `registers-view.ts` sets `memoryReference` on BC/DE/HL/IX/IY/SP/PC (reusing the hex-word value); `variablesRequest` forwards it → "View Binary Data" opens the native hex inspector. TDD; changeset `minor`. Not yet live-validated |
| Dedicated Memory View React webview panel | ✅ | first React webview in `amspirit-z80` (Vite + CSP, mirrors `amspirit-basic`); octets-only hex+ASCII grid; pure `memory-model` (TDD) + RTL `memory-grid`; `memory-panel` polls `readRam`. Command `amspirit.z80.memoryView`. **Finished pass:** "Go to", pointer-register highlight + tooltip, diff-flash, Follow PC, machine-driven bank/view selector, range-select → **label-aware Disassemble** (`#` hex; firmware + symbol-map labels; auto `Lxxxx` for in-range targets; opens as `z80-asm`), **64 KB wheel/keyboard scroll + paging**, **code-coverage shading**, **inline byte editing** on central RAM. Changesets `minor` (z80 + shared). **Live-validated** on a real emulator (2026-06-19) |
| Memory View — pointer-register highlight | ✅ | pure `pointerMarks(regs,window)` (TDD); byte a pointer reg (BC/DE/HL/IX/IY/SP/PC) targets highlighted + named in tooltip; panel fetches `getZ80()` each paused tick. On branch `feat/amspirit-z80-memory-view` |
| Memory View — diff-flash changed bytes | ✅ | `.valflash` on bytes that change between paused ticks; keyed by absolute address so a "Go to" doesn't flash everything. RTL. On branch |
| Memory View — **live-validated** vs real emulator | ✅ | confirmed on `amspirit-lite-qt` 1.11.0 (port 8765): dump + "Go to" + header render. Fixed the blank-at-breakpoint bug: gate on reachability (`ok`), not `pingState().paused` — the QT build wires `p_freeze=&s_paused` but the flag was fragile; `readRam` works whenever reachable. Panel now also targets the active debug session's host/port. Added a `Window: 0xXXXX` header (a zeroed window read as "empty") |
| Memory View — label-aware "Go to" | ⬜ | resolve firmware/symbol-map labels in the goto field (crosses webview↔extension boundary) |
| Code coverage via `/api/codemap` | ✅ | `EmulatorClient.getCodemap()` (shared) + pure `executedOffsets` / `isExecuted`; Memory View shades executed bytes; **Disassembly View** shades executed code and renders un-reached bytes as `DB` data (code vs data) |
| rasm SNA/DSK load modes | ⬜ | DeZog parity. Direct route since lite 1.15: `POST /api/media?name=<file>&drive=` (raw SNA/DSK/HFE/IPF/CPR/CRO/BIN bytes; headerless `.bin` via `name=game@4000[@ENTRY].bin`) — no script needed |
| Conditional / hit-count breakpoints + logpoints | ⬜ | client-side (re-`continue` on unmet condition); logpoints via `OutputEvent` |
| `writeMemory` (`supportsWriteMemoryRequest`) | 🟡 | Memory View edits any view inline: CPU view resolves the physical bank via `/api/memmap` (`writeTarget`), bank views write their own bank (`writeRam({bank})`, 2026-09-15); the DAP `writeMemoryRequest` itself is still unwired |
| Reverse-debug (`stepBack`/`reverseContinue`) | 🟡 | **`stepBack` landed 2026-09-15** (commit `bf505ae`, both debuggers): `tlBack()` + `getTimelapse()` in shared, `checkStepBack` gate (timelapse active, newest snapshots of the session's kind, `stepsBack > 0`), stop reported once `stepsBack` dropped. Emulator must run with `--enable-timelapse`. `reverseContinue` is declined (no emulator endpoint). **Validated by DAP replay** vs headless 1.14.3 + Qt 1.15.2; UI click-through pending. Gap: a step-over of `CALL` (run-to) saves no snapshot |
| Memory watchpoints (read/write) | ⬜ | **needs an emulator data-breakpoint endpoint** (none today) — costliest |
| Peripheral-chip views (Gate Array / PSG / FDC / CRTC) | ✅ | 2026-06-21, branch `feat/amspirit-z80-hardware-views`. 4 docked webviews polling `/api/state` (+`/api/memmap` for GA); shared `getState()`/`getMemmap()` typed (TDD); pure `hardware-views.ts` formatters (TDD) + generic `HardwarePanel`; scope table gained `kind:"flags"` so bit-groups render as chips. z80 201 tests, gate green. Changeset `minor`. Not yet live-validated |
| Peripheral views — PPI (8255) | ⬜ | **blocked**: `/api/state` exposes no PPI data (core `Core_PPI_Read_Internal_Value` exists but isn't serialized) — needs an `amspirit-lite` API extension |
| **Lite parity — API catch-up (lite 1.14/1.15)** | ✅ | 2026-09-15. Port `6128`; `send()` rejects on non-2xx with `{error}`; `/api/ram` 16 KB `bank` + `EmulatorConfig.ramKb` → `memoryBanks(ramKb)`; `EmuState.frames`/`ramApplySeq`; `writeRam`/`execAt` return `seq`. Deltas table in `doc/lite-parity-plan.md` §5. Client live-validated read-only vs headless 1.14.3 |
| **Lite parity — Phase 0 client foundations** | ✅ | 2026-07-04, branch `docs/lite-parity-plan`. `EmulatorClient`: `getHistory()`/`execAt()`/`runScript`/`getScriptState`/`abortScript`/`setConfig()`/`keytype()`/`keypress()`; new types `Z80HistoryEntry`/`ScriptState`/`EmulatorConfigUpdate`; private `send()` shared by `post`/`del`. TDD (shared 174). Changeset `minor`. Not live-validated |
| **Lite parity — instruction history (`/api/history`)** | ✅ | Phase 1.1, commit `67626c3`. `amspirit.z80.history` docked webview: last-executed Z80 instructions newest-first, decoded to `addr · bytes · mnemonic` (shared disassembler), current PC highlighted; refreshed off the SSE-fed `RefreshScheduler`. Pure `history-view-model` (5 tests) + RTL `HistoryList` (3) + `HistoryPanel`. Exported `Z80HistoryEntry` from the shared barrel. z80 226 tests. Changeset `minor`. Not live-validated |
| **Lite parity — disassembler zone analysis** | ⬜ | Phase 1. "Analyze from PC" / "Reset zones" over existing codemap coverage; must be **mapping‑aware** (not flat 64 KB) |
| **Lite parity — RAM search (Find/Next)** | ⬜ | Phase 1. Pure search over `readRam`; search correct bank / `view=cpu` space |
| **Lite parity — memmap bar + banking awareness** | ⬜ | Phase 0/1. Render ROM/RAM per region + `ram_mode`/`ram_page` in Memory/Disasm views (`getMemmap()` today feeds only Gate Array). Bank selector already uses the 16 KB unit (2026-09-15); `writeRam` bank + `Bnn:hhhh` breakpoints are follow-ups |
| **Lite parity — live screen capture + bp overlay** | ⬜ | Phase 2. `GET /api/screenshot[?crop&live&full]` now documented (PNG + `X-Beam-*`/`X-Crop-*` headers); pairs with `POST /api/raster_bp?x&y` for click-to-arm |
| **Lite parity — CSL/Lua scripting (`/api/script`)** | ⬜ | Phase 4. Run active `.csl`/`.lua`; also covers *SNA/DSK load via `/api/script`* below |
| **Lite parity — Step Back / timeline** | 🟡 | Phase 3 = *reverse‑debug* row above: Step Back ✅ (2026-09-15), Reverse Continue / forward navigation pending an emulator endpoint |
| Peripheral views — full CRTC register file (R0–R13) | ✅ | 2026-06-23, branch `feat/sse-integration`. `/api/state.crtc` now carries `regs` R0–R13 + `selected_reg`/`rasterline`/`vsync` (core `build_crtc_json`; R14–R17 + counters/HSYNC/VMA still commented out). Shared `CrtcState` + `getState()` mapping (TDD); `buildCrtcScopes(crtc,emu)` shows the register file (named decimal), chip variant, selected reg, raster line and real CRTC VSYNC. Kept strictly CRTC — dropped machine context (model/frame/FPS) and the GA HSYNC proxy; no derived "screen address" (R12/R13 are the raw 6845 MA start, not a CPU address). Gate green (shared 160 / z80 218). Changeset `crtc-register-file.md` (`minor` shared+z80). Not yet live-validated |

## Dev-host gotcha (2026-09-15)

VS Code 1.136 starts every extension host with `--experimental-network-inspection`.
When js-debug attaches to the Extension Development Host with its network view
on, Node throws `TypeError: Missing dataLength in event` (`node:inspector`) on
every HTTP response chunk, so **no `EmulatorClient` request completes** and the
extension shows "not connected" / a launch does nothing. Fix: set
`"debug.javascript.enableNetworkView": false` in the *root* workspace
`.vscode/settings.json` (git-ignored, so re-add it on a fresh clone) and restart
the dev host. `experimentalNetworking` is not an `extensionHost` launch option.

## Guardrail baseline

`pnpm precommit` is the gate (build → Biome → typecheck → test:coverage → knip);
CI adds `pnpm audit:prod`. Keep all green; don't lower coverage thresholds.
