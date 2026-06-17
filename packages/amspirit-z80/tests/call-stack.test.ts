import { describe, expect, it } from "vitest"
import { type ReadMem, reconstructCallStack } from "../src/call-stack.js"

type Cell = [addr: number, byte: number]

/**
 * Builds a {@link ReadMem} over a sparse byte map (unset bytes read as 0x00,
 * i.e. NOP — never a CALL/RST, so they never look like return sites).
 */
function memory(cells: Cell[]): ReadMem {
  const map = new Map(cells)
  return (addr, len) => {
    const out: number[] = []
    for (let i = 0; i < len; i++) out.push(map.get((addr + i) & 0xffff) ?? 0)
    return out
  }
}

/** Little-endian word at `addr`, as two memory cells. */
function word(at: number, value: number): Cell[] {
  return [
    [at, value & 0xff],
    [(at + 1) & 0xffff, (value >> 8) & 0xff],
  ]
}

describe("reconstructCallStack", () => {
  it("always reports the current PC as the innermost frame", () => {
    const frames = reconstructCallStack(0x9500, 0xc000, memory([]))
    expect(frames[0]).toEqual({ address: 0x9500, returnAddress: undefined })
  })

  it("walks return addresses pushed by CALL into nested frames", () => {
    // main: CALL sub1 at 0x8100 (-> ret 0x8103); sub1: CALL sub2 at 0x9050
    // (-> ret 0x9053); PC sits inside sub2 at 0x9500. Stack holds both returns.
    const mem = memory([
      [0x8100, 0xcd], // CALL nn
      [0x9050, 0xcd], // CALL nn
      ...word(0xc000, 0x9053), // SP: innermost return
      ...word(0xc002, 0x8103), // outer return
    ])
    expect(reconstructCallStack(0x9500, 0xc000, mem)).toEqual([
      { address: 0x9500, returnAddress: undefined },
      { address: 0x9050, returnAddress: 0x9053 }, // CALL site for sub2
      { address: 0x8100, returnAddress: 0x8103 }, // CALL site for sub1
    ])
  })

  it("recognises every conditional CALL opcode as a return site", () => {
    for (const op of [0xc4, 0xcc, 0xd4, 0xdc, 0xe4, 0xec, 0xf4, 0xfc]) {
      const mem = memory([[0x8200, op], ...word(0xc000, 0x8203)])
      const frames = reconstructCallStack(0x9000, 0xc000, mem)
      expect(frames[1]).toEqual({ address: 0x8200, returnAddress: 0x8203 })
    }
  })

  it("recognises a single-byte RST as a return site", () => {
    const mem = memory([[0x8200, 0xd7], ...word(0xc000, 0x8201)]) // RST 0x10
    expect(reconstructCallStack(0x9000, 0xc000, mem)[1]).toEqual({
      address: 0x8200,
      returnAddress: 0x8201,
    })
  })

  it("skips stack words that are not preceded by a CALL/RST (locals, saved regs)", () => {
    // 0xC000 holds 0x4000 but nothing call-like precedes it -> skipped;
    // the real return 0x8103 (CALL at 0x8100) is two bytes higher.
    const mem = memory([
      [0x8100, 0xcd],
      ...word(0xc000, 0x4000), // garbage / saved register
      ...word(0xc002, 0x8103), // genuine return
    ])
    expect(reconstructCallStack(0x9000, 0xc000, mem)).toEqual([
      { address: 0x9000, returnAddress: undefined },
      { address: 0x8100, returnAddress: 0x8103 },
    ])
  })

  it("caps the number of frames returned", () => {
    // A stack full of valid CALL returns; cap at maxFrames including frame 0.
    const cells: Cell[] = []
    for (let i = 0; i < 50; i++) {
      cells.push([0x8100 + i, 0xcd]) // CALL site for each return
      cells.push(...word(0xc000 + i * 2, 0x8103 + i))
    }
    const frames = reconstructCallStack(0x9000, 0xc000, memory(cells), { maxFrames: 5 })
    expect(frames).toHaveLength(5)
  })

  it("stops scanning at the configured depth", () => {
    // A genuine return sits beyond maxDepth words and must not be found.
    const mem = memory([[0x8100, 0xcd], ...word(0xc000 + 10 * 2, 0x8103)])
    const frames = reconstructCallStack(0x9000, 0xc000, mem, { maxDepth: 4 })
    expect(frames).toEqual([{ address: 0x9000, returnAddress: undefined }])
  })

  it("stops scanning when the stack read is truncated (memory boundary)", () => {
    const truncated: ReadMem = () => [] // reader yields nothing
    expect(reconstructCallStack(0x9000, 0xc000, truncated)).toEqual([
      { address: 0x9000, returnAddress: undefined },
    ])
  })

  it("ignores a return word whose call-site bytes are unreadable", () => {
    // The stack word reads fine, but the 1-byte call-site probe comes back empty.
    const reader: ReadMem = (_addr, len) => (len >= 2 ? [0x53, 0x90] : [])
    expect(reconstructCallStack(0x9000, 0xc000, reader, { maxDepth: 1 })).toEqual([
      { address: 0x9000, returnAddress: undefined },
    ])
  })

  it("wraps the call-site address at the 16-bit boundary", () => {
    // A return address of 0x0002 implies a CALL at 0xFFFF (0x0002 - 3, wrapped).
    const mem = memory([[0xffff, 0xcd], ...word(0xc000, 0x0002)])
    expect(reconstructCallStack(0x9000, 0xc000, mem)[1]).toEqual({
      address: 0xffff,
      returnAddress: 0x0002,
    })
  })
})
