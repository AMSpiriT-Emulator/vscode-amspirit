import { basename } from "node:path"
import type { SourceLocation, SymbolMap, SymbolMapParser } from "./symbol-map.js"

/**
 * One trace data point: the address of the instruction assembled for a given
 * source line. `file` keeps the path as written in the SLD (so includes resolve
 * relative to the program); matching is done by basename.
 */
interface TraceRecord {
  file: string
  line: number
  addr: number
}

/** SLD record type for an executable instruction (trace data). */
const TRACE_TYPE = "T"

/**
 * SLD records are pipe-separated and end with `…|value|type|data`. Real
 * sjasmplus output has 8 fields (`source|line|defFile|defLine|page|value|type|
 * data`) while the historical docs describe 7 — so the trailing `type`/`value`
 * are located from the end of the record, which works for both shapes.
 */
const FILE = 0
const LINE = 1
const TYPE_FROM_END = 2
const VALUE_FROM_END = 3
/** A trace record needs at least `source|line|value|type` (4 fields). */
const MIN_FIELDS = 4

/** Parse a decimal (or `0x`-prefixed) SLD value; `undefined` if not a real address. */
function parseAddress(value: string): number | undefined {
  const t = value.trim()
  if (t === "") return undefined
  const n =
    t.startsWith("0x") || t.startsWith("0X")
      ? Number.parseInt(t.slice(2), 16)
      : Number.parseInt(t, 10)
  return Number.isFinite(n) && n >= 0 ? n : undefined
}

function parseTraceRecords(content: string): TraceRecord[] {
  const records: TraceRecord[] = []
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim()
    // Skip blanks and the `|SLD.data.version|N` header plus keyword comment
    // lines — all of which have an empty source field (a leading `|`).
    if (line === "" || line.startsWith("|")) continue
    const fields = line.split("|")
    if (fields.length < MIN_FIELDS) continue
    if (fields[fields.length - TYPE_FROM_END] !== TRACE_TYPE) continue
    const file = fields[FILE]
    const lineNum = Number.parseInt(fields[LINE] ?? "", 10)
    const addr = parseAddress(fields[fields.length - VALUE_FROM_END] ?? "")
    if (!file || !Number.isFinite(lineNum) || addr === undefined) continue
    records.push({ file, line: lineNum, addr })
  }
  return records
}

class SldSymbolMap implements SymbolMap {
  constructor(private readonly records: readonly TraceRecord[]) {}

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
}

/** Parses the sjasmplus SLD format (`sjasmplus --sld=out.sld`). */
export class SjasmplusSldParser implements SymbolMapParser {
  readonly id = "sjasmplus-sld"

  parse(content: string): SymbolMap {
    return new SldSymbolMap(parseTraceRecords(content))
  }
}
