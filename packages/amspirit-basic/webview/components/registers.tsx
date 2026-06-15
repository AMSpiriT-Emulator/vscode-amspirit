import type { RegisterView } from "../../src/debug/register-view.js"

interface RegistersProps {
  view: RegisterView | null
}

/** Pure presentational view of the Z80 registers, flags and interrupt state. */
export function Registers({ view }: RegistersProps) {
  if (!view) {
    return <p className="placeholder">No data — pause the emulator to inspect registers.</p>
  }
  return (
    <div className="registers">
      <table>
        <tbody>
          {view.registers.map((r) => (
            <tr key={r.name}>
              <th>{r.name}</th>
              <td>{r.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="flags">
        Flags: <span>{view.flags}</span>
      </p>
      <table>
        <tbody>
          {view.interrupts.map((r) => (
            <tr key={r.name}>
              <th>{r.name}</th>
              <td>{r.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
