import { decodeInstruction } from "@amspirit/shared"
import { describe, expect, it } from "vitest"
import { planStepOver, returnAddress } from "../src/step-targets.js"

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
