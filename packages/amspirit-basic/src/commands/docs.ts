/** Minimal shape of the fields we read from the extension manifest. */
export interface DocsManifest {
  homepage?: string
  repository?: string | { url?: string }
}

const FALLBACK_DOCS_URL = "https://github.com/AMSpiriT-emulator/vscode-amspirit#readme"

/**
 * Resolve the documentation URL to open, preferring the manifest `homepage`,
 * then the `repository` URL (normalised), then a hard-coded fallback.
 */
export function resolveDocsUrl(manifest: DocsManifest): string {
  const homepage = manifest.homepage?.trim()
  if (homepage) return homepage

  const repo =
    typeof manifest.repository === "string" ? manifest.repository : manifest.repository?.url
  const normalised = normaliseRepoUrl(repo)
  if (normalised) return normalised

  return FALLBACK_DOCS_URL
}

function normaliseRepoUrl(url: string | undefined): string | undefined {
  const trimmed = url?.trim()
  if (!trimmed) return undefined
  // git+https://host/owner/repo.git -> https://host/owner/repo
  return trimmed.replace(/^git\+/, "").replace(/\.git$/, "")
}
