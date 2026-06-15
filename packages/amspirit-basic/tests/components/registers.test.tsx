// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import type { RegisterView } from "../../src/debug/register-view.js"
import { Registers } from "../../webview/components/registers.js"

afterEach(cleanup)

const view: RegisterView = {
  registers: [
    { name: "PC", value: "0x1234" },
    { name: "AF", value: "0xFF40" },
  ],
  flags: "·Z····",
  interrupts: [
    { name: "IFF1", value: "1" },
    { name: "IM", value: "2" },
  ],
}

describe("<Registers />", () => {
  it("renders each register name and value", () => {
    render(<Registers view={view} />)
    expect(screen.getByText("PC")).toBeDefined()
    expect(screen.getByText("0x1234")).toBeDefined()
    expect(screen.getByText("AF")).toBeDefined()
    expect(screen.getByText("0xFF40")).toBeDefined()
  })

  it("renders the flags string", () => {
    render(<Registers view={view} />)
    expect(screen.getByText("·Z····")).toBeDefined()
  })

  it("renders the interrupt state", () => {
    render(<Registers view={view} />)
    expect(screen.getByText("IFF1")).toBeDefined()
    expect(screen.getByText("IM")).toBeDefined()
  })

  it("shows a placeholder when there are no registers", () => {
    render(<Registers view={null} />)
    expect(screen.getByText(/not paused|no data/i)).toBeDefined()
  })
})
