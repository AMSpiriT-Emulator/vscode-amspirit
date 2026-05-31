import { describe, expect, it, vi } from "vitest"

const spawnMock = vi.fn()

vi.mock("node:child_process", () => ({
  spawn: spawnMock,
}))

const { spawnEmulator } = await import("../src/emulator.js")

describe("spawnEmulator", () => {
  it("invokes child_process.spawn with --web-server and --web-port flags", () => {
    spawnMock.mockReset()
    spawnMock.mockReturnValue({ pid: 1234 })

    const result = spawnEmulator("/usr/local/bin/amspirit-lite-sdl", 9000, ["--no-splash"])

    expect(result).toEqual({ pid: 1234 })
    expect(spawnMock).toHaveBeenCalledWith(
      "/usr/local/bin/amspirit-lite-sdl",
      ["--web-server", "--web-port", "9000", "--no-splash"],
      { stdio: "ignore", detached: false },
    )
  })

  it("works without extra args", () => {
    spawnMock.mockReset()
    spawnMock.mockReturnValue({ pid: 1 })

    spawnEmulator("/bin/emu", 8765)

    expect(spawnMock).toHaveBeenCalledWith("/bin/emu", ["--web-server", "--web-port", "8765"], {
      stdio: "ignore",
      detached: false,
    })
  })
})
