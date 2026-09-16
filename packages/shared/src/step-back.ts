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

import { errorMessage } from "./errors.js"

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

/** The subset of `EmulatorClient` the step-back driver needs. */
interface TimelapseClient {
  getTimelapse(): Promise<TimelapseState>
  tlBack(): Promise<void>
}

/**
 * Outcome of asking for a step back: the rewind is queued and `before` is the
 * state to poll against, or the reason to show the user.
 */
export type StepBackOutcome = { ok: true; before: TimelapseState } | { ok: false; reason: string }

/**
 * Read the timelapse, {@link checkStepBack}, then queue the rewind. A transport
 * error becomes a refusal reason, so the caller has one outcome to translate to
 * DAP. The rewind only applies on the next frame tick — poll it with
 * {@link stepBackAppliedProbe}.
 */
export async function requestStepBack(
  client: TimelapseClient,
  kind: "z80" | "basic",
): Promise<StepBackOutcome> {
  let before: TimelapseState
  try {
    before = await client.getTimelapse()
  } catch (e) {
    return { ok: false, reason: errorMessage(e) }
  }
  const check = checkStepBack(before, kind)
  if (!check.ok) return { ok: false, reason: check.reason }
  try {
    await client.tlBack()
  } catch (e) {
    return { ok: false, reason: errorMessage(e) }
  }
  return { ok: true, before }
}

/**
 * A `StopPoller` probe that reports done once the queued rewind is applied
 * ({@link stepBackApplied}), or once `maxPolls` calls are spent. A transient
 * read error does not end the poll: a rewind the emulator refused at apply time
 * must still resolve, and the budget is what guarantees that.
 */
export function stepBackAppliedProbe(
  client: Pick<TimelapseClient, "getTimelapse">,
  before: TimelapseState,
  maxPolls: number,
): () => Promise<boolean> {
  let attempts = 0
  return async () => {
    attempts += 1
    try {
      if (stepBackApplied(before, await client.getTimelapse())) return true
    } catch {
      // transient read error; keep polling
    }
    return attempts >= maxPolls
  }
}
