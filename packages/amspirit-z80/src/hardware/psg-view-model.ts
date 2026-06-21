import type { PsgState } from "@amspirit/shared"

/** The PSG tone generator clock on the CPC (1 MHz). */
const PSG_CLOCK_HZ = 1_000_000

/** One decoded tone channel for the PSG view. */
export interface PsgChannel {
  /** Channel letter (`A` | `B` | `C`). */
  name: string
  /** 12-bit tone period. */
  period: number
  /** Tone frequency in Hz (rounded), or `null` when the period is 0. */
  freqHz: number | null
  /** Amplitude 0–15. */
  amplitude: number
  /** Volume is driven by the envelope generator (volume bit 4). */
  envelope: boolean
  /** Tone enabled on this channel (mixer R7, active-low). */
  tone: boolean
  /** Noise enabled on this channel (mixer R7, active-low). */
  noise: boolean
}

/** Structured PSG snapshot the dedicated PSG view renders. */
export interface PsgViewModel {
  channels: PsgChannel[]
  noisePeriod: number
  envelope: {
    period: number
    /** Raw R13 shape value (0–15). */
    shape: number
    /** A small ASCII glyph of the envelope shape. */
    glyph: string
  }
}

// R13 envelope shape → ASCII glyph. Shapes 0–7 collapse to the two one-shot
// forms (0–3 ≈ \___, 4–7 ≈ /___); 8–15 are the distinct continuous patterns.
const ENV_GLYPH: Record<number, string> = {
  8: "\\\\\\\\",
  9: "\\___",
  10: "\\/\\/",
  11: "\\‾‾‾",
  12: "////",
  13: "/‾‾‾",
  14: "/\\/\\",
  15: "/___",
}

const envGlyph = (shape: number): string => {
  const s = shape & 0x0f
  if (s < 4) return "\\___"
  if (s < 8) return "/___"
  return ENV_GLYPH[s] ?? "?"
}

const freqHz = (period: number): number | null =>
  period > 0 ? Math.round(PSG_CLOCK_HZ / (16 * period)) : null

const channel = (
  name: string,
  period: number,
  vol: number,
  mixer: number,
  ch: number,
): PsgChannel => ({
  name,
  period,
  freqHz: freqHz(period),
  amplitude: vol & 0x0f,
  envelope: (vol & 0x10) !== 0,
  // Mixer R7 enables are active-low: a clear bit means the source is ON.
  tone: ((mixer >> ch) & 1) === 0,
  noise: ((mixer >> (ch + 3)) & 1) === 0,
})

/**
 * Decode a PSG (AY-3-8912) snapshot into the structured model the dedicated PSG
 * view renders: the three tone channels (period, frequency, amplitude/envelope,
 * mixer routing), the noise period and the envelope (period + shape glyph). Pure.
 */
export function buildPsgViewModel(psg: PsgState): PsgViewModel {
  return {
    channels: [
      channel("A", psg.periodA, psg.volA, psg.mixer, 0),
      channel("B", psg.periodB, psg.volB, psg.mixer, 1),
      channel("C", psg.periodC, psg.volC, psg.mixer, 2),
    ],
    noisePeriod: psg.noise,
    envelope: { period: psg.envPeriod, shape: psg.envShape & 0x0f, glyph: envGlyph(psg.envShape) },
  }
}
