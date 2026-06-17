import { describe, expect, it } from "vitest"
import { stepSettled } from "../src/step-landing.js"

describe("stepSettled", () => {
  it("is not settled while the PC still reads the pre-step address", () => {
    expect(stepSettled(0x8000, 0x8000, undefined)).toBe(false)
    expect(stepSettled(0x8000, 0x8000, 0x8000)).toBe(false)
  })

  it("is not settled on the first poll that sees a moved PC (could be mid-instruction)", () => {
    // PC moved off 0x8000 but we have no prior sample to confirm it is stable.
    expect(stepSettled(0x8000, 0x8001, undefined)).toBe(false)
  })

  it("is not settled while the PC is still advancing between polls", () => {
    // 0x8001 was a transient mid-instruction read; 0x8002 differs from it.
    expect(stepSettled(0x8000, 0x8002, 0x8001)).toBe(false)
  })

  it("is settled once the moved PC is stable across two consecutive polls", () => {
    expect(stepSettled(0x8000, 0x8002, 0x8002)).toBe(true)
  })
})
