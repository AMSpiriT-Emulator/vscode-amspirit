import type { BasicState, EmulatorClient } from "@amspirit/shared"
import { describe, expect, it } from "vitest"
import {
  CHAIN_HEADS_BYTES,
  MAX_VAR_BYTES,
  readResolvedBasicVars,
} from "../../src/debug/basic-vars-reader.js"

const state: BasicState = {
  cur_linenum: 10,
  stmt_addr: 0xae1b,
  basic_ver: 10,
  prog_start: 0x0170,
  txttop: 0x0200,
  vartop: 0x0300,
  arrend: 0x0400,
  prog_size: 0x90,
  var_size: 0x40,
  chain_heads_addr: 0xb000,
}

/** One string variable `S$` of length 5 stored at 0x1000, in chain 0. */
const chainBytes = (() => {
  const b = new Array(CHAIN_HEADS_BYTES).fill(0)
  b[0] = 0x01 // ptr = 1 (LE) → rel = 0 in the var zone
  return b
})()
const varBytes = [
  0x00,
  0x00, // next pointer = 0 (end of chain)
  0xd3, // 'S' (0x53) with bit 7 set = last/only name char
  0x02, // type byte: string
  0x05, // strLen = 5
  0x00,
  0x10, // strAddr = 0x1000 (LE)
]

function fakeClient(): { client: EmulatorClient; reads: Array<{ addr: number; len: number }> } {
  const reads: Array<{ addr: number; len: number }> = []
  const client = {
    getBasicState: async () => state,
    readRam: async (addr: number, len: number) => {
      reads.push({ addr, len })
      if (addr === state.chain_heads_addr) return chainBytes
      if (addr === state.txttop) return varBytes
      if (addr === 0x1000) return [0x48, 0x45, 0x4c, 0x4c, 0x4f] // "HELLO"
      return []
    },
  } as unknown as EmulatorClient
  return { client, reads }
}

describe("readResolvedBasicVars", () => {
  it("reads the chain heads and the (capped) variable zone", async () => {
    const { client, reads } = fakeClient()
    await readResolvedBasicVars(client)
    expect(reads).toContainEqual({ addr: state.chain_heads_addr, len: CHAIN_HEADS_BYTES })
    expect(reads).toContainEqual({
      addr: state.txttop,
      len: Math.min(state.var_size, MAX_VAR_BYTES),
    })
  })

  it("decodes variables and resolves string contents from RAM", async () => {
    const { client } = fakeClient()
    const { state: s, vars } = await readResolvedBasicVars(client)
    expect(s).toBe(state)
    expect(vars).toHaveLength(1)
    expect(vars[0]?.name).toBe("S$")
    expect(vars[0]?.value).toBe('"HELLO"')
  })

  it("keeps the placeholder when a string read fails", async () => {
    const reads: number[] = []
    const client = {
      getBasicState: async () => state,
      readRam: async (addr: number) => {
        if (addr === state.chain_heads_addr) return chainBytes
        if (addr === state.txttop) return varBytes
        reads.push(addr)
        throw new Error("RAM read failed")
      },
    } as unknown as EmulatorClient
    const { vars } = await readResolvedBasicVars(client)
    expect(reads).toContain(0x1000) // it tried
    expect(vars[0]?.value).toBe("(len 5)") // placeholder preserved
  })
})
