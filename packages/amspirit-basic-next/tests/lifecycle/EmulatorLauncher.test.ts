import type { ChildProcess } from "node:child_process"
import { EventEmitter } from "node:events"
import { describe, expect, it, vi } from "vitest"
import { EmulatorLauncher } from "../../src/lifecycle/EmulatorLauncher.js"

function fakeChild(): ChildProcess & { triggerExit: (code: number | null) => void } {
  const emitter = new EventEmitter() as ChildProcess & {
    triggerExit: (code: number | null) => void
    killed: boolean
    kill: () => boolean
  }
  emitter.killed = false
  emitter.kill = () => {
    emitter.killed = true
    return true
  }
  emitter.triggerExit = (code) => emitter.emit("exit", code)
  return emitter
}

describe("EmulatorLauncher", () => {
  it("spawns with the provided arguments", () => {
    const child = fakeChild()
    const spawn = vi.fn().mockReturnValue(child)
    const launcher = new EmulatorLauncher(spawn)

    const result = launcher.launch("/bin/emu", 8765, ["--no-splash"])

    expect(result).toBe(child)
    expect(spawn).toHaveBeenCalledWith("/bin/emu", 8765, ["--no-splash"])
    expect(launcher.isRunning).toBe(true)
  })

  it("refuses to launch twice while running", () => {
    const launcher = new EmulatorLauncher(vi.fn().mockReturnValue(fakeChild()))
    launcher.launch("/bin/emu", 8765, [])
    expect(() => launcher.launch("/bin/emu", 8765, [])).toThrow(/already running/i)
  })

  it("allows relaunch after the process exits", () => {
    const child1 = fakeChild()
    const child2 = fakeChild()
    const spawn = vi.fn().mockReturnValueOnce(child1).mockReturnValueOnce(child2)
    const launcher = new EmulatorLauncher(spawn)

    launcher.launch("/bin/emu", 8765, [])
    child1.triggerExit(0)
    expect(launcher.isRunning).toBe(false)

    launcher.launch("/bin/emu", 8765, [])
    expect(launcher.isRunning).toBe(true)
    expect(spawn).toHaveBeenCalledTimes(2)
  })

  it("notifies the onExit callback when the child exits", () => {
    const child = fakeChild()
    const onExit = vi.fn()
    new EmulatorLauncher(vi.fn().mockReturnValue(child)).launch("/bin/emu", 8765, [], { onExit })
    child.triggerExit(42)
    expect(onExit).toHaveBeenCalledWith(42)
  })

  it("dispose kills a running child", () => {
    const child = fakeChild()
    const launcher = new EmulatorLauncher(vi.fn().mockReturnValue(child))
    launcher.launch("/bin/emu", 8765, [])
    launcher.dispose()
    expect(child.killed).toBe(true)
    expect(launcher.isRunning).toBe(false)
  })

  it("dispose is a no-op when nothing is running", () => {
    const launcher = new EmulatorLauncher(vi.fn())
    expect(() => launcher.dispose()).not.toThrow()
  })
})
