import { describe, expect, it } from "vitest"
import { buildIndicator } from "../../src/status-bar/connection-indicator.js"

describe("buildIndicator", () => {
  it("uses an active icon and no warning bg when connected", () => {
    const v = buildIndicator("connected", 6128)
    expect(v.text).toBe("$(vm-active) AMSpiriT :6128")
    expect(v.tooltip).toContain("6128")
    expect(v.tooltip).toMatch(/connected/i)
    expect(v.command).toBe("amspirit.openSettings")
    expect(v.useWarningBackground).toBe(false)
  })

  it("uses an inactive icon and warning bg when disconnected", () => {
    const v = buildIndicator("disconnected", 6128)
    expect(v.text).toBe("$(vm) AMSpiriT :6128")
    expect(v.tooltip).toMatch(/not connected/i)
    expect(v.tooltip).toContain("6128")
    expect(v.command).toBe("amspirit.connect")
    expect(v.useWarningBackground).toBe(true)
  })

  it("includes the current port in the connected tooltip", () => {
    expect(buildIndicator("connected", 9001).tooltip).toContain("9001")
  })

  it("includes the active BASIC file name in the tooltip when available", () => {
    expect(buildIndicator("connected", 6128, "test.bas").tooltip).toContain("test.bas")
    expect(buildIndicator("disconnected", 6128, "test.bas").tooltip).toContain("test.bas")
  })
})
