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

/**
 * What `stepOut` should do:
 * - `runTo`: the return address on the stack is an instruction of the program,
 *   so set a temporary breakpoint there and resume.
 * - `noCaller`: it is not (top level of the program, where the stack still
 *   holds the firmware's return address, or no readable stack). Running there
 *   would run the whole program to its final RET, so refuse instead.
 */
export type StepOutPlan =
  | { kind: "runTo"; addr: number }
  | { kind: "noCaller"; addr: number | undefined }

/**
 * Decide how to step out. `stackBytes` are the two bytes read at SP;
 * `isProgramAddress` says whether an address belongs to the debugged program
 * (a symbol-map instruction start).
 */
export function planStepOut(
  stackBytes: readonly number[],
  isProgramAddress: (addr: number) => boolean,
): StepOutPlan {
  const addr = returnAddress(stackBytes)
  if (addr !== undefined && isProgramAddress(addr)) return { kind: "runTo", addr }
  return { kind: "noCaller", addr }
}
