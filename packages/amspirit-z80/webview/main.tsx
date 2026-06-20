import { createRoot } from "react-dom/client"
import { App } from "./app.js"
import { DisasmApp } from "./disasm-app.js"
import { RegistersApp } from "./registers-app.js"
import "./styles.css"

// One bundle hosts every panel; the HTML shell's `data-view` picks which to
// mount (see src/webview/html.ts).
const root = document.getElementById("root")
if (root) {
  const view = root.dataset.view
  const app = view === "disasm" ? <DisasmApp /> : view === "registers" ? <RegistersApp /> : <App />
  createRoot(root).render(app)
}
