/**
 * Normalize any caught value into a human-readable string.
 * Handles Error, string, and unknown shapes uniformly.
 */
export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  if (typeof e === "string") return e
  if (e === null || e === undefined) return String(e)
  try {
    const s = JSON.stringify(e)
    return s ?? String(e)
  } catch {
    return String(e)
  }
}
