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

  it("renders a colour legend for the byte-state shading", () => {
    render(<MemoryGrid rows={rows} onGoto={vi.fn()} />)
    expect(screen.getByText("Executed")).toBeDefined()
    expect(screen.getByText("Pointer")).toBeDefined()
    expect(screen.getByText("Changed")).toBeDefined()
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
    expect(hl.getAttribute("data-pointer")).toBe("true")
    // the "00" byte (row1, col0) is shared by BC and PC
    const shared = screen.getByTitle("BC, PC")
    expect(shared.textContent).toBe("00")
  })

  it("renders fine when no marks are supplied", () => {
    render(<MemoryGrid rows={rows} onGoto={vi.fn()} />)
    expect(screen.getAllByText("48").length).toBeGreaterThan(0)
  })

  it("renders the bank selector and reports a change", () => {
    const onSelectBank = vi.fn()
    const banks = [
      { id: "cpu", label: "CPU view", bank: 0, cpuView: true },
      { id: "ram", label: "Main RAM", bank: 0, cpuView: false },
      { id: "bank1", label: "Bank 1", bank: 1, cpuView: false },
    ]
    render(
      <MemoryGrid
        rows={rows}
        banks={banks}
        selectedBankId="cpu"
        onSelectBank={onSelectBank}
        onGoto={vi.fn()}
      />,
    )
    const select = screen.getByRole("combobox", { name: /memory view/i }) as HTMLSelectElement
    expect(select.value).toBe("cpu")
    expect(screen.getByRole("option", { name: "Bank 1" })).toBeDefined()
    fireEvent.change(select, { target: { value: "bank1" } })
    expect(onSelectBank).toHaveBeenCalledWith("bank1")
  })

  it("hides the bank selector when no banks are known", () => {
    render(<MemoryGrid rows={rows} banks={[]} onGoto={vi.fn()} />)
    expect(screen.queryByRole("combobox")).toBeNull()
  })

  it("selects a byte range (click + shift-click) and disassembles it", () => {
    const onDisassemble = vi.fn()
    render(<MemoryGrid rows={rows} onGoto={vi.fn()} onDisassemble={onDisassemble} />)
    // no selection yet -> no disassemble button
    expect(screen.queryByRole("button", { name: /disassemble/i })).toBeNull()
    // click "48" (0xC000), shift-click "6f" (0xC004) -> range C000..C004
    fireEvent.click(screen.getByText("48"))
    fireEvent.click(screen.getByText("6f"), { shiftKey: true })
    expect(screen.getByText("48").getAttribute("data-selected")).toBe("true")
    const btn = screen.getByRole("button", { name: /disassemble C000-C004/i })
    fireEvent.click(btn)
    expect(onDisassemble).toHaveBeenCalledWith(0xc000, 0xc004)
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
    expect(screen.getByText("49").getAttribute("data-flash")).toBe("true")
    expect(screen.getByText("65").getAttribute("data-flash")).toBeNull()
  })

  it("does not flash when the window moves to a new base address", () => {
    const before: MemoryRow[] = [{ addr: 0xc000, address: "C000", hex: ["48"], ascii: "H" }]
    const after: MemoryRow[] = [{ addr: 0x8000, address: "8000", hex: ["49"], ascii: "I" }]
    const { rerender } = render(<MemoryGrid rows={before} onGoto={vi.fn()} />)
    rerender(<MemoryGrid rows={after} onGoto={vi.fn()} />)
    expect(screen.getByText("49").getAttribute("data-flash")).toBeNull()
  })

  it("shades the bytes the PC has executed (code coverage)", () => {
    // offsets accumulate across rows: row0 = 0..4, row1 = 5..6.
    render(<MemoryGrid rows={rows} executed={[1, 5]} onGoto={vi.fn()} />)
    expect(screen.getByText("65").getAttribute("data-executed")).toBe("true") // offset 1
    expect(screen.getByText("48").getAttribute("data-executed")).toBeNull() // offset 0
    expect(screen.getByText("00").getAttribute("data-executed")).toBe("true") // offset 5
  })

  it("scrolls down one row on a wheel-down, leaving Follow PC", () => {
    const onGoto = vi.fn()
    const onFollowPcChange = vi.fn()
    render(
      <MemoryGrid
        rows={rows}
        columns={16}
        followPc={true}
        onFollowPcChange={onFollowPcChange}
        onGoto={onGoto}
      />,
    )
    fireEvent.wheel(screen.getByRole("table"), { deltaY: 120 })
    expect(onGoto).toHaveBeenCalledWith(0xc010) // base 0xC000 + one 16-byte row
    expect(onFollowPcChange).toHaveBeenCalledWith(false)
  })

  it("pages by the window height on PageDown/PageUp", () => {
    const onGoto = vi.fn()
    render(<MemoryGrid rows={rows} columns={16} onGoto={onGoto} />)
    const table = screen.getByRole("table")
    fireEvent.keyDown(table, { key: "PageDown" }) // 2 visible rows × 16 = +0x20
    expect(onGoto).toHaveBeenCalledWith(0xc020)
    onGoto.mockClear()
    fireEvent.keyDown(table, { key: "ArrowUp" }) // one row up, wraps below base
    expect(onGoto).toHaveBeenCalledWith(0xbff0)
  })

  it("jumps to 0x0000 on Home and to the last window on End", () => {
    const onGoto = vi.fn()
    render(<MemoryGrid rows={rows} columns={16} onGoto={onGoto} />)
    const table = screen.getByRole("table")
    fireEvent.keyDown(table, { key: "Home" })
    expect(onGoto).toHaveBeenCalledWith(0x0000)
    onGoto.mockClear()
    fireEvent.keyDown(table, { key: "End" }) // -(2 rows × 16) wraps to 0xFFE0
    expect(onGoto).toHaveBeenCalledWith(0xffe0)
  })

  it("commits an edit when the input loses focus", () => {
    const onWrite = vi.fn()
    render(<MemoryGrid rows={rows} editable onWrite={onWrite} onGoto={vi.fn()} />)
    fireEvent.doubleClick(screen.getByText("48"))
    const input = screen.getByRole("textbox", { name: /edit byte/i })
    fireEvent.change(input, { target: { value: "7f" } })
    fireEvent.blur(input)
    expect(onWrite).toHaveBeenCalledWith(0xc000, 0x7f)
  })

  it("edits a byte when editable and writes the new value", () => {
    const onWrite = vi.fn()
    render(<MemoryGrid rows={rows} editable onWrite={onWrite} onGoto={vi.fn()} />)
    fireEvent.doubleClick(screen.getByText("48")) // 0xC000
    const input = screen.getByRole("textbox", { name: /edit byte/i })
    fireEvent.change(input, { target: { value: "3e" } })
    fireEvent.keyDown(input, { key: "Enter" })
    expect(onWrite).toHaveBeenCalledWith(0xc000, 0x3e)
  })

  it("cancels an edit on Escape without writing", () => {
    const onWrite = vi.fn()
    render(<MemoryGrid rows={rows} editable onWrite={onWrite} onGoto={vi.fn()} />)
    fireEvent.doubleClick(screen.getByText("48"))
    const input = screen.getByRole("textbox", { name: /edit byte/i })
    fireEvent.change(input, { target: { value: "3e" } })
    fireEvent.keyDown(input, { key: "Escape" })
    expect(onWrite).not.toHaveBeenCalled()
    expect(screen.queryByRole("textbox", { name: /edit byte/i })).toBeNull()
  })

  it("ignores a double-click when read-only", () => {
    const onWrite = vi.fn()
    render(<MemoryGrid rows={rows} editable={false} onWrite={onWrite} onGoto={vi.fn()} />)
    fireEvent.doubleClick(screen.getByText("48"))
    expect(screen.queryByRole("textbox", { name: /edit byte/i })).toBeNull()
  })
})
