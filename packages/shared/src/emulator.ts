import * as cp from "node:child_process"
import * as http from "node:http"

export interface EmulatorClientOptions {
  port?: number
  host?: string
  pingTimeoutMs?: number
  injectTimeoutMs?: number
  exportTimeoutMs?: number
  debugTimeoutMs?: number
}

const DEFAULTS = {
  port: 8765,
  host: "127.0.0.1",
  pingTimeoutMs: 2000,
  injectTimeoutMs: 5000,
  exportTimeoutMs: 5000,
  debugTimeoutMs: 3000,
} as const

/** A single BASIC statement within a line, as decoded by `/api/basic_listing`. */
export interface BasicStatement {
  /** RAM address of the statement (matches `stmt_addr` while it executes). */
  addr: number
  /** Exclusive upper bound (address of the next statement). */
  end: number
  /** Whether a leading `:` separates this statement from the previous one. */
  colon: boolean
  /** Detokenized statement text. */
  text: string
  /** Variable names referenced by the statement (display form, e.g. `MSG$`). */
  vars: string[]
}

/** One BASIC line: its number plus the statements it contains. */
export interface BasicLine {
  /** RAM address of the line record. */
  addr: number
  /** BASIC line number. */
  num: number
  stmts: BasicStatement[]
}

/** Structured program decode from `/api/basic_listing`. */
export interface BasicListing {
  lines: BasicLine[]
}

/** BASIC interpreter execution state from `/api/basic_state`. */
export interface BasicState {
  /** Current BASIC line number; `0xFFFF` means direct mode (no program). */
  cur_linenum: number
  /** Current statement address (the `0xAE1B` execution pointer). */
  stmt_addr: number
  /** BASIC version (`10` = v1.0 / 464, `11` = v1.1 / 664+). */
  basic_ver: number
  prog_start: number
  txttop: number
  vartop: number
  arrend: number
  prog_size: number
  var_size: number
  chain_heads_addr: number
}

/** Connectivity + run/pause snapshot from `/api/ping`. */
export interface PingState {
  ok: boolean
  paused: boolean
}

/** Z80 register snapshot from `/api/z80` (all values unsigned). */
export interface Z80Registers {
  PC: number
  SP: number
  A: number
  F: number
  B: number
  C: number
  D: number
  E: number
  H: number
  L: number
  /** Shadow (alternate) register set (`A'F'B'C'D'E'H'L'`). */
  A2: number
  F2: number
  B2: number
  C2: number
  D2: number
  E2: number
  H2: number
  L2: number
  IX: number
  IY: number
  I: number
  R: number
  IFF1: number
  IFF2: number
  IM: number
}

/** Gate Array state from `/api/state` (`ga`). Colours are packed RGB24. */
export interface GateArrayState {
  /** Video mode 0, 1 or 2. */
  mode: number
  /** AMSTRAD colour index of the border (0–31). */
  borderIdx: number
  /** Border colour as packed `0xRRGGBB`. */
  borderRgb: number
  hbl: boolean
  vbl: boolean
  /** AMSTRAD colour index of each of the 16 PENs. */
  inkIdx: number[]
  /** RGB24 colour of each of the 16 PENs. */
  inkRgb: number[]
}

/** PSG (AY-3-8912) state from `/api/state` (`psg`), already decoded. */
export interface PsgState {
  /** Tone periods of channels A/B/C (12-bit). */
  periodA: number
  /** Channel volumes (5-bit; bit 4 = envelope mode). */
  volA: number
  periodB: number
  volB: number
  periodC: number
  volC: number
  /** Mixer register (R7). */
  mixer: number
  /** Noise period (R6, 5-bit). */
  noise: number
  /** 16-bit envelope period (R12<<8 | R11). */
  envPeriod: number
  /** Envelope shape (R13, 4-bit). */
  envShape: number
}

/** FDC (PD765) state from `/api/state` (`fdc`). */
export interface FdcState {
  /** Main Status Register. */
  msr: number
  sr0: number
  sr1: number
  sr2: number
  motor: boolean
  /** Active drive (0 or 1). */
  drive: number
}

