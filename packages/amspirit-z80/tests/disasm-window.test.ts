import { describe, expect, it } from "vitest"
import { type ByteReader, decodeWindow } from "../src/disasm-window.js"

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

// LD A,0x00 (3e 00) @8000 ; INC A (3c) @8002 ; RET (c9) @8003
const PROGRAM = memory([
  [0x8000, 0x3e],
  [0x8001, 0x00],
  [0x8002, 0x3c],
  [0x8003, 0xc9],
])

describe("decodeWindow", () => {
  it("disassembles forward from the base address (no offset)", () => {
    expect(decodeWindow(PROGRAM, 0x8000, 0, 3)).toEqual([
      { addr: 0x8000, bytes: [0x3e, 0x00], text: "LD A,0x00" },
      { addr: 0x8002, bytes: [0x3c], text: "INC A" },
      { addr: 0x8003, bytes: [0xc9], text: "RET" },
    ])
  })

  it("decodes real instructions before the base for a negative offset (context above PC)", () => {
    // VS Code asks for instructions before the PC. Z80 has no exact backward
    // decode, so we decode forward from a point ahead of the window and keep the
    // instructions that land just before `base` (here a NOP from zeroed memory,
    // then the real LD A). The base sits at index = -instructionOffset.
    const rows = decodeWindow(PROGRAM, 0x8002, -2, 4)
    expect(rows).toEqual([
      { addr: 0x7fff, bytes: [0x00], text: "NOP" },
      { addr: 0x8000, bytes: [0x3e, 0x00], text: "LD A,0x00" },
      { addr: 0x8002, bytes: [0x3c], text: "INC A" },
      { addr: 0x8003, bytes: [0xc9], text: "RET" },
    ])
  })

  it("skips instructions forward for a positive instruction offset", () => {
    expect(decodeWindow(PROGRAM, 0x8000, 1, 2)).toEqual([
      { addr: 0x8002, bytes: [0x3c], text: "INC A" },
      { addr: 0x8003, bytes: [0xc9], text: "RET" },
    ])
  })

  it("always returns exactly instructionCount rows", () => {
    // Zeroed memory decodes as NOPs; the count must still be honoured exactly,
    // with the one row before base (offset -1) decoded from real memory.
    const rows = decodeWindow(memory([]), 0x9000, -1, 3)
    expect(rows).toEqual([
      { addr: 0x8fff, bytes: [0x00], text: "NOP" },
      { addr: 0x9000, bytes: [0x00], text: "NOP" },
      { addr: 0x9001, bytes: [0x00], text: "NOP" },
    ])
  })

  it("returns nothing for a non-positive count", () => {
    expect(decodeWindow(PROGRAM, 0x8000, 0, 0)).toEqual([])
    expect(decodeWindow(PROGRAM, 0x8000, -5, -1)).toEqual([])
  })

  it("stops early when the memory read yields nothing (unreadable region)", () => {
    const unreadable: ByteReader = () => []
    expect(decodeWindow(unreadable, 0x8000, 0, 3)).toEqual([])
    // Positive offset: the skip-forward step falls back to 1 byte per step, then
    // the decode loop finds nothing to emit.
    expect(decodeWindow(unreadable, 0x8000, 2, 1)).toEqual([])
  })

  it("wraps placeholder addresses at the 16-bit boundary", () => {
    const rows = decodeWindow(memory([]), 0x0000, -1, 2)
    expect(rows[0]).toEqual({ addr: 0xffff, placeholder: true })
    expect(rows[1]).toMatchObject({ addr: 0x0000 })
  })

  it("falls back to placeholders when the backward region is unreadable", () => {
    // Negative offset but the bytes before base can't be read.
    const unreadable: ByteReader = () => []
    expect(decodeWindow(unreadable, 0x8000, -2, 4)).toEqual([
      { addr: 0x7ffe, placeholder: true },
      { addr: 0x7fff, placeholder: true },
    ])
  })

  it("drops a backward instruction that straddles the base (re-synchronisation)", () => {
    // A 2-byte LD A sits at 0x8001, so decoding forward toward base 0x8002
    // produces an instruction ending at 0x8003 — past base. It is dropped (a
    // small gap), and the row above base is the aligned NOP at 0x8000.
    const mem = memory([
      [0x8001, 0x3e],
      [0x8002, 0x00],
      [0x8003, 0x3c],
    ])
    expect(decodeWindow(mem, 0x8002, -1, 2)).toEqual([
      { addr: 0x8000, bytes: [0x00], text: "NOP" },
      { addr: 0x8002, bytes: [0x00], text: "NOP" },
    ])
  })

  it("pads only the rows the window can't reach near address 0", () => {
    // base is too close to 0 to decode 4 instructions back: two real NOPs are
    // found, the remaining two leading rows are placeholders.
    expect(decodeWindow(memory([]), 0x0002, -4, 6)).toEqual([
      { addr: 0xfffe, placeholder: true },
      { addr: 0xffff, placeholder: true },
      { addr: 0x0000, bytes: [0x00], text: "NOP" },
      { addr: 0x0001, bytes: [0x00], text: "NOP" },
      { addr: 0x0002, bytes: [0x00], text: "NOP" },
      { addr: 0x0003, bytes: [0x00], text: "NOP" },
    ])
  })
})
