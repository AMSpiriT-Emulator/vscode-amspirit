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
      // Thin imperative shells (VS Code / DAP / DOM glue): not unit-testable
      // without an integration harness. The testable core (pure modules) is
      // covered.
      exclude: [
        "src/extension.ts",
        "src/config/vs-code-config-reader.ts",
        "src/debug/z80-debug-session.ts",
        "src/status-bar/z80-status-bar.ts",
        "src/webview/**",
        "webview/main.tsx",
        "webview/app.tsx",
        "webview/disasm-app.tsx",
        "webview/registers-app.tsx",
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