/** Emulator status from `/api/state` (`emu`). */
export interface EmuState {
  fps: number
  frame: number
  paused: boolean
  /** CPC model: 0=464, 1=664, 2=6128, 4=6128+, 5=464+, 6=GX4000. */
  cpcModel: number
  /** CRTC type (0–4). */
  crtcType: number
}

/** Full chip snapshot from `GET /api/state`. */
export interface EmulatorState {
  z80: Z80Registers
  ga: GateArrayState
  psg: PsgState
  fdc: FdcState
  emu: EmuState
}

/** One 16 KB region of the memory map from `/api/memmap`. */
export interface MemmapRegion {
  /** Region base address. */
  base: number
  /** Region name (the base as 4 hex digits). */
  name: string
  /** `true` if ROM is currently mapped here. */
  rom: boolean
  /** ROM number when `rom` (255 = lower/firmware ROM, else upper-ROM number). */
  romBank?: number
  /** Physical RAM bank when `!rom` (0–3 central, 4+ extended). */
  ramBank?: number
  /** `true` if this RAM bank comes from extended RAM. */
  ext?: boolean
}

/** ROM/RAM mapping + banking config from `GET /api/memmap`. */
export interface MemmapState {
  regions: MemmapRegion[]
  /** Gate Array RMR register value. */
  rmr: number
  /** RAM banking configuration (the `&7Fxx` value, 0–7). */
  ramMode: number
  /** Extended-RAM page (0–3). */
  ramPage: number
}

/** Machine configuration reported by `/api/config`. */
export interface EmulatorConfig {
  /** CPC model index (0=464, 1=664, 2=6128, …). */
  cpcModel: number
  crtcType: number
  /** Expansion RAM in KB beyond the base machine (0 on a stock machine). */
  extendedRam: number
  romLang: string
}

/** Line number `0xFFFF` reported by the emulator when no program is running. */
export const DIRECT_MODE_LINE = 0xffff

export class EmulatorClient {
  readonly port: number
  readonly host: string
  readonly pingTimeoutMs: number
  readonly injectTimeoutMs: number
  readonly exportTimeoutMs: number
  readonly debugTimeoutMs: number

  constructor(options: EmulatorClientOptions = {}) {
    this.port = options.port ?? DEFAULTS.port
    this.host = options.host ?? DEFAULTS.host
    this.pingTimeoutMs = options.pingTimeoutMs ?? DEFAULTS.pingTimeoutMs
    this.injectTimeoutMs = options.injectTimeoutMs ?? DEFAULTS.injectTimeoutMs
    this.exportTimeoutMs = options.exportTimeoutMs ?? DEFAULTS.exportTimeoutMs
    this.debugTimeoutMs = options.debugTimeoutMs ?? DEFAULTS.debugTimeoutMs
  }

  async ping(): Promise<boolean> {
    try {
      await this.get("/api/state", this.pingTimeoutMs)
      return true
    } catch {
      return false
    }
  }

  async injectBasic(source: string, resetFirst: boolean, runAfter: boolean): Promise<void> {
    const qs = [resetFirst && "reset=1", runAfter && "run=1"].filter(Boolean).join("&")
    const path = `/api/basic${qs ? `?${qs}` : ""}`
    const body = await this.post(path, source, "text/plain; charset=utf-8", this.injectTimeoutMs)
    let parsed: { ok?: boolean }
    try {
      parsed = JSON.parse(body) as { ok?: boolean }
    } catch {
      parsed = {}
    }
    if (!parsed.ok) {
      throw new Error("Emulator rejected BASIC injection")
    }
  }

  /**
   * Retrieve the BASIC program currently in the emulator's memory,
   * detokenized to ASCII source. With `verbose`, the emulator appends
   * hex-dump comment lines after each statement.
   */
  async exportBasic(verbose = false): Promise<string> {
    const path = `/api/basic_export${verbose ? "?verbose=1" : ""}`
    return this.get(path, this.exportTimeoutMs)
  }

  // --- BASIC debugger ------------------------------------------------------

  /** Current BASIC execution state (current line/statement, memory pointers). */
  async getBasicState(): Promise<BasicState> {
    return this.getJson<BasicState>("/api/basic_state", this.debugTimeoutMs)
  }

