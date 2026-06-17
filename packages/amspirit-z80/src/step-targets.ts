import type { DisasmInstruction } from "@amspirit/shared"

/**
 * What `next` (step-over) should do for the instruction at PC:
 * - `runTo`: set a temporary breakpoint at `addr` (the instruction after a
 *   CALL/RST) and resume, so the subroutine runs to completion.
 * - `stepOne`: just execute a single instruction (everything else, including
 *   plain jumps and returns).
 */
export type StepOverPlan = { kind: "runTo"; addr: number } | { kind: "stepOne" }

/** Decide how to step over the given instruction. */
export function planStepOver(instr: DisasmInstruction): StepOverPlan {
  if (isCall(instr.text)) {
    return { kind: "runTo", addr: (instr.address + instr.bytes.length) & 0xffff }
  }
  return { kind: "stepOne" }
}

/** CALL (incl. conditional) and RST are the only instructions to step over. */
function isCall(text: string): boolean {
  return text.startsWith("CALL ") || text.startsWith("RST ")
}

/**
 * The return address sitting on top of the stack (little-endian), used by
 * step-out: set a temporary breakpoint there and resume. `bytes` are the two
 * bytes read at SP; `undefined` if fewer than two were available.
 */
export function returnAddress(bytes: readonly number[]): number | undefined {
  const lo = bytes[0]
  const hi = bytes[1]
  if (lo === undefined || hi === undefined) return undefined
  return (lo | (hi << 8)) & 0xffff
}
