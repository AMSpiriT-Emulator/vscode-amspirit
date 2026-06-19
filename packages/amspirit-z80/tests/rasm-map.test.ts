import { describe, expect, it } from "vitest"
import { RasmMapParser } from "../src/symbol-map/rasm-map.js"

// Verbatim `rasm src.asm -ob src.bin -map` stdout (rasm v3.0.8). Instruction
// lines carry a `(L<line>:<file>)` marker after the mnemonic; labels, EQU, ORG
// and banner lines do not.
const SAMPLE_MAP = `RASM v3.0.8 (build 20/02/2026) - Polaris
Pre-processing [hello.asm]
Assembling
Bnk|Real|Logic  Bytecode  [Time] Assembly
-----------------------------------------
             | SYNCHRO EQU 256
                                    ORG #8000 ; in memory workspace 0
000|8000     |                 START:
000|8000     | 3E 00       [02]     LD A,0                         (L3:hello.asm)
000|8002     |                 LOOP:
000|8002     | 3C          [01]     INC A                          (L5:hello.asm)
000|8003     | CD 00 00    [05]     CALL DELAY                     (L6:hello.asm)
000|8006     | FE 00       [02]     CP 10                          (L7:hello.asm)
000|8008     | 20 00       [02]     JR NZ,LOOP                     (L8:hello.asm)
000|800A     | C9          [03]     RET                            (L8:hello.asm)
000|800B     |                 DELAY:
000|800B     | 06 00       [02]     LD B,0                         (L11:hello.asm)
000|800D     |                 WAIT:
000|800D     | 10 00       [04]     DJNZ WAIT                      (L13:hello.asm)
000|800F     | C9          [03]     RET                            (L13:hello.asm)
Write binary file hello.bin (16 bytes)
`

describe("RasmMapParser", () => {
  const parse = () => new RasmMapParser().parse(SAMPLE_MAP)

  it("exposes a stable adapter id", () => {
    expect(new RasmMapParser().id).toBe("rasm-map")
  })

  it("maps source lines to their (hex) instruction addresses", () => {
    expect(parse().lineToAddresses("hello.asm", 3)).toEqual([0x8000]) // LD A,0
    expect(parse().lineToAddresses("hello.asm", 6)).toEqual([0x8003]) // CALL DELAY
    expect(parse().lineToAddresses("hello.asm", 11)).toEqual([0x800b]) // LD B,0
  })

  it("returns every address rasm attributes to a line", () => {
    // rasm attributes the trailing RET to the same line as the preceding JR.
    expect(parse().lineToAddresses("hello.asm", 8)).toEqual([0x8008, 0x800a])
  })

  it("returns no address for label-only / non-instruction lines", () => {
    expect(parse().lineToAddresses("hello.asm", 2)).toEqual([]) // START: label
    expect(parse().lineToAddresses("hello.asm", 4)).toEqual([]) // LOOP: label
  })

  it("matches by basename so absolute editor paths resolve", () => {
    expect(parse().lineToAddresses("/home/me/proj/hello.asm", 5)).toEqual([0x8002])
  })

  it("maps an address back to its source line", () => {
    expect(parse().addressToLine(0x8003)).toEqual({ file: "hello.asm", line: 6 })
    expect(parse().addressToLine(0x800f)).toEqual({ file: "hello.asm", line: 13 })
    expect(parse().addressToLine(0x9999)).toBeUndefined()
  })

  describe("labelToAddress", () => {
    it("resolves a label (the `NAME:` line) to its address", () => {
      expect(parse().labelToAddress("START")).toBe(0x8000)
      expect(parse().labelToAddress("DELAY")).toBe(0x800b)
      expect(parse().labelToAddress("WAIT")).toBe(0x800d)
    })

    it("matches case-insensitively", () => {
      expect(parse().labelToAddress("start")).toBe(0x8000)
    })

    it("returns undefined for an unknown label", () => {
      expect(parse().labelToAddress("nope")).toBeUndefined()
    })
  })

  describe("addressToLabel", () => {
    it("resolves an address back to the label defined there", () => {
      expect(parse().addressToLabel(0x8000)).toBe("START")
      expect(parse().addressToLabel(0x800b)).toBe("DELAY")
    })

    it("returns undefined for an address with no label", () => {
      expect(parse().addressToLabel(0x9999)).toBeUndefined()
    })
  })

  it("reports the program origin via lowestAddress", () => {
    expect(parse().lowestAddress()).toBe(0x8000)
  })

  it("strips ANSI colour codes (rasm colours its -map stdout)", () => {
    const esc = String.fromCharCode(0x1b)
    const colored =
      `${esc}[0m${esc}[95m000|8000     ${esc}[96m| 3E 00 ${esc}[0m` +
      `      ${esc}[32m[02] ${esc}[93m    LD${esc}[93m A,0` +
      `                      ${esc}[31m   (L8:hello-rasm.asm)`
    const map = new RasmMapParser().parse(colored)
    expect(map.lineToAddresses("hello-rasm.asm", 8)).toEqual([0x8000])
    expect(map.addressToLine(0x8000)).toEqual({ file: "hello-rasm.asm", line: 8 })
  })

  it("tolerates banner / empty output without throwing", () => {
    const map = new RasmMapParser().parse("RASM v3.0.8\nAssembling\n")
    expect(map.lineToAddresses("hello.asm", 3)).toEqual([])
    expect(map.lowestAddress()).toBeUndefined()
  })
})
