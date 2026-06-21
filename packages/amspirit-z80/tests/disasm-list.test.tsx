// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { DisasmRow } from "../src/disasm-view/disasm-view-model.js"
import { DisasmList } from "../webview/components/disasm-list.js"

afterEach(cleanup)

const rows: DisasmRow[] = [
  {
    addr: 0x8000,
    address: "8000",
    bytes: "18 01",
    text: "JR L8003",
    isPc: true,
    executed: true,
    data: false,
  },
  {
    addr: 0x8002,
    address: "8002",
    bytes: "00",
    text: "DB #00",
    isPc: false,
    executed: false,
    data: true,
  },
  {
    addr: 0x8003,
    address: "8003",
    bytes: "C9",
    text: "RET",
    label: "L8003",
    isPc: false,
    executed: false,
    data: false,
  },
]

describe("<DisasmList />", () => {
  it("renders a row per instruction with address, bytes and mnemonic", () => {
    render(<DisasmList rows={rows} onGoto={vi.fn()} />)
    expect(screen.getByText("8000")).toBeDefined()
    expect(screen.getByText("JR L8003")).toBeDefined()
    expect(screen.getByText("RET")).toBeDefined()
    expect(screen.getByText("18 01")).toBeDefined()
  })

  it("shows a placeholder when there is no data", () => {
    render(<DisasmList rows={null} onGoto={vi.fn()} />)
    expect(screen.getByText(/no data|connect/i)).toBeDefined()
  })

  it("renders a legend for the PC marker and row shading", () => {
    render(<DisasmList rows={rows} onGoto={vi.fn()} />)
    expect(screen.getByText("▶ PC")).toBeDefined()
    expect(screen.getByText("Executed")).toBeDefined()
    expect(screen.getByText("Data (DB)")).toBeDefined()
  })

  it("marks the program-counter row and shades executed instructions", () => {
    render(<DisasmList rows={rows} onGoto={vi.fn()} />)
    const pcRow = screen.getByText("JR L8003").closest("tr")
    expect(pcRow?.getAttribute("data-pc")).toBe("true")
    expect(pcRow?.getAttribute("data-executed")).toBe("true")
    const dataRow = screen.getByText("DB #00").closest("tr")
    expect(dataRow?.getAttribute("data-pc")).toBeNull()
    // The un-executed row is shown as DB data and flagged as such.
    expect(dataRow?.getAttribute("data-data")).toBe("true")
  })

  it("emits a label definition line above its instruction", () => {
    render(<DisasmList rows={rows} onGoto={vi.fn()} />)
    expect(screen.getByText("L8003:")).toBeDefined()
  })

  it("calls onGoto with the parsed address when the form is submitted", () => {
    const onGoto = vi.fn()
    render(<DisasmList rows={rows} onGoto={onGoto} />)
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "&4000" } })
    fireEvent.submit(screen.getByRole("form"))
    expect(onGoto).toHaveBeenCalledWith(0x4000)
  })

  it("does not call onGoto for invalid input", () => {
    const onGoto = vi.fn()
    render(<DisasmList rows={rows} onGoto={onGoto} />)
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "zzz" } })
    fireEvent.submit(screen.getByRole("form"))
    expect(onGoto).not.toHaveBeenCalled()
  })

  it("pages on wheel and arrow/page keys", () => {
    const onPage = vi.fn()
    render(<DisasmList rows={rows} onGoto={vi.fn()} onPage={onPage} />)
    const table = screen.getByRole("table")
    fireEvent.wheel(table, { deltaY: 1 })
    expect(onPage).toHaveBeenCalledWith(1)
    fireEvent.keyDown(table, { key: "ArrowUp" })
    expect(onPage).toHaveBeenCalledWith(-1)
    fireEvent.keyDown(table, { key: "ArrowDown" })
    expect(onPage).toHaveBeenCalledWith(1)
    fireEvent.keyDown(table, { key: "PageDown" })
    expect(onPage).toHaveBeenCalledWith(rows.length)
    fireEvent.keyDown(table, { key: "PageUp" })
    expect(onPage).toHaveBeenCalledWith(-rows.length)
  })

  it("jumps to address 0 on Home", () => {
    const onGoto = vi.fn()
    render(<DisasmList rows={rows} onGoto={onGoto} onPage={vi.fn()} />)
    fireEvent.keyDown(screen.getByRole("table"), { key: "Home" })
    expect(onGoto).toHaveBeenCalledWith(0x0000)
  })

  it("toggles Follow PC off when navigating to an explicit address", () => {
    const onFollowPcChange = vi.fn()
    const onGoto = vi.fn()
    render(<DisasmList rows={rows} followPc onFollowPcChange={onFollowPcChange} onGoto={onGoto} />)
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "9000" } })
    fireEvent.submit(screen.getByRole("form"))
    expect(onFollowPcChange).toHaveBeenCalledWith(false)
    expect(onGoto).toHaveBeenCalledWith(0x9000)
  })

  it("reports Follow PC toggles and exports", () => {
    const onFollowPcChange = vi.fn()
    const onExportAsm = vi.fn()
    render(
      <DisasmList
        rows={rows}
        onGoto={vi.fn()}
        onFollowPcChange={onFollowPcChange}
        onExportAsm={onExportAsm}
      />,
    )
    fireEvent.click(screen.getByLabelText("Follow PC"))
    expect(onFollowPcChange).toHaveBeenCalledWith(true)
    fireEvent.click(screen.getByText("Export .asm"))
    expect(onExportAsm).toHaveBeenCalledWith()
  })

  it("exports the selected row range (click + shift-click)", () => {
    const onExportAsm = vi.fn()
    render(<DisasmList rows={rows} onGoto={vi.fn()} onExportAsm={onExportAsm} />)
    fireEvent.click(screen.getByText("JR L8003")) // anchor at 0x8000
    fireEvent.click(screen.getByText("RET"), { shiftKey: true }) // extend to 0x8003
    // The button reflects the selection and exports the whole range.
    fireEvent.click(screen.getByText("Export 8000-8003 .asm"))
    expect(onExportAsm).toHaveBeenCalledWith(0x8000, 0x8003)
  })

  it("renders the bank selector and reports a change", () => {
    const onSelectBank = vi.fn()
    const banks = [
      { id: "cpu", label: "CPU view", bank: 0, cpuView: true },
      { id: "bank1", label: "Bank 1", bank: 1, cpuView: false },
    ]
    render(
      <DisasmList
        rows={rows}
        banks={banks}
        selectedBankId="cpu"
        onSelectBank={onSelectBank}
        onGoto={vi.fn()}
      />,
    )
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "bank1" } })
    expect(onSelectBank).toHaveBeenCalledWith("bank1")
  })
})
