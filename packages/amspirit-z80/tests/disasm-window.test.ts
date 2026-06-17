import { describe, expect, it } from "vitest"
import { type ByteReader, buildDisassemblyWindow } from "../src/disasm-window.js"

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

describe("buildDisassemblyWindow", () => {
  it("disassembles forward from the base address (no offset)", () => {
    expect(buildDisassemblyWindow(PROGRAM, 0x8000, 0, 3)).toEqual([
      { address: "0x8000", instructionBytes: "3e 00", instruction: "LD A,0x00" },
      { address: "0x8002", instructionBytes: "3c", instruction: "INC A" },
      { address: "0x8003", instructionBytes: "c9", instruction: "RET" },
    ])
  })

  it("decodes real instructions before the base for a negative offset (context above PC)", () => {
    // VS Code asks for instructions before the PC. Z80 has no exact backward
    // decode, so we decode forward from a point ahead of the window and keep the
    // instructions that land just before `base` (here a NOP from zeroed memory,
    // then the real LD A). The base sits at index = -instructionOffset.
    const lines = buildDisassemblyWindow(PROGRAM, 0x8002, -2, 4)
    expect(lines).toEqual([
      { address: "0x7fff", instructionBytes: "00", instruction: "NOP" },
      { address: "0x8000", instructionBytes: "3e 00", instruction: "LD A,0x00" },
      { address: "0x8002", instructionBytes: "3c", instruction: "INC A" },
      { address: "0x8003", instructionBytes: "c9", instruction: "RET" },
    ])
  })

  it("skips instructions forward for a positive instruction offset", () => {
    expect(buildDisassemblyWindow(PROGRAM, 0x8000, 1, 2)).toEqual([
      { address: "0x8002", instructionBytes: "3c", instruction: "INC A" },
      { address: "0x8003", instructionBytes: "c9", instruction: "RET" },
    ])
  })

  it("always returns exactly instructionCount lines", () => {
    // Zeroed memory decodes as NOPs; the count must still be honoured exactly,
    // with the one row before base (offset -1) decoded from real memory.
    const lines = buildDisassemblyWindow(memory([]), 0x9000, -1, 3)
    expect(lines).toEqual([
      { address: "0x8fff", instructionBytes: "00", instruction: "NOP" },
      { address: "0x9000", instructionBytes: "00", instruction: "NOP" },
      { address: "0x9001", instructionBytes: "00", instruction: "NOP" },
    ])
  })

  it("returns nothing for a non-positive count", () => {
    expect(buildDisassemblyWindow(PROGRAM, 0x8000, 0, 0)).toEqual([])
    expect(buildDisassemblyWindow(PROGRAM, 0x8000, -5, -1)).toEqual([])
  })

  it("stops early when the memory read yields nothing (unreadable region)", () => {
    const unreadable: ByteReader = () => []
    expect(buildDisassemblyWindow(unreadable, 0x8000, 0, 3)).toEqual([])
    // Positive offset: the skip-forward step falls back to 1 byte per step, then
    // the decode loop finds nothing to emit.
    expect(buildDisassemblyWindow(unreadable, 0x8000, 2, 1)).toEqual([])
  })

  it("wraps placeholder addresses at the 16-bit boundary", () => {
    const lines = buildDisassemblyWindow(memory([]), 0x0000, -1, 2)
    expect(lines[0]).toEqual({ address: "0xffff", instruction: "..." })
    expect(lines[1]?.address).toBe("0x0")
  })

  it("falls back to placeholders when the backward region is unreadable", () => {
    // Negative offset but the bytes before base can't be read.
    const unreadable: ByteReader = () => []
    expect(buildDisassemblyWindow(unreadable, 0x8000, -2, 4)).toEqual([
      { address: "0x7ffe", instruction: "..." },
      { address: "0x7fff", instruction: "..." },
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
    expect(buildDisassemblyWindow(mem, 0x8002, -1, 2)).toEqual([
      { address: "0x8000", instructionBytes: "00", instruction: "NOP" },
      { address: "0x8002", instructionBytes: "00", instruction: "NOP" },
    ])
  })

  it("pads only the rows the window can't reach near address 0", () => {
    // base is too close to 0 to decode 4 instructions back: two real NOPs are
    // found, the remaining two leading rows are placeholders.
    expect(buildDisassemblyWindow(memory([]), 0x0002, -4, 6)).toEqual([
      { address: "0xfffe", instruction: "..." },
      { address: "0xffff", instruction: "..." },
      { address: "0x0", instructionBytes: "00", instruction: "NOP" },
      { address: "0x1", instructionBytes: "00", instruction: "NOP" },
      { address: "0x2", instructionBytes: "00", instruction: "NOP" },
      { address: "0x3", instructionBytes: "00", instruction: "NOP" },
    ])
  })
})
