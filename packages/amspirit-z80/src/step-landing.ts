/**
 * Decide whether a single-instruction step has settled.
 *
 * The emulator stays paused throughout a `step` and applies it "a frame later",
 * so a poll right after `step()` can read a transient mid-instruction PC (e.g.
 * one byte into a two-byte `LD H,n`). Treat the step as landed only once the PC
 * has both moved off `prePc` *and* stayed put across two consecutive polls.
 *
 * @param prePc  PC sampled just before `step()`
 * @param pc     PC from the latest poll
 * @param prevPc PC from the previous poll (`undefined` on the first poll)
 */
export function stepSettled(prePc: number, pc: number, prevPc: number | undefined): boolean {
  return pc !== prePc && pc === prevPc
}

/**
 * Whether a launch-entry step sequence has advanced far enough: the PC has moved
 * at least `instrLen` bytes forward from the entry `startPc` (16-bit wrap).
 *
 * The launch `exec` (PC override + unpause mid-instruction) leaves a dirty
 * prefetch latch, so the first one or two raw steps land mid-instruction before
 * the PC re-syncs to real boundaries. Stepping (bounded) until this returns
 * `true` lands on the next real instruction boundary without the runaway risk of
 * a free-running temp breakpoint — which escapes into firmware on the rare run
 * where the latch shifts boundaries so the temp address is never hit.
 *
 * @param startPc  the launch entry address (PC at stop-on-entry)
 * @param instrLen byte length of the entry instruction
 * @param pc       the current (settled) PC
 */
export function launchEntryReached(startPc: number, instrLen: number, pc: number): boolean {
  return ((pc - startPc) & 0xffff) >= instrLen
}
