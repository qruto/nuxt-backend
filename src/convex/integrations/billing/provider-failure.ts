// Whether a provider request that failed may pass on a retry. The package's
// refusal hides the provider's error from callers (`unavailable`, reason
// `provider_refused`) whatever went wrong; the answer rides on the thrown
// error, server side only, as a rate limit's wait does (rate-limit.ts), so
// code that tries again later (a job's owed charge) can tell a provider
// having trouble from one that refuses the request itself, such as a
// revoked access token (401) or metadata over its limits (422).

/** Where the answer rides on a thrown refusal: a symbol, so it never reaches a caller with the error's data. */
const PASSING = Symbol.for('nuxt-backend.billing.passing')

/**
 * Whether a provider SDK error may pass on a retry: no answer at all (the
 * connection failed, the request timed out or was aborted), an answer the
 * SDK could not read (whether the provider took the request is unknown, and
 * a retry under the same idempotency key settles it), or a `408`, `429` or
 * `5xx`. Any other `4xx` refuses the request itself, as does the SDK when it
 * refuses a request before sending it.
 */
function passes(error: unknown): boolean {
  const { statusCode, name } = (typeof error === 'object' && error !== null ? error : {}) as { statusCode?: unknown, name?: unknown }
  if (typeof statusCode === 'number') return statusCode < 400 || statusCode === 408 || statusCode === 429 || statusCode >= 500
  return name !== 'SDKValidationError' && name !== 'InvalidRequestError'
}

/** Mark the package's refusal of a provider error with whether that error may pass on a retry. */
export function markPassing<E extends Error>(refusal: E, providerError: unknown): E {
  Object.defineProperty(refusal, PASSING, { value: passes(providerError), enumerable: false })
  return refusal
}

/**
 * Whether a thrown error is the package's refusal of a provider failure
 * that may pass on a retry. `false` for one the provider will refuse again,
 * and for any error no provider answer marked.
 */
export function providerFailurePasses(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { [PASSING]?: unknown })[PASSING] === true
}
