/** Options controlling how a flat byte buffer is laid out into rows. */
export interface MemoryRowsOptions {
  /** 16-bit address of the first byte. */
  base: number
  /** Bytes per row (e.g. 8 or 16). */
  columns: number
}

/** One rendered row of the memory view (rendering-agnostic: React/HTML consume it). */
export interface MemoryRow {
  /** 16-bit address of the row's first byte (for offset/flash math). */
  addr: number
  /** Display form of {@link addr}: bare, upper-case, 4-digit hex (no prefix). */
  address: string
  /** Lower-case two-digit hex for each byte in the row. */
  hex: string[]
  /** Printable ASCII (0x20–0x7e); other bytes render as `.`. */
  ascii: string
}

/**
 * Parse a user-entered address into a 16-bit value. Accepts bare hex (`C000`),
 * `0x`-prefixed and Amstrad `&`-prefixed hex, case-insensitively. Returns
 * `undefined` for anything that isn't hex.
 */
export function parseAddress(input: string): number | undefined {
  const trimmed = input.trim().replace(/^(0x|&)/i, "")
  if (trimmed === "" || !/^[0-9a-f]+$/i.test(trimmed)) return undefined
  return Number.parseInt(trimmed, 16) & 0xffff
}

/** Bare, upper-case, 4-digit hex (no `0x`/`&` prefix) for display. */
const hex16 = (n: number): string => (n & 0xffff).toString(16).toUpperCase().padStart(4, "0")

/** One entry in the Memory View's bank/view selector. */
export interface BankOption {
  /** Stable id used as the `<select>` value and `selectBank` message payload. */
  id: string
  /** Human label shown in the dropdown. */
  label: string
  /** `/api/ram` bank: 0 = central RAM, 1..N = extended page N-1. */
  bank: number
  /** Read the CPU-visible mapping (ROM mapped in) rather than the raw bank. */
  cpuView: boolean
}

/**
 * The memory views selectable for a machine with `extendedRamKb` of expansion
 * RAM: always the CPU-visible view and the raw main 64 KB, plus one extended
 * bank per 64 KB of expansion. Pure; the panel derives `extendedRamKb` from
 * `/api/config` so the bank count matches the actual machine.
 */
export function memoryBanks(extendedRamKb: number): BankOption[] {
  const banks: BankOption[] = [
    { id: "cpu", label: "CPU view", bank: 0, cpuView: true },
    { id: "ram", label: "Main RAM", bank: 0, cpuView: false },
  ]
  const pages = Math.max(0, Math.floor(extendedRamKb / 64))
  for (let p = 1; p <= pages; p += 1) {
    banks.push({ id: `bank${p}`, label: `Bank ${p}`, bank: p, cpuView: false })
  }
  return banks
}
const byteHex = (n: number): string => (n & 0xff).toString(16).padStart(2, "0")
const asciiChar = (n: number): string => (n >= 0x20 && n < 0x7f ? String.fromCharCode(n) : ".")

/** The 16-bit pointer registers whose target byte can be highlighted in the grid. */
export interface PointerRegisterValues {
  BC: number
  DE: number
  HL: number
  IX: number
  IY: number
  SP: number
  PC: number
}

/** One highlighted byte: the register(s) pointing at it, by window offset. */
export interface PointerMark {
  /** 0-based byte offset into the window. */
  offset: number
  /** Register names pointing at this byte, in canonical order. */
  registers: string[]
}

/** Canonical render order for the pointer registers (matches the Registers view). */
const POINTER_ORDER: readonly (keyof PointerRegisterValues)[] = [
  "BC",
  "DE",
  "HL",
  "IX",
  "IY",
  "SP",
  "PC",
]

/**
 * Map the pointer registers that fall inside the `[base, base + length)` window
 * (16-bit wrapping) to their byte offset, grouping registers that share a byte.
 * Pure; the grid renders a highlight + tooltip per returned offset.
 */
export function pointerMarks(
  regs: PointerRegisterValues,
  opts: { base: number; length: number },
): PointerMark[] {
  const { base, length } = opts
  const byOffset = new Map<number, string[]>()
  for (const name of POINTER_ORDER) {
    const offset = (regs[name] - base) & 0xffff
    if (offset >= length) continue
    const at = byOffset.get(offset)
    if (at) at.push(name)
    else byOffset.set(offset, [name])
  }
  return [...byOffset.entries()]
    .sort(([a], [b]) => a - b)
    .map(([offset, registers]) => ({ offset, registers }))
}

/**
 * The window base that centres a `windowBytes`-tall view on `pc`, aligned down
 * to a `columns`-wide row so the layout stays stable as PC moves. Wraps the
 * 16-bit space. Used by the "Follow PC" mode.
 */
export function followBase(pc: number, windowBytes: number, columns: number): number {
  const start = (pc - (windowBytes >> 1)) & 0xffff
  return start & ~(columns - 1) & 0xffff
}

/**
 * The base after scrolling by `deltaRows` rows of `columns` bytes (negative =
 * up). Wraps the 16-bit space. Used by mouse-wheel / keyboard navigation.
 */
export function scrollBase(base: number, deltaRows: number, columns: number): number {
  return (base + deltaRows * columns) & 0xffff
}

/**
 * Parse one or two hex digits into a byte (0–255), or `undefined` if the input
 * isn't 1–2 hex chars. Used to commit an inline byte edit.
 */
export function parseByte(input: string): number | undefined {
  const trimmed = input.trim()
  if (!/^[0-9a-f]{1,2}$/i.test(trimmed)) return undefined
  return Number.parseInt(trimmed, 16) & 0xff
}

/**
 * Given the emulator's 64K-bit execution bitmap (`/api/codemap`, 8192 bytes as
 * hex — bit `addr` set once an instruction has started at `addr`), return the
 * window offsets in `[0, length)` whose address has been executed by the Z80.
 * Pure; the grid shades those bytes as "code". 16-bit wrapping.
 */
export function executedOffsets(bitmapHex: string, base: number, length: number): number[] {
  const offsets: number[] = []
  if (bitmapHex.length < 16384) return offsets
  for (let offset = 0; offset < length; offset += 1) {
    const addr = (base + offset) & 0xffff
    const byte = Number.parseInt(bitmapHex.substr((addr >> 3) * 2, 2), 16)
    if ((byte >> (addr & 7)) & 1) offsets.push(offset)
  }
  return offsets
}

/**
 * Lay a flat byte buffer out into `columns`-wide rows starting at `base`.
 * Pure and rendering-agnostic; the row address wraps the 16-bit space.
 */
export function buildMemoryRows(bytes: readonly number[], opts: MemoryRowsOptions): MemoryRow[] {
  const { base, columns } = opts
  const rows: MemoryRow[] = []
  for (let offset = 0; offset < bytes.length; offset += columns) {
    const slice = bytes.slice(offset, offset + columns)
    const addr = (base + offset) & 0xffff
    rows.push({
      addr,
      address: hex16(addr),
      hex: slice.map(byteHex),
      ascii: slice.map(asciiChar).join(""),
    })
  }
  return rows
}
