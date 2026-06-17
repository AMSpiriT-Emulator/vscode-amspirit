/** Synchronous memory accessor: read `len` bytes from `addr` (16-bit wrap). */
export type ReadMem = (addr: number, len: number) => number[]

/** One reconstructed call-stack entry. */
export interface CallFrame {
  /**
   * Address to map to a source line: the CALL/RST instruction site for caller
   * frames, or the live PC for the innermost (top) frame.
   */
  address: number
  /** Return address read off the stack (`undefined` for the top frame). */
  returnAddress: number | undefined
}

/** CALL nn and its conditional forms (all 3-byte instructions). */
const CALL_OPCODES = new Set([0xcd, 0xc4, 0xcc, 0xd4, 0xdc, 0xe4, 0xec, 0xf4, 0xfc])
/** RST p restarts (single-byte). */
const RST_OPCODES = new Set([0xc7, 0xcf, 0xd7, 0xdf, 0xe7, 0xef, 0xf7, 0xff])

/** Stack words to scan upward from SP, and frames to return, by default. */
const DEFAULT_MAX_DEPTH = 64
const DEFAULT_MAX_FRAMES = 20

interface Options {
  /** Stack words scanned upward from SP (default {@link DEFAULT_MAX_DEPTH}). */
  maxDepth?: number
  /** Frames returned, including the PC frame (default {@link DEFAULT_MAX_FRAMES}). */
  maxFrames?: number
}

/**
 * Reconstruct the Z80 call stack with no frame pointers, à la DeZog: the PC is
 * frame 0, then scan stack memory upward from SP and treat any 16-bit word that
 * is preceded by a `CALL`/`RST` instruction as a pushed return address — its
 * instruction site becomes a caller frame. Non-return words (saved registers,
 * locals) are skipped. This is a heuristic: data that happens to follow a
 * CALL/RST opcode byte can yield a spurious frame, which is acceptable for v1.
 */
export function reconstructCallStack(
  pc: number,
  sp: number,
  read: ReadMem,
  opts: Options = {},
): CallFrame[] {
  const maxDepth = opts.maxDepth ?? DEFAULT_MAX_DEPTH
  const maxFrames = opts.maxFrames ?? DEFAULT_MAX_FRAMES
  const frames: CallFrame[] = [{ address: pc & 0xffff, returnAddress: undefined }]

  for (let i = 0; i < maxDepth && frames.length < maxFrames; i++) {
    const [lo, hi] = read((sp + i * 2) & 0xffff, 2)
    if (lo === undefined || hi === undefined) break
    const ret = (lo | (hi << 8)) & 0xffff
    const site = callSite(ret, read)
    if (site !== undefined) frames.push({ address: site, returnAddress: ret })
  }
  return frames
}

/**
 * The instruction address that would have pushed `ret`: `ret - 3` if a CALL
 * sits there, else `ret - 1` if an RST does, else `undefined` (not a return).
 */
function callSite(ret: number, read: ReadMem): number | undefined {
  const callAddr = (ret - 3) & 0xffff
  if (CALL_OPCODES.has(read(callAddr, 1)[0] ?? -1)) return callAddr
  const rstAddr = (ret - 1) & 0xffff
  if (RST_OPCODES.has(read(rstAddr, 1)[0] ?? -1)) return rstAddr
  return undefined
}