  /** Structured program decode: lines + statements with their RAM addresses. */
  async getBasicListing(): Promise<BasicListing> {
    return this.getJson<BasicListing>("/api/basic_listing", this.debugTimeoutMs)
  }

  /** Resume until the next statement, or the next line when `byLine` is true. */
  async basicStep(byLine: boolean): Promise<void> {
    const path = `/api/basic_step${byLine ? "?mode=line" : ""}`
    await this.post(path, "", "text/plain; charset=utf-8", this.debugTimeoutMs)
  }

  /**
   * Replace the BASIC breakpoint set. `addrs` are statement addresses
   * (`stmt_addr` space); an empty array clears all breakpoints.
   */
  async setBasicBreakpoints(addrs: readonly number[]): Promise<void> {
    await this.post("/api/basic_bp", addrs.join(","), "text/plain", this.debugTimeoutMs)
  }

  /**
   * Replace the Z80 PC breakpoint set via `/api/z80_bp`. Addresses are sent
   * hex-encoded (`0x..`); the emulator stops with `PC == addr`, *before*
   * executing the instruction. An empty array clears all breakpoints.
   */
  async setZ80Breakpoints(addrs: readonly number[]): Promise<void> {
    const body = addrs.map((a) => `0x${a.toString(16)}`).join(",")
    await this.post("/api/z80_bp", body, "text/plain", this.debugTimeoutMs)
  }

  /** Execute exactly one Z80 instruction, then re-pause, via `/api/step`. */
  async step(): Promise<void> {
    await this.post("/api/step", "", "text/plain", this.debugTimeoutMs)
  }

  /** One-shot run-to: resume and pause at the given BASIC line or statement address. */
  async basicRunTo(target: { line: number } | { addr: number }): Promise<void> {
    const qs = "line" in target ? `line=${target.line}` : `addr=${target.addr}`
    await this.post(`/api/basic_runto?${qs}`, "", "text/plain", this.debugTimeoutMs)
  }

  /** Pause or resume emulation via `/api/config`. */
  async setPaused(paused: boolean): Promise<void> {
    await this.post(
      "/api/config",
      JSON.stringify({ paused }),
      "application/json",
      this.debugTimeoutMs,
    )
  }

  /** Connectivity + run/pause snapshot. Returns `paused:false` when unreachable. */
  async pingState(): Promise<PingState> {
    try {
      const raw = await this.getJson<{ ok?: boolean; emu?: { paused?: boolean } }>(
        "/api/ping",
        this.pingTimeoutMs,
      )
      return { ok: raw.ok === true, paused: raw.emu?.paused === true }
    } catch {
      return { ok: false, paused: false }
    }
  }

  /** Z80 register snapshot via `/api/z80`. */
  async getZ80(): Promise<Z80Registers> {
    return this.getJson<Z80Registers>("/api/z80", this.debugTimeoutMs)
  }

