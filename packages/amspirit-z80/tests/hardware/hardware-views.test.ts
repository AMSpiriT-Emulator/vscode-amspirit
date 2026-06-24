import type { CrtcState, EmuState, FdcState, GateArrayState, MemmapState } from "@amspirit/shared"
import { describe, expect, it } from "vitest"
import {
  buildCrtcScopes,
  buildFdcScopes,
  buildGateArrayScopes,
} from "../../src/hardware/hardware-views.js"
import type { RegisterScope } from "../../src/registers-view.js"

const scope = (scopes: RegisterScope[], name: string): RegisterScope => {
  const s = scopes.find((x) => x.name === name)
  if (!s) throw new Error(`scope ${name} not found`)
  return s
}
const entry = (scopes: RegisterScope[], scopeName: string, varName: string) => {
  const v = scope(scopes, scopeName).variables.find((x) => x.name === varName)
  if (!v) throw new Error(`var ${varName} not found in ${scopeName}`)
  return v
}
const value = (scopes: RegisterScope[], scopeName: string, varName: string): string =>
  entry(scopes, scopeName, varName).value

const ga: GateArrayState = {
  mode: 1,
  borderIdx: 3,
  borderRgb: 0xff0000,
  hbl: false,
  vbl: true,
  inkIdx: Array.from({ length: 16 }, (_, i) => i),
  inkRgb: Array.from({ length: 16 }, (_, i) => i * 0x010101),
}
const memmap: MemmapState = {
  regions: [
    { base: 0, name: "0000", rom: true, romBank: 255 },
    { base: 16384, name: "4000", rom: false, ramBank: 1, ext: false },
    { base: 49152, name: "C000", rom: true, romBank: 0 },
  ],
  rmr: 0x89,
  ramMode: 2,
  ramPage: 3,
}

describe("buildGateArrayScopes", () => {
  const scopes = buildGateArrayScopes(ga, memmap)

  it("formats the video mode", () => {
    expect(value(scopes, "Video", "Mode")).toBe("1")
  })

  it("renders HBL/VBL as flag chips with hints", () => {
    const signals = scope(scopes, "Signals")
    expect(signals.kind).toBe("flags")
    expect(value(scopes, "Signals", "HBL")).toBe("0")
    expect(value(scopes, "Signals", "VBL")).toBe("1")
    expect(entry(scopes, "Signals", "VBL").hint).toMatch(/vertical/i)
  })

  it("renders 16 PENs + border as a palette grid (index value + swatch)", () => {
    const palette = scope(scopes, "Palette")
    expect(palette.kind).toBe("palette")
    expect(palette.variables).toHaveLength(17)
    expect(value(scopes, "Palette", "PEN0")).toBe("0")
    expect(entry(scopes, "Palette", "PEN0").swatch).toBe("#000000")
    expect(value(scopes, "Palette", "PEN15")).toBe("15")
    expect(entry(scopes, "Palette", "PEN15").swatch).toBe("#0F0F0F")
    expect(value(scopes, "Palette", "Border")).toBe("3")
    expect(entry(scopes, "Palette", "Border").swatch).toBe("#FF0000")
  })

  it("sets the border ink apart with a divider", () => {
    expect(entry(scopes, "Palette", "Border").divider).toBe(true)
    expect(entry(scopes, "Palette", "PEN0").divider).toBeUndefined()
  })

  it("dims the PENs unused in the current video mode", () => {
    // MODE 1 shows 4 PENs: PEN0-3 active, PEN4-15 dimmed; the border is never dimmed.
    expect(entry(scopes, "Palette", "PEN3").muted).toBeUndefined()
    expect(entry(scopes, "Palette", "PEN4").muted).toBe(true)
    expect(entry(scopes, "Palette", "Border").muted).toBeUndefined()
    // MODE 0 shows all 16.
    const mode0 = buildGateArrayScopes({ ...ga, mode: 0 }, memmap)
    expect(entry(mode0, "Palette", "PEN15").muted).toBeUndefined()
    // MODE 2 shows 2.
    const mode2 = buildGateArrayScopes({ ...ga, mode: 2 }, memmap)
    expect(entry(mode2, "Palette", "PEN2").muted).toBe(true)
  })

  it("formats RMR as #-hex and surfaces RAM banking", () => {
    expect(value(scopes, "Banking", "RMR")).toBe("#89")
    expect(value(scopes, "Banking", "RAM mode")).toBe("2")
    expect(value(scopes, "Banking", "RAM page")).toBe("3")
  })

  it("renders the memory map as a ROM/RAM bar with ROM names and bare addresses", () => {
    const map = scope(scopes, "Memory map")
    expect(map.kind).toBe("membar")
    expect(value(scopes, "Memory map", "0000")).toBe("Lower")
    expect(entry(scopes, "Memory map", "0000").rom).toBe(true)
    expect(value(scopes, "Memory map", "4000")).toBe("RAM 1")
    expect(entry(scopes, "Memory map", "4000").rom).toBe(false)
    expect(value(scopes, "Memory map", "C000")).toBe("BASIC")
  })

  it("names AMSDOS and extended RAM, and defaults missing banks", () => {
    const m = buildGateArrayScopes(ga, {
      ...memmap,
      regions: [
        { base: 0, name: "0000", rom: true, romBank: 7 },
        { base: 16384, name: "4000", rom: false, ramBank: 5, ext: true },
        { base: 32768, name: "8000", rom: true },
        { base: 49152, name: "C000", rom: false },
      ],
    })
    expect(value(m, "Memory map", "0000")).toBe("AMSDOS")
    expect(value(m, "Memory map", "4000")).toBe("RAM 5 (ext)")
    // A ROM region with no bank number defaults to 0 → BASIC.
    expect(value(m, "Memory map", "8000")).toBe("BASIC")
    expect(value(m, "Memory map", "C000")).toBe("RAM 0")
  })

  it("tolerates short ink arrays by defaulting to 0/black", () => {
    const scopes2 = buildGateArrayScopes({ ...ga, inkIdx: [], inkRgb: [] }, memmap)
    const pen0 = entry(scopes2, "Palette", "PEN0")
    expect(pen0.value).toBe("0")
    expect(pen0.swatch).toBe("#000000")
  })
})

