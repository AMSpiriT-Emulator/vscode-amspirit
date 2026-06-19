import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// Builds the React memory-view webview into out/webview/ as a single ES module
// + CSS file (no hashing) so the extension's HTML shell can reference stable
// paths with a strict CSP nonce. No hand-written HTML.
export default defineConfig({
  plugins: [react()],
  // Lib mode doesn't define NODE_ENV, so React would ship its dev build.
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  build: {
    outDir: "out/webview",
    emptyOutDir: true,
    cssCodeSplit: false,
    lib: {
      entry: "webview/main.tsx",
      formats: ["es"],
      fileName: () => "webview.js",
    },
    rollupOptions: {
      output: { assetFileNames: "webview.[ext]" },
    },
  },
})
