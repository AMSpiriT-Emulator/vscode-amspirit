/**
 * Breakpoint addresses grouped by source file.
 *
 * VS Code sends one `setBreakpoints` request per source file, carrying only
 * that file's breakpoints. The emulator, on the other hand, takes the whole
 * set on every `/api/z80_bp` post. Keeping each file's addresses apart lets a
 * request for `helper.asm` replace only `helper.asm`, so the breakpoints of
 * `main.asm` survive it. Pure.
 */
export class BreakpointSet {
  private readonly byPath = new Map<string, readonly number[]>()

  /** Replace the addresses of one source file (an empty list clears it). */
  replace(path: string, addrs: readonly number[]): void {
    if (addrs.length === 0) this.byPath.delete(path)
    else this.byPath.set(path, addrs)
  }

  /** The union over every file, deduped, in insertion order. */
  all(): number[] {
    const seen = new Set<number>()
    for (const addrs of this.byPath.values()) {
      for (const a of addrs) seen.add(a)
    }
    return [...seen]
  }
}
