import { type EmulatorClient, errorMessage } from "@amspirit/shared"

export type PullOutcome =
  | { kind: "success"; source: string }
  | { kind: "empty" }
  | { kind: "notConnected" }
  | { kind: "error"; message: string }

export interface PullContext {
  client: Pick<EmulatorClient, "exportBasic">
  connected: boolean
}

/**
 * Pull the BASIC program currently held in the emulator and return its
 * detokenized source. An empty (or whitespace-only) program is reported
 * as `empty` so the caller can warn instead of opening a blank document.
 */
export async function performPull(ctx: PullContext): Promise<PullOutcome> {
  if (!ctx.connected) return { kind: "notConnected" }

  try {
    const source = await ctx.client.exportBasic()
    if (source.trim().length === 0) return { kind: "empty" }
    return { kind: "success", source }
  } catch (e: unknown) {
    return { kind: "error", message: errorMessage(e) }
  }
}
