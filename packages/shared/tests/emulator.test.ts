import * as http from "node:http"
import type { AddressInfo } from "node:net"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { EmulatorClient } from "../src/emulator.js"

type Recorded = {
  method: string
  url: string
  headers: http.IncomingHttpHeaders
  body: string
}

type Responder = (req: http.IncomingMessage, res: http.ServerResponse) => void

class FakeEmulator {
  private server!: http.Server
  port = 0
  recorded: Recorded[] = []
  responder: Responder = (_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" })
    res.end('{"ok":true}')
  }

  async start(): Promise<void> {
    this.server = http.createServer((req, res) => {
      let body = ""
      req.setEncoding("utf-8")
      req.on("data", (chunk: string) => {
        body += chunk
      })
      req.on("end", () => {
        this.recorded.push({
          method: req.method ?? "",
          url: req.url ?? "",
          headers: req.headers,
          body,
        })
        this.responder(req, res)
      })
    })
    await new Promise<void>((resolve) => this.server.listen(0, "127.0.0.1", resolve))
    this.port = (this.server.address() as AddressInfo).port
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve, reject) =>
      this.server.close((err) => (err ? reject(err) : resolve())),
    )
  }
}

describe("EmulatorClient", () => {
  let fake: FakeEmulator

  beforeEach(async () => {
    fake = new FakeEmulator()
    await fake.start()
  })

  afterEach(async () => {
    await fake.stop()
  })

  describe("constructor", () => {
    it("uses default port 8765 and host 127.0.0.1", () => {
      const c = new EmulatorClient()
      expect(c.port).toBe(8765)
      expect(c.host).toBe("127.0.0.1")
    })

    it("accepts custom port and host", () => {
      const c = new EmulatorClient({ port: 9000, host: "0.0.0.0" })
      expect(c.port).toBe(9000)
      expect(c.host).toBe("0.0.0.0")
    })

    it("has configurable timeouts with sane defaults", () => {
      const c = new EmulatorClient()
      expect(c.pingTimeoutMs).toBe(2000)
      expect(c.injectTimeoutMs).toBe(5000)
      expect(c.exportTimeoutMs).toBe(5000)

      const custom = new EmulatorClient({
        pingTimeoutMs: 500,
        injectTimeoutMs: 1000,
        exportTimeoutMs: 1500,
      })
      expect(custom.pingTimeoutMs).toBe(500)
      expect(custom.injectTimeoutMs).toBe(1000)
      expect(custom.exportTimeoutMs).toBe(1500)
    })
  })

  describe("ping", () => {
    it("returns true when /api/state responds 200", async () => {
      const client = new EmulatorClient({ port: fake.port })
      await expect(client.ping()).resolves.toBe(true)
      expect(fake.recorded.at(0)?.method).toBe("GET")
      expect(fake.recorded.at(0)?.url).toBe("/api/state")
    })

    it("returns false when the server is unreachable", async () => {
      // Stop the fake so the connection is refused.
      await fake.stop()
      const client = new EmulatorClient({ port: fake.port })
      await expect(client.ping()).resolves.toBe(false)
      // Re-start so afterEach's stop succeeds (idempotent — guard).
      fake = new FakeEmulator()
      await fake.start()
    })

    it("returns false on timeout", async () => {
      fake.responder = () => {
        // Never respond.
      }
      const client = new EmulatorClient({ port: fake.port, pingTimeoutMs: 50 })
      await expect(client.ping()).resolves.toBe(false)
    })
  })

  describe("injectBasic", () => {
    it("POSTs to /api/basic with the source as body and text/plain content-type", async () => {
      const client = new EmulatorClient({ port: fake.port })
      await client.injectBasic('10 PRINT "HELLO"', false, false)

      const rec = fake.recorded.at(0)
      expect(rec?.method).toBe("POST")
      expect(rec?.url).toBe("/api/basic")
      expect(rec?.body).toBe('10 PRINT "HELLO"')
      expect(rec?.headers["content-type"]).toMatch(/text\/plain/)
    })

    it("adds ?reset=1 when resetFirst is true", async () => {
      const client = new EmulatorClient({ port: fake.port })
      await client.injectBasic("10 END", true, false)
      expect(fake.recorded.at(0)?.url).toBe("/api/basic?reset=1")
    })

    it("adds ?run=1 when runAfter is true", async () => {
      const client = new EmulatorClient({ port: fake.port })
      await client.injectBasic("10 END", false, true)
      expect(fake.recorded.at(0)?.url).toBe("/api/basic?run=1")
    })

    it("combines reset and run flags", async () => {
      const client = new EmulatorClient({ port: fake.port })
      await client.injectBasic("10 END", true, true)
      expect(fake.recorded.at(0)?.url).toBe("/api/basic?reset=1&run=1")
    })

    it("throws when the emulator returns a non-ok payload", async () => {
      fake.responder = (_req, res) => {
        res.writeHead(200, { "Content-Type": "application/json" })
        res.end('{"ok":false,"error":"boom"}')
      }
      const client = new EmulatorClient({ port: fake.port })
      await expect(client.injectBasic("10 END", false, false)).rejects.toThrow(
        /Emulator rejected BASIC injection/,
      )
    })

    it("throws when the response is not valid JSON", async () => {
      fake.responder = (_req, res) => {
        res.writeHead(200, { "Content-Type": "text/plain" })
        res.end("not json")
      }
      const client = new EmulatorClient({ port: fake.port })
      await expect(client.injectBasic("10 END", false, false)).rejects.toThrow(
        /Emulator rejected BASIC injection/,
      )
    })

    it("rejects on timeout", async () => {
      fake.responder = () => {
        // Never respond.
      }
      const client = new EmulatorClient({ port: fake.port, injectTimeoutMs: 50 })
      await expect(client.injectBasic("10 END", false, false)).rejects.toThrow(/timeout/)
    })
  })

  describe("exportBasic", () => {
    it("GETs /api/basic_export and returns the detokenized source", async () => {
      fake.responder = (_req, res) => {
        res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" })
        res.end('10 PRINT "HELLO"\n20 GOTO 10\n')
      }
      const client = new EmulatorClient({ port: fake.port })
      await expect(client.exportBasic()).resolves.toBe('10 PRINT "HELLO"\n20 GOTO 10\n')

      const rec = fake.recorded.at(0)
      expect(rec?.method).toBe("GET")
      expect(rec?.url).toBe("/api/basic_export")
    })

    it("adds ?verbose=1 when verbose is true", async () => {
      const client = new EmulatorClient({ port: fake.port })
      await client.exportBasic(true)
      expect(fake.recorded.at(0)?.url).toBe("/api/basic_export?verbose=1")
    })

    it("rejects when the emulator returns a non-2xx status", async () => {
      fake.responder = (_req, res) => {
        res.writeHead(503, { "Content-Type": "text/plain" })
        res.end("")
      }
      const client = new EmulatorClient({ port: fake.port })
      await expect(client.exportBasic()).rejects.toThrow(/HTTP 503/)
    })

    it("rejects on timeout", async () => {
      fake.responder = () => {
        // Never respond.
      }
      const client = new EmulatorClient({ port: fake.port, exportTimeoutMs: 50 })
      await expect(client.exportBasic()).rejects.toThrow(/timeout/)
    })
  })

  const jsonResponder =
    (payload: unknown): Responder =>
    (_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" })
      res.end(JSON.stringify(payload))
    }

  describe("getBasicState", () => {
    it("GETs /api/basic_state and parses the JSON", async () => {
      fake.responder = jsonResponder({ cur_linenum: 30, stmt_addr: 44573, basic_ver: 11 })
      const client = new EmulatorClient({ port: fake.port })
      const state = await client.getBasicState()
      expect(state.cur_linenum).toBe(30)
      expect(state.stmt_addr).toBe(44573)
      expect(fake.recorded.at(0)?.method).toBe("GET")
      expect(fake.recorded.at(0)?.url).toBe("/api/basic_state")
    })
  })

  describe("getBasicListing", () => {
    it("GETs /api/basic_listing and parses lines/statements", async () => {
      fake.responder = jsonResponder({
        lines: [
          {
            addr: 368,
            num: 10,
            stmts: [{ addr: 371, end: 378, colon: false, text: "A=1", vars: ["A"] }],
          },
        ],
      })
      const client = new EmulatorClient({ port: fake.port })
      const listing = await client.getBasicListing()
      expect(fake.recorded.at(0)?.url).toBe("/api/basic_listing")
      expect(listing.lines.at(0)?.num).toBe(10)
      expect(listing.lines.at(0)?.stmts.at(0)?.addr).toBe(371)
    })
  })

  describe("basicStep", () => {
    it("POSTs /api/basic_step with an empty body for statement stepping", async () => {
      const client = new EmulatorClient({ port: fake.port })
      await client.basicStep(false)
      const rec = fake.recorded.at(0)
      expect(rec?.method).toBe("POST")
      expect(rec?.url).toBe("/api/basic_step")
      expect(rec?.body).toBe("")
    })

    it("adds ?mode=line for line stepping", async () => {
      const client = new EmulatorClient({ port: fake.port })
      await client.basicStep(true)
      expect(fake.recorded.at(0)?.url).toBe("/api/basic_step?mode=line")
    })
  })

  describe("setBasicBreakpoints", () => {
    it("POSTs comma-separated statement addresses to /api/basic_bp", async () => {
      const client = new EmulatorClient({ port: fake.port })
      await client.setBasicBreakpoints([371, 880, 44573])
      const rec = fake.recorded.at(0)
      expect(rec?.method).toBe("POST")
      expect(rec?.url).toBe("/api/basic_bp")
      expect(rec?.body).toBe("371,880,44573")
    })

    it("sends an empty body to clear all breakpoints", async () => {
      const client = new EmulatorClient({ port: fake.port })
      await client.setBasicBreakpoints([])
      expect(fake.recorded.at(0)?.body).toBe("")
    })
  })

  describe("basicRunTo", () => {
    it("POSTs ?line=N when given a line", async () => {
      const client = new EmulatorClient({ port: fake.port })
      await client.basicRunTo({ line: 40 })
      expect(fake.recorded.at(0)?.url).toBe("/api/basic_runto?line=40")
    })

    it("POSTs ?addr=N when given an address", async () => {
      const client = new EmulatorClient({ port: fake.port })
      await client.basicRunTo({ addr: 44573 })
      expect(fake.recorded.at(0)?.url).toBe("/api/basic_runto?addr=44573")
    })
  })

  describe("setPaused", () => {
    it("POSTs {paused:true} as JSON to /api/config", async () => {
      const client = new EmulatorClient({ port: fake.port })
      await client.setPaused(true)
      const rec = fake.recorded.at(0)
      expect(rec?.method).toBe("POST")
      expect(rec?.url).toBe("/api/config")
      expect(rec?.headers["content-type"]).toMatch(/application\/json/)
      expect(JSON.parse(rec?.body ?? "{}")).toEqual({ paused: true })
    })

    it("POSTs {paused:false} to resume", async () => {
      const client = new EmulatorClient({ port: fake.port })
      await client.setPaused(false)
      expect(JSON.parse(fake.recorded.at(0)?.body ?? "{}")).toEqual({ paused: false })
    })
  })

  describe("readRam", () => {
    it("GETs /api/ram with addr+len and decodes the hex into bytes", async () => {
      fake.responder = jsonResponder({ addr: 880, len: 3, hex: "00ff80" })
      const client = new EmulatorClient({ port: fake.port })
      await expect(client.readRam(880, 3)).resolves.toEqual([0x00, 0xff, 0x80])
      expect(fake.recorded.at(0)?.url).toBe("/api/ram?addr=880&len=3")
    })

    it("throws when the emulator reports an error", async () => {
      fake.responder = jsonResponder({ error: "ram unavailable" })
      const client = new EmulatorClient({ port: fake.port })
      await expect(client.readRam(0, 16)).rejects.toThrow(/ram unavailable/)
    })
  })

  describe("getZ80", () => {
    it("GETs /api/z80 and returns the register snapshot", async () => {
      fake.responder = jsonResponder({
        PC: 0x1234,
        SP: 0x4000,
        A: 0xff,
        F: 0x40,
        IX: 0x1000,
        IY: 0x2000,
        I: 0x10,
        R: 0x7f,
        IFF1: 1,
        IFF2: 1,
        IM: 1,
      })
      const client = new EmulatorClient({ port: fake.port })
      const z = await client.getZ80()
      expect(z.PC).toBe(0x1234)
      expect(z.IM).toBe(1)
      expect(z.IX).toBe(0x1000)
      expect(fake.recorded.at(0)?.method).toBe("GET")
      expect(fake.recorded.at(0)?.url).toBe("/api/z80")
    })
  })

  describe("pingState", () => {
    it("reads ok + emu.paused from /api/ping", async () => {
      fake.responder = jsonResponder({ ok: true, emu: { paused: true, fps: 50 } })
      const client = new EmulatorClient({ port: fake.port })
      await expect(client.pingState()).resolves.toEqual({ ok: true, paused: true })
      expect(fake.recorded.at(0)?.url).toBe("/api/ping")
    })

    it("reports paused:false when emu is running", async () => {
      fake.responder = jsonResponder({ ok: true, emu: { paused: false } })
      const client = new EmulatorClient({ port: fake.port })
      await expect(client.pingState()).resolves.toEqual({ ok: true, paused: false })
    })

    it("returns {ok:false, paused:false} when unreachable", async () => {
      await fake.stop()
      const client = new EmulatorClient({ port: fake.port })
      await expect(client.pingState()).resolves.toEqual({ ok: false, paused: false })
      fake = new FakeEmulator()
      await fake.start()
    })
  })
})
