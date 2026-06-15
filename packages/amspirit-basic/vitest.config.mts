import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts", "webview/**/*.{ts,tsx}"],
      // Thin imperative shells (VS Code / DOM glue): not unit-testable without
      // an integration harness. The testable core is covered below.
      exclude: [
        "src/extension.ts",
        "src/config/vs-code-config-reader.ts",
        "src/diagnostics/register-basic-diagnostics.ts",
        "src/status-bar/status-bar-presenter.ts",
        "src/debug/basic-debug-session.ts",
        "src/webview/**",
        "webview/main.tsx",
        "webview/app.tsx",
        "webview/hooks/**",
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
