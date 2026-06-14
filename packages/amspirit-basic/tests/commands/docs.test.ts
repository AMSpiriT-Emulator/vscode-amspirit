import { describe, expect, it } from "vitest"
import { resolveDocsUrl } from "../../src/commands/docs.js"

describe("resolveDocsUrl", () => {
  it("prefers the homepage field", () => {
    const url = resolveDocsUrl({
      homepage: "https://example.com/docs",
      repository: { url: "https://github.com/x/y.git" },
    })
    expect(url).toBe("https://example.com/docs")
  })

  it("falls back to the repository url (object form), normalised", () => {
    const url = resolveDocsUrl({ repository: { url: "git+https://github.com/x/y.git" } })
    expect(url).toBe("https://github.com/x/y")
  })

  it("accepts the repository as a plain string", () => {
    const url = resolveDocsUrl({ repository: "https://github.com/x/y.git" })
    expect(url).toBe("https://github.com/x/y")
  })

  it("ignores blank/whitespace homepage", () => {
    const url = resolveDocsUrl({ homepage: "   ", repository: "https://github.com/x/y" })
    expect(url).toBe("https://github.com/x/y")
  })

  it("uses the hard-coded fallback when nothing is provided", () => {
    expect(resolveDocsUrl({})).toMatch(/^https:\/\/github\.com\/.+#readme$/)
  })
})
