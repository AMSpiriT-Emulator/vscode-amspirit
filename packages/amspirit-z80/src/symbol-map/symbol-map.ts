/** A source location reported by a symbol map (file path as recorded in the map). */
export interface SourceLocation {
  file: string
  line: number
}

/**
 * Bidirectional mapping between assembler source lines and Z80 PC addresses,
 * produced by parsing a build artifact (sjasmplus SLD, rasm map, …).
 */
export interface SymbolMap {
  /** Every instruction address emitted for `file:line` (empty when none). */
  lineToAddresses(file: string, line: number): number[]
  /** The source location of the instruction at `addr`, if known. */
  addressToLine(addr: number): SourceLocation | undefined
  /** Lowest instruction address (program origin), or `undefined` if no code. */
  lowestAddress(): number | undefined
}

/** Adapter that turns one assembler's debug artifact into a {@link SymbolMap}. */
export interface SymbolMapParser {
  /** Stable identifier, e.g. `"sjasmplus-sld"` or `"rasm"`. */
  readonly id: string
  parse(content: string): SymbolMap
}
