import type { BasicState, EmulatorClient } from "@amspirit/shared"
import { type BasicVar, decodeCpcString, parseBasicVars } from "./basic-var-parser.js"

/**
 * Single source of truth for reading the live Locomotive BASIC variables off the
 * emulator, shared by the DAP Variables scope and the webview Variables card so
 * the two cannot drift. Reads the interpreter state, decodes the variable chains
 * and resolves string contents from RAM.
 */

/** Bytes of the 27 variable-chain heads (27 × 2-byte LE pointers). */
export const CHAIN_HEADS_BYTES = 54
/** Cap on the variable-zone read, mirroring the amspirit-lite web debugger. */
export const MAX_VAR_BYTES = 8192

export interface ResolvedBasicVars {
  state: BasicState
  vars: BasicVar[]
}

export async function readResolvedBasicVars(client: EmulatorClient): Promise<ResolvedBasicVars> {
  const state = await client.getBasicState()
  const [chainBytes, varBytes] = await Promise.all([
    client.readRam(state.chain_heads_addr, CHAIN_HEADS_BYTES),
    client.readRam(state.txttop, Math.min(state.var_size, MAX_VAR_BYTES)),
  ])
  const vars = parseBasicVars(chainBytes, varBytes)
  await Promise.all(
    vars.map(async (v) => {
      if (v.type === "string" && v.strLen > 0) {
        try {
          v.value = `"${decodeCpcString(await client.readRam(v.strAddr, v.strLen))}"`
        } catch {
          // keep the "(len N)" placeholder on read failure
        }
      }
    }),
  )
  return { state, vars }
}
