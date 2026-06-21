import type { PsgChannel, PsgViewModel } from "../../src/hardware/psg-view-model.js"
import styles from "./psg-view.module.css"

interface PsgViewProps {
  /** The decoded PSG model, or `null` when unavailable (running/detached). */
  psg: PsgViewModel | null
}

/** Max PSG amplitude (4-bit), for scaling the volume meter. */
const MAX_AMP = 15

function Channel({ channel }: { channel: PsgChannel }) {
  const pct = Math.round((channel.amplitude / MAX_AMP) * 100)
  return (
    <div className={styles.channel}>
      <div className={styles.chanName}>{channel.name}</div>
      <dl className={styles.chanFields}>
        <dt>Freq</dt>
        <dd>{channel.freqHz === null ? "—" : `${channel.freqHz} Hz`}</dd>
        <dt>Period</dt>
        <dd>{channel.period}</dd>
      </dl>
      <div
        className={styles.meter}
        title={channel.envelope ? "Volume from envelope" : `Volume ${channel.amplitude}/${MAX_AMP}`}
        data-env={channel.envelope ? "true" : undefined}
      >
        <div
          className={styles.meterFill}
          style={{ width: channel.envelope ? "100%" : `${pct}%` }}
        />
        <span className={styles.meterLabel}>
          {channel.envelope ? "ENV" : `${channel.amplitude}`}
        </span>
      </div>
      <div className={styles.routing}>
        <span className={styles.chip} data-set={channel.tone} title="Tone enabled">
          Tone
        </span>
        <span className={styles.chip} data-set={channel.noise} title="Noise enabled">
          Noise
        </span>
      </div>
    </div>
  )
}

/**
 * PSG (AY-3-8912) view: the three tone channels side by side (frequency, period,
 * a volume meter, and tone/noise routing chips), plus the shared noise period
 * and the envelope (period + an ASCII shape glyph). Pure presentation; the panel
 * feeds the decoded model.
 */
export function PsgView({ psg }: PsgViewProps) {
  if (!psg) {
    return (
      <main>
        <p className={styles.placeholder}>No data — connect to the emulator.</p>
      </main>
    )
  }
  return (
    <main className={styles.root}>
      <div className={styles.channels}>
        {psg.channels.map((c) => (
          <Channel key={c.name} channel={c} />
        ))}
      </div>
      <dl className={styles.footer}>
        <dt>Noise period</dt>
        <dd>{psg.noisePeriod}</dd>
        <dt>Env period</dt>
        <dd>{psg.envelope.period}</dd>
        <dt>Env shape</dt>
        <dd>
          #{psg.envelope.shape.toString(16).toUpperCase().padStart(2, "0")}{" "}
          <span className={styles.glyph}>{psg.envelope.glyph}</span>
        </dd>
      </dl>
    </main>
  )
}
