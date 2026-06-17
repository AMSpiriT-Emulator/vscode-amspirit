import type { ConfigReader } from "@amspirit/shared"
import * as vscode from "vscode"

/**
 * Adapter exposing VS Code's `WorkspaceConfiguration` through the minimal
 * `ConfigReader` interface used by `readSettings`. Kept separate so the rest of
 * the code stays unit-testable without the `vscode` namespace.
 */
export function vsCodeConfigReader(section = "amspirit"): ConfigReader {
  return {
    get<T>(key: string, defaultValue: T): T {
      return vscode.workspace.getConfiguration(section).get<T>(key, defaultValue)
    },
  }
}
