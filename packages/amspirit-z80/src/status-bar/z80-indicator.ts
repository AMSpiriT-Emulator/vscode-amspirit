import type { ConnectionState } from "@amspirit/shared"

/** Pure view-model for the Z80 status bar item. */
export interface Z80IndicatorView {
  text: string
  tooltip: string
  /** Command id run when the item is clicked. */
  command: string
}

/** Build the status bar text/tooltip/command for the emulator connection state. */
export function buildZ80Indicator(state: ConnectionState, port: number): Z80IndicatorView {
  if (state === "connected") {
    return {
      text: `$(vm-active) AMSpiriT Z80 :${port}`,
      tooltip: `Connected to AMSpiriT on port ${port} — ready to debug Z80 assembler`,
      command: "amspirit.z80.launch",
    }
  }
  return {
    text: `$(vm) AMSpiriT Z80 :${port}`,
    tooltip: `Not connected on port ${port} — click to launch the emulator`,
    command: "amspirit.z80.connect",
  }
}
