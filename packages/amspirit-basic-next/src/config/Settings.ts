export interface ConfigReader {
  get<T>(key: string, defaultValue: T): T
}

export interface AmspiritSettings {
  emulatorPath: string
  webPort: number
  autoLaunch: boolean
  emulatorArgs: readonly string[]
}

const DEFAULTS: AmspiritSettings = {
  emulatorPath: "",
  webPort: 8765,
  autoLaunch: false,
  emulatorArgs: [],
}

export function readSettings(reader: ConfigReader): AmspiritSettings {
  const port = reader.get<number>("webPort", DEFAULTS.webPort)
  const args = reader.get<readonly string[]>("emulatorArgs", DEFAULTS.emulatorArgs)
  return {
    emulatorPath: reader.get<string>("emulatorPath", DEFAULTS.emulatorPath),
    webPort: Number.isFinite(port) && port > 0 && port < 65536 ? port : DEFAULTS.webPort,
    autoLaunch: reader.get<boolean>("autoLaunch", DEFAULTS.autoLaunch),
    emulatorArgs: Array.isArray(args) ? args.filter((a): a is string => typeof a === "string") : [],
  }
}
