# STATUS — resume point

> Canonical resume point for multi-session work in this repo. Read this first,
> then the latest report in `doc/sessions/`. Close every step with the
> `/session-report` skill so this file and the session log stay authoritative.

## Where we are

- **Branch:** `docs/sdl-and-qt`
- **Current effort:** BASIC debugger in the `amspirit-basic` extension —
  bringing the features of the amspirit-lite web debugger (breakpoints, step,
  continue/pause, run-to, current-line highlight, variables) into VS Code.
- **Approach:** Hybrid **DAP + Webview**. Phase 1 = DAP execution control
  (breakpoints, continue/pause, step line & statement, run-to-cursor, current
  line) — **no emulator changes needed**. Phase 2 = Webview (Z80 registers,
  disassembly) + Locomotive BASIC variable inspection.
- **Why now:** the amspirit-lite HTTP API evolved and now exposes native BASIC
  debug endpoints (`/api/basic_state`, `/api/basic_listing`,
  `/api/basic_step`, `/api/basic_bp`, `/api/basic_runto`, `/api/config`).
  `doc/debugger-plan.md` predates this and is stale on its core assumption
  ("no breakpoints/step") — to be updated as part of the work.
- **Next step:** extend `@amspirit/shared` `EmulatorClient` with the debug HTTP
  methods (+ Vitest), then the pure debug modules (`BreakpointMapper`,
  `StopPoller`, `dapHandlers`), then the `BasicDebugSession` adapter + manifest.

## Roadmap

| Item | Status | Notes |
|---|---|---|
| Monorepo pnpm + Biome + TS strict | ✅ | |
| `@amspirit/shared` (`EmulatorClient`, `spawnEmulator`) + tests | ✅ | |
| `amspirit-basic` TDD (inject/pull/ping/launch/diagnostics) | ✅ | |
| esbuild bundling + Changesets release pipeline | ✅ | |
| Debug HTTP methods on `EmulatorClient` (+ tests) | ⬜ | basic_state/listing/step/bp/runto/config/pingState |
| Pure debug modules (BreakpointMapper / StopPoller / dapHandlers) | ⬜ | line↔addr mapping, paused polling, DAP responses |
| `BasicDebugSession` (DAP) + manifest contributes | ⬜ | breakpoints + debuggers + activation |
| Phase 2: Webview (Z80 regs / disasm) + BASIC variables | ⬜ | reuse Vite; pure variable-chain parser |
| End-to-end manual validation vs real emulator | ⬜ | launch `--web-server`, set BP, observe |

## Guardrail baseline

`pnpm precommit` is the gate (build → Biome → typecheck → test:coverage → knip);
CI adds `pnpm audit:prod`. Keep all green; don't lower coverage thresholds.
