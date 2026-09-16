import { describe, expect, it } from "vitest"
import { buildHistoryRows } from "../src/history-view/history-view-model.js"

describe("buildHistoryRows", () => {
  it("decodes each history entry, showing only the bytes the instruction consumes", () => {
    // hex is a 4-byte CPU fetch window; the instruction may be shorter.
    // 3E01 = LD A,0x01 (2 bytes); CD00BB = CALL 0xBB00 (3 bytes).
    const rows = buildHistoryRows([
      { pc: 0xb942, hex: "3E0100BB" },
      { pc: 0xb944, hex: "CD00BB00" },
    ])
    expect(rows).toEqual([
      // Newest first: the last executed instruction is row 0 and is current.
      { address: "B944", bytes: "CD 00 BB", text: "CALL 0xBB00", current: true },
      { address: "B942", bytes: "3E 01", text: "LD A,0x01", current: false },
    ])
  })

  it("returns an empty array for no history", () => {
    expect(buildHistoryRows([])).toEqual([])
  })

  it("renders a single entry as the current row", () => {
    const rows = buildHistoryRows([{ pc: 0x8000, hex: "00" }])
    expect(rows).toEqual([{ address: "8000", bytes: "00", text: "NOP", current: true }])
  })

  it("renders a missing fetch window without inventing an instruction", () => {
    const rows = buildHistoryRows([{ pc: 0x0000, hex: "" }])
    expect(rows).toEqual([{ address: "0000", bytes: "", text: "", current: true }])
  })

  it("ignores a trailing half-byte in the hex window", () => {
    // Only whole byte pairs are parsed; a stray final nibble is dropped, not
    // misparsed. "0000C" -> [00, 00] -> NOP (consumes 1 byte).
    const rows = buildHistoryRows([{ pc: 0x9000, hex: "0000C" }])
    expect(rows).toEqual([{ address: "9000", bytes: "00", text: "NOP", current: true }])
  })
})
