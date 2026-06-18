import { useState } from "react"
import { type MemoryRow, parseAddress } from "../../src/memory-view/memory-model.js"

interface MemoryGridProps {
  /** Rows to render, or `null` when memory is unavailable (running/detached). */
  rows: MemoryRow[] | null
  /** Called with a 16-bit address when the user submits the "Go to" field. */
  onGoto: (address: number) => void
}

/**
 * Z80 memory view: a "Go to" address field over a hex+ASCII dump. Octets only —
 * no multi-byte/float interpretation, unlike VS Code's native hex inspector.
 * Pure presentation; the panel feeds rows and acts on `onGoto`.
 */
export function MemoryGrid({ rows, onGoto }: MemoryGridProps) {
  const [input, setInput] = useState("")

  const submit = (e: React.FormEvent): void => {
    e.preventDefault()
    const addr = parseAddress(input)
    if (addr !== undefined) onGoto(addr)
  }

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
      </form>
      {rows === null ? (
        <p className="placeholder">No data — pause the emulator to inspect memory.</p>
      ) : (
        <table className="mem-table">
          <tbody>
            {rows.map((row) => (
              <tr key={row.address}>
                <th className="mem-addr">{row.address}</th>
                {row.hex.map((b, i) => (
                  // Bytes within a row have no stable id; index is the position.
                  // biome-ignore lint/suspicious/noArrayIndexKey: fixed-width hex column
                  <td key={i} className="mem-byte">
                    {b}
                  </td>
                ))}
                <td className="mem-ascii">{row.ascii}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
