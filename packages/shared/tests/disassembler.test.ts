import { describe, expect, it } from "vitest"
import { decodeInstruction, disassemble } from "../src/disassembler.js"

/** Helper: decode a single instruction at `address` and return just its text. */
const text = (bytes: number[], address = 0): string => decodeInstruction(bytes, address).text
/** Helper: decode a single instruction and return its byte length. */
const len = (bytes: number[], address = 0): number => decodeInstruction(bytes, address).bytes.length

describe("decodeInstruction — main opcode table", () => {
  it("decodes simple single-byte opcodes", () => {
    expect(text([0x00])).toBe("NOP")
    expect(len([0x00])).toBe(1)
    expect(text([0x08])).toBe("EX AF,AF'")
    expect(text([0x76])).toBe("HALT")
    expect(text([0xc9])).toBe("RET")
    expect(text([0xe9])).toBe("JP (HL)")
    expect(text([0xfb])).toBe("EI")
    expect(text([0xf3])).toBe("DI")
    expect(text([0xeb])).toBe("EX DE,HL")
    expect(text([0xd9])).toBe("EXX")
  })

  it("decodes the accumulator/flag group (0x07..0x3F, z=7)", () => {
    expect(text([0x07])).toBe("RLCA")
    expect(text([0x0f])).toBe("RRCA")
    expect(text([0x17])).toBe("RLA")
    expect(text([0x1f])).toBe("RRA")
    expect(text([0x27])).toBe("DAA")
    expect(text([0x2f])).toBe("CPL")
    expect(text([0x37])).toBe("SCF")
    expect(text([0x3f])).toBe("CCF")
  })

  it("decodes 8-bit immediate loads (LD r,n)", () => {
    expect(text([0x06, 0x12])).toBe("LD B,0x12")
    expect(len([0x06, 0x12])).toBe(2)
    expect(text([0x3e, 0xff])).toBe("LD A,0xFF")
    expect(text([0x36, 0x40])).toBe("LD (HL),0x40")
  })

  it("decodes 16-bit immediate loads (LD rp,nn)", () => {
    expect(text([0x01, 0x34, 0x12])).toBe("LD BC,0x1234")
    expect(len([0x01, 0x34, 0x12])).toBe(3)
    expect(text([0x21, 0x00, 0xc0])).toBe("LD HL,0xC000")
    expect(text([0x31, 0xff, 0xff])).toBe("LD SP,0xFFFF")
  })

  it("decodes memory loads with absolute addresses", () => {
    expect(text([0x02])).toBe("LD (BC),A")
    expect(text([0x12])).toBe("LD (DE),A")
    expect(text([0x0a])).toBe("LD A,(BC)")
    expect(text([0x22, 0x00, 0x80])).toBe("LD (0x8000),HL")
    expect(text([0x2a, 0x00, 0x80])).toBe("LD HL,(0x8000)")
    expect(text([0x32, 0x34, 0x12])).toBe("LD (0x1234),A")
    expect(text([0x3a, 0x34, 0x12])).toBe("LD A,(0x1234)")
  })

  it("decodes inc/dec on registers and pairs", () => {
    expect(text([0x03])).toBe("INC BC")
    expect(text([0x0b])).toBe("DEC BC")
    expect(text([0x04])).toBe("INC B")
    expect(text([0x05])).toBe("DEC B")
    expect(text([0x34])).toBe("INC (HL)")
    expect(text([0x35])).toBe("DEC (HL)")
    expect(text([0x09])).toBe("ADD HL,BC")
    expect(text([0x39])).toBe("ADD HL,SP")
  })

  it("decodes LD r,r' (x=1) and HALT", () => {
    expect(text([0x40])).toBe("LD B,B")
    expect(text([0x47])).toBe("LD B,A")
    expect(text([0x7e])).toBe("LD A,(HL)")
    expect(text([0x70])).toBe("LD (HL),B")
    expect(text([0x76])).toBe("HALT") // would be LD (HL),(HL) but is HALT
  })

  it("decodes the ALU group (x=2 register, x=3 immediate)", () => {
    expect(text([0x80])).toBe("ADD A,B")
    expect(text([0x88])).toBe("ADC A,B")
    expect(text([0x90])).toBe("SUB B")
    expect(text([0x98])).toBe("SBC A,B")
    expect(text([0xa0])).toBe("AND B")
    expect(text([0xa8])).toBe("XOR B")
    expect(text([0xb0])).toBe("OR B")
    expect(text([0xb8])).toBe("CP B")
    expect(text([0x86])).toBe("ADD A,(HL)")
    expect(text([0xc6, 0x05])).toBe("ADD A,0x05")
    expect(text([0xfe, 0x10])).toBe("CP 0x10")
  })

  it("decodes relative jumps resolved to absolute targets", () => {
    // JR d at 0x0100, d = 0xFE (-2) -> 0x0100 (target = addr + 2 + d)
    expect(text([0x18, 0xfe], 0x0100)).toBe("JR 0x0100")
    expect(len([0x18, 0xfe])).toBe(2)
    // DJNZ d at 0x0200, d = 0x10 (+16) -> 0x0212
    expect(text([0x10, 0x10], 0x0200)).toBe("DJNZ 0x0212")
    // JR NZ,d at 0x0000, d = 0x05 -> 0x0007
    expect(text([0x20, 0x05], 0x0000)).toBe("JR NZ,0x0007")
    expect(text([0x38, 0x7f], 0x1000)).toBe("JR C,0x1081")
  })

  it("decodes absolute jumps, calls, conditionals and returns", () => {
    expect(text([0xc3, 0x00, 0x40])).toBe("JP 0x4000")
    expect(text([0xc2, 0x00, 0x40])).toBe("JP NZ,0x4000")
    expect(text([0xda, 0x34, 0x12])).toBe("JP C,0x1234")
    expect(text([0xcd, 0x00, 0xbb])).toBe("CALL 0xBB00")
    expect(text([0xc4, 0x00, 0xbb])).toBe("CALL NZ,0xBB00")
    expect(text([0xc0])).toBe("RET NZ")
    expect(text([0xc8])).toBe("RET Z")
  })

  it("decodes push/pop, I/O and RST", () => {
    expect(text([0xc1])).toBe("POP BC")
    expect(text([0xf1])).toBe("POP AF")
    expect(text([0xc5])).toBe("PUSH BC")
    expect(text([0xf5])).toBe("PUSH AF")
    expect(text([0xd3, 0x7f])).toBe("OUT (0x7F),A")
    expect(text([0xdb, 0x00])).toBe("IN A,(0x00)")
    expect(text([0xc7])).toBe("RST 0x00")
    expect(text([0xff])).toBe("RST 0x38")
    expect(text([0xe3])).toBe("EX (SP),HL")
    expect(text([0xf9])).toBe("LD SP,HL")
  })
})

