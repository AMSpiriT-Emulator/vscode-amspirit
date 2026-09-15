import { decodeInstruction } from "@amspirit/shared"
import { describe, expect, it } from "vitest"
import { planStepOut, planStepOver, returnAddress } from "../src/step-targets.js"

const at = (bytes: number[], pc = 0x8000) => decodeInstruction(bytes, pc)

describe("planStepOver", () => {
  it("runs to the instruction after a CALL nn (steps over the subroutine)", () => {
    expect(planStepOver(at([0xcd, 0x34, 0x12]))).toEqual({ kind: "runTo", addr: 0x8003 })
  })

  it("steps over a conditional CALL", () => {
    expect(planStepOver(at([0xc4, 0x34, 0x12]))).toEqual({ kind: "runTo", addr: 0x8003 })
  })

  it("steps over an RST restart", () => {
    expect(planStepOver(at([0xcf]))).toEqual({ kind: "runTo", addr: 0x8001 })
  })

  it("single-steps non-call instructions", () => {
    expect(planStepOver(at([0x78]))).toEqual({ kind: "stepOne" }) // LD A,B
    expect(planStepOver(at([0xc3, 0x00, 0x90]))).toEqual({ kind: "stepOne" }) // JP nn
    expect(planStepOver(at([0xc9]))).toEqual({ kind: "stepOne" }) // RET
    expect(planStepOver(at([0x18, 0xfe]))).toEqual({ kind: "stepOne" }) // JR
  })

  it("wraps the run-to address at 0xFFFF", () => {
    expect(planStepOver(at([0xcd, 0x00, 0x00], 0xffff))).toEqual({ kind: "runTo", addr: 0x0002 })
  })
})

describe("returnAddress", () => {
  it("reads the little-endian return address off the stack top", () => {
    expect(returnAddress([0x34, 0x12])).toBe(0x1234)
  })

  it("ignores extra bytes", () => {
    expect(returnAddress([0x00, 0x90, 0xff])).toBe(0x9000)
  })

  it("returns undefined when the stack read is too short", () => {
    expect(returnAddress([0x34])).toBeUndefined()
    expect(returnAddress([])).toBeUndefined()
  })
})

describe("planStepOut", () => {
  // Program spans &8000-&800F; only those addresses are "inside".
  const inside = (addr: number) => addr >= 0x8000 && addr <= 0x800f

  it("runs to the return address when the caller is inside the program", () => {
    expect(planStepOut([0x06, 0x80], inside)).toEqual({ kind: "runTo", addr: 0x8006 })
  })

  it("refuses when the return address leads outside the program (firmware caller)", () => {
    // At the program's top level the stack still holds the firmware's return
    // address: running there would run the whole program to its final RET.
    expect(planStepOut([0xcc, 0x1b], inside)).toEqual({ kind: "noCaller", addr: 0x1bcc })
  })

  it("refuses when the stack bytes are unavailable", () => {
    expect(planStepOut([0x06], inside)).toEqual({ kind: "noCaller", addr: undefined })
  })
})
