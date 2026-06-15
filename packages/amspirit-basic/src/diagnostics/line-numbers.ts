export interface LineNumberIssue {
  /** 0-based line index in the document. */
  line: number
  /** 0-based start column of the first non-whitespace character. */
  startColumn: number
  /** Exclusive 0-based end column (end of line content, trimmed of trailing whitespace). */
  endColumn: number
  message: string
}

/**
 * Locomotive BASIC silently ignores statements without a leading line number,
 * so we flag them. Blank lines and comments (`'` or `REM`) are ignored.
 */
export function findLineNumberIssues(source: string): LineNumberIssue[] {
  const issues: LineNumberIssue[] = []
  const lines = source.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] ?? ""
    const leading = raw.match(/^\s*/)?.[0].length ?? 0
    const trimmed = raw.slice(leading).replace(/\s+$/, "")
    if (trimmed.length === 0) continue
    if (trimmed.startsWith("'")) continue
    if (/^rem(\s|$)/i.test(trimmed)) continue
    if (/^\d+(\s|$)/.test(trimmed)) continue
    issues.push({
      line: i,
      startColumn: leading,
      endColumn: leading + trimmed.length,
      message: "Locomotive BASIC requires a line number; this statement will be ignored.",
    })
  }
  return issues
}
