import type { BasicState } from "@amspirit/shared"
import { describe, expect, it } from "vitest"
import type { BasicVar } from "../../src/debug/basic-var-parser.js"
import { buildBasicVarsView } from "../../src/debug/basic-vars-view.js"

const state: BasicState = {
  cur_linenum: 20,
  stmt_addr: 0xae1b,
  basic_ver: 10,
  prog_start: 0x0170,
  txttop: 0x0170,
  vartop: 0x02a0,
  arrend: 0x0300,
  prog_size: 0x130,
  var_size: 0x130,
  chain_heads_addr: 0xb000,
}

const mkVar = (over: Partial<BasicVar>): BasicVar => ({
  name: "A",
  baseName: "A",
  type: "real",
  value: "0",
  strLen: 0,
  strAddr: 0,
  addr: 0,
  ...over,
})

describe("buildBasicVarsView — system variables", () => {
  it("formats the memory-layout fields like the amspirit-lite BASIC card", () => {
    const { systemVars } = buildBasicVarsView(state, [])
    const find = (label: string) => systemVars.find((s) => s.label === label)?.value
    expect(find("TXTTOP")).toBe("0170")
    expect(find("Size")).toBe("304 B")
    expect(find("Vars zone")).toBe("0170–02A0 (304 B)")
    expect(find("Arrays zone")).toBe("02A0–0300")
    expect(find("Stmt addr")).toBe("AE1B")
    expect(find("Version")).toBe("BASIC 1.0")
  })

  it("computes free RAM up to the BASIC system area (0xAE14)", () => {
    expect(
      buildBasicVarsView({ ...state, arrend: 0xae04 }, []).systemVars.find(
        (s) => s.label === "Free RAM",
      )?.value,
    ).toBe("16 B")
    // arrend past the system area → clamped to 0
    expect(
      buildBasicVarsView({ ...state, arrend: 0xb000 }, []).systemVars.find(
        (s) => s.label === "Free RAM",
      )?.value,
    ).toBe("0 B")
  })

  it("shows BASIC 1.1 for version 11", () => {
    expect(
      buildBasicVarsView({ ...state, basic_ver: 11 }, []).systemVars.find(
        (s) => s.label === "Version",
      )?.value,
    ).toBe("BASIC 1.1")
  })
})

describe("buildBasicVarsView — variable rows", () => {
  it("maps each variable to a name/type/value row", () => {
    const rows = buildBasicVarsView(state, [
      mkVar({ name: "I%", type: "int", value: "42" }),
      mkVar({ name: "MSG$", type: "string", value: '"HELLO"' }),
      mkVar({ name: "X", type: "real", value: "3.14" }),
    ]).rows
    expect(rows).toEqual([
      { name: "I%", type: "Int", value: "42" },
      { name: "MSG$", type: "String", value: '"HELLO"' },
      { name: "X", type: "Real", value: "3.14" },
    ])
  })

  it("caps over-long values at 32 chars with an ellipsis", () => {
    const long = `"${"A".repeat(40)}"`
    const [row] = buildBasicVarsView(state, [
      mkVar({ name: "S$", type: "string", value: long }),
    ]).rows
    expect(row?.value).toHaveLength(33) // 32 chars + ellipsis
    expect(row?.value.endsWith("…")).toBe(true)
  })

  it("renders no rows when there are no variables", () => {
    expect(buildBasicVarsView(state, []).rows).toEqual([])
  })
})
