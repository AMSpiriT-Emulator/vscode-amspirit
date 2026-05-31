import * as cp from "node:child_process"
import * as http from "node:http"

export interface EmulatorClientOptions {
  port?: number
  host?: string
  pingTimeoutMs?: number
  injectTimeoutMs?: number
}

const DEFAULTS = {
  port: 8765,
  host: "127.0.0.1",
  pingTimeoutMs: 2000,
  injectTimeoutMs: 5000,
} as const

export class EmulatorClient {
  readonly port: number
  readonly host: string
  readonly pingTimeoutMs: number
  readonly injectTimeoutMs: number

  constructor(options: EmulatorClientOptions = {}) {
    this.port = options.port ?? DEFAULTS.port
    this.host = options.host ?? DEFAULTS.host
    this.pingTimeoutMs = options.pingTimeoutMs ?? DEFAULTS.pingTimeoutMs
    this.injectTimeoutMs = options.injectTimeoutMs ?? DEFAULTS.injectTimeoutMs
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
          res.on("end", () => settle(() => resolve(data)))
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

export function spawnEmulator(
  binaryPath: string,
  port: number,
  extraArgs: readonly string[] = [],
): cp.ChildProcess {
  const args = ["--web-server", "--web-port", String(port), ...extraArgs]
  return cp.spawn(binaryPath, args, { stdio: "ignore", detached: false })
}
