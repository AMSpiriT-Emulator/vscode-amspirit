// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { MemoryRow, PointerMark } from "../src/memory-view/memory-model.js"
import { MemoryGrid } from "../webview/components/memory-grid.js"

afterEach(cleanup)

const rows: MemoryRow[] = [
  { address: "0xC000", hex: ["48", "65", "6c", "6c", "6f"], ascii: "Hello" },
  { address: "0xC010", hex: ["00", "ff"], ascii: ".." },
]

describe("<MemoryGrid />", () => {
  it("renders a row per line with its address, hex bytes and ascii", () => {
    render(<MemoryGrid rows={rows} onGoto={vi.fn()} />)
    expect(screen.getByText("0xC000")).toBeDefined()
    expect(screen.getByText("0xC010")).toBeDefined()
    expect(screen.getByText("Hello")).toBeDefined()
    // a hex byte cell is present
    expect(screen.getAllByText("48").length).toBeGreaterThan(0)
  })

  it("shows a placeholder when there is no data", () => {
    render(<MemoryGrid rows={null} onGoto={vi.fn()} />)
    expect(screen.getByText(/no data|pause/i)).toBeDefined()
  })

  it("calls onGoto with the parsed address when the form is submitted", () => {
    const onGoto = vi.fn()
    render(<MemoryGrid rows={rows} onGoto={onGoto} />)
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "&4000" } })
    fireEvent.submit(screen.getByRole("form"))
    expect(onGoto).toHaveBeenCalledWith(0x4000)
  })

  it("does not call onGoto for invalid input", () => {
    const onGoto = vi.fn()
    render(<MemoryGrid rows={rows} onGoto={onGoto} />)
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "zzz" } })
    fireEvent.submit(screen.getByRole("form"))
    expect(onGoto).not.toHaveBeenCalled()
  })

  it("highlights the byte a pointer register targets and names it in a tooltip", () => {
    // offsets accumulate across rows by byte count: row0 = 0..4, row1 = 5..6.
    const marks: PointerMark[] = [
      { offset: 1, registers: ["HL"] },
      { offset: 5, registers: ["BC", "PC"] },
    ]
    render(<MemoryGrid rows={rows} marks={marks} onGoto={vi.fn()} />)
    // the "65" byte (row0, col1) is the HL target
    const hl = screen.getByTitle("HL")
    expect(hl.textContent).toBe("65")
    expect(hl.className).toContain("pointer")
    // the "00" byte (row1, col0) is shared by BC and PC
    const shared = screen.getByTitle("BC, PC")
    expect(shared.textContent).toBe("00")
  })

  it("renders fine when no marks are supplied", () => {
    render(<MemoryGrid rows={rows} onGoto={vi.fn()} />)
    expect(screen.getAllByText("48").length).toBeGreaterThan(0)
  })
})
