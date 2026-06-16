import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // Thin imperative shells (VS Code / DAP glue): not unit-testable without
      // an integration harness. The testable core (pure modules) is covered.
      exclude: [
        "src/extension.ts",
        "src/config/vs-code-config-reader.ts",
        "src/debug/z80-debug-session.ts",
        "src/status-bar/z80-status-bar.ts",
      ],
      thresholds: {
        lines: 90,
        functions: 90,
        statements: 90,
        branches: 80,
      },
    },
  },
})
