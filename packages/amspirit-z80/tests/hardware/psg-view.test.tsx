// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import type { PsgViewModel } from "../../src/hardware/psg-view-model.js"
import { PsgView } from "../../webview/components/psg-view.js"

afterEach(cleanup)

const model: PsgViewModel = {
  channels: [
    {
      name: "A",
      period: 564,
      freqHz: 111,
      amplitude: 12,
      envelope: false,
      tone: true,
      noise: false,
    },
    { name: "B", period: 0, freqHz: null, amplitude: 0, envelope: true, tone: false, noise: true },
    { name: "C", period: 250, freqHz: 250, amplitude: 7, envelope: false, tone: true, noise: true },
  ],
  noisePeriod: 7,
  envelope: { period: 0x1234, shape: 0x0a, glyph: "\\/\\/" },
}

describe("<PsgView />", () => {
  it("shows a placeholder when there is no data", () => {
    render(<PsgView psg={null} />)
    expect(screen.getByText(/no data|connect/i)).toBeDefined()
  })

  it("renders the three channels with frequency and amplitude", () => {
    render(<PsgView psg={model} />)
    expect(screen.getByText("A")).toBeDefined()
    expect(screen.getByText("111 Hz")).toBeDefined()
    expect(screen.getByText("12")).toBeDefined()
  })

  it("shows ENV for an envelope-driven channel and — for a zero period", () => {
    render(<PsgView psg={model} />)
    expect(screen.getByText("ENV")).toBeDefined()
    expect(screen.getByText("—")).toBeDefined()
  })

  it("lights the tone/noise chips per the routing", () => {
    render(<PsgView psg={model} />)
    const tones = screen.getAllByText("Tone")
    // Channel A tone on, channel B tone off.
    expect(tones[0]?.getAttribute("data-set")).toBe("true")
    expect(tones[1]?.getAttribute("data-set")).toBe("false")
  })

  it("renders the envelope shape glyph", () => {
    render(<PsgView psg={model} />)
    expect(screen.getByText("\\/\\/")).toBeDefined()
  })
})
