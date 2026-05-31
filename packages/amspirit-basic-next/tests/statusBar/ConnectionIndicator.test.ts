import { describe, expect, it } from "vitest"
import { buildIndicator } from "../../src/statusBar/ConnectionIndicator.js"

describe("buildIndicator", () => {
  it("uses an active icon and no warning bg when connected", () => {
    const v = buildIndicator("connected", 8765)
    expect(v.text).toBe("$(vm-active) AMSpiriT :8765")
    expect(v.tooltip).toContain("8765")
    expect(v.tooltip).toMatch(/connected/i)
    expect(v.useWarningBackground).toBe(false)
  })

  it("uses an inactive icon and warning bg when disconnected", () => {
    const v = buildIndicator("disconnected", 8765)
    expect(v.text).toBe("$(vm) AMSpiriT :8765")
    expect(v.tooltip).toMatch(/not connected/i)
    expect(v.tooltip).toContain("8765")
    expect(v.useWarningBackground).toBe(true)
  })

  it("includes the current port in the connected tooltip", () => {
    expect(buildIndicator("connected", 9001).tooltip).toContain("9001")
  })
})