const fdc: FdcState = {
  msr: 0xd0, // 0b11010000: RQM, DIO, CB set
  sr0: 0xa8, // 0b10101000: IC=2, SE set, NR set
  sr1: 0x00,
  sr2: 0x01,
  motor: true,
  drive: 1,
}

describe("buildFdcScopes", () => {
  const scopes = buildFdcScopes(fdc)

  it("formats MSR + SR0-2 as #-hex", () => {
    expect(value(scopes, "Status registers", "MSR")).toBe("#D0")
    expect(value(scopes, "Status registers", "SR0")).toBe("#A8")
    expect(value(scopes, "Status registers", "SR2")).toBe("#01")
  })

  it("decodes the MSR bits into chips with hints", () => {
    expect(scope(scopes, "MSR bits").kind).toBe("flags")
    expect(value(scopes, "MSR bits", "RQM")).toBe("1")
    expect(value(scopes, "MSR bits", "EXM")).toBe("0")
    expect(value(scopes, "MSR bits", "CB")).toBe("1")
    expect(entry(scopes, "MSR bits", "RQM").hint).toMatch(/request for master/i)
  })

  it("decodes SR0 into chips and the interrupt code", () => {
    expect(scope(scopes, "SR0 bits").kind).toBe("flags")
    expect(value(scopes, "SR0 bits", "SE")).toBe("1")
    expect(value(scopes, "SR0 bits", "NR")).toBe("1")
    expect(value(scopes, "SR0 bits", "EC")).toBe("0")
    expect(value(scopes, "Drive", "IC")).toBe("2")
  })

  it("shows the motor and the active drive as a letter", () => {
    expect(value(scopes, "Drive", "Motor")).toBe("ON")
    expect(value(scopes, "Drive", "Active")).toBe("B")
    expect(value(buildFdcScopes({ ...fdc, drive: 0, motor: false }), "Drive", "Active")).toBe("A")
    expect(value(buildFdcScopes({ ...fdc, motor: false }), "Drive", "Motor")).toBe("OFF")
  })
})

describe("buildCrtcScopes", () => {
  const emu: EmuState = { fps: 50, frame: 1234, paused: false, cpcModel: 2, crtcType: 1 }
  const crtc: CrtcState = {
    regs: [63, 40, 46, 142, 38, 0, 25, 30, 0, 7, 0, 0, 48, 0],
    selectedReg: 6,
    rasterline: 87,
    vsync: true,
  }
  const scopes = buildCrtcScopes(crtc, emu)

  it("shows the CRTC type, chip label, selected register and raster line", () => {
    expect(value(scopes, "CRTC", "Type")).toBe("1")
    expect(value(scopes, "CRTC", "Chip")).toContain("UM6845R")
    expect(value(scopes, "CRTC", "Selected")).toBe("R6")
    expect(value(scopes, "CRTC", "Rasterline")).toBe("87")
  })

  it("falls back to Unknown for an out-of-range type", () => {
    expect(value(buildCrtcScopes(crtc, { ...emu, crtcType: 9 }), "CRTC", "Chip")).toBe("Unknown")
  })

  it("lists the register file R0–R13 with named decimal values", () => {
    const regs = scope(scopes, "Registers")
    expect(regs.variables).toHaveLength(14)
    expect(regs.variables[0]?.name).toBe("R0 HTotal")
    expect(value(scopes, "Registers", "R0 HTotal")).toBe("63")
    expect(value(scopes, "Registers", "R3 SyncW")).toBe("142")
    expect(value(scopes, "Registers", "R9 MaxScan")).toBe("7")
  })

  it("surfaces the CRTC VSYNC as a flag chip", () => {
    expect(scope(scopes, "Sync").kind).toBe("flags")
    expect(value(scopes, "Sync", "VSYNC")).toBe("1") // from crtc.vsync
  })

  it("tolerates an empty register file (no /api/state crtc yet)", () => {
    const bare = buildCrtcScopes({ regs: [], selectedReg: 0, rasterline: 0, vsync: false }, emu)
    expect(scope(bare, "Registers").variables).toHaveLength(0)
  })
})
