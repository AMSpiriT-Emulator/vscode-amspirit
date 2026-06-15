# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this repository.

> **Resuming multi-session work?** Read **`doc/STATUS.md`** first (the canonical
> resume point) and the latest report in `doc/sessions/`. Use the
> `/refactor-preflight` and `/session-report` skills; **close every step with a
> session report** so the next session resumes with zero context loss. The
> current effort is the BASIC debugger in `amspirit-basic` (see `doc/STATUS.md`).

## Project context

A **pnpm monorepo** hosting the shared layer and the VS Code extensions of the
AMSpiriT ecosystem. The extensions edit and inject Amstrad CPC (Locomotive)
BASIC, and drive the [AMSpiriT Lite](https://github.com/AMSpiriT/amspirit-lite)
emulator over its HTTP web-debug server.

```
packages/
  shared/          @amspirit/shared — EmulatorClient (HTTP) + spawnEmulator; Vitest-covered
  amspirit-basic/  VS Code extension (BASIC syntax, inject/pull, launch, diagnostics); TDD, packaged
doc/
  STATUS.md        canonical multi-session resume point
  sessions/        dated session reports (git-ignored; _TEMPLATE.md tracked)
  debugger-plan.md older debugger design — partly stale since the emulator API evolved
  release.md       release procedure (secrets, publisher accounts)
```

The emulator is an **external dependency**, not in this repo. Its HTTP API lives
at `127.0.0.1:8765` by default; relevant builds are `amspirit-lite-sdl` and
`amspirit-lite-qt` (transport is plain HTTP, so the extension is build-agnostic).
The emulator source (for API reference) is typically a sibling checkout at
`../amspirit-lite` — see `src/doc/web_server_api.md` and
`src/amspirit-helpers/src/web_server.cpp` there.

## Commands

```bash
pnpm install              # install all packages
pnpm build                # tsc per package + esbuild bundle for the extension
pnpm check                # Biome lint + format check
pnpm check:fix            # Biome auto-fix
pnpm typecheck            # tsc --noEmit, TS strict (incl. tests)
pnpm test                 # Vitest run across packages
pnpm test:coverage        # + v8 coverage (thresholds enforced)
pnpm knip                 # dead code / unused deps & exports
pnpm precommit            # the full gate: build → check → typecheck → test:coverage → knip
```

Per-package:

```bash
pnpm --filter @amspirit/shared test
pnpm --filter amspirit-basic   watch      # esbuild --watch (then F5 = Extension Dev Host)
pnpm --filter amspirit-basic   package    # produce the .vsix (self-contained bundle)
```

`.githooks/pre-commit` runs `pnpm precommit` (wired by `prepare` on install).
CI mirrors it and adds `pnpm audit:prod`.

## Architecture & conventions

- **Quality gate is non-negotiable.** Biome (no ESLint/Prettier), TS strict with
  `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`, Vitest with enforced
  coverage. Run `/refactor-preflight` before pushing.
- **One tsconfig the editor and the gate share.** Each package's `tsconfig.json`
  is the editor + `typecheck` config and covers **everything** — `src`, `tests`,
  and `vitest.config.mts` — with `noEmit`, so VS Code's Problems panel matches
  `pnpm typecheck` exactly. Emission is a separate `tsconfig.build.json` (src
  only). Don't exclude `tests` from `tsconfig.json` (that re-creates IDE-only
  "inferred project" errors the gate can't see). Vitest configs are `.mts`
  (genuinely ESM) so they typecheck under `node16`. knip entries are pinned in
  `knip.json` since the editor config no longer maps `out/` → `src/`.
- **TDD with DI in `amspirit-basic`.** Business logic lives in pure, testable
  modules; `src/extension.ts` is a thin, untested VS Code adapter. Examples:
  `src/config/Settings.ts`, `src/connection/PingService.ts`,
  `src/commands/inject.ts` (outcome reducer), `src/lifecycle/EmulatorLauncher.ts`.
  **Put new logic in a pure module + test it; keep `extension.ts` thin.**
- **`@amspirit/shared` is the only place that talks HTTP.** `EmulatorClient`
  wraps the emulator endpoints (`ping`/`injectBasic`/`exportBasic`, …);
  extensions consume it via `workspace:*`. Its tests spin up a `FakeEmulator`
  HTTP server and assert URL + payload — follow that pattern for new endpoints.
- **Self-contained bundle.** `esbuild.mjs` inlines `@amspirit/shared` into a
  single `out/extension.js` (the `.vsix` ships no `node_modules`). New runtime
  deps must be bundled (not left `external`); only `vscode` is external.
- **Releases via Changesets.** User-facing changes need a `.changeset/*.md`;
  publication is tag-driven (`amspirit-basic@<version>`) to VS Marketplace +
  Open VSX. Full procedure: `doc/release.md`.
- **Git/PRs:** plain commit messages and PR bodies — no AI/attribution trailers.

## Gotchas

- This repo lives under `~/Documents` (iCloud). Heavy file ops can spawn ` 2`
  conflict-copy directories that corrupt the git tree — watch for them.
- Don't quote volatile numbers (test counts, etc.) in the README.
- A stale emulator instance on the same `--web-port` will answer probes — use a
  custom port when validating, and confirm you're hitting the build you think.
