import {
  type LabelRecord,
  type SymbolMap,
  type SymbolMapParser,
  type TraceRecord,
  TraceSymbolMap,
} from "./symbol-map.js"

/** SLD record type for an executable instruction (trace data). */
const TRACE_TYPE = "T"
/** SLD record type for a label definition. */
const LABEL_TYPE = "L"

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

/**
 * Resolve a label name from an `L` record's data field. The field is
 * comma-separated `module,name,sub,+flag…`; the qualified label is the
 * identifier parts (those not starting with `+`, non-empty) joined with a dot —
 * e.g. `,delay,wait,+local` → `delay.wait`, `,start,` → `start`.
 */
function labelName(data: string): string | undefined {
  const parts = data
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p !== "" && !p.startsWith("+"))
  return parts.length > 0 ? parts.join(".") : undefined
}

function parseLabelRecords(content: string): LabelRecord[] {
  const labels: LabelRecord[] = []
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim()
    if (line === "" || line.startsWith("|")) continue
    const fields = line.split("|")
    if (fields.length < MIN_FIELDS) continue
    if (fields[fields.length - TYPE_FROM_END] !== LABEL_TYPE) continue
    const addr = parseAddress(fields[fields.length - VALUE_FROM_END] ?? "")
    const name = labelName(fields[fields.length - 1] ?? "")
    if (addr === undefined || name === undefined) continue
    labels.push({ name, addr })
  }
  return labels
}

/** Parses the sjasmplus SLD format (`sjasmplus --sld=out.sld`). */
export class SjasmplusSldParser implements SymbolMapParser {
  readonly id = "sjasmplus-sld"

  parse(content: string): SymbolMap {
    return new TraceSymbolMap(parseTraceRecords(content), parseLabelRecords(content))
  }
}
