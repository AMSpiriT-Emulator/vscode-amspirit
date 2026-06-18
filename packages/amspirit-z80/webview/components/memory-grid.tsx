import { useEffect, useRef, useState } from "react"
import {
  type BankOption,
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
  /** Selectable views/banks for the machine (empty hides the selector). */
  banks?: BankOption[]
  /** Id of the currently selected view/bank. */
  selectedBankId?: string
  /** Called when the user picks a different view/bank. */
  onSelectBank?: (id: string) => void
  /** Whether the window currently tracks the program counter. */
  followPc?: boolean
  /** Called when the "Follow PC" checkbox is toggled. */
  onFollowPcChange?: (enabled: boolean) => void
  /** Called with a 16-bit address when the user submits the "Go to" field. */
  onGoto: (address: number) => void
  /** Called with the inclusive [start, end] of the selected byte range. */
  onDisassemble?: (start: number, end: number) => void
}

const hex4 = (n: number): string => (n & 0xffff).toString(16).toUpperCase().padStart(4, "0")

/**
 * Z80 memory view: a "Go to" address field over a hex+ASCII dump. Octets only —
 * no multi-byte/float interpretation, unlike VS Code's native hex inspector.
 * Pure presentation; the panel feeds rows and acts on `onGoto`.
 */
export function MemoryGrid({
  rows,
  marks,
  banks,
  selectedBankId,
  onSelectBank,
  followPc,
  onFollowPcChange,
  onGoto,
  onDisassemble,
}: MemoryGridProps) {
  const [input, setInput] = useState("")
  // Byte-range selection: anchor + focus addresses (null = nothing selected).
  const [selAnchor, setSelAnchor] = useState<number | null>(null)
  const [selFocus, setSelFocus] = useState<number | null>(null)
  const selLo = selAnchor !== null && selFocus !== null ? Math.min(selAnchor, selFocus) : null
  const selHi = selAnchor !== null && selFocus !== null ? Math.max(selAnchor, selFocus) : null

  const submit = (e: React.FormEvent): void => {
    e.preventDefault()
    const addr = parseAddress(input)
    if (addr === undefined) return
    // Navigating manually leaves "follow PC" mode so the address sticks.
    if (followPc) onFollowPcChange?.(false)
    onGoto(addr)
  }

  const clickByte = (addr: number, extend: boolean): void => {
    if (extend && selAnchor !== null) setSelFocus(addr)
    else {
      setSelAnchor(addr)
      setSelFocus(addr)
    }
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
        {selLo !== null && selHi !== null && (
          <button className={styles.go} type="button" onClick={() => onDisassemble?.(selLo, selHi)}>
            Disassemble {hex4(selLo)}-{hex4(selHi)} →
          </button>
        )}
        {banks && banks.length > 0 && (
          <select
            className={styles.bankSelect}
            aria-label="Memory view"
            value={selectedBankId ?? banks[0]?.id}
            onChange={(e) => onSelectBank?.(e.target.value)}
          >
            {banks.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>
        )}
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
                    const addr = rowAddr + i
                    const label = labelByOffset.get(rowOffset + i)
                    const before = previous.get(addr)
                    const changed = before !== undefined && before !== b
                    const sel = selLo !== null && selHi !== null && addr >= selLo && addr <= selHi
                    return (
                      // biome-ignore lint/a11y/useKeyWithClickEvents: byte grid; click-to-select, keyboard nav out of scope
                      <td
                        // Re-key on value so the flash animation replays on change;
                        // the column index keeps it unique within the row.
                        // biome-ignore lint/suspicious/noArrayIndexKey: composite key, value drives remount
                        key={`${i}:${b}`}
                        className={styles.byte}
                        title={label}
                        data-pointer={label ? "true" : undefined}
                        data-flash={changed ? "true" : undefined}
                        data-selected={sel ? "true" : undefined}
                        onClick={(e) => clickByte(addr, e.shiftKey)}
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
