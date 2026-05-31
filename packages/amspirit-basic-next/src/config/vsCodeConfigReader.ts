import * as vscode from "vscode"
import type { ConfigReader } from "./Settings.js"

/**
 * Adapter that exposes VS Code's `WorkspaceConfiguration` through the
 * minimal `ConfigReader` interface used by `readSettings`. Kept in its
 * own module so the rest of the code can be unit-tested without
 * pulling in the `vscode` namespace.
 */
export function vsCodeConfigReader(section = "amspirit"): ConfigReader {
  return {
    get<T>(key: string, defaultValue: T): T {
      return vscode.workspace.getConfiguration(section).get<T>(key, defaultValue)
    },
  }
}
