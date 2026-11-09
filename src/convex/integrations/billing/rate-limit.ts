// A provider request refused for its rate limit (`429`), and how long the
// provider asks to wait (`Retry-After`). The package's own refusal hides the
// provider's error from callers (`unavailable`, reason `provider_refused`);
// the wait rides on the thrown error, server side only, so the code that
// paces many requests (`billing resync`) can honour it.

/** Where the wait rides on a thrown refusal: a symbol, so it never reaches a caller with the error's data. */
const RATE_LIMITED = Symbol.for('nuxt-backend.billing.rateLimited')

/** The longest wait a `Retry-After` is taken at: past it, the caller backs off on its own schedule. */
const RETRY_AFTER_CAP_MS = 120_000

/**
 * A `Retry-After` value in milliseconds: delta seconds, or an HTTP date;
 * `null` when it says neither, or is absent.
 */
export function retryAfterMs(value: string | null | undefined, now = Date.now()): number | null {
  if (!value) return null
  const trimmed = value.trim()
  const ms = /^\d+$/.test(trimmed) ? Number(trimmed) * 1000 : Date.parse(trimmed) - now
  return Number.isFinite(ms) ? Math.min(Math.max(ms, 0), RETRY_AFTER_CAP_MS) : null
}

/** The provider SDK's error for a `429`, with its `Retry-After`; `undefined` for any other error. */
function rateLimitOf(error: unknown): { waitMs: number | null } | undefined {
  const fields = (typeof error === 'object' && error !== null ? error : {}) as { statusCode?: unknown, headers?: { get?: (name: string) => string | null } }
  if (fields.statusCode !== 429) return undefined
  return { waitMs: retryAfterMs(typeof fields.headers?.get === 'function' ? fields.headers.get('retry-after') : null) }
}

/** Mark the package's refusal of a provider error that was a rate limit, with the wait the provider asked for. */
export function markRateLimited<E extends Error>(refusal: E, providerError: unknown): E {
  const limit = rateLimitOf(providerError)
  if (limit) Object.defineProperty(refusal, RATE_LIMITED, { value: limit, enumerable: false })
  return refusal
}

/**
 * Whether a thrown error is the provider's rate limit, and the wait it asked
 * for (`null` when it named none): read off the package's refusal, or off
 * the SDK's own error.
 */
export function providerRateLimit(error: unknown): { waitMs: number | null } | undefined {
  if (typeof error === 'object' && error !== null && RATE_LIMITED in error) return (error as { [RATE_LIMITED]: { waitMs: number | null } })[RATE_LIMITED]
  return rateLimitOf(error)
}
