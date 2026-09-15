import { describe, expect, it } from "vitest"
import { analyzeZones } from "../src/disasm-view/zone-analysis.js"
import type { ByteReader } from "../src/disasm-window.js"

type Cell = [addr: number, byte: number]

/** ByteReader over a sparse byte map (unset bytes read as 0x00 = NOP). */
function memory(cells: Cell[]): ByteReader {
  const map = new Map(cells)
  return (addr, len) => {
    const out: number[] = []
    for (let i = 0; i < len; i++) out.push(map.get((addr + i) & 0xffff) ?? 0)
    return out
  }
}

/** Lay out `bytes` from `start`. */
const at = (start: number, bytes: number[]): Cell[] => bytes.map((b, i) => [start + i, b])

describe("analyzeZones", () => {
  it("follows the fall-through chain and stops at RET", () => {
    // 8000: LD A,#01 ; 8002: INC A ; 8003: RET ; 8004: #FF (data)
    const read = memory(at(0x8000, [0x3e, 0x01, 0x3c, 0xc9, 0xff]))

    const zones = analyzeZones(read, [0x8000])

    expect([...zones.code].sort((a, b) => a - b)).toEqual([0x8000, 0x8002, 0x8003])
    expect(zones.truncated).toBe(false)
  })

  it("follows an unconditional JP and leaves the skipped bytes unmarked", () => {
    // 8000: JP #8006 ; 8003: #11 #22 #33 (data) ; 8006: RET
    const read = memory([...at(0x8000, [0xc3, 0x06, 0x80, 0x11, 0x22, 0x33, 0xc9])])

    const zones = analyzeZones(read, [0x8000])

    expect([...zones.code].sort((a, b) => a - b)).toEqual([0x8000, 0x8006])
  })

  it("follows both paths of a conditional jump", () => {
    // 8000: JR NZ,+2 ; 8002: INC A ; 8003: RET ; 8004: RET
    const read = memory(at(0x8000, [0x20, 0x02, 0x3c, 0xc9, 0xc9]))

    const zones = analyzeZones(read, [0x8000])

    expect([...zones.code].sort((a, b) => a - b)).toEqual([0x8000, 0x8002, 0x8003, 0x8004])
  })

  it("follows a CALL target and the instruction after it", () => {
    // 8000: CALL #8005 ; 8003: RET ; 8004: #FF (data) ; 8005: RET
    const read = memory(at(0x8000, [0xcd, 0x05, 0x80, 0xc9, 0xff, 0xc9]))

    const zones = analyzeZones(read, [0x8000])

    expect([...zones.code].sort((a, b) => a - b)).toEqual([0x8000, 0x8003, 0x8005])
  })

  it("stops at an indirect jump, whose target is unknown", () => {
    // 8000: JP (HL) ; 8001: #FF (data)
    const read = memory(at(0x8000, [0xe9, 0xff]))

    expect([...analyzeZones(read, [0x8000]).code]).toEqual([0x8000])
  })

  it("follows an RST target and the instruction after it", () => {
    // 0018: RET ; 8000: RST #18 ; 8001: RET
    const read = memory([...at(0x0018, [0xc9]), ...at(0x8000, [0xdf, 0xc9])])

    const zones = analyzeZones(read, [0x8000])

    expect([...zones.code].sort((a, b) => a - b)).toEqual([0x0018, 0x8000, 0x8001])
  })

  it("stops at HALT", () => {
    // 8000: HALT ; 8001: #FF (data)
    const read = memory(at(0x8000, [0x76, 0xff]))

    expect([...analyzeZones(read, [0x8000]).code]).toEqual([0x8000])
  })

  it("terminates on a backward loop", () => {
    // 8000: DJNZ -2 (back to 8000) ; 8002: RET
    const read = memory(at(0x8000, [0x10, 0xfe, 0xc9]))

    expect([...analyzeZones(read, [0x8000]).code].sort((a, b) => a - b)).toEqual([0x8000, 0x8002])
  })

  it("traces every entry point given", () => {
    const read = memory([...at(0x8000, [0xc9]), ...at(0x9000, [0xc9])])

    expect([...analyzeZones(read, [0x8000, 0x9000]).code].sort((a, b) => a - b)).toEqual([
      0x8000, 0x9000,
    ])
  })

  it("stops at the instruction budget and reports the truncation", () => {
    // A long NOP slide: the budget cuts the trace short.
    const read = memory([])

    const zones = analyzeZones(read, [0x0000], { limit: 10 })

    expect(zones.code.size).toBe(10)
    expect(zones.truncated).toBe(true)
  })
})
