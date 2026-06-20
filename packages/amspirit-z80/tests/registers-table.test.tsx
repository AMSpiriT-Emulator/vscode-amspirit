// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { RegisterScope } from "../src/registers-view.js"
import { RegistersTable } from "../webview/components/registers-table.js"

afterEach(cleanup)

const scopes: RegisterScope[] = [
  {
    name: "Registers",
    variables: [
      { name: "AF", value: "0x1234" },
      { name: "HL", value: "0xC000", memoryReference: "0xC000" },
      { name: "PC", value: "0x4000", memoryReference: "0x4000" },
    ],
  },
  {
    name: "Flags",
    variables: [
      { name: "Z", value: "1" },
      { name: "C", value: "0" },
    ],
  },
]

describe("<RegistersTable />", () => {
  it("renders each scope heading and its register name/value pairs", () => {
    render(<RegistersTable scopes={scopes} onGoto={vi.fn()} />)
    expect(screen.getByText("Registers")).toBeDefined()
    expect(screen.getByText("Flags")).toBeDefined()
    expect(screen.getByText("AF")).toBeDefined()
    expect(screen.getByText("0x1234")).toBeDefined()
    expect(screen.getByText("Z")).toBeDefined()
  })

  it("shows a placeholder when there is no data", () => {
    render(<RegistersTable scopes={null} onGoto={vi.fn()} />)
    expect(screen.getByText(/no data|pause|connect/i)).toBeDefined()
  })

  it("makes a pointer register's value a button that jumps memory to its address", () => {
    const onGoto = vi.fn()
    render(<RegistersTable scopes={scopes} onGoto={onGoto} />)
    fireEvent.click(screen.getByRole("button", { name: /HL/ }))
    expect(onGoto).toHaveBeenCalledWith(0xc000)
  })

  it("does not make a data register (no memory reference) clickable", () => {
    const onGoto = vi.fn()
    render(<RegistersTable scopes={scopes} onGoto={onGoto} />)
    // AF carries no memoryReference, so its value is plain text, not a button.
    expect(screen.queryByRole("button", { name: /AF/ })).toBeNull()
  })

  it("renders the Flags scope as a strip of chips, lit when the flag is set", () => {
    const flags: RegisterScope[] = [
      {
        name: "Flags",
        variables: [
          { name: "S", value: "1" },
          { name: "Z", value: "0" },
          { name: "C", value: "1" },
        ],
      },
    ]
    render(<RegistersTable scopes={flags} onGoto={vi.fn()} />)
    expect(screen.getByText("S").getAttribute("data-set")).toBe("true")
    expect(screen.getByText("Z").getAttribute("data-set")).toBe("false")
    expect(screen.getByText("C").getAttribute("data-set")).toBe("true")
  })

  it("names each flag in a tooltip", () => {
    const flags: RegisterScope[] = [{ name: "Flags", variables: [{ name: "Z", value: "1" }] }]
    render(<RegistersTable scopes={flags} onGoto={vi.fn()} />)
    expect(screen.getByText("Z").getAttribute("title")).toMatch(/zero/i)
  })
})
