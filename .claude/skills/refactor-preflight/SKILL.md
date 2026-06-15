---
name: refactor-preflight
description: Run the repo quality gate (build + Biome + typecheck + tests/coverage + knip) and report before opening a PR or pushing a branch. Use after a refactor or feature slice on the pnpm monorepo, to confirm style is clean, types pass, nothing broke, and no dead code or old duplicated path was left behind.
---

# Refactor preflight

Report-only health check for a branch in this pnpm monorepo. It runs the **same
gates as CI and the pre-commit hook** (`pnpm precommit`), then you read the
output and act on what THIS branch changed — don't dismiss a finding just
because another package is green.

## Run

From the repo root:

```bash
pnpm build           # tsc per package + esbuild bundle for the extension
pnpm check           # Biome lint + format check (zero ESLint/Prettier)
pnpm typecheck       # tsc --noEmit, TS strict (incl. tests)
pnpm test:coverage   # Vitest run with v8 coverage (thresholds enforced)
pnpm knip            # dead code / unused deps & exports
```

`pnpm precommit` runs all five in one go (it's what `.githooks/pre-commit`
invokes). CI additionally runs `pnpm audit:prod` (network) — run it manually if
you touched dependencies.

## How to read it

- **Biome (`pnpm check`)** — must be clean. Auto-fix your files with
  `pnpm check:fix`; don't hand-format. Format and lint are one tool here.
- **typecheck** — TS strict with `noUncheckedIndexedAccess` and
  `exactOptionalPropertyTypes`. New `any`, non-null `!` shortcuts, or loosened
  optionals introduced by this branch are the finding, not the baseline.
- **tests / coverage** — coverage thresholds are enforced; a new untested module
  (e.g. a pure logic module under `src/`) that drops coverage is on this PR.
  Business logic lives in testable modules with DI — if you added logic to the
  thin `extension.ts` adapter instead of a pure module, that's the smell.
- **knip** — flags dead code, unused exports, and unused deps. After deleting an
  old path, knip confirms nothing dangles; after adding a dep, confirm it's
  actually wired (and bundled by `esbuild.mjs`, not left `external`).
- **anti-duplication (refactors)** — if you extracted or moved logic, confirm the
  **old path is deleted in the same change** — never leave the new module and the
  old copy side by side. `grep` the codebase for the symbol you moved.

## Before declaring done

- `pnpm build`, `pnpm check`, `pnpm typecheck`, `pnpm test:coverage`, `pnpm knip`
  all green.
- For a refactor: old path deleted, knip clean.
- If behaviour could change, validate against the **real emulator** (the project's
  manual-validation pattern): launch `amspirit-lite-sdl --web-server`, open a
  `.bas`, inject (F6) and observe — don't trust unit tests alone for the HTTP
  round-trip. Use a custom `--web-port` to avoid clashing with a stale instance.
- If you packaged: `pnpm --filter amspirit-basic package` produces a valid `.vsix`
  (deps inlined by esbuild — vsce ships no node_modules).

Report a short summary: build green? Biome/typecheck clean? tests + coverage
status? knip clean? old path deleted? Don't pad — name only what changed.

When the step is finished (not just checked), close it with the
`/session-report` skill so `doc/STATUS.md` and the session log stay the
resumable source of truth.
