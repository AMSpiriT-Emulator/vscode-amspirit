import { describe, expect, it } from "vitest"
import {
  checkStepBack,
  requestStepBack,
  stepBackApplied,
  stepBackAppliedProbe,
  type TimelapseState,
} from "../src/step-back.js"

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

describe("requestStepBack", () => {
  const client = (tlState: TimelapseState, fail?: { get?: string; back?: string }) => {
    const calls: string[] = []
    return {
      calls,
      getTimelapse: async () => {
        calls.push("get")
        if (fail?.get) throw new Error(fail.get)
        return tlState
      },
      tlBack: async () => {
        calls.push("back")
        if (fail?.back) throw new Error(fail.back)
      },
    }
  }

  it("queues the rewind and returns the state it read, so the caller can poll it", async () => {
    const c = client(tl({ stepsBack: 2 }))
    const r = await requestStepBack(c, "z80")
    expect(r).toEqual({ ok: true, before: tl({ stepsBack: 2 }) })
    expect(c.calls).toEqual(["get", "back"])
  })

  it("refuses without issuing the rewind when the timelapse holds another kind", async () => {
    const c = client(tl({ stepKind: "frame" }))
    const r = await requestStepBack(c, "z80")
    expect(r.ok).toBe(false)
    expect(c.calls).toEqual(["get"])
  })

  it("reports the transport error as the refusal reason", async () => {
    const r = await requestStepBack(client(tl({}), { get: "connect ECONNREFUSED" }), "z80")
    expect(r).toEqual({ ok: false, reason: "connect ECONNREFUSED" })
    const back = await requestStepBack(client(tl({}), { back: "HTTP 500" }), "z80")
    expect(back).toEqual({ ok: false, reason: "HTTP 500" })
  })
})

describe("stepBackAppliedProbe", () => {
  it("reports done once the snapshot count behind the position drops", async () => {
    const states = [tl({ stepsBack: 2 }), tl({ stepsBack: 2 }), tl({ stepsBack: 1 })]
    let i = 0
    const probe = stepBackAppliedProbe(
      { getTimelapse: async () => states[i++] ?? tl({ stepsBack: 1 }) },
      tl({ stepsBack: 2 }),
      10,
    )
    expect(await probe()).toBe(false)
    expect(await probe()).toBe(false)
    expect(await probe()).toBe(true)
  })

  it("keeps polling through a transient read error, then gives up at the budget", async () => {
    const probe = stepBackAppliedProbe(
      {
        getTimelapse: async () => {
          throw new Error("transient")
        },
      },
      tl({ stepsBack: 2 }),
      2,
    )
    expect(await probe()).toBe(false)
    expect(await probe()).toBe(true)
  })
})
