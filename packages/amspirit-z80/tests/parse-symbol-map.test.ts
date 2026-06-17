import { describe, expect, it } from "vitest"
import { parseSymbolMap } from "../src/symbol-map/parse-symbol-map.js"

const SLD = "|SLD.data.version|1\nmain.asm|10||0|2|32768|T|\n"
const RASM = "000|8000     | 3E 00 [02] LD A,0 (L3:main.asm)\n"

describe("parseSymbolMap", () => {
  it("uses the SLD adapter for a .sld file", () => {
    expect(parseSymbolMap("out.sld", SLD).lineToAddresses("main.asm", 10)).toEqual([32768])
  })

  it("uses the rasm adapter for a .map file", () => {
    expect(parseSymbolMap("out.map", RASM).lineToAddresses("main.asm", 3)).toEqual([0x8000])
  })

  it("sniffs SLD content when the extension is unknown", () => {
    expect(parseSymbolMap("out.txt", SLD).lineToAddresses("main.asm", 10)).toEqual([32768])
  })

  it("falls back to the rasm adapter for unknown extension + non-SLD content", () => {
    expect(parseSymbolMap("out.txt", RASM).lineToAddresses("main.asm", 3)).toEqual([0x8000])
  })
})
