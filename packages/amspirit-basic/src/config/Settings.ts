export interface ConfigReader {
  get<T>(key: string, defaultValue: T): T
}

export interface AmspiritSettings {
  emulatorPath: string
  webPort: number
  autoLaunch: boolean
  emulatorArgs: readonly string[]
}

export interface SettingsReadResult {
  settings: AmspiritSettings
  warnings: readonly string[]
}

const DEFAULTS: AmspiritSettings = {
  emulatorPath: "",
  webPort: 8765,
  autoLaunch: false,
  emulatorArgs: [],
}

export function readSettings(reader: ConfigReader): AmspiritSettings {
  return readSettingsWithWarnings(reader).settings
}

export function readSettingsWithWarnings(reader: ConfigReader): SettingsReadResult {
  const warnings: string[] = []

  const rawPort = reader.get<number>("webPort", DEFAULTS.webPort)
  let webPort = DEFAULTS.webPort
  if (Number.isFinite(rawPort) && rawPort > 0 && rawPort < 65536) {
    webPort = rawPort
  } else {
    warnings.push(
      `amspirit.webPort: "${rawPort}" is not a valid port (1-65535). Falling back to ${DEFAULTS.webPort}.`,
    )
  }

  const rawArgs = reader.get<readonly unknown[]>(
    "emulatorArgs",
    DEFAULTS.emulatorArgs as readonly unknown[],
  )
  let emulatorArgs: readonly string[] = DEFAULTS.emulatorArgs
  if (Array.isArray(rawArgs)) {
    const cleaned = rawArgs.filter((a): a is string => typeof a === "string")
    if (cleaned.length !== rawArgs.length) {
      warnings.push(
        "amspirit.emulatorArgs: non-string entries were ignored. Use a list of strings.",
      )
    }
    emulatorArgs = cleaned
  } else {
    warnings.push("amspirit.emulatorArgs: expected an array of strings. Falling back to [].")
  }

  return {
    settings: {
      emulatorPath: reader.get<string>("emulatorPath", DEFAULTS.emulatorPath),
      webPort,
      autoLaunch: reader.get<boolean>("autoLaunch", DEFAULTS.autoLaunch),
      emulatorArgs,
    },
    warnings,
  }
}
