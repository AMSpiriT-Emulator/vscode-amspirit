import { createRoot } from "react-dom/client"
import { App } from "./app.js"
import "./styles.css"

const root = document.getElementById("root")
if (root) createRoot(root).render(<App />)
