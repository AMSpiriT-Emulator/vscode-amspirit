import {
  type SymbolMap,
  type SymbolMapParser,
  type TraceRecord,
  TraceSymbolMap,
} from "./symbol-map.js"

/**
 * One instruction line of `rasm … -map` stdout:
 *   `000|8000     | 3E 00       [02]     LD A,0      (L3:hello.asm)`
 * i.e. `<bank>|<hex address>     | <bytes> [<time>] <mnemonic>  (L<line>:<file>)`.
 * Only instruction lines carry the trailing `(L<line>:<file>)` marker — labels,
 * `EQU`, `ORG` and banner lines do not, so matching on it filters them out.
 */
const INSTRUCTION = /^\s*\d+\|\s*([0-9A-Fa-f]+)\s*\|.*\(L(\d+):([^)]+)\)\s*$/

// rasm colours its `-map` stdout, so the captured file is full of SGR escapes
// (`ESC [ … m`). Strip them before matching. The control char is built at
// runtime to avoid a literal control character in the regex source.
const ANSI_SGR = new RegExp(`${String.fromCharCode(0x1b)}\\[[0-9;]*m`, "g")

function parseRasmRecords(content: string): TraceRecord[] {
  const records: TraceRecord[] = []
  for (const raw of content.replace(ANSI_SGR, "").split(/\r?\n/)) {
    const m = INSTRUCTION.exec(raw)
    if (!m) continue
    const [, hex, lineNum, file] = m
    const addr = Number.parseInt(hex ?? "", 16)
    const line = Number.parseInt(lineNum ?? "", 10)
    const trimmed = (file ?? "").trim()
    if (!Number.isFinite(addr) || !Number.isFinite(line) || trimmed === "") continue
    records.push({ file: trimmed, line, addr })
  }
  return records
}

/** Parses the `rasm … -map` stdout listing into a {@link SymbolMap}. */
export class RasmMapParser implements SymbolMapParser {
  readonly id = "rasm-map"

  parse(content: string): SymbolMap {
    return new TraceSymbolMap(parseRasmRecords(content))
  }
}
