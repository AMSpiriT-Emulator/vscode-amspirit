import { describe, expect, it, vi } from "vitest"
import { type InjectMode, flagsFor, performInject } from "../../src/commands/inject.js"

describe("flagsFor", () => {
  it.each<[InjectMode, boolean, boolean]>([
    ["inject", false, false],
    ["injectAndRun", false, true],
    ["resetAndInject", true, false],
    ["resetAndRun", true, true],
  ])("maps %s to reset=%s, run=%s", (mode, reset, run) => {
    expect(flagsFor(mode)).toEqual({ resetFirst: reset, runAfter: run })
  })
})

describe("performInject", () => {
  function makeClient() {
    return { injectBasic: vi.fn().mockResolvedValue(undefined) }
  }

  it("returns noEditor when source is undefined", async () => {
    const r = await performInject(
      { client: makeClient(), source: undefined, connected: true },
      "inject",
    )
    expect(r.kind).toBe("noEditor")
  })

  it("returns notConnected when not connected", async () => {
    const r = await performInject(
      { client: makeClient(), source: "10 END", connected: false },
      "inject",
    )
    expect(r.kind).toBe("notConnected")
  })

  it("calls injectBasic with the right flags for injectAndRun", async () => {
    const client = makeClient()
    await performInject({ client, source: "10 END", connected: true }, "injectAndRun")
    expect(client.injectBasic).toHaveBeenCalledWith("10 END", false, true)
  })

  it("calls injectBasic with reset+run for resetAndRun", async () => {
    const client = makeClient()
    await performInject({ client, source: "10 END", connected: true }, "resetAndRun")
    expect(client.injectBasic).toHaveBeenCalledWith("10 END", true, true)
  })

  it("returns a success message tailored to the mode", async () => {
    const cases: Array<[InjectMode, RegExp]> = [
      ["inject", /type RUN/],
      ["injectAndRun", /running/i],
      ["resetAndInject", /hard reset/i],
      ["resetAndRun", /then RUN/],
    ]
    for (const [mode, pattern] of cases) {
      const r = await performInject(
        { client: makeClient(), source: "10 END", connected: true },
        mode,
      )
      expect(r.kind).toBe("success")
      if (r.kind === "success") expect(r.message).toMatch(pattern)
    }
  })

  it("captures Error messages on failure", async () => {
    const client = { injectBasic: vi.fn().mockRejectedValue(new Error("network down")) }
    const r = await performInject({ client, source: "10 END", connected: true }, "inject")
    expect(r.kind).toBe("error")
    if (r.kind === "error") expect(r.message).toBe("network down")
  })

  it("captures non-Error rejections as strings", async () => {
    const client = { injectBasic: vi.fn().mockRejectedValue("plain string") }
    const r = await performInject({ client, source: "10 END", connected: true }, "inject")
    expect(r.kind).toBe("error")
    if (r.kind === "error") expect(r.message).toBe("plain string")
  })
})
