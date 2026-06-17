import { fileURLToPath } from "node:url"
import { build, context } from "esbuild"

const production = process.argv.includes("--production")
const watch = process.argv.includes("--watch")

const sharedSrc = fileURLToPath(new URL("../shared/src/index.ts", import.meta.url))

/** @type {import("esbuild").BuildOptions} */
const options = {
  entryPoints: ["src/extension.ts"],
  outfile: "out/extension.js",
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  // `vscode` is provided by the host at runtime and must not be bundled.
  external: ["vscode"],
  // Inline @amspirit/shared (zero runtime deps) into a single file so the
  // packaged extension is self-contained — vsce ships no node_modules.
  // Resolve it from source so bundling never depends on shared being
  // pre-built (dist/).
  alias: { "@amspirit/shared": sharedSrc },
  minify: production,
  sourcemap: !production,
  logLevel: "info",
}

if (watch) {
  const ctx = await context(options)
  await ctx.watch()
} else {
  await build(options)
}
