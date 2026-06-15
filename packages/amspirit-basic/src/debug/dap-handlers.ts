import { type BasicState, DIRECT_MODE_LINE } from "@amspirit/shared"
import { editorLineForBasicLine } from "./breakpoint-mapper.js"

/**
 * Pure helpers turning emulator state into the data the Debug Adapter reports.
 * No `vscode`/`@vscode/debugadapter` imports here so this stays unit-testable;
 * `BasicDebugSession` wraps these into DAP response objects.
 */

export type StepRequest = "next" | "stepIn" | "stepOut"

/**
 * Map a DAP step request to emulator step granularity.
 * - `stepIn` (F11) -> statement-level (finer; into the next `:`-separated stmt)
 * - `next` (F10, Step Over) / `stepOut` -> line-level (next BASIC line)
 *
 * BASIC has no real call stack, so "step out" degrades to a line step.
 */
export function stepByLine(request: StepRequest): boolean {
  return request !== "stepIn"
}

export interface StackFrameInfo {
  name: string
  /** 1-based editor line, or 0 when unknown (direct mode / line not in document). */
  line: number
  column: number
}

/** Build the single BASIC stack frame from the current execution state. */
export function buildStackFrame(
  state: BasicState,
  documentLines: readonly string[],
): StackFrameInfo {
  if (state.cur_linenum === DIRECT_MODE_LINE) {
    return { name: "Direct mode", line: 0, column: 0 }
  }
  const line = editorLineForBasicLine(state.cur_linenum, documentLines) ?? 0
  return { name: `BASIC ${state.cur_linenum}`, line, column: 0 }
}

export interface NamedValue {
  name: string
  value: string
}

const hex = (n: number): string => `0x${n.toString(16).toUpperCase().padStart(4, "0")}`

/** Read-only "State" scope shown in the Variables view (MVP; real vars in phase 2). */
export function buildStateVariables(state: BasicState): NamedValue[] {
  const running = state.cur_linenum !== DIRECT_MODE_LINE
  return [
    { name: "Current line", value: running ? String(state.cur_linenum) : "(direct mode)" },
    { name: "Statement addr", value: hex(state.stmt_addr) },
    { name: "Program size", value: `${state.prog_size} bytes` },
    { name: "BASIC version", value: state.basic_ver === 11 ? "1.1" : "1.0" },
  ]
}
