import { describe, expect, it } from "vitest"
import { SjasmplusSldParser } from "../src/symbol-map/sjasmplus-sld.js"

// A small but representative SLD dump, matching real `sjasmplus --sld` output
// (8 fields: `source|line|defFile|defLine|page|value|type|data`). Only type `T`
// (trace) records carry an instruction address; everything else is metadata.
const SAMPLE_SLD = `|SLD.data.version|1
main.asm|1||0|0|-1|Z|pages.size:16384,pages.count:8,slots.count:4
main.asm|10||0|2|32768|F|start
main.asm|10||0|2|32768|L|,start,
main.asm|10||0|2|32768|T|
main.asm|11||0|2|32770|T|
main.asm|12||0|2|32773|T|
main.asm|12||0|2|32776|T|
main.asm|13||0|2|-1|K|some keyword metadata
main.asm|20||0|2|32790|L|,label,
math.asm|5||0|2|40000|T|
math.asm|6||0|2|40003|T|

`

describe("SjasmplusSldParser", () => {
  const parse = () => new SjasmplusSldParser().parse(SAMPLE_SLD)

  it("exposes a stable adapter id", () => {
    expect(new SjasmplusSldParser().id).toBe("sjasmplus-sld")
  })

  describe("lineToAddresses", () => {
    it("returns the single instruction address for a line", () => {
      expect(parse().lineToAddresses("main.asm", 10)).toEqual([32768])
    })

    it("returns every address emitted for a line (e.g. macro expansion)", () => {
      expect(parse().lineToAddresses("main.asm", 12)).toEqual([32773, 32776])
    })

    it("returns no address for a line without code (label/keyword only)", () => {
      expect(parse().lineToAddresses("main.asm", 13)).toEqual([])
      expect(parse().lineToAddresses("main.asm", 20)).toEqual([])
    })

    it("resolves addresses across included files", () => {
      expect(parse().lineToAddresses("math.asm", 5)).toEqual([40000])
    })

    it("matches by basename so absolute editor paths resolve", () => {
      expect(parse().lineToAddresses("/home/me/proj/src/main.asm", 11)).toEqual([32770])
    })

    it("returns empty for an unknown file or line", () => {
      expect(parse().lineToAddresses("nope.asm", 10)).toEqual([])
      expect(parse().lineToAddresses("main.asm", 999)).toEqual([])
    })
  })

  describe("addressToLine", () => {
    it("maps an instruction address back to its source location", () => {
      expect(parse().addressToLine(32773)).toEqual({ file: "main.asm", line: 12 })
      expect(parse().addressToLine(40003)).toEqual({ file: "math.asm", line: 6 })
    })

    it("returns undefined for an address with no instruction", () => {
      expect(parse().addressToLine(0x9999)).toBeUndefined()
    })
  })

  it("accepts a hex-encoded value field", () => {
    const map = new SjasmplusSldParser().parse("main.asm|10||0|2|0x8000|T|\n")
    expect(map.lineToAddresses("main.asm", 10)).toEqual([0x8000])
    expect(map.addressToLine(0x8000)).toEqual({ file: "main.asm", line: 10 })
  })

  it("skips trace records with a missing or malformed address", () => {
    const map = new SjasmplusSldParser().parse(
      "main.asm|10||0|2||T|\nmain.asm|11||0|2|notanum|T|\n",
    )
    expect(map.lineToAddresses("main.asm", 10)).toEqual([])
    expect(map.lineToAddresses("main.asm", 11)).toEqual([])
  })

  it("parses a verbatim sjasmplus --sld dump (real v1.23.1 output)", () => {
    // Captured from `sjasmplus --sld` on a tiny CPC program (DEVICE AMSTRADCPC6128).
    const real = `|SLD.data.version|1
test.asm|1||0|0|-1|-1|Z|pages.size:16384,pages.count:8,slots.count:4,slots.adr:0,16384,32768,49152
test.asm|3||0|2|32768|F|start
test.asm|3||0|2|32768|L|,start,
test.asm|4||0|2|32768|T|
test.asm|5||0|2|32770|T|
test.asm|6||0|2|32772|T|
test.asm|7||0|2|32775|T|
test.asm|8||0|2|32776|F|sub
test.asm|8||0|2|32776|L|,sub,,+used
test.asm|9||0|2|32776|T|
test.asm|10||0|2|32777|T|
`
    const map = new SjasmplusSldParser().parse(real)
    expect(map.lineToAddresses("test.asm", 4)).toEqual([32768]) // ld a,1
    expect(map.lineToAddresses("test.asm", 6)).toEqual([32772]) // call sub
    expect(map.lineToAddresses("test.asm", 8)).toEqual([]) // label line, no code
    expect(map.addressToLine(32775)).toEqual({ file: "test.asm", line: 7 }) // ret
  })

  describe("lowestAddress", () => {
    it("returns the lowest instruction address (program origin)", () => {
      expect(parse().lowestAddress()).toBe(32768)
    })

    it("returns undefined when there is no code", () => {
      expect(
        new SjasmplusSldParser().parse("|SLD.data.version|1\n").lowestAddress(),
      ).toBeUndefined()
    })
  })

  it("tolerates an empty or header-only map without throwing", () => {
    const map = new SjasmplusSldParser().parse("|SLD.data.version|1\n")
    expect(map.lineToAddresses("main.asm", 10)).toEqual([])
    expect(map.addressToLine(32768)).toBeUndefined()
  })
})
