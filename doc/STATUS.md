# STATUS — resume point

> Canonical resume point for multi-session work in this repo. Read this first,
> then the latest report in `doc/sessions/`. Close every step with the
> `/session-report` skill so this file and the session log stay authoritative.

## Where we are

- **Branch:** `main` — the BASIC debugger shipped via **PR #3 (merged**, merge
  commit `fcf5a91`). Local `feat/basic-debugger` deleted; the remote branch may
  still need pruning.
- **Current effort:** BASIC debugger in the `amspirit-basic` extension —
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

## Guardrail baseline

`pnpm precommit` is the gate (build → Biome → typecheck → test:coverage → knip);
CI adds `pnpm audit:prod`. Keep all green; don't lower coverage thresholds.
