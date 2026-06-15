// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import type { BasicVarsView } from "../../src/debug/basic-vars-view.js"
import { BasicVariables } from "../../webview/components/basic-variables.js"

afterEach(cleanup)

const view: BasicVarsView = {
  systemVars: [
    { label: "TXTTOP", value: "0170" },
    { label: "Version", value: "BASIC 1.0" },
  ],
  rows: [
    { name: "I%", type: "Int", value: "42" },
    { name: "MSG$", type: "String", value: '"HELLO"' },
  ],
}

describe("<BasicVariables />", () => {
  it("renders the memory-layout system variables", () => {
    render(<BasicVariables view={view} />)
    expect(screen.getByText("TXTTOP")).toBeDefined()
    expect(screen.getByText("0170")).toBeDefined()
    expect(screen.getByText("BASIC 1.0")).toBeDefined()
  })

  it("renders a name/type/value row per variable", () => {
    render(<BasicVariables view={view} />)
    expect(screen.getByText("I%")).toBeDefined()
    expect(screen.getByText("Int")).toBeDefined()
    expect(screen.getByText("42")).toBeDefined()
    expect(screen.getByText("MSG$")).toBeDefined()
    expect(screen.getByText('"HELLO"')).toBeDefined()
  })

  it("flashes a value cell when it changes between renders", () => {
    const { container, rerender } = render(<BasicVariables view={view} />)
    // first render: nothing flashes (no prior value)
    expect(container.querySelectorAll(".valflash")).toHaveLength(0)
    const next: BasicVarsView = {
      ...view,
      rows: [
        { name: "I%", type: "Int", value: "43" }, // changed
        { name: "MSG$", type: "String", value: '"HELLO"' }, // unchanged
      ],
    }
    rerender(<BasicVariables view={next} />)
    const flashed = container.querySelectorAll(".valflash")
    expect(flashed).toHaveLength(1)
    expect(flashed[0]?.textContent).toBe("43")
  })

  it("shows the no-variables message when the list is empty", () => {
    render(<BasicVariables view={{ systemVars: view.systemVars, rows: [] }} />)
    expect(screen.getByText(/no variables/i)).toBeDefined()
  })

  it("shows a placeholder when there is no data", () => {
    render(<BasicVariables view={null} />)
    expect(screen.getByText(/no data|pause/i)).toBeDefined()
  })
})
