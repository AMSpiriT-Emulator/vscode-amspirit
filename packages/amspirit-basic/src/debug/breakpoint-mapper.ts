import type { BasicLine, BasicListing } from "@amspirit/shared"

/**
 * Pure line <-> address mapping for the BASIC debugger.
 *
 * VS Code places breakpoints on *editor* lines (1-based, in the `.bas` file),
 * but the emulator tracks breakpoints by *statement address* and reports the
 * current position as a *BASIC line number*. The bridge between them is the
 * leading integer of each editor line (the BASIC line number) plus the
 * `/api/basic_listing` decode (BASIC line number -> statement addresses).
 */

export interface ResolvedBreakpoint {
  /** Editor line (1-based), echoed back to VS Code. */
  line: number
  /** True when the line carries a BASIC line number present in the listing. */
  verified: boolean
  /** BASIC line number parsed from the editor line, if any. */
  basicLine?: number
  /** Address of the line's first statement (what the emulator breaks on). */
  addr?: number
}

/** Extract the leading BASIC line number from an editor line, if present. */
export function parseBasicLineNumber(text: string): number | undefined {
  const m = /^\s*(\d+)/.exec(text)
  if (!m?.[1]) return undefined
  return Number.parseInt(m[1], 10)
}

/** Index a listing by BASIC line number (first occurrence wins). */
export function indexListingByLine(listing: BasicListing): Map<number, BasicLine> {
  const byNum = new Map<number, BasicLine>()
  for (const line of listing.lines) {
    if (!byNum.has(line.num)) byNum.set(line.num, line)
  }
  return byNum
}

/**
 * Resolve VS Code breakpoint requests (editor line numbers) against the program
 * listing. A breakpoint is verified only when its editor line starts with a
 * BASIC line number that exists in the listing and has at least one statement.
 */
export function resolveBreakpoints(
  editorLines: readonly number[],
  documentLines: readonly string[],
  listing: BasicListing,
): ResolvedBreakpoint[] {
  const byNum = indexListingByLine(listing)
  return editorLines.map((line) => {
    const text = documentLines[line - 1]
    const basicLine = text === undefined ? undefined : parseBasicLineNumber(text)
    if (basicLine === undefined) return { line, verified: false }
    const addr = byNum.get(basicLine)?.stmts[0]?.addr
    if (addr === undefined) return { line, verified: false, basicLine }
    return { line, verified: true, basicLine, addr }
  })
}

/** Statement addresses of the verified breakpoints, ready for `/api/basic_bp`. */
export function breakpointAddresses(resolved: readonly ResolvedBreakpoint[]): number[] {
  const addrs: number[] = []
  for (const bp of resolved) {
    if (bp.verified && bp.addr !== undefined) addrs.push(bp.addr)
  }
  return addrs
}

/**
 * Find the editor line (1-based) that declares the given BASIC line number,
 * for highlighting the current execution point. Returns undefined in direct
 * mode or when the line isn't found in the document.
 */
export function editorLineForBasicLine(
  basicLine: number,
  documentLines: readonly string[],
): number | undefined {
  for (let i = 0; i < documentLines.length; i++) {
    const text = documentLines[i]
    if (text !== undefined && parseBasicLineNumber(text) === basicLine) return i + 1
  }
  return undefined
}
