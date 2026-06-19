import { describe, expect, it } from "vitest"
import { type ByteReader, buildDisasmRows, stepBase } from "../src/disasm-view/disasm-view-model.js"

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

describe("buildDisasmRows", () => {
  it("renders forward rows with upper-case address, bytes and #-hex operands", () => {
    expect(
      buildDisasmRows({ read: PROGRAM, base: 0x8000, instructionOffset: 0, instructionCount: 3 }),
    ).toEqual([
      {
        addr: 0x8000,
        address: "8000",
        bytes: "3E 00",
        text: "LD A,#00",
        isPc: false,
        executed: false,
        data: false,
      },
      {
        addr: 0x8002,
        address: "8002",
        bytes: "3C",
        text: "INC A",
        isPc: false,
        executed: false,
        data: false,
      },
      {
        addr: 0x8003,
        address: "8003",
        bytes: "C9",
        text: "RET",
        isPc: false,
        executed: false,
        data: false,
      },
    ])
  })

  it("flags the row at the program counter", () => {
    const rows = buildDisasmRows({
      read: PROGRAM,
      base: 0x8000,
      instructionOffset: 0,
      instructionCount: 3,
      pc: 0x8002,
    })
    expect(rows.map((r) => r.isPc)).toEqual([false, true, false])
  })

  it("shades rows the Z80 has executed (codemap bit set)", () => {
    // Bitmap is 8192 bytes of hex (16384 chars); set the bit for address 0x8003.
    const bits = new Uint8Array(8192)
    bits[0x8003 >> 3] = 1 << (0x8003 & 7)
    const codemapHex = [...bits].map((b) => b.toString(16).padStart(2, "0")).join("")
    const rows = buildDisasmRows({
      read: PROGRAM,
      base: 0x8000,
      instructionOffset: 0,
      instructionCount: 3,
      codemapHex,
    })
    expect(rows.map((r) => r.executed)).toEqual([false, false, true])
  })

  it("names a resolved operand and emits its label definition when in window", () => {
    // CALL 0xBB5A (cd 5a bb) @9000 ; firmware resolves 0xBB5A → TXT OUTPUT.
    const mem = memory([
      [0x9000, 0xcd],
      [0x9001, 0x5a],
      [0x9002, 0xbb],
    ])
    const resolve = (addr: number): string | undefined =>
      addr === 0xbb5a ? "TXT OUTPUT" : undefined
    const [row] = buildDisasmRows({
      read: mem,
      base: 0x9000,
      instructionOffset: 0,
      instructionCount: 1,
      resolve,
    })
    expect(row?.text).toBe("CALL TXT_OUTPUT")
    expect(row?.label).toBeUndefined()
  })

  it("renders an unresolved 16-bit operand as #-hex", () => {
    const mem = memory([
      [0x9000, 0xcd],
      [0x9001, 0x5a],
      [0x9002, 0xbb],
    ])
    const [row] = buildDisasmRows({
      read: mem,
      base: 0x9000,
      instructionOffset: 0,
      instructionCount: 1,
    })
    expect(row?.text).toBe("CALL #BB5A")
  })

  it("invents an Lxxxx label for an in-window branch target", () => {
    // JR +2 lands on the RET; the target row gets the synthetic label and the
    // operand is rewritten to it.
    const mem = memory([
      [0x8000, 0x18], // JR
      [0x8001, 0x01], // +1 → 0x8003
      [0x8002, 0x00], // NOP
      [0x8003, 0xc9], // RET (target)
    ])
    const rows = buildDisasmRows({
      read: mem,
      base: 0x8000,
      instructionOffset: 0,
      instructionCount: 4,
    })
    expect(rows[0]?.text).toBe("JR L8003")
    // Rows: JR@8000, NOP@8002, RET@8003 (target), NOP@8004 — the def is on the RET.
    expect(rows[2]?.label).toBe("L8003")
  })

  it("represents near-zero placeholder rows", () => {
    const rows = buildDisasmRows({
      read: memory([]),
      base: 0x0000,
      instructionOffset: -1,
      instructionCount: 2,
    })
    expect(rows[0]).toEqual({
      addr: 0xffff,
      address: "FFFF",
      bytes: "",
      text: "...",
      isPc: false,
      executed: false,
      data: false,
    })
  })

  it("marks un-executed instructions as data when coverage is known (not the PC)", () => {
    // Coverage known: bit set only for 0x8003 (RET). PC sits at 0x8000.
    const bits = new Uint8Array(8192)
    bits[0x8003 >> 3] = 1 << (0x8003 & 7)
    const codemapHex = [...bits].map((b) => b.toString(16).padStart(2, "0")).join("")
    const rows = buildDisasmRows({
      read: PROGRAM,
      base: 0x8000,
      instructionOffset: 0,
      instructionCount: 3,
      pc: 0x8000,
      codemapHex,
    })
    // 0x8000 = PC (code), 0x8002 = never reached (data), 0x8003 = executed (code).
    expect(rows.map((r) => r.data)).toEqual([false, true, false])
    // The data row is rendered as a DB directive, not a decoded mnemonic.
    expect(rows[0]?.text).toBe("LD A,#00")
    expect(rows[1]?.text).toBe("DB #3C")
    expect(rows[2]?.text).toBe("RET")
  })

  it("never marks data without coverage (can't tell code from data)", () => {
    const rows = buildDisasmRows({
      read: PROGRAM,
      base: 0x8000,
      instructionOffset: 0,
      instructionCount: 3,
    })
    expect(rows.every((r) => r.data === false)).toBe(true)
  })
})

describe("stepBase", () => {
  it("advances by whole instructions when paging down", () => {
    // 0x8000 → past LD A (2 bytes) = 0x8002, → past two more = INC A then RET.
    expect(stepBase(PROGRAM, 0x8000, 1)).toBe(0x8002)
    expect(stepBase(PROGRAM, 0x8000, 2)).toBe(0x8003)
  })

  it("re-derives instructions above base when paging up", () => {
    // One instruction before 0x8002 is the LD A at 0x8000.
    expect(stepBase(PROGRAM, 0x8002, -1)).toBe(0x8000)
  })

  it("is a no-op for a zero delta", () => {
    expect(stepBase(PROGRAM, 0x8002, 0)).toBe(0x8002)
  })
})
