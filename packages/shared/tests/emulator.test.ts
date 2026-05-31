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

      const custom = new EmulatorClient({ pingTimeoutMs: 500, injectTimeoutMs: 1000 })
      expect(custom.pingTimeoutMs).toBe(500)
      expect(custom.injectTimeoutMs).toBe(1000)
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
})
