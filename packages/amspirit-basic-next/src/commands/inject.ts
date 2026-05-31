import { type EmulatorClient, errorMessage } from "@amspirit/shared"

export type InjectMode = "inject" | "injectAndRun" | "resetAndInject" | "resetAndRun"

export interface InjectFlags {
  resetFirst: boolean
  runAfter: boolean
}

export type InjectOutcome =
  | { kind: "success"; message: string }
  | { kind: "notConnected" }
  | { kind: "error"; message: string }

const FLAGS: Record<InjectMode, InjectFlags> = {
  inject: { resetFirst: false, runAfter: false },
  injectAndRun: { resetFirst: false, runAfter: true },
  resetAndInject: { resetFirst: true, runAfter: false },
  resetAndRun: { resetFirst: true, runAfter: true },
}

export function flagsFor(mode: InjectMode): InjectFlags {
  return FLAGS[mode]
}

function successMessage(flags: InjectFlags): string {
  if (flags.resetFirst) {
    const runHint = flags.runAfter ? ", then RUN" : ""
    return `AMSpiriT: hard reset — BASIC will inject after boot (~3 s)${runHint}.`
  }
  return flags.runAfter
    ? "AMSpiriT: BASIC injected — running…"
    : "AMSpiriT: BASIC injected — type RUN."
}

export interface InjectContext {
  client: Pick<EmulatorClient, "injectBasic">
  source: string
  connected: boolean
}

export async function performInject(ctx: InjectContext, mode: InjectMode): Promise<InjectOutcome> {
  if (!ctx.connected) return { kind: "notConnected" }

  const flags = flagsFor(mode)
  try {
    await ctx.client.injectBasic(ctx.source, flags.resetFirst, flags.runAfter)
    return { kind: "success", message: successMessage(flags) }
  } catch (e: unknown) {
    return { kind: "error", message: errorMessage(e) }
  }
}