describe("decodeInstruction — CB-prefixed (rotate/shift/bit)", () => {
  it("decodes rotates and shifts", () => {
    expect(text([0xcb, 0x00])).toBe("RLC B")
    expect(len([0xcb, 0x00])).toBe(2)
    expect(text([0xcb, 0x06])).toBe("RLC (HL)")
    expect(text([0xcb, 0x17])).toBe("RL A")
    expect(text([0xcb, 0x3f])).toBe("SRL A")
    expect(text([0xcb, 0x30])).toBe("SLL B") // undocumented
  })

  it("decodes BIT/RES/SET", () => {
    expect(text([0xcb, 0x40])).toBe("BIT 0,B")
    expect(text([0xcb, 0x7e])).toBe("BIT 7,(HL)")
    expect(text([0xcb, 0x86])).toBe("RES 0,(HL)")
    expect(text([0xcb, 0xff])).toBe("SET 7,A")
  })
})

describe("decodeInstruction — ED-prefixed (extended)", () => {
  it("decodes the misc / interrupt-mode group", () => {
    expect(text([0xed, 0x44])).toBe("NEG")
    expect(text([0xed, 0x4d])).toBe("RETI")
    expect(text([0xed, 0x45])).toBe("RETN")
    expect(text([0xed, 0x46])).toBe("IM 0")
    expect(text([0xed, 0x56])).toBe("IM 1")
    expect(text([0xed, 0x5e])).toBe("IM 2")
    expect(text([0xed, 0x57])).toBe("LD A,I")
    expect(text([0xed, 0x47])).toBe("LD I,A")
    expect(text([0xed, 0x5f])).toBe("LD A,R")
    expect(text([0xed, 0x4f])).toBe("LD R,A")
    expect(text([0xed, 0x67])).toBe("RRD")
    expect(text([0xed, 0x6f])).toBe("RLD")
  })

  it("decodes 16-bit arithmetic, I/O and load-from-memory", () => {
    expect(text([0xed, 0x42])).toBe("SBC HL,BC")
    expect(text([0xed, 0x4a])).toBe("ADC HL,BC")
    expect(text([0xed, 0x40])).toBe("IN B,(C)")
    expect(text([0xed, 0x41])).toBe("OUT (C),B")
    expect(text([0xed, 0x43, 0x00, 0x80])).toBe("LD (0x8000),BC")
    expect(len([0xed, 0x43, 0x00, 0x80])).toBe(4)
    expect(text([0xed, 0x4b, 0x00, 0x80])).toBe("LD BC,(0x8000)")
  })

  it("decodes block instructions", () => {
    expect(text([0xed, 0xa0])).toBe("LDI")
    expect(text([0xed, 0xb0])).toBe("LDIR")
    expect(text([0xed, 0xb8])).toBe("LDDR")
    expect(text([0xed, 0xb1])).toBe("CPIR")
    expect(text([0xed, 0xba])).toBe("INDR")
    expect(text([0xed, 0xbb])).toBe("OTDR")
  })

  it("renders unassigned ED opcodes as DB pseudo-ops", () => {
    expect(text([0xed, 0x00])).toBe("DB 0xED,0x00")
    expect(len([0xed, 0x00])).toBe(2)
  })
})

