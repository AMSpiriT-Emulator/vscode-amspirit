import type { CrtcState, EmuState, FdcState, GateArrayState, MemmapState } from "@amspirit/shared"
import type { RegisterScope } from "../registers-view.js"

// Uppercase hex. `#NN` marks a value as hex (the disassembler's sigil) so it
// isn't confused with the decimal values that share these chip tables; raw
// addresses stay bare, matching the Memory/Disassembly address columns.
const hex = (n: number, width: number): string =>
  (n >>> 0).toString(16).toUpperCase().padStart(width, "0")
const hash2 = (n: number): string => `#${hex(n & 0xff, 2)}`
/** Packed RGB24 as a CSS-style `#RRGGBB` string. */
const rgb6 = (n: number): string => `#${hex(n & 0xffffff, 6)}`
/** A bit's value as the `"0"`/`"1"` strings the chip strip lights on. */
const bit = (value: number, index: number): string => `${(value >> index) & 1}`

/** CRTC type → chip label. */
const CRTC_KIND: Record<number, string> = {
  0: "Type 0 (HD6845S / UM6845)",
  1: "Type 1 (UM6845R)",
  2: "Type 2 (MC6845)",
  3: "Type 3 (pre-ASIC / Plus)",
  4: "Type 4 (ASIC / GX4000)",
}

/** How many PENs the Gate Array actually displays in each video mode. */
const PENS_IN_MODE: Record<number, number> = { 0: 16, 1: 4, 2: 2 }

/** Upper-ROM number → name (255 = lower/firmware ROM). */
const romName = (bank: number): string => {
  if (bank === 255) return "Lower"
  if (bank === 0) return "BASIC"
  if (bank === 7) return "AMSDOS"
  return `ROM ${bank}`
}

/**
 * Gate Array view scopes from `/api/state.ga` + `/api/memmap`: the video mode,
 * the palette as a swatch grid (16 PENs dimmed to the active count for the mode,
 * plus the border ink), the HBL/VBL signal chips, the RMR/RAM-banking, and the
 * 16 KB memory map as a ROM/RAM bar. Pure.
 */
export function buildGateArrayScopes(ga: GateArrayState, memmap: MemmapState): RegisterScope[] {
  // Palette cells: value is the AMSTRAD ink index (what the program wrote), the
  // swatch is the resolved colour. PENs beyond the mode's active count are
  // dimmed; the border is the GA's 17th ink (PEN 16), set off by a divider.
  const active = PENS_IN_MODE[ga.mode] ?? 16
  const inks: RegisterScope["variables"] = []
  for (let i = 0; i < 16; i++) {
    const entry: RegisterScope["variables"][number] = {
      name: `PEN${i}`,
      value: `${ga.inkIdx[i] ?? 0}`,
      swatch: rgb6(ga.inkRgb[i] ?? 0),
    }
    if (i >= active) entry.muted = true
    inks.push(entry)
  }
  inks.push({
    name: "Border",
    value: `${ga.borderIdx}`,
    swatch: rgb6(ga.borderRgb),
    divider: true,
  })
  const regions: RegisterScope["variables"] = memmap.regions.map((r) => ({
    name: r.name,
    value: r.rom ? romName(r.romBank ?? 0) : `RAM ${r.ramBank ?? 0}${r.ext ? " (ext)" : ""}`,
    rom: r.rom,
  }))
  return [
    { name: "Video", variables: [{ name: "Mode", value: `${ga.mode}` }] },
    {
      name: "Signals",
      kind: "flags",
      variables: [
        { name: "HBL", value: ga.hbl ? "1" : "0", hint: "Horizontal blanking" },
        { name: "VBL", value: ga.vbl ? "1" : "0", hint: "Vertical blanking" },
      ],
    },
    { name: "Palette", kind: "palette", variables: inks },
    {
      name: "Banking",
      variables: [
        { name: "RMR", value: hash2(memmap.rmr) },
        { name: "RAM mode", value: `${memmap.ramMode}` },
        { name: "RAM page", value: `${memmap.ramPage}` },
      ],
    },
    { name: "Memory map", kind: "membar", variables: regions },
  ]
}

/**
 * FDC (PD765 / µPD765A) view scopes from `/api/state.fdc`: the Main Status
 * Register + SR0–SR2 as hex, the MSR and SR0 decoded into named bit chips, and
 * the drive/motor state. Pure.
 */
