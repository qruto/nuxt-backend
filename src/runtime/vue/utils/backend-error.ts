// The error catalog's reader on the Vue side: the same module the Convex
// functions throw from, so a code and its fields mean the same on both.
import { getBackendError } from '../../../convex/errors.js'

export { getBackendError }
export type { BackendError } from '../../../convex/errors.js'

/** The text an app's own `ConvexError('…')` carries, which production keeps too. */
function convexText(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  const data = (error as { data?: unknown }).data
  return typeof data === 'string' && data ? data : undefined
}

/**
 * The sentence a packaged component shows for a failed call: a refusal's
 * (which production keeps), else the string an app's own `ConvexError`
 * carries, else the error's own message, else `fallback`.
 */
export function refusalMessage(error: unknown, fallback: string): string {
  return getBackendError(error)?.message ?? convexText(error) ?? (error instanceof Error ? error.message : fallback)
}