describe("decodeInstruction — DD/FD-prefixed (IX/IY)", () => {
  it("decodes 16-bit IX/IY operations", () => {
    expect(text([0xdd, 0x21, 0x00, 0x80])).toBe("LD IX,0x8000")
    expect(len([0xdd, 0x21, 0x00, 0x80])).toBe(4)
    expect(text([0xfd, 0x21, 0x00, 0x80])).toBe("LD IY,0x8000")
    expect(text([0xdd, 0x09])).toBe("ADD IX,BC")
    expect(text([0xdd, 0x29])).toBe("ADD IX,IX")
    expect(text([0xdd, 0x23])).toBe("INC IX")
    expect(text([0xdd, 0x2b])).toBe("DEC IX")
    expect(text([0xdd, 0xe5])).toBe("PUSH IX")
    expect(text([0xdd, 0xe1])).toBe("POP IX")
    expect(text([0xdd, 0xe9])).toBe("JP (IX)")
    expect(text([0xdd, 0xe3])).toBe("EX (SP),IX")
    expect(text([0xfd, 0xf9])).toBe("LD SP,IY")
  })

  it("decodes indexed memory operands with signed displacement", () => {
    expect(text([0xdd, 0x7e, 0x05])).toBe("LD A,(IX+0x05)")
    expect(len([0xdd, 0x7e, 0x05])).toBe(3)
    expect(text([0xdd, 0x70, 0xff])).toBe("LD (IX-0x01),B")
    expect(text([0xfd, 0x7e, 0x05])).toBe("LD A,(IY+0x05)")
    expect(text([0xdd, 0x34, 0x02])).toBe("INC (IX+0x02)")
    expect(text([0xdd, 0x86, 0x04])).toBe("ADD A,(IX+0x04)")
    expect(text([0xdd, 0x36, 0x05, 0x40])).toBe("LD (IX+0x05),0x40")
    expect(len([0xdd, 0x36, 0x05, 0x40])).toBe(4)
  })

  it("decodes DDCB / FDCB bit operations on indexed memory", () => {
    expect(text([0xdd, 0xcb, 0x05, 0x06])).toBe("RLC (IX+0x05)")
    expect(len([0xdd, 0xcb, 0x05, 0x06])).toBe(4)
    expect(text([0xdd, 0xcb, 0x05, 0x46])).toBe("BIT 0,(IX+0x05)")
    expect(text([0xfd, 0xcb, 0xff, 0xc6])).toBe("SET 0,(IY-0x01)")
  })
})

describe("disassemble — sequences", () => {
  it("decodes a run of instructions with running addresses", () => {
    // ORG 0x4000: LD HL,0xC000 ; LD A,0x00 ; RET
    const bytes = [0x21, 0x00, 0xc0, 0x3e, 0x00, 0xc9]
    const out = disassemble(bytes, 0x4000, 3)
    expect(out).toEqual([
      { address: 0x4000, bytes: [0x21, 0x00, 0xc0], text: "LD HL,0xC000" },
      { address: 0x4003, bytes: [0x3e, 0x00], text: "LD A,0x00" },
      { address: 0x4005, bytes: [0xc9], text: "RET" },
    ])
  })

  it("stops cleanly when the buffer is exhausted mid-stream", () => {
    const out = disassemble([0x00, 0x00], 0x0000, 10)
    expect(out).toHaveLength(2)
  })

  it("emits a DB pseudo-op when operand bytes are truncated", () => {
    // lone 0x21 (LD HL,nn) with no operand bytes -> DB
    expect(text([0x21])).toBe("DB 0x21")
    expect(len([0x21])).toBe(1)
  })
})
