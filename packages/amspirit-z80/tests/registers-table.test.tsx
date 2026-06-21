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

  it("renders a palette scope as a grid of colour swatches (index in the tooltip)", () => {
    const palette: RegisterScope[] = [
      {
        name: "Palette",
        kind: "palette",
        variables: [
          { name: "PEN0", value: "0", swatch: "#000000" },
          { name: "PEN1", value: "26", swatch: "#FFFF00", muted: true },
          { name: "Border", value: "3", swatch: "#FF0000", divider: true },
        ],
      },
    ]
    render(<RegistersTable scopes={palette} onGoto={vi.fn()} />)
    expect(screen.getByText("PEN0")).toBeDefined()
    const swatch = screen.getByTestId("swatch-PEN1")
    expect(swatch.style.backgroundColor).toBe("rgb(255, 255, 0)")
    // The scattered hardware colour index is not shown on the face, only on hover.
    expect(screen.queryByText("26")).toBeNull()
    expect(swatch.parentElement?.getAttribute("title")).toMatch(/hardware colour 26/)
    expect(swatch.parentElement?.getAttribute("data-muted")).toBe("true")
  })

  it("renders a membar scope as ROM/RAM regions", () => {
    const scopesMb: RegisterScope[] = [
      {
        name: "Memory map",
        kind: "membar",
        variables: [
          { name: "0000", value: "Lower", rom: true },
          { name: "4000", value: "RAM 1", rom: false },
        ],
      },
    ]
    render(<RegistersTable scopes={scopesMb} onGoto={vi.fn()} />)
    expect(screen.getByText("Lower")).toBeDefined()
    expect(screen.getByText("0000").parentElement?.getAttribute("data-rom")).toBe("true")
    expect(screen.getByText("4000").parentElement?.getAttribute("data-rom")).toBeNull()
  })

  it("uses a variable's hint for the flag chip tooltip", () => {
    const flags: RegisterScope[] = [
      {
        name: "MSR bits",
        kind: "flags",
        variables: [{ name: "RQM", value: "1", hint: "Request for Master" }],
      },
    ]
    render(<RegistersTable scopes={flags} onGoto={vi.fn()} />)
    expect(screen.getByText("RQM").getAttribute("title")).toMatch(/request for master/i)
  })
})