  /**
   * Full chip snapshot via `GET /api/state` (Z80, Gate Array, PSG, FDC, emu),
   * mapped to camelCase. Missing sub-objects fall back to safe zero/empty
   * defaults so the hardware views can render unconditionally.
   */
  async getState(): Promise<EmulatorState> {
    const raw = await this.getJson<{
      z80?: Z80Registers
      ga?: {
        mode?: number
        border_idx?: number
        border_rgb?: number
        hbl?: boolean
        vbl?: boolean
        ink_idx?: number[]
        ink_rgb?: number[]
      }
      psg?: {
        period_a?: number
        vol_a?: number
        period_b?: number
        vol_b?: number
        period_c?: number
        vol_c?: number
        mixer?: number
        noise?: number
        env_period?: number
        env_shape?: number
      }
      fdc?: {
        msr?: number
        sr0?: number
        sr1?: number
        sr2?: number
        motor?: boolean
        drive?: number
      }
      emu?: {
        fps?: number
        frame?: number
        paused?: boolean
        cpc_model?: number
        crtc_type?: number
      }
    }>("/api/state", this.debugTimeoutMs)
    const ga = raw.ga ?? {}
    const psg = raw.psg ?? {}
    const fdc = raw.fdc ?? {}
    const emu = raw.emu ?? {}
    return {
      z80: raw.z80 ?? ({} as Z80Registers),
      ga: {
        mode: ga.mode ?? 0,
        borderIdx: ga.border_idx ?? 0,
        borderRgb: ga.border_rgb ?? 0,
        hbl: ga.hbl ?? false,
        vbl: ga.vbl ?? false,
        inkIdx: ga.ink_idx ?? [],
        inkRgb: ga.ink_rgb ?? [],
      },
      psg: {
        periodA: psg.period_a ?? 0,
        volA: psg.vol_a ?? 0,
        periodB: psg.period_b ?? 0,
        volB: psg.vol_b ?? 0,
        periodC: psg.period_c ?? 0,
        volC: psg.vol_c ?? 0,
        mixer: psg.mixer ?? 0,
        noise: psg.noise ?? 0,
        envPeriod: psg.env_period ?? 0,
        envShape: psg.env_shape ?? 0,
      },
      fdc: {
        msr: fdc.msr ?? 0,
        sr0: fdc.sr0 ?? 0,
        sr1: fdc.sr1 ?? 0,
        sr2: fdc.sr2 ?? 0,
        motor: fdc.motor ?? false,
        drive: fdc.drive ?? 0,
      },
      emu: {
        fps: emu.fps ?? 0,
        frame: emu.frame ?? 0,
        paused: emu.paused ?? false,
        cpcModel: emu.cpc_model ?? 0,
        crtcType: emu.crtc_type ?? 0,
      },
    }
  }

  /**
   * ROM/RAM mapping + banking config via `GET /api/memmap`, mapped to camelCase.
   * Supplies the Gate Array view's RMR / RAM-banking section.
   */
  async getMemmap(): Promise<MemmapState> {
    const raw = await this.getJson<{
      regions?: {
        base?: number
        name?: string
        rom?: boolean
        rom_bank?: number
        ram_bank?: number
        ext?: boolean
      }[]
      rmr?: number
      ram_mode?: number
      ram_page?: number
    }>("/api/memmap", this.debugTimeoutMs)
    const regions: MemmapRegion[] = (raw.regions ?? []).map((r) => {
      const region: MemmapRegion = {
        base: r.base ?? 0,
        name: r.name ?? "",
        rom: r.rom ?? false,
      }
      if (r.rom_bank !== undefined) region.romBank = r.rom_bank
      if (r.ram_bank !== undefined) region.ramBank = r.ram_bank
      if (r.ext !== undefined) region.ext = r.ext
      return region
    })
    return {
      regions,
      rmr: raw.rmr ?? 0,
      ramMode: raw.ram_mode ?? 0,
      ramPage: raw.ram_page ?? 0,
    }
  }

  /**
   * Read `len` bytes from `addr` via `/api/ram`. By default reads raw central
   * RAM; with `cpuView`, reads memory as the Z80 sees it (ROM/RAM mapping
   * applied) — use this to disassemble around PC, which often points into ROM.
   */
  async readRam(
    addr: number,
    len: number,
    opts: { cpuView?: boolean; bank?: number } = {},
  ): Promise<number[]> {
    const params = [`addr=${addr}`, `len=${len}`]
    // bank 0 = central RAM, 1..N = extended page N-1; the CPU-visible view (ROM
    // mapped in) only applies to the central bank.
    if (opts.bank) params.push(`bank=${opts.bank}`)
    if (opts.cpuView) params.push("view=cpu")
    const res = await this.getJson<{ hex?: string; error?: string }>(
      `/api/ram?${params.join("&")}`,
      this.debugTimeoutMs,
    )
    if (res.error !== undefined || res.hex === undefined) {
      throw new Error(res.error ?? "RAM read failed")
    }
    return hexToBytes(res.hex)
  }

  /** Machine configuration via `GET /api/config` (model, CRTC, expansion RAM). */
  async getConfig(): Promise<EmulatorConfig> {
    const raw = await this.getJson<{
      cpc_model?: number
      crtc_type?: number
      extended_ram?: number
      rom_lang?: string
    }>("/api/config", this.debugTimeoutMs)
    return {
      cpcModel: raw.cpc_model ?? 0,
      crtcType: raw.crtc_type ?? 0,
      extendedRam: raw.extended_ram ?? 0,
      romLang: raw.rom_lang ?? "",
    }
  }

