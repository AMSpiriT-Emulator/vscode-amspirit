// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import type { HistoryRow } from "../src/history-view/history-view-model.js"
import { HistoryList } from "../webview/components/history-list.js"

afterEach(cleanup)

const rows: HistoryRow[] = [
  { address: "B944", bytes: "CD 00 BB", text: "CALL 0xBB00", current: true },
  { address: "B942", bytes: "3E 01", text: "LD A,0x01", current: false },
]

describe("<HistoryList />", () => {
  it("renders each entry's address, bytes and mnemonic", () => {
    render(<HistoryList rows={rows} />)
    expect(screen.getByText("B944")).toBeDefined()
    expect(screen.getByText("CD 00 BB")).toBeDefined()
    expect(screen.getByText("CALL 0xBB00")).toBeDefined()
    expect(screen.getByText("LD A,0x01")).toBeDefined()
  })

  it("shows a placeholder when history is unavailable", () => {
    render(<HistoryList rows={null} />)
    expect(screen.getByText(/no data|connect/i)).toBeDefined()
  })

  it("shows an empty-history hint when there are no rows", () => {
    render(<HistoryList rows={[]} />)
    expect(screen.getByText(/no instruction history/i)).toBeDefined()
  })
})
