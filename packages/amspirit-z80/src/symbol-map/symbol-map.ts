import { basename } from "node:path"

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
  /** The address a label resolves to (case-insensitive), or `undefined`. */
  labelToAddress(name: string): number | undefined
}

/** Adapter that turns one assembler's debug artifact into a {@link SymbolMap}. */
export interface SymbolMapParser {
  /** Stable identifier, e.g. `"sjasmplus-sld"` or `"rasm"`. */
  readonly id: string
  parse(content: string): SymbolMap
}

/**
 * One trace data point: the address of the instruction assembled for a source
 * line. `file` keeps the path as written in the artifact (so includes resolve
 * relative to the program); matching is by basename.
 */
export interface TraceRecord {
  file: string
  line: number
  addr: number
}

/** A label definition: the symbol name and the address it stands for. */
export interface LabelRecord {
  name: string
  addr: number
}

/**
 * A {@link SymbolMap} backed by trace records. Shared by every adapter — each
 * parser just turns its artifact into records and hands them here.
 */
export class TraceSymbolMap implements SymbolMap {
  constructor(
    private readonly records: readonly TraceRecord[],
    private readonly labels: readonly LabelRecord[] = [],
  ) {}

  lineToAddresses(file: string, line: number): number[] {
    const key = basename(file)
    return this.records
      .filter((r) => basename(r.file) === key && r.line === line)
      .map((r) => r.addr)
  }

  addressToLine(addr: number): SourceLocation | undefined {
    const r = this.records.find((rec) => rec.addr === addr)
    return r ? { file: r.file, line: r.line } : undefined
  }

  lowestAddress(): number | undefined {
    let min: number | undefined
    for (const r of this.records) {
      if (min === undefined || r.addr < min) min = r.addr
    }
    return min
  }

  labelToAddress(name: string): number | undefined {
    const key = name.toLowerCase()
    return this.labels.find((l) => l.name.toLowerCase() === key)?.addr
  }
}
