import { describe, expect, it } from "vitest"
import { firmwareLabel } from "../src/firmware-labels.js"

describe("firmwareLabel", () => {
  it("names the start of each firmware pack in the main jumpblock", () => {
    expect(firmwareLabel(0xbb00)).toBe("KM INITIALISE")
    expect(firmwareLabel(0xbb4e)).toBe("TXT INITIALISE")
    expect(firmwareLabel(0xbbba)).toBe("GRA INITIALISE")
    expect(firmwareLabel(0xbbff)).toBe("SCR INITIALISE")
    expect(firmwareLabel(0xbc65)).toBe("CAS INITIALISE")
    expect(firmwareLabel(0xbca7)).toBe("SOUND RESET")
    expect(firmwareLabel(0xbcc8)).toBe("KL CHOKE OFF")
    expect(firmwareLabel(0xbd13)).toBe("MC BOOT PROGRAM")
  })

  it("names common mid-block entries", () => {
    expect(firmwareLabel(0xbb06)).toBe("KM WAIT CHAR")
    expect(firmwareLabel(0xbb5a)).toBe("TXT OUTPUT")
    expect(firmwareLabel(0xbbea)).toBe("GRA PLOT ABSOLUTE")
    expect(firmwareLabel(0xbd19)).toBe("MC WAIT FLYBACK")
  })

  it("names the last jumpblock entry (JUMP RESTORE)", () => {
    expect(firmwareLabel(0xbd37)).toBe("JUMP RESTORE")
  })

  it("returns undefined for an address that is not on a 3-byte entry boundary", () => {
    expect(firmwareLabel(0xbb01)).toBeUndefined()
    expect(firmwareLabel(0xbb02)).toBeUndefined()
  })

  it("returns undefined outside the jumpblock range", () => {
    expect(firmwareLabel(0x8000)).toBeUndefined() // user code
    expect(firmwareLabel(0xbaff)).toBeUndefined() // just below
    expect(firmwareLabel(0xbd3a)).toBeUndefined() // just past JUMP RESTORE
  })
})