export function buildFdcScopes(fdc: FdcState): RegisterScope[] {
  return [
    {
      name: "Status registers",
      variables: [
        { name: "MSR", value: hash2(fdc.msr) },
        { name: "SR0", value: hash2(fdc.sr0) },
        { name: "SR1", value: hash2(fdc.sr1) },
        { name: "SR2", value: hash2(fdc.sr2) },
      ],
    },
    {
      name: "MSR bits",
      kind: "flags",
      // PD765 MSR: RQM DIO EXM CB | D3B D2B D1B D0B (bits 7..0).
      variables: [
        { name: "RQM", value: bit(fdc.msr, 7), hint: "Request for Master (ready to transfer)" },
        { name: "DIO", value: bit(fdc.msr, 6), hint: "Data direction (1 = FDC→CPU)" },
        { name: "EXM", value: bit(fdc.msr, 5), hint: "Execution mode (non-DMA)" },
        { name: "CB", value: bit(fdc.msr, 4), hint: "FDC busy" },
        { name: "D0B", value: bit(fdc.msr, 0), hint: "Drive 0 busy / seeking" },
        { name: "D1B", value: bit(fdc.msr, 1), hint: "Drive 1 busy / seeking" },
        { name: "D2B", value: bit(fdc.msr, 2), hint: "Drive 2 busy / seeking" },
        { name: "D3B", value: bit(fdc.msr, 3), hint: "Drive 3 busy / seeking" },
      ],
    },
    {
      name: "SR0 bits",
      kind: "flags",
      // PD765 SR0: IC1 IC0 SE EC NR HD US1 US0 (bits 7..0).
      variables: [
        { name: "SE", value: bit(fdc.sr0, 5), hint: "Seek end" },
        { name: "EC", value: bit(fdc.sr0, 4), hint: "Equipment check" },
        { name: "NR", value: bit(fdc.sr0, 3), hint: "Not ready" },
        { name: "HD", value: bit(fdc.sr0, 2), hint: "Head address (side)" },
      ],
    },
    {
      name: "Drive",
      variables: [
        { name: "Motor", value: fdc.motor ? "ON" : "OFF" },
        { name: "Active", value: fdc.drive === 0 ? "A" : "B" },
        { name: "IC", value: `${(fdc.sr0 >> 6) & 3}`, hint: "Interrupt code (SR0 bits 7-6)" },
      ],
    },
  ]
}

/** 6845 register file R0–R13: short label + full description (hint). */
const CRTC_REGS: ReadonlyArray<{ label: string; hint: string }> = [
  { label: "R0 HTotal", hint: "Horizontal Total (chars/line − 1)" },
  { label: "R1 HDisp", hint: "Horizontal Displayed" },
  { label: "R2 HSync", hint: "Horizontal Sync Position" },
  { label: "R3 SyncW", hint: "Sync Width (lo nibble HSYNC, hi nibble VSYNC)" },
  { label: "R4 VTotal", hint: "Vertical Total (char rows − 1)" },
  { label: "R5 VAdjust", hint: "Vertical Total Adjust (raster lines)" },
  { label: "R6 VDisp", hint: "Vertical Displayed" },
  { label: "R7 VSync", hint: "Vertical Sync Position" },
  { label: "R8 Interlace", hint: "Interlace and Skew" },
  { label: "R9 MaxScan", hint: "Maximum Raster Address (scan lines/row − 1)" },
  { label: "R10 CurStart", hint: "Cursor Start Raster" },
  { label: "R11 CurEnd", hint: "Cursor End Raster" },
  { label: "R12 StartH", hint: "Screen Start Address High" },
  { label: "R13 StartL", hint: "Screen Start Address Low" },
]

/**
 * CRTC (6845) view scopes from `/api/state.crtc` (+ the chip type from `emu`):
 * the chip variant, selected register and raster line; the register file R0–R13
 * with named decimal values; and the CRTC VSYNC as a flag chip. Pure.
 *
 * Strictly CRTC data only — machine context (model/frame/FPS) belongs to other
 * views, and HSYNC is left out because the core doesn't expose it (R14–R17, the
 * internal counters, HSYNC and VMA are in `Core_Info_Reg_CRTC` but not
 * serialised yet). No derived "screen address" is shown: R12/R13 are the raw
 * 6845 MA start, not a CPU/RAM address (the Gate Array remaps the 16 KB page
 * and offset), so reporting it as an address would be misleading.
 */
export function buildCrtcScopes(crtc: CrtcState, emu: EmuState): RegisterScope[] {
  return [
    {
      name: "CRTC",
      variables: [
        { name: "Type", value: `${emu.crtcType}` },
        { name: "Chip", value: CRTC_KIND[emu.crtcType] ?? "Unknown" },
        { name: "Selected", value: `R${crtc.selectedReg}`, hint: "Last write to &BC00" },
        { name: "Rasterline", value: `${crtc.rasterline}`, hint: "Absolute raster line in frame" },
      ],
    },
    {
      name: "Registers",
      variables: crtc.regs.map((v, i) => ({
        name: CRTC_REGS[i]?.label ?? `R${i}`,
        value: `${v}`,
        hint: CRTC_REGS[i]?.hint ?? "",
      })),
    },
    {
      name: "Sync",
      kind: "flags",
      variables: [
        { name: "VSYNC", value: crtc.vsync ? "1" : "0", hint: "CRTC vertical sync output" },
      ],
    },
  ]
}
