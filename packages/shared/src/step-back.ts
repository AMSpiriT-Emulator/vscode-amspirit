/**
 * Step Back over the emulator timelapse.
 *
 * With `--enable-timelapse`, the emulator saves a snapshot before each
 * debugger step, tagged with the step's kind (`z80` or `basic`), and one per
 * N frames while running (`frame`). `POST /api/tl_back` restores the newest
 * snapshot, but only when its kind matches the current context
 * (`emu.tl_step_kind`); otherwise it does nothing, silently. These helpers
 * make that contract explicit for a DAP `stepBack`. Pure.
 */

/** Kind of the snapshots the timelapse currently navigates. */
export type TimelapseStepKind = "frame" | "basic" | "z80"

/** Timelapse state from `emu.tl_*` (`/api/ping`, `/api/state`). */
export interface TimelapseState {
  /** `true` when the timelapse is enabled and holds at least one snapshot. */
  active: boolean
  /** Snapshots of `stepKind` available behind the current position. */
  stepsBack: number
  /** Snapshots available ahead (after a rewind; no forward endpoint yet). */
  stepsFwd: number
  stepKind: TimelapseStepKind
}

/** Whether a step back can be issued now, with the reason shown when not. */
export type StepBackCheck = { ok: true } | { ok: false; reason: string }

/**
 * Decide whether a `stepBack` of `kind` (the debug session's granularity) can
 * be issued against `tl`. The reasons are user-facing.
 */
export function checkStepBack(tl: TimelapseState, kind: "z80" | "basic"): StepBackCheck {
  if (!tl.active) {
    return {
      ok: false,
      reason:
        "Step Back needs the emulator timelapse. Start the emulator with --enable-timelapse " +
        "(emulatorArgs setting), then step once.",
    }
  }
  if (tl.stepKind !== kind) {
    return {
      ok: false,
      reason:
        `Step Back can only undo a ${kind} step. The newest timelapse snapshots are ` +
        `${tl.stepKind} snapshots. Step once, then step back.`,
    }
  }
  if (tl.stepsBack <= 0) return { ok: false, reason: `No ${kind} step left to undo.` }
  return { ok: true }
}

/**
 * Whether the queued `tl_back` has been applied: the emulator consumed one
 * snapshot, so the count behind the position dropped. Polled after `tlBack()`
 * because the request only queues the rewind for the next frame tick.
 */
export function stepBackApplied(before: TimelapseState, now: TimelapseState): boolean {
  return now.stepsBack < before.stepsBack
}
