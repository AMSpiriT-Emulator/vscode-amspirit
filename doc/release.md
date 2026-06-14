# Releasing the VS Code extensions

Extensions are bundled with **esbuild** into a single self-contained
`out/extension.js` (the workspace lib `@amspirit/shared` is inlined), versioned
with **Changesets**, and published to the **VS Marketplace** and **Open VSX**
by a tag-triggered GitHub Actions workflow.

## One-time setup (maintainer)

1. **VS Marketplace** — create/own the `amspirit-emulator` publisher at
   <https://marketplace.visualstudio.com/manage>, then generate an Azure DevOps
   Personal Access Token (scope: *Marketplace → Manage*).
2. **Open VSX** — create an account at <https://open-vsx.org>, claim the
   `amspirit-emulator` namespace (`ovsx create-namespace amspirit-emulator`),
   and generate an access token.
3. Add both as **GitHub repository secrets**:
   - `VSCE_PAT` — the Azure DevOps token
   - `OVSX_PAT` — the Open VSX token

## Cutting a release

```bash
# 1. Describe the change (creates a file under .changeset/)
pnpm changeset            # pick amspirit-basic + bump type, write a summary

# 2. Apply versions + regenerate CHANGELOG.md
pnpm version              # = changeset version

# 3. Commit the version bump
git add -A && git commit -m "release: amspirit-basic <new-version>"

# 4. Create + push the tag (changeset tag emits amspirit-basic@<version>)
pnpm tag
git push --follow-tags
```

Pushing the `amspirit-basic@<version>` tag triggers
[`release.yml`](../.github/workflows/release.yml), which runs the full quality
gate, packages the `.vsix`, publishes to both marketplaces, and attaches the
`.vsix` to the GitHub Release.

> If `changeset tag` skips the package (it is `private`), tag manually:
> `git tag amspirit-basic@<version> && git push --tags`.

## Local checks before tagging

```bash
pnpm --filter amspirit-basic build      # esbuild production bundle
pnpm --filter amspirit-basic package    # vsce package --no-dependencies -> .vsix
pnpm exec vsce package --no-dependencies # (run inside the package) dry inspect

# Smoke-test the packaged artifact:
code --install-extension packages/amspirit-basic/amspirit-basic-*.vsix
# open a .bas file, press F6 (inject) and run "Pull BASIC from Emulator"
```

The packaged `.vsix` must contain **only** `out/extension.js` plus assets
(README, CHANGELOG, LICENSE, icon, language config, syntaxes, media) — never
`node_modules`, `src`, or tests.
