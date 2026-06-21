import type { PsgState } from "@amspirit/shared"
import { describe, expect, it } from "vitest"
import { buildPsgViewModel } from "../../src/hardware/psg-view-model.js"

const psg: PsgState = {
  periodA: 564,
  volA: 0x0c,
  periodB: 0,
  volB: 0x10, // envelope mode
  periodC: 250,
  volC: 0x07,
  mixer: 0x3e, // 0b00111110 → Tone A on, everything else off
  noise: 7,
  envPeriod: 0x1234,
  envShape: 0x0a,
}

describe("buildPsgViewModel", () => {
  const m = buildPsgViewModel(psg)

  it("decodes the three channels in order A, B, C", () => {
    expect(m.channels.map((c) => c.name)).toEqual(["A", "B", "C"])
  })

  it("computes the tone frequency from the period (null when period is 0)", () => {
    // f = 1_000_000 / (16 * 564) ≈ 111 Hz
    expect(m.channels[0]?.freqHz).toBe(111)
    expect(m.channels[1]?.freqHz).toBeNull()
    expect(m.channels[2]?.period).toBe(250)
  })

  it("splits amplitude from the envelope-mode bit", () => {
    expect(m.channels[0]?.amplitude).toBe(12)
    expect(m.channels[0]?.envelope).toBe(false)
    expect(m.channels[1]?.amplitude).toBe(0)
    expect(m.channels[1]?.envelope).toBe(true)
  })

  it("decodes the active-low mixer routing per channel", () => {
    // mixer 0x3e: bit0 clear → Tone A on; bits 1,2 set → Tone B/C off;
    // bits 3-5 set → all noise off.
    expect(m.channels[0]?.tone).toBe(true)
    expect(m.channels[1]?.tone).toBe(false)
    expect(m.channels[0]?.noise).toBe(false)
    const allOn = buildPsgViewModel({ ...psg, mixer: 0 })
    expect(allOn.channels[2]?.tone).toBe(true)
    expect(allOn.channels[2]?.noise).toBe(true)
  })

  it("carries noise period and the envelope (period + shape glyph)", () => {
    expect(m.noisePeriod).toBe(7)
    expect(m.envelope.period).toBe(0x1234)
    expect(m.envelope.shape).toBe(0x0a)
    expect(m.envelope.glyph).toBe("\\/\\/")
  })

  it("maps the one-shot envelope shape ranges", () => {
    expect(buildPsgViewModel({ ...psg, envShape: 0x02 }).envelope.glyph).toBe("\\___")
    expect(buildPsgViewModel({ ...psg, envShape: 0x05 }).envelope.glyph).toBe("/___")
    expect(buildPsgViewModel({ ...psg, envShape: 0x0c }).envelope.glyph).toBe("////")
  })
})
