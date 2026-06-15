/**
 * Pure decoder for Locomotive BASIC variables out of raw CPC RAM.
 *
 * Ported from the amspirit-lite web debugger (`parseBasicVars`). Variables live
 * in 27 chains anchored at `chain_heads_addr` (A–Z plus the `FN ` chain). Each
 * node stores the **full** name (every character, the last with bit 7 set), a
 * type byte, then the value — the first-letter chain is just an index, so the
 * name is read straight from the node (do NOT re-prepend the chain letter, that
 * doubled it to `AA`). String values aren't inlined — the node holds a
 * length+address descriptor, so the caller resolves the text with a follow-up
 * RAM read (see {@link decodeCpcString}).
 */

type BasicVarType = "int" | "string" | "real" | "deffn" | "unknown"

export interface BasicVar {
  /** Display name including type sigil, e.g. `A%`, `MSG$`, `X`. */
  name: string
  /** Name without the type sigil. */
  baseName: string
  type: BasicVarType
  /** Formatted value. For strings this is a placeholder until content is read. */
  value: string
  /** String length (type `string` only). */
  strLen: number
  /** String content address (type `string` only). */
  strAddr: number
  /** Variable record address (the chain pointer), for diagnostics. */
  addr: number
}

const byte = (b: readonly number[], i: number): number => b[i] ?? 0

/** Decode a 5-byte Locomotive BASIC float at offset `o` into a display string. */
export function decodeCpcFloat(b: readonly number[], o: number): string {
  const exp = byte(b, o + 4)
  if (exp === 0) return "0"
  const sign = byte(b, o + 3) & 0x80 ? -1 : 1
  // Restore the implied MSB by forcing bit 7 of the top mantissa byte to 1.
  const m32 =
    (byte(b, o + 3) | 0x80) * 16777216 + byte(b, o + 2) * 65536 + byte(b, o + 1) * 256 + byte(b, o)
  const mantissa = m32 / 4294967296
  const v = sign * mantissa * 2 ** (exp - 128)
  if (v === 0) return "0"
  const a = Math.abs(v)
  return a >= 0.001 && a < 1e10
    ? Number.parseFloat(v.toPrecision(9)).toString()
    : v.toExponential(6)
}

/** Decode raw CPC string bytes (printable ASCII) into a JS string. */
export function decodeCpcString(bytes: readonly number[]): string {
  let s = ""
  for (const b of bytes) s += String.fromCharCode(b & 0x7f)
  return s
}

/**
 * Walk the 27 variable chains and decode each node.
 * @param chainBytes 54 bytes read from `chain_heads_addr` (27 × 2-byte LE offset)
 * @param varBytes   variable zone read starting at `txttop`
 */
export function parseBasicVars(
  chainBytes: readonly number[],
  varBytes: readonly number[],
): BasicVar[] {
  const vars: BasicVar[] = []
  const visited = new Set<number>()

  for (let i = 0; i < 27; i++) {
    let ptr = byte(chainBytes, i * 2) | (byte(chainBytes, i * 2 + 1) << 8)
    let safety = 0

    while (ptr !== 0 && safety++ < 200) {
      if (visited.has(ptr)) break
      visited.add(ptr)

      const rel = ptr - 1 // absolute = (txttop-1)+ptr  →  index = ptr-1
      if (rel < 0 || rel + 3 > varBytes.length) break

      const next = byte(varBytes, rel) | (byte(varBytes, rel + 1) << 8)

      // Full name: ASCII bytes, last byte has bit 7 set.
      let pos = rel + 2
      let name = ""
      while (pos < varBytes.length) {
        const ch = byte(varBytes, pos++)
        name += String.fromCharCode(ch & 0x7f)
        if (ch & 0x80) break
      }
      // biome-ignore lint/suspicious/noControlCharactersInRegex: strip a stray NUL
      const baseName = name.replace(/\x00/g, "")
      if (pos >= varBytes.length) break

      const tc = byte(varBytes, pos++)
      const node = decodeValue(tc, varBytes, pos)
      vars.push({ name: baseName + node.sigil, baseName, addr: ptr, ...node.fields })
      ptr = next
    }
  }
  return vars
}

interface DecodedValue {
  sigil: string
  fields: {
    type: BasicVarType
    value: string
    strLen: number
    strAddr: number
  }
}

function decodeValue(tc: number, b: readonly number[], pos: number): DecodedValue {
  switch (tc) {
    case 0x01: {
      const raw = byte(b, pos) | (byte(b, pos + 1) << 8)
      const value = (raw < 32768 ? raw : raw - 65536).toString()
      return { sigil: "%", fields: { type: "int", value, strLen: 0, strAddr: 0 } }
    }
    case 0x02: {
      const strLen = byte(b, pos)
      const strAddr = byte(b, pos + 1) | (byte(b, pos + 2) << 8)
      const value = strLen === 0 ? '""' : `(len ${strLen})`
      return { sigil: "$", fields: { type: "string", value, strLen, strAddr } }
    }
    case 0x04:
      return {
        sigil: "",
        fields: { type: "real", value: decodeCpcFloat(b, pos), strLen: 0, strAddr: 0 },
      }
    case 0x05:
      return { sigil: "", fields: { type: "deffn", value: "…", strLen: 0, strAddr: 0 } }
    default:
      return { sigil: "", fields: { type: "unknown", value: "?", strLen: 0, strAddr: 0 } }
  }
}
