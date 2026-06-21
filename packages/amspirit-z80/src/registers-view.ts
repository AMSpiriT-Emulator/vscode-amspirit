import type { Z80Registers } from "@amspirit/shared"

/** A single register/flag entry rendered in the Registers view. */
interface RegisterVariable {
  name: string
  value: string
  /**
   * For registers that point into RAM, a `0x`-prefixed address string so a click
   * can jump the Memory view there. Absent on flags, shadow and interrupt
   * entries. Kept `0x`-prefixed (unlike the bare `value`) so it parses directly
   * with `Number()`.
   */
  memoryReference?: string
  /**
   * A CSS colour (e.g. `#RRGGBB`) for `"palette"` scopes: the entry renders as a
   * colour swatch tinted with this, with `value` shown as its label. Ignored by
   * other scope kinds.
   */
  swatch?: string
  /**
   * A fuller description for the tooltip (e.g. a bit's meaning on a `"flags"`
   * chip). Falls back to the entry name when absent.
   */
  hint?: string
  /** Render this entry dimmed (e.g. a palette PEN unused in the current mode). */
  muted?: boolean
  /** Start a visual group separator before this entry (e.g. the GA border ink). */
  divider?: boolean
  /** For `"membar"` entries: this region maps ROM (tinted apart from RAM). */
  rom?: boolean
}

/** A named group of register variables (one section of the view). */
export interface RegisterScope {
  name: string
  variables: RegisterVariable[]
  /**
   * Render hint. `"flags"` shows a lit/dim chip strip (bit decoders);
   * `"palette"` shows a grid of colour swatches (each variable's `swatch`);
   * `"membar"` shows a horizontal ROM/RAM region bar; otherwise a name/value
   * grid. The Z80 "Flags" scope is treated as `"flags"` by name for back-compat;
   * chip views set this explicitly.
   */
  kind?: "flags" | "palette" | "membar"
}

/** How many stack words {@link buildStackScope} shows by default. */
const DEFAULT_STACK_DEPTH = 8

/** Bare uppercase hex (no `0x`): the form shown in the view, matching the Memory grid. */
const hex4 = (n: number): string => (n & 0xffff).toString(16).toUpperCase().padStart(4, "0")
const hex2 = (n: number): string => (n & 0xff).toString(16).toUpperCase().padStart(2, "0")
/** A `Number()`-parseable memory anchor for a 16-bit address. */
const ref = (n: number): string => `0x${hex4(n)}`
const pairValue = (hi: number, lo: number): number => ((hi & 0xff) << 8) | (lo & 0xff)
const bit = (value: number, index: number): string => `${(value >> index) & 1}`

/**
 * Format a Z80 register snapshot into the four scopes shown in the Registers
 * view: the main registers, the decoded flags, the shadow set and the interrupt
 * state. Values are bare hex (no `0x`); pointer registers also carry a
 * `memoryReference` so a click can open the Memory view at that address. Pure.
 */
export function buildRegisterScopes(r: Z80Registers): RegisterScope[] {
  return [
    {
      name: "Registers",
      // Pointer registers carry a memoryReference so the Memory view can jump to
      // the address they hold; AF is data and R is the refresh counter, so
      // neither does. R lives here rather than under Interrupts — it is the DRAM
      // refresh register, unrelated to the interrupt state.
      variables: [
        { name: "AF", value: hex4(pairValue(r.A, r.F)) },
        { name: "BC", value: hex4(pairValue(r.B, r.C)), memoryReference: ref(pairValue(r.B, r.C)) },
        { name: "DE", value: hex4(pairValue(r.D, r.E)), memoryReference: ref(pairValue(r.D, r.E)) },
        { name: "HL", value: hex4(pairValue(r.H, r.L)), memoryReference: ref(pairValue(r.H, r.L)) },
        { name: "IX", value: hex4(r.IX), memoryReference: ref(r.IX) },
        { name: "IY", value: hex4(r.IY), memoryReference: ref(r.IY) },
        { name: "SP", value: hex4(r.SP), memoryReference: ref(r.SP) },
        { name: "PC", value: hex4(r.PC), memoryReference: ref(r.PC) },
        { name: "R", value: hex2(r.R) },
      ],
    },
    {
      name: "Flags",
      // Z80 F layout: S Z - H - P/V N C (bits 7..0).
      variables: [
        { name: "S", value: bit(r.F, 7) },
        { name: "Z", value: bit(r.F, 6) },
        { name: "H", value: bit(r.F, 4) },
        { name: "P/V", value: bit(r.F, 2) },
        { name: "N", value: bit(r.F, 1) },
        { name: "C", value: bit(r.F, 0) },
      ],
    },
    {
      name: "Shadow",
      variables: [
        { name: "AF'", value: hex4(pairValue(r.A2, r.F2)) },
        { name: "BC'", value: hex4(pairValue(r.B2, r.C2)) },
        { name: "DE'", value: hex4(pairValue(r.D2, r.E2)) },
        { name: "HL'", value: hex4(pairValue(r.H2, r.L2)) },
      ],
    },
    {
      name: "Interrupts",
      variables: [
        { name: "I", value: hex2(r.I) },
        { name: "IFF1", value: `${r.IFF1 & 1}` },
        { name: "IFF2", value: `${r.IFF2 & 1}` },
        { name: "IM", value: `${r.IM}` },
      ],
    },
  ]
}

/**
 * Build the "Stack" scope: up to `depth` little-endian words read at `sp`. Each
 * entry is labelled by its absolute slot address and shows the word it holds,
 * with that word exposed as a `memoryReference` so a click jumps the Memory view
 * to where it points (return addresses, saved pointers). A trailing odd byte
 * that can't form a whole word is dropped. Pure: the panel feeds the bytes.
 */
export function buildStackScope(
  sp: number,
  bytes: number[],
  depth: number = DEFAULT_STACK_DEPTH,
): RegisterScope {
  const variables: RegisterVariable[] = []
  for (let i = 0; i < depth; i++) {
    const lo = bytes[i * 2]
    const hi = bytes[i * 2 + 1]
    if (lo === undefined || hi === undefined) break
    const slot = (sp + i * 2) & 0xffff
    const word = pairValue(hi, lo)
    variables.push({ name: hex4(slot), value: hex4(word), memoryReference: ref(word) })
  }
  return { name: "Stack", variables }
}
