import { describe, expect, it } from "vitest"
import { type ConfigReader, readSettings, readSettingsWithWarnings } from "../src/settings.js"

function makeReader(map: Record<string, unknown>): ConfigReader {
  return {
    get<T>(key: string, defaultValue: T): T {
      return key in map ? (map[key] as T) : defaultValue
    },
  }
}

describe("readSettings", () => {
  it("returns defaults when nothing is configured", () => {
    const s = readSettings(makeReader({}))
    expect(s).toEqual({
      emulatorPath: "",
      webPort: 8765,
      autoLaunch: false,
      emulatorArgs: [],
    })
  })

  it("reads all configured values", () => {
    const s = readSettings(
      makeReader({
        emulatorPath: "/opt/amspirit/amspirit-lite-sdl",
        webPort: 9000,
        autoLaunch: true,
        emulatorArgs: ["--no-splash", "-A"],
      }),
    )
    expect(s.emulatorPath).toBe("/opt/amspirit/amspirit-lite-sdl")
    expect(s.webPort).toBe(9000)
    expect(s.autoLaunch).toBe(true)
    expect(s.emulatorArgs).toEqual(["--no-splash", "-A"])
  })

  it("falls back to default port when the value is out of range", () => {
    expect(readSettings(makeReader({ webPort: 0 })).webPort).toBe(8765)
    expect(readSettings(makeReader({ webPort: 70000 })).webPort).toBe(8765)
    expect(readSettings(makeReader({ webPort: Number.NaN })).webPort).toBe(8765)
    expect(readSettings(makeReader({ webPort: -1 })).webPort).toBe(8765)
  })

  it("filters out non-string entries from emulatorArgs", () => {
    const s = readSettings(
      makeReader({ emulatorArgs: ["--ok", 42, null, "--also-ok"] as unknown as readonly string[] }),
    )
    expect(s.emulatorArgs).toEqual(["--ok", "--also-ok"])
  })

  it("falls back to empty array when emulatorArgs is not an array", () => {
    const s = readSettings(
      makeReader({ emulatorArgs: "not-an-array" as unknown as readonly string[] }),
    )
    expect(s.emulatorArgs).toEqual([])
  })
})

describe("readSettingsWithWarnings", () => {
  it("returns no warnings for a valid config", () => {
    const { warnings } = readSettingsWithWarnings(
      makeReader({ webPort: 9000, emulatorArgs: ["--ok"] }),
    )
    expect(warnings).toEqual([])
  })

  it("warns when the port is out of range", () => {
    const { settings, warnings } = readSettingsWithWarnings(makeReader({ webPort: 0 }))
    expect(settings.webPort).toBe(8765)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatch(/webPort/)
    expect(warnings[0]).toMatch(/8765/)
  })

  it("warns when emulatorArgs contains non-string entries", () => {
    const { settings, warnings } = readSettingsWithWarnings(
      makeReader({ emulatorArgs: ["--ok", 1, null] as unknown as readonly string[] }),
    )
    expect(settings.emulatorArgs).toEqual(["--ok"])
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatch(/emulatorArgs/)
  })

  it("warns when emulatorArgs is not an array", () => {
    const { settings, warnings } = readSettingsWithWarnings(
      makeReader({ emulatorArgs: "nope" as unknown as readonly string[] }),
    )
    expect(settings.emulatorArgs).toEqual([])
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatch(/expected an array/)
  })
})
