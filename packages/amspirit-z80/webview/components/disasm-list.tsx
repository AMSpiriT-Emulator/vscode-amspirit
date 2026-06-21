import { Fragment, useState } from "react"
import type { DisasmRow } from "../../src/disasm-view/disasm-view-model.js"
import type { BankOption } from "../../src/memory-view/memory-model.js"
import { parseAddress } from "../../src/memory-view/memory-model.js"
import styles from "./disasm-list.module.css"

interface DisasmListProps {
  /** Rows to render, or `null` when disassembly is unavailable (running/detached). */
  rows: DisasmRow[] | null
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
  /** Called to scroll by N instructions (negative = up). */
  onPage?: (delta: number) => void
  /** Called to export to an `.asm` listing — the selected `[start, end]` range,
   * or the visible window when no range is supplied. */
  onExportAsm?: (start?: number, end?: number) => void
}

const hex4 = (n: number): string => (n & 0xffff).toString(16).toUpperCase().padStart(4, "0")

/** Keyboard navigation: how many instruction rows to move for each handled key. */
const KEY_ROWS: Record<string, (visibleRows: number) => number> = {
  ArrowDown: () => 1,
  ArrowUp: () => -1,
  PageDown: (n) => n,
  PageUp: (n) => -n,
}

/**
 * Z80 disassembly view: a "Go to" address field over a live, label-aware
 * instruction listing. Mirrors the Memory View's care — sticky toolbar, Follow
 * PC, machine-driven bank selector, wheel/keyboard paging, current-PC highlight
 * and code-coverage shading — but tailored to decoded instructions (firmware /
 * symbol-map labels, synthetic `Lxxxx` targets). Pure presentation; the panel
 * feeds rows and acts on the callbacks.
 */
export function DisasmList({
  rows,
  banks,
  selectedBankId,
  onSelectBank,
  followPc,
  onFollowPcChange,
  onGoto,
  onPage,
  onExportAsm,
}: DisasmListProps) {
  const [input, setInput] = useState("")
  // Range selection (by instruction address) for the `.asm` export.
  const [selAnchor, setSelAnchor] = useState<number | null>(null)
  const [selFocus, setSelFocus] = useState<number | null>(null)
  const selLo = selAnchor !== null && selFocus !== null ? Math.min(selAnchor, selFocus) : null
  const selHi = selAnchor !== null && selFocus !== null ? Math.max(selAnchor, selFocus) : null

  // Navigate to an absolute address, leaving "follow PC" so the address sticks.
  const navigate = (address: number): void => {
    if (followPc) onFollowPcChange?.(false)
    onGoto(address & 0xffff)
  }

  const clickRow = (addr: number, extend: boolean): void => {
    if (extend && selAnchor !== null) setSelFocus(addr)
    else {
      setSelAnchor(addr)
      setSelFocus(addr)
    }
  }

  const exportAsm = (): void => {
    if (selLo !== null && selHi !== null) onExportAsm?.(selLo, selHi)
    else onExportAsm?.()
  }

  const submit = (e: React.FormEvent): void => {
    e.preventDefault()
    const addr = parseAddress(input)
    if (addr !== undefined) navigate(addr)
  }

  const page = (delta: number): void => {
    if (rows && rows.length > 0 && delta !== 0) onPage?.(delta)
  }

  const onWheel = (e: React.WheelEvent): void => page(Math.sign(e.deltaY))

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (!rows) return
    const move = KEY_ROWS[e.key]
    if (move) {
      e.preventDefault()
      page(move(rows.length))
    } else if (e.key === "Home") {
      e.preventDefault()
      navigate(0x0000)
    }
  }

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
        <button className={styles.export} type="button" onClick={exportAsm}>
          {selLo !== null && selHi !== null
            ? `Export ${hex4(selLo)}-${hex4(selHi)} .asm`
            : "Export .asm"}
        </button>
        {banks && banks.length > 0 && (
          <select
            className={styles.bankSelect}
            aria-label="Disassembly view"
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
        <span className={styles.legendItem} data-kind="pc">
          ▶ PC
        </span>
        <span className={styles.legendItem} data-kind="executed">
          Executed
        </span>
        <span className={styles.legendItem} data-kind="data">
          Data (DB)
        </span>
      </div>
      {rows === null ? (
        <p className={styles.placeholder}>No data — connect to the emulator to disassemble.</p>
      ) : (
        <table
          className={styles.table}
          // biome-ignore lint/a11y/noNoninteractiveTabindex: the list is a scroll surface that takes focus for keyboard paging
          tabIndex={0}
          onWheel={onWheel}
          onKeyDown={onKeyDown}
        >
          <tbody>
            {rows.map((row) => (
              <Fragment key={row.addr}>
                {row.label && (
                  <tr className={styles.labelRow}>
                    <td colSpan={4}>{row.label}:</td>
                  </tr>
                )}
                <tr
                  className={styles.row}
                  data-pc={row.isPc ? "true" : undefined}
                  data-executed={row.executed ? "true" : undefined}
                  data-data={row.data ? "true" : undefined}
                  data-selected={
                    selLo !== null && selHi !== null && row.addr >= selLo && row.addr <= selHi
                      ? "true"
                      : undefined
                  }
                  onClick={(e) => clickRow(row.addr, e.shiftKey)}
                >
                  <td className={styles.marker} aria-hidden="true">
                    {row.isPc ? "▶" : ""}
                  </td>
                  <th className={styles.addr}>{row.address}</th>
                  <td className={styles.bytes}>{row.bytes}</td>
                  <td className={styles.text}>{row.text}</td>
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
