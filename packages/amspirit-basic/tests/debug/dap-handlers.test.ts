import type { BasicState } from "@amspirit/shared"
import { describe, expect, it } from "vitest"
import { buildStackFrame, buildStateVariables, stepByLine } from "../../src/debug/dap-handlers.js"

const state = (over: Partial<BasicState> = {}): BasicState => ({
  cur_linenum: 20,
  stmt_addr: 0xae1b,
  basic_ver: 11,
  prog_start: 368,
  txttop: 880,
  vartop: 920,
  arrend: 920,
  prog_size: 512,
  var_size: 40,
  chain_heads_addr: 0xadb7,
  ...over,
})

const doc = ["10 A=1", "20 A=A+1", "100 END"]

describe("stepByLine", () => {
  it("maps next and stepOut to line stepping", () => {
    expect(stepByLine("next")).toBe(true)
    expect(stepByLine("stepOut")).toBe(true)
  })

  it("maps stepIn to statement stepping", () => {
    expect(stepByLine("stepIn")).toBe(false)
  })
})

describe("buildStackFrame", () => {
  it("names the frame after the current BASIC line and maps to the editor line", () => {
    expect(buildStackFrame(state(), doc)).toEqual({ name: "BASIC 20", line: 2, column: 0 })
  })

  it("reports line 0 when the BASIC line is not in the document", () => {
    expect(buildStackFrame(state({ cur_linenum: 55 }), doc)).toEqual({
      name: "BASIC 55",
      line: 0,
      column: 0,
    })
  })

  it("reports direct mode when no program is running", () => {
    expect(buildStackFrame(state({ cur_linenum: 0xffff }), doc)).toEqual({
      name: "Direct mode",
      line: 0,
      column: 0,
    })
  })
})

describe("buildStateVariables", () => {
  it("formats the running state with hex statement address and version", () => {
    expect(buildStateVariables(state())).toEqual([
      { name: "Current line", value: "20" },
      { name: "Statement addr", value: "0xAE1B" },
      { name: "Program size", value: "512 bytes" },
      { name: "BASIC version", value: "1.1" },
    ])
  })

  it("shows direct mode and BASIC 1.0", () => {
    const vars = buildStateVariables(state({ cur_linenum: 0xffff, basic_ver: 10 }))
    expect(vars[0]).toEqual({ name: "Current line", value: "(direct mode)" })
    expect(vars[3]).toEqual({ name: "BASIC version", value: "1.0" })
  })
})
