import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // Thin VS Code API adapters (imperative shell): not unit-testable
      // without an integration harness. The testable core is covered below.
      exclude: [
        "src/extension.ts",
        "src/config/vsCodeConfigReader.ts",
        "src/diagnostics/registerBasicDiagnostics.ts",
        "src/statusBar/StatusBarPresenter.ts",
        "src/debug/BasicDebugSession.ts",
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
