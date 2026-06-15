/**
 * Pure Z80 disassembler for the memory/disassembly webview. Decodes raw bytes
 * into mnemonics using the regular octal decomposition of the instruction set
 * (x/y/z/p/q fields) rather than a giant literal table, so the logic stays
 * compact and fully testable. Operands are rendered as `0xNN` / `0xNNNN`;
 * relative jumps are resolved to their absolute target address. Covers the
 * main table plus the CB, ED and DD/FD (IX/IY, incl. DDCB/FDCB) prefixes.
 */

export interface DisasmInstruction {
  /** Address of the instruction's first byte. */
  address: number
  /** Raw bytes consumed by the instruction. */
  bytes: number[]
  /** Rendered mnemonic, e.g. `LD HL,0xC000`. */
  text: string
}

/** `undefined` = plain HL context; otherwise an IX/IY-prefixed instruction. */
type Index = "IX" | "IY" | undefined

const r = ["B", "C", "D", "E", "H", "L", "(HL)", "A"]
const rp = ["BC", "DE", "HL", "SP"]
const rp2 = ["BC", "DE", "HL", "AF"]
const cc = ["NZ", "Z", "NC", "C", "PO", "PE", "P", "M"]
const alu = ["ADD A,", "ADC A,", "SUB ", "SBC A,", "AND ", "XOR ", "OR ", "CP "]
const accFlag = ["RLCA", "RRCA", "RLA", "RRA", "DAA", "CPL", "SCF", "CCF"]
const rot = ["RLC", "RRC", "RL", "RR", "SLA", "SRA", "SLL", "SRL"]
const im = ["0", "0", "1", "2", "0", "0", "1", "2"]
const edAcc = ["LD I,A", "LD R,A", "LD A,I", "LD A,R", "RRD", "RLD", "NOP", "NOP"]
// Block instructions: bli[y-4][z], for x=2 z<=3 y>=4.
const bli = [
  ["LDI", "CPI", "INI", "OUTI"],
  ["LDD", "CPD", "IND", "OUTD"],
  ["LDIR", "CPIR", "INIR", "OTIR"],
  ["LDDR", "CPDR", "INDR", "OTDR"],
]

const byte = (n: number): string => `0x${(n & 0xff).toString(16).toUpperCase().padStart(2, "0")}`
const word = (n: number): string => `0x${(n & 0xffff).toString(16).toUpperCase().padStart(4, "0")}`
/** Signed 8-bit interpretation of a byte (for relative/index displacements). */
const signed = (n: number): number => (n & 0x80 ? (n & 0xff) - 0x100 : n & 0xff)
/** Render an index displacement, e.g. `(IX+0x05)` / `(IY-0x01)`. */
const indexed = (ix: "IX" | "IY", d: number): string =>
  `(${ix}${d < 0 ? "-" : "+"}${byte(Math.abs(d))})`

/** Reads operand bytes from a buffer at a moving cursor; throws when truncated. */
class Cursor {
  constructor(
    private readonly buf: number[],
    public pos: number,
  ) {}
  next(): number {
    const v = this.buf[this.pos]
    if (v === undefined) throw new TruncatedError()
    this.pos += 1
    return v
  }
  /** 16-bit little-endian immediate. */
  word(): number {
    const lo = this.next()
    const hi = this.next()
    return (hi << 8) | lo
  }
}

class TruncatedError extends Error {}

/**
 * Decode a single instruction starting at `bytes[0]`, located at `address`.
 * Returns its text and the bytes it consumes. On a truncated operand the
 * leading byte is emitted as a `DB 0xNN` pseudo-op.
 */
export function decodeInstruction(bytes: number[], address = 0): DisasmInstruction {
  const c = new Cursor(bytes, 0)
  try {
    const text = decodeOp(c, address)
    return { address, bytes: bytes.slice(0, c.pos), text }
  } catch (e) {
    if (e instanceof TruncatedError) {
      const first = bytes[0] ?? 0
      return { address, bytes: [first], text: `DB ${byte(first)}` }
    }
    throw e
  }
}

/**
 * Decode up to `count` instructions from `bytes`, the first byte mapping to
 * `baseAddress`. Stops early when the buffer is exhausted.
 */
export function disassemble(
  bytes: number[],
  baseAddress: number,
  count: number,
): DisasmInstruction[] {
  const out: DisasmInstruction[] = []
  let offset = 0
  for (let i = 0; i < count && offset < bytes.length; i += 1) {
    const ins = decodeInstruction(bytes.slice(offset), (baseAddress + offset) & 0xffff)
    out.push(ins)
    offset += ins.bytes.length
  }
  return out
}

/** Dispatch on the (possibly prefixed) opcode. */
function decodeOp(c: Cursor, address: number): string {
  const op = c.next()
  if (op === 0xcb) return decodeCB(c.next(), undefined, 0)
  if (op === 0xed) return decodeED(c)
  if (op === 0xdd) return decodePrefixed(c, address, "IX")
  if (op === 0xfd) return decodePrefixed(c, address, "IY")
  return decodeMain(op, c, address, undefined)
}

/** DD/FD prefix: re-decode the next opcode in an IX/IY context. */
function decodePrefixed(c: Cursor, address: number, ix: "IX" | "IY"): string {
  const op = c.next()
  if (op === 0xcb) {
    // DDCB/FDCB layout: prefix, CB, displacement, opcode.
    const d = signed(c.next())
    return decodeCB(c.next(), ix, d)
  }
  return decodeMain(op, c, address, ix)
}

