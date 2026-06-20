import type { RegisterScope } from "../../src/registers-view.js"
import styles from "./registers-table.module.css"

interface RegistersTableProps {
  /** Register scopes to render, or `null` when unavailable (running/detached). */
  scopes: RegisterScope[] | null
  /** Called with a 16-bit address when a pointer register's value is clicked. */
  onGoto: (address: number) => void
}

/** Full names for the Z80 flag letters, shown as chip tooltips. */
const FLAG_NAMES: Record<string, string> = {
  S: "Sign",
  Z: "Zero",
  H: "Half-carry",
  "P/V": "Parity / Overflow",
  N: "Add / Subtract",
  C: "Carry",
}

/**
 * Z80 register view: the four scopes (Registers / Flags / Shadow / Interrupts)
 * the debugger used to surface in VS Code's generic DAP Variables tree, here as
 * a compact 8-bit-machine panel. Pointer registers (those carrying a memory
 * reference) render their value as a button that jumps the Memory view there.
 * Pure presentation; the panel feeds scopes and acts on the callback.
 */
export function RegistersTable({ scopes, onGoto }: RegistersTableProps) {
  if (!scopes) {
    return (
      <main>
        <p className={styles.placeholder}>No data — connect to a paused emulator.</p>
      </main>
    )
  }

  return (
    <main className={styles.root}>
      {scopes.map((scope) => (
        <section key={scope.name} className={styles.scope}>
          <h2 className={styles.heading}>{scope.name}</h2>
          {scope.name === "Flags" ? (
            <div className={styles.flags}>
              {scope.variables.map((v) => (
                <span
                  key={v.name}
                  className={styles.flag}
                  data-set={v.value === "1"}
                  title={`${FLAG_NAMES[v.name] ?? v.name} (${v.value})`}
                >
                  {v.name}
                </span>
              ))}
            </div>
          ) : (
            <dl className={styles.grid}>
              {scope.variables.map((v) => {
                const target =
                  v.memoryReference === undefined ? undefined : Number(v.memoryReference)
                return (
                  <div key={v.name} className={styles.entry}>
                    <dt className={styles.name}>{v.name}</dt>
                    <dd className={styles.value}>
                      {target !== undefined && Number.isFinite(target) ? (
                        <button
                          type="button"
                          className={styles.pointer}
                          aria-label={`${v.name} ${v.value} — view memory`}
                          title={`${v.name} → view memory at ${v.value}`}
                          onClick={() => onGoto(target & 0xffff)}
                        >
                          {v.value}
                        </button>
                      ) : (
                        v.value
                      )}
                    </dd>
                  </div>
                )
              })}
            </dl>
          )}
        </section>
      ))}
    </main>
  )
}
