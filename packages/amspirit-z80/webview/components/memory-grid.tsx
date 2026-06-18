import { useEffect, useRef, useState } from "react"
import {
  type MemoryRow,
  type PointerMark,
  parseAddress,
} from "../../src/memory-view/memory-model.js"

interface MemoryGridProps {
  /** Rows to render, or `null` when memory is unavailable (running/detached). */
  rows: MemoryRow[] | null
  /** Address of the first byte of the window (`0x`-prefixed), shown in the header. */
  base?: string | undefined
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
export function MemoryGrid({
  rows,
  base,
  marks,
  followPc,
  onFollowPcChange,
  onGoto,
}: MemoryGridProps) {
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
      const rowAddr = Number(row.address)
      row.hex.forEach((b, i) => {
        next.set(rowAddr + i, b)
      })
    }
    prev.current = next
  })

  return (
    <div className="memory-view">
      <form className="goto" aria-label="Go to address" onSubmit={submit}>
        <label htmlFor="goto-addr">Address</label>
        <input
          id="goto-addr"
          type="text"
          placeholder="&C000"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button type="submit">Go</button>
        <label className="follow-pc">
          <input
            type="checkbox"
            checked={followPc ?? false}
            onChange={(e) => onFollowPcChange?.(e.target.checked)}
          />
          Follow PC
        </label>
        {base !== undefined && <span className="window-base">Window: {base}</span>}
      </form>
      {rows === null ? (
        <p className="placeholder">No data — connect to the emulator to inspect memory.</p>
      ) : (
        <table className="mem-table">
          <tbody>
            {rows.map((row, rowIndex) => {
              // Offset of this row's first byte: rows before it are full-width.
              const rowOffset = rows.slice(0, rowIndex).reduce((n, r) => n + r.hex.length, 0)
              const rowAddr = Number(row.address)
              return (
                <tr key={row.address}>
                  <th className="mem-addr">{row.address}</th>
                  {row.hex.map((b, i) => {
                    const label = labelByOffset.get(rowOffset + i)
                    const before = previous.get(rowAddr + i)
                    const changed = before !== undefined && before !== b
                    const className = `mem-byte${label ? " pointer" : ""}${changed ? " valflash" : ""}`
                    return (
                      // Re-key on value so the flash animation replays on change;
                      // the column index keeps it unique within the row.
                      // biome-ignore lint/suspicious/noArrayIndexKey: composite key, value drives remount
                      <td key={`${i}:${b}`} className={className} title={label}>
                        {b}
                      </td>
                    )
                  })}
                  <td className="mem-ascii">{row.ascii}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
