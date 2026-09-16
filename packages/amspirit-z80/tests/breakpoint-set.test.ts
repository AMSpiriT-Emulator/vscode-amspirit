import { describe, expect, it } from "vitest"
import { BreakpointSet } from "../src/debug/breakpoint-set.js"

describe("BreakpointSet", () => {
  it("keeps the addresses of every source file and posts their union", () => {
    const set = new BreakpointSet()
    set.replace("/src/main.asm", [0x8000, 0x8010])
    set.replace("/src/helper.asm", [0x9000])
    expect(set.all()).toEqual([0x8000, 0x8010, 0x9000])
  })

  it("replaces only the file the request names (a DAP setBreakpoints is per source)", () => {
    const set = new BreakpointSet()
    set.replace("/src/main.asm", [0x8000])
    set.replace("/src/helper.asm", [0x9000])
    set.replace("/src/main.asm", [0x8020])
    expect(set.all()).toEqual([0x8020, 0x9000])
  })

  it("clears a file when its request carries no breakpoints", () => {
    const set = new BreakpointSet()
    set.replace("/src/main.asm", [0x8000])
    set.replace("/src/helper.asm", [0x9000])
    set.replace("/src/helper.asm", [])
    expect(set.all()).toEqual([0x8000])
  })

  it("dedupes an address two files (or two lines) resolve to", () => {
    const set = new BreakpointSet()
    set.replace("/src/main.asm", [0x8000, 0x8000])
    set.replace("/src/inc.asm", [0x8000])
    expect(set.all()).toEqual([0x8000])
  })

  it("starts empty", () => {
    expect(new BreakpointSet().all()).toEqual([])
  })
})
