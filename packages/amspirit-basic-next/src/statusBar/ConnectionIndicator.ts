export type ConnectionState = "connected" | "disconnected"

export interface IndicatorView {
  text: string
  tooltip: string
  /** True when the status bar should use the warning background color. */
  useWarningBackground: boolean
}

export function buildIndicator(state: ConnectionState, port: number): IndicatorView {
  if (state === "connected") {
    return {
      text: `$(vm-active) AMSpiriT :${port}`,
      tooltip: `Connected to AMSpiriT on port ${port}`,
      useWarningBackground: false,
    }
  }
  return {
    text: `$(vm) AMSpiriT :${port}`,
    tooltip: `Not connected on port ${port} — click to connect or launch the emulator`,
    useWarningBackground: true,
  }
}
