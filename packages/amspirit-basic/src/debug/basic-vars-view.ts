import type { BasicState } from "@amspirit/shared"
import type { BasicVar } from "./basic-var-parser.js"

/**
 * Pure formatter for the BASIC Variables card — reproduces the amspirit-lite
 * web-debugger "Variables" panel (memory-layout header + name/type/value rows)
 * so the React layer only renders. Hex is 4-digit uppercase, no `0x` prefix,
 * matching the emulator's own UI.
 */

interface SysVar {
  label: string
  value: string
}

interface VarRow {
  /** Display name including the type sigil, e.g. `A%`, `MSG$`. */
  name: string
  /** Human type: `Int` / `String` / `Real` / `FN` / `?`. */
  type: string
  value: string
}

export interface BasicVarsView {
  systemVars: SysVar[]
  rows: VarRow[]
}

/** Start of the BASIC system-variable area; free RAM is measured up to here. */
const BASIC_SYS_AREA = 0xae14
const MAX_VALUE_LEN = 32

const h4 = (n: number): string => (n & 0xffff).toString(16).toUpperCase().padStart(4, "0")

const TYPE_NAMES: Record<BasicVar["type"], string> = {
  int: "Int",
  string: "String",
  real: "Real",
  deffn: "FN",
  unknown: "?",
}

export function buildBasicVarsView(state: BasicState, vars: readonly BasicVar[]): BasicVarsView {
  const freeRam = state.arrend < BASIC_SYS_AREA ? BASIC_SYS_AREA - state.arrend : 0
  const systemVars: SysVar[] = [
    { label: "TXTTOP", value: h4(state.txttop) },
    { label: "Size", value: `${state.prog_size} B` },
    { label: "Vars zone", value: `${h4(state.txttop)}–${h4(state.vartop)} (${state.var_size} B)` },
    { label: "Arrays zone", value: `${h4(state.vartop)}–${h4(state.arrend)}` },
    { label: "Free RAM", value: `${freeRam} B` },
    { label: "Stmt addr", value: h4(state.stmt_addr) },
    { label: "Version", value: `BASIC 1.${state.basic_ver === 10 ? "0" : "1"}` },
  ]
  const rows: VarRow[] = vars.map((v) => ({
    name: v.name,
    type: TYPE_NAMES[v.type],
    value: v.value.length > MAX_VALUE_LEN ? `${v.value.slice(0, MAX_VALUE_LEN)}…` : v.value,
  }))
  return { systemVars, rows }
}
