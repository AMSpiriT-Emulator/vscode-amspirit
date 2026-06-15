import { useEffect, useRef } from "react"
import type { BasicVarsView } from "../../src/debug/basic-vars-view.js"

interface BasicVariablesProps {
  view: BasicVarsView | null
}

/**
 * BASIC Variables card — reproduces the amspirit-lite web-debugger panel:
 * a memory-layout header row plus a name/type/value table. Value cells flash
 * (`.valflash`) when they change between refreshes.
 */
export function BasicVariables({ view }: BasicVariablesProps) {
  // Previous value per variable name, to flash cells that changed this refresh.
  const prev = useRef<Map<string, string>>(new Map())
  const previous = prev.current

  useEffect(() => {
    if (!view) return
    prev.current = new Map(view.rows.map((r) => [r.name, r.value]))
  })

  if (!view) {
    return <p className="placeholder">No data — pause the emulator to inspect variables.</p>
  }

  return (
    <div className="basic-vars">
      <div className="sysvars">
        {view.systemVars.map((s) => (
          <span key={s.label}>
            <span className="sysvar-label">{s.label}</span> <b>{s.value}</b>
          </span>
        ))}
      </div>
      {view.rows.length === 0 ? (
        <p className="vars-msg">No variables</p>
      ) : (
        <table className="vars-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            {view.rows.map((row) => {
              const before = previous.get(row.name)
              const changed = before !== undefined && before !== row.value
              return (
                <tr key={row.name}>
                  <th className="var-name">{row.name}</th>
                  <td className="var-type">{row.type}</td>
                  <td
                    // Re-key on value so the flash animation replays on change.
                    key={row.value}
                    className={changed ? "var-value valflash" : "var-value"}
                  >
                    {row.value}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
