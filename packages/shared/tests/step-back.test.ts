import { describe, expect, it } from "vitest"
import { checkStepBack, stepBackApplied, type TimelapseState } from "../src/step-back.js"

const tl = (over: Partial<TimelapseState>): TimelapseState => ({
  active: true,
  stepsBack: 1,
  stepsFwd: 0,
  stepKind: "z80",
  ...over,
})

describe("checkStepBack", () => {
  it("allows a step back when the timelapse holds a snapshot of the session's kind", () => {
    expect(checkStepBack(tl({}), "z80")).toEqual({ ok: true })
    expect(checkStepBack(tl({ stepKind: "basic", stepsBack: 3 }), "basic")).toEqual({ ok: true })
  })

  it("explains how to enable the timelapse when it is inactive", () => {
    const r = checkStepBack(tl({ active: false, stepsBack: 0 }), "z80")
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/--enable-timelapse/)
  })

  it("refuses to undo a snapshot of another kind (a frame after continue, a BASIC step)", () => {
    const frame = checkStepBack(tl({ stepKind: "frame", stepsBack: 5 }), "z80")
    expect(frame.ok).toBe(false)
    if (!frame.ok) expect(frame.reason).toMatch(/frame/)
    const basic = checkStepBack(tl({ stepKind: "basic" }), "z80")
    expect(basic.ok).toBe(false)
    if (!basic.ok) expect(basic.reason).toMatch(/basic/)
  })

  it("reports when no step of that kind is left to undo", () => {
    const r = checkStepBack(tl({ stepsBack: 0 }), "z80")
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/no z80 step/i)
  })
})

describe("stepBackApplied", () => {
  it("is true once the emulator consumed one snapshot", () => {
    expect(stepBackApplied(tl({ stepsBack: 3 }), tl({ stepsBack: 2 }))).toBe(true)
    expect(stepBackApplied(tl({ stepsBack: 1 }), tl({ stepsBack: 0, active: false }))).toBe(true)
  })

  it("is false while the queued tl_back is still pending", () => {
    expect(stepBackApplied(tl({ stepsBack: 3 }), tl({ stepsBack: 3 }))).toBe(false)
    expect(stepBackApplied(tl({ stepsBack: 3 }), tl({ stepsBack: 4 }))).toBe(false)
  })
})