  /**
   * Write `bytes` to CPC RAM at `addr` via `POST /api/ram`. With `exec`, the
   * Z80 jumps to `entry` (default `addr`) after the write — used to load and run
   * an assembled program. Throws if the emulator does not acknowledge.
   */
  async writeRam(
    addr: number,
    bytes: readonly number[],
    opts: { exec?: boolean; entry?: number } = {},
  ): Promise<void> {
    const data = bytes.map((b) => (b & 0xff).toString(16).padStart(2, "0")).join("")
    const body: { addr: number; data: string; exec?: boolean; entry?: number } = { addr, data }
    if (opts.exec) body.exec = true
    if (opts.entry !== undefined) body.entry = opts.entry
    const res = await this.post(
      "/api/ram",
      JSON.stringify(body),
      "application/json",
      this.debugTimeoutMs,
    )
    let parsed: { ok?: boolean }
    try {
      parsed = JSON.parse(res) as { ok?: boolean }
    } catch {
      parsed = {}
    }
    if (!parsed.ok) throw new Error("Emulator rejected RAM write")
  }

  /**
   * The Z80 execution bitmap via `GET /api/codemap`: 8192 bytes as hex, bit
   * `addr` set once an instruction has started at `addr` since the last reset.
   * Returns `""` if the emulator omits it. Decode with `executedOffsets`.
   */
  async getCodemap(): Promise<string> {
    const res = await this.getJson<{ hex?: string }>("/api/codemap", this.debugTimeoutMs)
    return res.hex ?? ""
  }

  private async getJson<T>(path: string, timeoutMs: number): Promise<T> {
    const body = await this.get(path, timeoutMs)
    return JSON.parse(body) as T
  }

  private get(path: string, timeoutMs: number): Promise<string> {
    return new Promise((resolve, reject) => {
      let settled = false
      const settle = (fn: () => void): void => {
        if (settled) return
        settled = true
        fn()
      }
      const req = http.get(
        { hostname: this.host, port: this.port, path, timeout: timeoutMs },
        (res) => {
          let data = ""
          res.setEncoding("utf-8")
          res.on("data", (chunk: string) => {
            data += chunk
          })
          res.on("end", () => {
            const status = res.statusCode ?? 0
            if (status < 200 || status >= 300) {
              settle(() => reject(new Error(`HTTP ${status}`)))
              return
            }
            settle(() => resolve(data))
          })
        },
      )
      req.on("error", (err) => settle(() => reject(err)))
      req.on("timeout", () => {
        req.destroy()
        settle(() => reject(new Error("timeout")))
      })
    })
  }

  private post(
    path: string,
    body: string,
    contentType: string,
    timeoutMs: number,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      let settled = false
      const settle = (fn: () => void): void => {
        if (settled) return
        settled = true
        fn()
      }
      const buf = Buffer.from(body, "utf-8")
      const req = http.request(
        {
          hostname: this.host,
          port: this.port,
          path,
          method: "POST",
          timeout: timeoutMs,
          headers: {
            "Content-Type": contentType,
            "Content-Length": buf.length,
          },
        },
        (res) => {
          let data = ""
          res.setEncoding("utf-8")
          res.on("data", (chunk: string) => {
            data += chunk
          })
          res.on("end", () => settle(() => resolve(data)))
        },
      )
      req.on("error", (err) => settle(() => reject(err)))
      req.on("timeout", () => {
        req.destroy()
        settle(() => reject(new Error("timeout")))
      })
      req.write(buf)
      req.end()
    })
  }
}

/** Decode a hex string (2 chars per byte) into a byte array. */
function hexToBytes(hex: string): number[] {
  if (hex.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(hex)) {
    throw new Error(`malformed hex response (${hex.length} chars)`)
  }
  const n = hex.length >> 1
  const bytes = new Array<number>(n)
  for (let i = 0; i < n; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

export function spawnEmulator(
  binaryPath: string,
  port: number,
  extraArgs: readonly string[] = [],
): cp.ChildProcess {
  const args = ["--web-server", "--web-port", String(port), ...extraArgs]
  return cp.spawn(binaryPath, args, { stdio: "ignore", detached: false })
}
