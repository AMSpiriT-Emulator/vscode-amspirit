import type { EmulatorClient } from "@amspirit/shared"

export type InjectMode = "inject" | "injectAndRun" | "resetAndInject" | "resetAndRun"

export interface InjectFlags {
  resetFirst: boolean
  runAfter: boolean
}

export type InjectOutcome =
  | { kind: "success"; message: string }
  | { kind: "noEditor" }
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
  source: string | undefined
  connected: boolean
}

export async function performInject(ctx: InjectContext, mode: InjectMode): Promise<InjectOutcome> {
  if (ctx.source === undefined) return { kind: "noEditor" }
  if (!ctx.connected) return { kind: "notConnected" }

  const flags = flagsFor(mode)
  try {
    await ctx.client.injectBasic(ctx.source, flags.resetFirst, flags.runAfter)
    return { kind: "success", message: successMessage(flags) }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    return { kind: "error", message }
  }
}
