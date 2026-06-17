import { extname } from "node:path"
import { RasmMapParser } from "./rasm-map.js"
import { SjasmplusSldParser } from "./sjasmplus-sld.js"
import type { SymbolMap, SymbolMapParser } from "./symbol-map.js"

/**
 * Pick the symbol-map adapter for a build artifact and parse it. Selection is by
 * extension (`.sld` → sjasmplus, `.map` → rasm); for anything else the content
 * is sniffed (the SLD header is unmistakable, otherwise assume a rasm listing).
 */
export function parseSymbolMap(mapPath: string, content: string): SymbolMap {
  return selectParser(mapPath, content).parse(content)
}

function selectParser(mapPath: string, content: string): SymbolMapParser {
  switch (extname(mapPath).toLowerCase()) {
    case ".sld":
      return new SjasmplusSldParser()
    case ".map":
      return new RasmMapParser()
    default:
      return content.includes("SLD.data.version") ? new SjasmplusSldParser() : new RasmMapParser()
  }
}
