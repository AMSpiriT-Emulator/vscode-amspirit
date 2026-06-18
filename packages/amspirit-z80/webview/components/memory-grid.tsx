import { useEffect, useRef, useState } from "react"
import {
  type MemoryRow,
  type PointerMark,
  parseAddress,
} from "../../src/memory-view/memory-model.js"
import styles from "./memory-grid.module.css"

interface MemoryGridProps {
  /** Rows to render, or `null` when memory is unavailable (running/detached). */
  rows: MemoryRow[] | null
  /** Pointer registers landing in the window, by byte offset (optional). */
  marks?: PointerMark[]
  /** Whether the window currently tracks the program counter. */
  followPc?: boolean
  /** Called when the "Follow PC" checkbox is toggled. */
  onFollowPcChange?: (enabled: boolean) => void
  /** Called with a 16-bit address when the user submits the "Go to" field. */
  onGoto: (address: number) => void
}

/**
 * Z80 memory view: a "Go to" address field over a hex+ASCII dump. Octets only —
 * no multi-byte/float interpretation, unlike VS Code's native hex inspector.
 * Pure presentation; the panel feeds rows and acts on `onGoto`.
 */
export function MemoryGrid({ rows, marks, followPc, onFollowPcChange, onGoto }: MemoryGridProps) {
  const [input, setInput] = useState("")

  const submit = (e: React.FormEvent): void => {
    e.preventDefault()
    const addr = parseAddress(input)
    if (addr === undefined) return
    // Navigating manually leaves "follow PC" mode so the address sticks.
    if (followPc) onFollowPcChange?.(false)
    onGoto(addr)
  }

  // Byte offsets accumulate across rows; resolve each to its pointer label.
  const labelByOffset = new Map((marks ?? []).map((m) => [m.offset, m.registers.join(", ")]))

  // Previous byte value per absolute address, to flash bytes that changed this
  // tick. Keyed by address (not offset) so moving the window doesn't flash.
  const prev = useRef<Map<number, string>>(new Map())
  const previous = prev.current
  useEffect(() => {
    const next = new Map<number, string>()
    for (const row of rows ?? []) {
      row.hex.forEach((b, i) => {
        next.set(row.addr + i, b)
      })
    }
    prev.current = next
  })

  return (
    <div>
      <form className={styles.toolbar} aria-label="Go to address" onSubmit={submit}>
        <input
          className={styles.addrInput}
          id="goto-addr"
          type="text"
          placeholder="C000"
          aria-label="Address"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button className={styles.go} type="submit">
          Go
        </button>
        <label className={styles.followPc}>
          <input
            type="checkbox"
            checked={followPc ?? false}
            onChange={(e) => onFollowPcChange?.(e.target.checked)}
          />
          <span>Follow PC</span>
        </label>
      </form>
      {rows === null ? (
        <p className={styles.placeholder}>No data — connect to the emulator to inspect memory.</p>
      ) : (
        <table className={styles.table}>
          <tbody>
            {rows.map((row, rowIndex) => {
              // Offset of this row's first byte: rows before it are full-width.
              const rowOffset = rows.slice(0, rowIndex).reduce((n, r) => n + r.hex.length, 0)
              const rowAddr = row.addr
              return (
                <tr key={row.address}>
                  <th className={styles.addr}>{row.address}</th>
                  {row.hex.map((b, i) => {
                    const label = labelByOffset.get(rowOffset + i)
                    const before = previous.get(rowAddr + i)
                    const changed = before !== undefined && before !== b
                    return (
                      <td
                        // Re-key on value so the flash animation replays on change;
                        // the column index keeps it unique within the row.
                        // biome-ignore lint/suspicious/noArrayIndexKey: composite key, value drives remount
                        key={`${i}:${b}`}
                        className={styles.byte}
                        title={label}
                        data-pointer={label ? "true" : undefined}
                        data-flash={changed ? "true" : undefined}
                      >
                        {b}
                      </td>
                    )
                  })}
                  <td className={styles.ascii}>{row.ascii}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
