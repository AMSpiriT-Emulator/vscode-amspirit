export type { ConnectionState } from "../connection/PingService.js"
import type { ConnectionState } from "../connection/PingService.js"

export interface IndicatorView {
  text: string
  tooltip: string
  command: string
  /** True when the status bar should use the warning background color. */
  useWarningBackground: boolean
}

function fileHint(activeBasicFileName: string | undefined): string {
  return activeBasicFileName ? ` for ${activeBasicFileName}` : ""
}

export function buildIndicator(
  state: ConnectionState,
  port: number,
  activeBasicFileName?: string,
): IndicatorView {
  if (state === "connected") {
    return {
      text: `$(vm-active) AMSpiriT :${port}`,
      tooltip: `Connected to AMSpiriT on port ${port}${fileHint(activeBasicFileName)} — click to open settings`,
      command: "amspirit.openSettings",
      useWarningBackground: false,
    }
  }
  return {
    text: `$(vm) AMSpiriT :${port}`,
    tooltip: `Not connected on port ${port}${fileHint(activeBasicFileName)} — click to connect or launch the emulator`,
    command: "amspirit.connect",
    useWarningBackground: true,
  }
}
