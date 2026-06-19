import { describe, expect, it } from "vitest"
import { launchEntryReached, stepSettled } from "../src/step-landing.js"

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

describe("launchEntryReached", () => {
  it("is not reached until the PC advances the full entry-instruction length", () => {
    // Entry instr at 0x8000 is 3 bytes; the dirty prefetch latch first lands
    // mid-instruction (0x8001 / 0x8002) before re-syncing.
    expect(launchEntryReached(0x8000, 3, 0x8000)).toBe(false)
    expect(launchEntryReached(0x8000, 3, 0x8001)).toBe(false)
    expect(launchEntryReached(0x8000, 3, 0x8002)).toBe(false)
  })

  it("is reached once the PC lands on the next instruction boundary", () => {
    expect(launchEntryReached(0x8000, 3, 0x8003)).toBe(true)
  })

  it("is reached (capped) if the latch skips the exact boundary", () => {
    // Rare: the latch shifts boundaries so 0x8003 is skipped; stopping at the
    // first boundary at/after it (0x8005) is bounded, never a runaway.
    expect(launchEntryReached(0x8000, 3, 0x8005)).toBe(true)
  })

  it("wraps the 16-bit space", () => {
    // entry 0xFFFF, 2-byte instr -> 0x0001 is distance 2
    expect(launchEntryReached(0xffff, 2, 0x0000)).toBe(false)
    expect(launchEntryReached(0xffff, 2, 0x0001)).toBe(true)
  })
})