function decodeMain(op: number, c: Cursor, address: number, ix: Index): string {
  const x = op >> 6
  const y = (op >> 3) & 7
  const z = op & 7
  const p = y >> 1
  const q = y & 1
  // Relative target = address + (bytes consumed so far + 1 displacement byte).
  const rel = (): string => {
    const d = signed(c.next())
    return word((address + c.pos + d) & 0xffff)
  }
  // 16-bit pair name with HL substituted by IX/IY under a DD/FD prefix.
  const pair = (table: string[], idx: number): string =>
    ix && table[idx] === "HL" ? ix : (table[idx] as string)
  // 8-bit register name. `mem` = the instruction also has an (HL) operand, in
  // which case the H/L halves keep their plain names (undocumented Z80 rule).
  const reg = (idx: number, mem: boolean): string => {
    if (!ix) return r[idx] as string
    if (idx === 6) return indexed(ix, signed(c.next()))
    if (idx === 4 && !mem) return `${ix}H`
    if (idx === 5 && !mem) return `${ix}L`
    return r[idx] as string
  }

  if (x === 0) {
    switch (z) {
      case 0:
        if (y === 0) return "NOP"
        if (y === 1) return "EX AF,AF'"
        if (y === 2) return `DJNZ ${rel()}`
        if (y === 3) return `JR ${rel()}`
        return `JR ${cc[y - 4]},${rel()}`
      case 1:
        return q === 0 ? `LD ${pair(rp, p)},${word(c.word())}` : `ADD ${ix ?? "HL"},${pair(rp, p)}`
      case 2:
        return decodeIndirectLoad(p, q, c, ix)
      case 3:
        return q === 0 ? `INC ${pair(rp, p)}` : `DEC ${pair(rp, p)}`
      case 4:
        return `INC ${reg(y, false)}`
      case 5:
        return `DEC ${reg(y, false)}`
      case 6: {
        const dst = reg(y, false)
        return `LD ${dst},${byte(c.next())}`
      }
      default:
        return accFlag[y] as string
    }
  }
  if (x === 1) {
    if (z === 6 && y === 6) return "HALT"
    const mem = y === 6 || z === 6
    return `LD ${reg(y, mem)},${reg(z, mem)}`
  }
  if (x === 2) {
    return `${alu[y]}${reg(z, z === 6)}`
  }
  return decodeX3(y, z, p, q, c, ix)
}

function decodeIndirectLoad(p: number, q: number, c: Cursor, ix: Index): string {
  const hl = ix ?? "HL"
  if (q === 0) {
    if (p === 0) return "LD (BC),A"
    if (p === 1) return "LD (DE),A"
    if (p === 2) return `LD (${word(c.word())}),${hl}`
    return `LD (${word(c.word())}),A`
  }
  if (p === 0) return "LD A,(BC)"
  if (p === 1) return "LD A,(DE)"
  if (p === 2) return `LD ${hl},(${word(c.word())})`
  return `LD A,(${word(c.word())})`
}

function decodeX3(y: number, z: number, p: number, q: number, c: Cursor, ix: Index): string {
  const hl = ix ?? "HL"
  const pair2 = (idx: number): string => (ix && rp2[idx] === "HL" ? ix : (rp2[idx] as string))
  switch (z) {
    case 0:
      return `RET ${cc[y]}`
    case 1:
      if (q === 0) return `POP ${pair2(p)}`
      if (p === 0) return "RET"
      if (p === 1) return "EXX"
      if (p === 2) return `JP (${hl})`
      return `LD SP,${hl}`
    case 2:
      return `JP ${cc[y]},${word(c.word())}`
    case 3:
      if (y === 0) return `JP ${word(c.word())}`
      if (y === 2) return `OUT (${byte(c.next())}),A`
      if (y === 3) return `IN A,(${byte(c.next())})`
      if (y === 4) return `EX (SP),${hl}`
      if (y === 5) return "EX DE,HL"
      if (y === 6) return "DI"
      return "EI"
    case 4:
      return `CALL ${cc[y]},${word(c.word())}`
    case 5:
      if (q === 0) return `PUSH ${pair2(p)}`
      return `CALL ${word(c.word())}`
    case 6:
      return `${alu[y]}${byte(c.next())}`
    default:
      return `RST ${byte(y * 8)}`
  }
}

/**
 * Decode a CB-prefixed opcode. Under a DD/FD prefix (`ix` set) the operand is
 * the indexed memory cell `(IX+d)` regardless of the opcode's register field.
 */
function decodeCB(op: number, ix: Index, d: number): string {
  const x = op >> 6
  const y = (op >> 3) & 7
  const z = op & 7
  const target = ix ? indexed(ix, d) : (r[z] as string)
  if (x === 0) return `${rot[y]} ${target}`
  if (x === 1) return `BIT ${y},${target}`
  if (x === 2) return `RES ${y},${target}`
  return `SET ${y},${target}`
}

function decodeED(c: Cursor): string {
  const op = c.next()
  const x = op >> 6
  const y = (op >> 3) & 7
  const z = op & 7
  const p = y >> 1
  const q = y & 1
  if (x === 1) {
    switch (z) {
      case 0:
        return y === 6 ? "IN (C)" : `IN ${r[y]},(C)`
      case 1:
        return y === 6 ? "OUT (C),0" : `OUT (C),${r[y]}`
      case 2:
        return q === 0 ? `SBC HL,${rp[p]}` : `ADC HL,${rp[p]}`
      case 3:
        return q === 0 ? `LD (${word(c.word())}),${rp[p]}` : `LD ${rp[p]},(${word(c.word())})`
      case 4:
        return "NEG"
      case 5:
        return y === 1 ? "RETI" : "RETN"
      case 6:
        return `IM ${im[y]}`
      default:
        return edAcc[y] as string
    }
  }
  if (x === 2 && z <= 3 && y >= 4) {
    return bli[y - 4]?.[z] as string
  }
  return `DB 0xED,${byte(op)}`
}
