// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { MemoryRow, PointerMark } from "../src/memory-view/memory-model.js"
import { MemoryGrid } from "../webview/components/memory-grid.js"

afterEach(cleanup)

const rows: MemoryRow[] = [
  { addr: 0xc000, address: "C000", hex: ["48", "65", "6c", "6c", "6f"], ascii: "Hello" },
  { addr: 0xc010, address: "C010", hex: ["00", "ff"], ascii: ".." },
]

describe("<MemoryGrid />", () => {
  it("renders a row per line with its address, hex bytes and ascii", () => {
    render(<MemoryGrid rows={rows} onGoto={vi.fn()} />)
    expect(screen.getByText("C000")).toBeDefined()
    expect(screen.getByText("C010")).toBeDefined()
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

  it("shows the current window base address in a header", () => {
    render(<MemoryGrid rows={rows} base="4000" onGoto={vi.fn()} />)
    expect(screen.getByText(/4000/)).toBeDefined()
  })

  it("renders a Follow PC checkbox reflecting its state and toggling it", () => {
    const onFollowPcChange = vi.fn()
    render(
      <MemoryGrid
        rows={rows}
        followPc={false}
        onFollowPcChange={onFollowPcChange}
        onGoto={vi.fn()}
      />,
    )
    const box = screen.getByRole("checkbox", { name: /follow pc/i }) as HTMLInputElement
    expect(box.checked).toBe(false)
    fireEvent.click(box)
    expect(onFollowPcChange).toHaveBeenCalledWith(true)
  })

  it("turns Follow PC off when the user navigates with Go to", () => {
    const onFollowPcChange = vi.fn()
    const onGoto = vi.fn()
    render(
      <MemoryGrid
        rows={rows}
        followPc={true}
        onFollowPcChange={onFollowPcChange}
        onGoto={onGoto}
      />,
    )
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "&8000" } })
    fireEvent.submit(screen.getByRole("form"))
    expect(onFollowPcChange).toHaveBeenCalledWith(false)
    expect(onGoto).toHaveBeenCalledWith(0x8000)
  })

  it("flashes a byte that changed value since the last render, not its neighbours", () => {
    const before: MemoryRow[] = [{ addr: 0xc000, address: "C000", hex: ["48", "65"], ascii: "He" }]
    const after: MemoryRow[] = [{ addr: 0xc000, address: "C000", hex: ["49", "65"], ascii: "Ie" }]
    const { rerender } = render(<MemoryGrid rows={before} onGoto={vi.fn()} />)
    rerender(<MemoryGrid rows={after} onGoto={vi.fn()} />)
    expect(screen.getByText("49").className).toContain("valflash")
    expect(screen.getByText("65").className).not.toContain("valflash")
  })

  it("does not flash when the window moves to a new base address", () => {
    const before: MemoryRow[] = [{ addr: 0xc000, address: "C000", hex: ["48"], ascii: "H" }]
    const after: MemoryRow[] = [{ addr: 0x8000, address: "8000", hex: ["49"], ascii: "I" }]
    const { rerender } = render(<MemoryGrid rows={before} onGoto={vi.fn()} />)
    rerender(<MemoryGrid rows={after} onGoto={vi.fn()} />)
    expect(screen.getByText("49").className).not.toContain("valflash")
  })
})
