// The error catalog's reader on the Vue side: the same module the Convex
// functions throw from, so a code and its fields mean the same on both.
import { backendError, getBackendError, type BackendError } from '../../../convex/errors.js'

export { getBackendError }
export type { BackendError } from '../../../convex/errors.js'

/**
 * The text an app's own `ConvexError` carries, which production keeps too:
 * the string of `new ConvexError('…')`, or the `message` of
 * `new ConvexError({ message })`.
 */
function convexText(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  const data = (error as { data?: unknown }).data
  if (typeof data === 'string') return data || undefined
  const message = typeof data === 'object' && data !== null ? (data as { message?: unknown }).message : undefined
  return typeof message === 'string' && message ? message : undefined
}

/**
 * The sentence a packaged component shows for a failed call: a refusal's
 * (which production keeps), else the string an app's own `ConvexError`
 * carries, else the error's own message, else `fallback`.
 */
export function refusalMessage(error: unknown, fallback: string): string {
  return getBackendError(error)?.message ?? convexText(error) ?? (error instanceof Error ? error.message : fallback)
}

/**
 * The message of an auth client's error body (`{ message, status }`, a plain
 * object rather than an `Error`), on the error or anywhere down its causes.
 */
function authText(error: unknown): string | undefined {
  const seen = new Set<unknown>()
  let current = error
  while (typeof current === 'object' && current !== null && !seen.has(current)) {
    seen.add(current)
    const message = (current as { message?: unknown }).message
    if (!(current instanceof Error) && typeof message === 'string' && message) return message
    current = (current as { cause?: unknown }).cause
  }
  return undefined
}

/** The package's own message for a developer, such as a function the app does not export. */
function packageText(error: unknown): string | undefined {
  return error instanceof Error && error.message.startsWith('[nuxt-backend]') ? error.message : undefined
}

/**
 * A failed call as a composable's `error`: its refusal when it carries a
 * catalog code. Anything else (a crash, which production words as "Server
 * Error", or an app's own error) reads as `unavailable` with service
 * `backend` and reason `unexpected`, keeping the sentence an app's own
 * `ConvexError`, an auth error body or the package's own setup error wrote.
 * Never `null`, so a failed read or action always shows in `error`. The
 * original error rides along as `cause`, kept out of enumeration so the
 * value still compares and serializes as `{ code, data, message }`.
 */
export function failureOf(error: unknown): BackendError {
  let failure = getBackendError(error)
  if (!failure) {
    const unexpected = getBackendError(backendError('unavailable', { service: 'backend', reason: 'unexpected' }))!
    const text = convexText(error) ?? authText(error) ?? packageText(error)
    failure = text ? { ...unexpected, message: text } : unexpected
  }
  return Object.defineProperty(failure, 'cause', { value: error, enumerable: false })
}

/** Whether a failure carries no catalog code: a crash or an app's own error, which a developer should see. */
export function isUnexpected(failure: BackendError): boolean {
  return failure.code === 'unavailable' && failure.data.service === 'backend' && failure.data.reason === 'unexpected'
}
