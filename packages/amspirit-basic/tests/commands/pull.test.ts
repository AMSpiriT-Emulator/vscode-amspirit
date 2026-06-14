import { describe, expect, it, vi } from "vitest"
import { performPull } from "../../src/commands/pull.js"

describe("performPull", () => {
  function makeClient(source = '10 PRINT "HELLO"\n') {
    return { exportBasic: vi.fn().mockResolvedValue(source) }
  }

  it("returns notConnected when not connected", async () => {
    const r = await performPull({ client: makeClient(), connected: false })
    expect(r.kind).toBe("notConnected")
  })

  it("returns the exported source on success", async () => {
    const client = makeClient('10 PRINT "HELLO"\n20 GOTO 10\n')
    const r = await performPull({ client, connected: true })
    expect(client.exportBasic).toHaveBeenCalledOnce()
    expect(r.kind).toBe("success")
    if (r.kind === "success") expect(r.source).toBe('10 PRINT "HELLO"\n20 GOTO 10\n')
  })

  it("reports empty when the program is blank or whitespace-only", async () => {
    for (const blank of ["", "   ", "\n\t  \n"]) {
      const r = await performPull({ client: makeClient(blank), connected: true })
      expect(r.kind).toBe("empty")
    }
  })

  it("captures Error messages on failure", async () => {
    const client = { exportBasic: vi.fn().mockRejectedValue(new Error("HTTP 503")) }
    const r = await performPull({ client, connected: true })
    expect(r.kind).toBe("error")
    if (r.kind === "error") expect(r.message).toBe("HTTP 503")
  })

  it("captures non-Error rejections as strings", async () => {
    const client = { exportBasic: vi.fn().mockRejectedValue("plain string") }
    const r = await performPull({ client, connected: true })
    expect(r.kind).toBe("error")
    if (r.kind === "error") expect(r.message).toBe("plain string")
  })
})
