import type { ChildProcess } from "node:child_process"

export type SpawnFn = (
  binaryPath: string,
  port: number,
  extraArgs: readonly string[],
) => ChildProcess

export interface LauncherEvents {
  onExit?: (code: number | null) => void
}

/**
 * Manages the lifecycle of a spawned emulator child process.
 * Refuses to launch twice; cleanly disposes on shutdown.
 */
export class EmulatorLauncher {
  private proc: ChildProcess | undefined

  constructor(private readonly spawn: SpawnFn) {}

  get isRunning(): boolean {
    return this.proc !== undefined && !this.proc.killed
  }

  launch(
    binaryPath: string,
    port: number,
    extraArgs: readonly string[],
    events: LauncherEvents = {},
  ): ChildProcess {
    if (this.isRunning) {
      throw new Error("Emulator is already running")
    }
    const child = this.spawn(binaryPath, port, extraArgs)
    this.proc = child
    child.on("exit", (code) => {
      this.proc = undefined
      events.onExit?.(code)
    })
    return child
  }

  dispose(): void {
    if (this.proc && !this.proc.killed) {
      this.proc.kill()
    }
    this.proc = undefined
  }
}
