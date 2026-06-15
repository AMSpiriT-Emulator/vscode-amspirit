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
  IX: number
  IY: number
  I: number
  R: number
  IFF1: number
  IFF2: number
  IM: number
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
   * Read `len` bytes from `addr` via `/api/ram`. By default reads raw central
   * RAM; with `cpuView`, reads memory as the Z80 sees it (ROM/RAM mapping
   * applied) — use this to disassemble around PC, which often points into ROM.
   */
  async readRam(addr: number, len: number, opts: { cpuView?: boolean } = {}): Promise<number[]> {
    const view = opts.cpuView ? "&view=cpu" : ""
    const res = await this.getJson<{ hex?: string; error?: string }>(
      `/api/ram?addr=${addr}&len=${len}${view}`,
      this.debugTimeoutMs,
    )
    if (res.error !== undefined || res.hex === undefined) {
      throw new Error(res.error ?? "RAM read failed")
    }
    return hexToBytes(res.hex)
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
