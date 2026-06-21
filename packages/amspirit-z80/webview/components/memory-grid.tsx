import { useEffect, useRef, useState } from "react"
import {
  type BankOption,
  type MemoryRow,
  type PointerMark,
  parseAddress,
  parseByte,
  scrollBase,
} from "../../src/memory-view/memory-model.js"
import styles from "./memory-grid.module.css"

interface MemoryGridProps {
  /** Rows to render, or `null` when memory is unavailable (running/detached). */
  rows: MemoryRow[] | null
  /** Bytes per row (drives scroll/paging math). Defaults to 16. */
  columns?: number
  /** Pointer registers landing in the window, by byte offset (optional). */
  marks?: PointerMark[]
  /** Window offsets the Z80 has executed, shaded as "code" (optional). */
  executed?: number[]
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
  /** Whether bytes can be edited in place (central RAM only). */
  editable?: boolean
  /** Called when an inline byte edit is committed. */
  onWrite?: (address: number, value: number) => void
}

const hex4 = (n: number): string => (n & 0xffff).toString(16).toUpperCase().padStart(4, "0")

/** Keyboard navigation: how many rows to move for each handled key. */
const KEY_ROWS: Record<string, (visibleRows: number) => number> = {
  ArrowDown: () => 1,
  ArrowUp: () => -1,
  PageDown: (n) => n,
  PageUp: (n) => -n,
}

/**
 * Z80 memory view: a "Go to" address field over a hex+ASCII dump. Octets only —
 * no multi-byte/float interpretation, unlike VS Code's native hex inspector.
 * Supports wheel/keyboard scrolling, code-coverage shading and (on central RAM)
 * inline byte editing. Pure presentation; the panel feeds rows and acts on the
 * callbacks.
 */
export function MemoryGrid({
  rows,
  columns = 16,
  marks,
  executed,
  banks,
  selectedBankId,
  onSelectBank,
  followPc,
  onFollowPcChange,
  onGoto,
  onDisassemble,
  editable,
  onWrite,
}: MemoryGridProps) {
  const [input, setInput] = useState("")
  // Byte-range selection: anchor + focus addresses (null = nothing selected).
  const [selAnchor, setSelAnchor] = useState<number | null>(null)
  const [selFocus, setSelFocus] = useState<number | null>(null)
  // Inline edit: the address being edited and its in-progress hex text.
  const [editAddr, setEditAddr] = useState<number | null>(null)
  const [editValue, setEditValue] = useState("")
  const selLo = selAnchor !== null && selFocus !== null ? Math.min(selAnchor, selFocus) : null
  const selHi = selAnchor !== null && selFocus !== null ? Math.max(selAnchor, selFocus) : null

  // Navigate to an absolute base, leaving "follow PC" so the address sticks.
  const navigate = (base: number): void => {
    if (followPc) onFollowPcChange?.(false)
    onGoto(base & 0xffff)
  }

  const submit = (e: React.FormEvent): void => {
    e.preventDefault()
    const addr = parseAddress(input)
    if (addr !== undefined) navigate(addr)
  }

  // Scroll/page relative to the current window (its first row is the base).
  const scrollRows = (deltaRows: number): void => {
    if (!rows || rows.length === 0 || deltaRows === 0) return
    const base = rows[0]?.addr ?? 0
    navigate(scrollBase(base, deltaRows, columns))
  }

  const onWheel = (e: React.WheelEvent): void => {
    if (editAddr === null) scrollRows(Math.sign(e.deltaY))
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (editAddr !== null || !rows) return
    const move = KEY_ROWS[e.key]
    if (move) {
      e.preventDefault()
      scrollRows(move(rows.length))
    } else if (e.key === "Home") {
      e.preventDefault()
      navigate(0x0000)
    } else if (e.key === "End") {
      e.preventDefault()
      navigate(-rows.length * columns)
    }
  }

  const clickByte = (addr: number, extend: boolean): void => {
    if (extend && selAnchor !== null) setSelFocus(addr)
    else {
      setSelAnchor(addr)
      setSelFocus(addr)
    }
  }

  const startEdit = (addr: number, current: string): void => {
    if (!editable) return
    setEditAddr(addr)
    setEditValue(current)
  }

  const commitEdit = (addr: number): void => {
    const value = parseByte(editValue)
    if (value !== undefined) onWrite?.(addr, value)
    setEditAddr(null)
  }

  const editKeyDown = (e: React.KeyboardEvent, addr: number): void => {
    e.stopPropagation()
    if (e.key === "Enter") commitEdit(addr)
    else if (e.key === "Escape") setEditAddr(null)
  }

  // Byte offsets accumulate across rows; resolve each to its pointer label.
  const labelByOffset = new Map((marks ?? []).map((m) => [m.offset, m.registers.join(", ")]))
  const executedSet = new Set(executed ?? [])

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
      <div className={styles.legend}>
        <span className={styles.legendItem} data-kind="executed">
          Executed
        </span>
        <span className={styles.legendItem} data-kind="pointer">
          Pointer
        </span>
        <span className={styles.legendItem} data-kind="flash">
          Changed
        </span>
      </div>
      {rows === null ? (
        <p className={styles.placeholder}>No data — connect to the emulator to inspect memory.</p>
      ) : (
        <table
          className={styles.table}
          // biome-ignore lint/a11y/noNoninteractiveTabindex: the grid is a scroll surface that takes focus for keyboard paging
          tabIndex={0}
          onWheel={onWheel}
          onKeyDown={onKeyDown}
        >
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
                    const editing = editAddr === addr
                    return (
                      // biome-ignore lint/a11y/useKeyWithClickEvents: byte grid; keyboard paging handled at table level
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
                        data-executed={executedSet.has(rowOffset + i) ? "true" : undefined}
                        data-editable={editable ? "true" : undefined}
                        onClick={(e) => clickByte(addr, e.shiftKey)}
                        onDoubleClick={() => startEdit(addr, b)}
                      >
                        {editing ? (
                          <input
                            className={styles.edit}
                            type="text"
                            // biome-ignore lint/a11y/noAutofocus: the cell was just opened for editing by the user
                            autoFocus
                            maxLength={2}
                            aria-label={`Edit byte ${hex4(addr)}`}
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={(e) => editKeyDown(e, addr)}
                            onBlur={() => commitEdit(addr)}
                          />
                        ) : (
                          b
                        )}
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
