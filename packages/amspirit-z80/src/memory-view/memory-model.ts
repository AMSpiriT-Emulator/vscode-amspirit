/** Options controlling how a flat byte buffer is laid out into rows. */
export interface MemoryRowsOptions {
  /** 16-bit address of the first byte. */
  base: number
  /** Bytes per row (e.g. 8 or 16). */
  columns: number
}

/** One rendered row of the memory view (rendering-agnostic: React/HTML consume it). */
export interface MemoryRow {
  /** `0x`-prefixed, upper-case, 4-digit hex address of the row's first byte. */
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

const rowAddr = (n: number): string =>
  `0x${(n & 0xffff).toString(16).toUpperCase().padStart(4, "0")}`
const byteHex = (n: number): string => (n & 0xff).toString(16).padStart(2, "0")
const asciiChar = (n: number): string => (n >= 0x20 && n < 0x7f ? String.fromCharCode(n) : ".")

/**
 * Lay a flat byte buffer out into `columns`-wide rows starting at `base`.
 * Pure and rendering-agnostic; the row address wraps the 16-bit space.
 */
export function buildMemoryRows(bytes: readonly number[], opts: MemoryRowsOptions): MemoryRow[] {
  const { base, columns } = opts
  const rows: MemoryRow[] = []
  for (let offset = 0; offset < bytes.length; offset += columns) {
    const slice = bytes.slice(offset, offset + columns)
    rows.push({
      address: rowAddr(base + offset),
      hex: slice.map(byteHex),
      ascii: slice.map(asciiChar).join(""),
    })
  }
  return rows
}
