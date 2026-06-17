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
