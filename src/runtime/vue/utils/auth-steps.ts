import type { Ref } from 'vue'

// What the code-driven flows share — the sign-in flow (`useLoginFlow`) and the
// email change (`useEmailChange`): a step only advances when the auth client
// answered without an error, and an error lands in the flow's `error` (with
// the wait of a 429 beside it) instead of rejecting.

/** What the auth client hands back: the response JSON spread next to its status. */
type AuthResult = { error?: { message?: string, status?: number, retryAfter?: number } | null }

export const DEFAULT_EMAIL_MESSAGE = 'Enter a valid email address.'

/**
 * A 429 on its way up `run()`'s error path, with when to retry. The package's
 * own limits answer with `retryAfter` in milliseconds in the body, which the
 * client's fetch spreads into `error` next to `status` — the only wait that
 * reaches a flow: Better Auth's built-in limiter (off unless an app turns it
 * on) sets an `X-Retry-After` header (seconds) that the `{ data, error }`
 * result drops, so its refusals read as "in a moment".
 */
class RateLimitedError extends Error {
  /** Seconds, rounded up so a countdown never lets the user retry early. */
  readonly retryAfter: number | null

  constructor(retryAfterMs: number | undefined, cause?: unknown) {
    const seconds = typeof retryAfterMs === 'number' && Number.isFinite(retryAfterMs)
      ? Math.max(1, Math.ceil(retryAfterMs / 1000))
      : null
    super(seconds === null
      ? 'Too many attempts. Try again in a moment.'
      : `Too many attempts. Try again in ${seconds} ${seconds === 1 ? 'second' : 'seconds'}.`, { cause })
    this.retryAfter = seconds
  }
}

/** A basic shape check: one `@`, a dot after it, no spaces. */
export function defaultValidateEmail(email: string): boolean {
  const value = email.trim()
  const at = value.indexOf('@')
  return at > 0 && value.indexOf('.', at) > at + 1 && !value.includes(' ') && at === value.lastIndexOf('@')
}

/**
 * Throw the client's error envelope, a 429 with its wait. The envelope's
 * error is the thrown error's `cause`, so `getBackendError` reads its code.
 */
export function ensureOk(result: unknown, fallback: string): void {
  const { error: resultError } = (result ?? {}) as AuthResult
  if (!resultError) return
  if (resultError.status === 429) throw new RateLimitedError(resultError.retryAfter, resultError)
  throw new Error(resultError.message ?? fallback, { cause: resultError })
}

/**
 * The runner a flow wraps each action in: `pending` while it runs, any error
 * into `error`, never a rejection.
 */
export function stepRunner(state: { pending: Ref<boolean>, error: Ref<string | null>, retryAfter: Ref<number | null> }) {
  const clearError = () => {
    state.error.value = null
    state.retryAfter.value = null
  }

  async function run(fallback: string, action: () => Promise<void>): Promise<void> {
    state.pending.value = true
    clearError()
    try {
      await action()
    }
    catch (cause) {
      // The step only advances on success, so a refusal leaves the user where
      // they were — with the wait beside the message for a countdown.
      if (cause instanceof RateLimitedError) state.retryAfter.value = cause.retryAfter
      state.error.value = cause instanceof Error ? cause.message : fallback
    }
    finally {
      state.pending.value = false
    }
  }

  return { run, clearError }
}
