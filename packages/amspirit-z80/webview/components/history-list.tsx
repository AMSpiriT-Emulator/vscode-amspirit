import type { HistoryRow } from "../../src/history-view/history-view-model.js"
import styles from "./history-list.module.css"

interface HistoryListProps {
  /** Rows newest-first, or `null` when history is unavailable (running/detached). */
  rows: HistoryRow[] | null
}

/**
 * Z80 instruction-history view: the last executed instructions, newest first,
 * each decoded to `addr · bytes · mnemonic`. The most recent (row 0) is
 * highlighted as the current PC. Pure presentation; the panel feeds the rows.
 */
export function HistoryList({ rows }: HistoryListProps) {
  if (rows === null) {
    return <p className={styles.placeholder}>No data — connect to the emulator.</p>
  }
  if (rows.length === 0) {
    return <p className={styles.placeholder}>No instruction history yet.</p>
  }
  return (
    <table className={styles.table}>
      <tbody>
        {rows.map((row, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: a fresh immutable snapshot replaces the whole list each tick; positional key is correct (addresses repeat in loops)
          <tr key={i} className={row.current ? styles.current : undefined}>
            <td className={styles.addr}>{row.address}</td>
            <td className={styles.bytes}>{row.bytes}</td>
            <td className={styles.text}>{row.text}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
