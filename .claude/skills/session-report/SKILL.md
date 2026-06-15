---
name: session-report
description: Close a multi-session step with a resumable session report. Use at the end of every step/PR of an ongoing effort (e.g. the BASIC debugger) so a fresh session can pick up exactly where this one left off. Updates the canonical doc/STATUS.md and appends a dated report under doc/sessions/.
---

# Session report (close a step)

Produce the artifacts that let a new session resume with zero context loss.
Run this at the end of each step/PR, before stopping.

## 1. Gather the real state (don't guess)

```
date +%F                  # the report's date / filename prefix
git branch --show-current
git status --short
pnpm check                # Biome lint + format (dry-run, like CI)
pnpm typecheck            # TS strict
pnpm test:coverage        # Vitest + coverage thresholds
pnpm knip                 # dead code / unused deps
```

Compare against the baseline in `doc/STATUS.md`. A regression (new Biome noise,
a red test, a coverage drop, a type error, knip findings) must be called out —
and ideally fixed before reporting done. (`pnpm precommit` runs the whole gate
in one shot.)

## 2. Append a dated session report

- Copy `doc/sessions/_TEMPLATE.md` to `doc/sessions/<YYYY-MM-DD>-<slug>.md`
  (slug = the step, e.g. `debugger-phase1-dap`). Never overwrite an existing
  report — history is append-only. (These dated files are git-ignored /
  local-only; that's intended — `_TEMPLATE.md` stays tracked.)
- Fill every section honestly: Done, Not done / remaining, Decisions,
  Guardrail status (with the numbers from step 1), State to resume from.
- "State to resume from" must name the SINGLE next action and any gotchas /
  half-done edits / stale config (e.g. a breakpoint set still posted to a
  running emulator, a `.changeset` not yet written, a dep added but not bundled).

## 3. Update the canonical STATUS

Edit `doc/STATUS.md`:
- Move the roadmap row(s) to ✅ / 🟡 and update the Notes.
- Update "Where we are" (branch, current step, next step).
- If a guardrail genuinely improved, raise the baseline (never lower it to hide
  a regression).

## 4. Keep memory in sync (optional, if the plan shifted)

If a durable cross-session decision changed, update the relevant auto-memory note
(architecture/process decision). Don't duplicate the whole report there — just
the durable decision.

## 5. Changeset (if user-facing)

If the step changed `amspirit-basic` or `@amspirit/shared` behaviour, ensure a
`.changeset/*.md` exists (`pnpm changeset`) — releases are Changesets-driven.

## Output

End with a 3-line summary to the user: what's done, the next action, and the
report path.
