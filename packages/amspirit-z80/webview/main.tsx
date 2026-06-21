import type { JSX } from "react"
import { createRoot } from "react-dom/client"
import { App } from "./app.js"
import { DisasmApp } from "./disasm-app.js"
import { HardwareApp } from "./hardware-app.js"
import { RegistersApp } from "./registers-app.js"
import "./styles.css"

// One bundle hosts every panel; the HTML shell's `data-view` picks which to
// mount (see src/webview/html.ts). The peripheral chips share HardwareApp — the
// panel feeds each its own formatted scopes.
const VIEWS: Record<string, () => JSX.Element> = {
  disasm: () => <DisasmApp />,
  registers: () => <RegistersApp />,
  "gate-array": () => <HardwareApp />,
  psg: () => <HardwareApp />,
  fdc: () => <HardwareApp />,
  crtc: () => <HardwareApp />,
}

const root = document.getElementById("root")
if (root) {
  const view = root.dataset.view ?? ""
  const make = VIEWS[view] ?? (() => <App />)
  createRoot(root).render(make())
}
