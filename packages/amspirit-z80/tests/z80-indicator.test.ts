import { describe, expect, it } from "vitest"
import { buildZ80Indicator } from "../src/status-bar/z80-indicator.js"

describe("buildZ80Indicator", () => {
  it("shows an active icon and the port when connected", () => {
    const view = buildZ80Indicator("connected", 8765)
    expect(view.text).toBe("$(vm-active) AMSpiriT Z80 :8765")
    expect(view.tooltip).toContain("Connected")
    expect(view.tooltip).toContain("8765")
    expect(view.command).toBe("amspirit.z80.launch")
  })

  it("offers to connect/launch when disconnected", () => {
    const view = buildZ80Indicator("disconnected", 9000)
    expect(view.text).toBe("$(vm) AMSpiriT Z80 :9000")
    expect(view.tooltip).toContain("launch")
    expect(view.tooltip).toContain("9000")
    expect(view.command).toBe("amspirit.z80.connect")
  })
})
