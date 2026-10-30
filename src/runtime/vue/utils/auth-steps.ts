import type { Ref } from 'vue'
import { backendError } from '../../../convex/errors.js'
import { quietly } from './action-state'
import { type BackendError, failureOf } from './backend-error'

// What the code-driven flows share — the sign-in flow (`useLoginFlow`) and the
// email change (`useEmailChange`): a step only advances when its call
// resolved, and a failure lands in the flow's `error` (with the wait of a
// rate limit beside it) instead of rejecting.

/** A basic shape check: one `@`, a dot after it, no spaces. */
export function defaultValidateEmail(email: string): boolean {
  const value = email.trim()
  const at = value.indexOf('@')
  return at > 0 && value.indexOf('.', at) > at + 1 && !value.includes(' ') && at === value.lastIndexOf('@')
}

/**
 * The refusal a flow makes itself, before any code is sent: an address that
 * does not pass. `invalid_input` on `field`, with the sentence an app's
 * own check wrote, or none, so the field's label (`errors.invalid_input_email`)
 * says it in the reader's language.
 */
export function invalidInput(field: string, message?: string): BackendError {
  return failureOf(backendError('invalid_input', message === undefined ? { field } : { field, message }))
}

/**
 * Run an app's email check, or the default one: `true` passes; `false`
 * refuses with the field's label (`undefined` here); a string refuses with
 * that sentence.
 */
export function checkEmail(validate: ((email: string) => boolean | string) | undefined, email: string): true | string | undefined {
  const result = (validate ?? defaultValidateEmail)(email)
  if (result === true) return true
  return typeof result === 'string' ? result : undefined
}

/**
 * The seconds a rate-limited failure says to wait, rounded up so a countdown
 * never lets the user retry early; `null` for any other failure, or a limit
 * that gave no wait. The package's own limits send it; Better Auth's built-in
 * limiter (off unless an app turns it on) puts it in a header the client
 * drops, so its refusals have none.
 */
function secondsToWait(failure: BackendError): number | null {
  if (failure.code !== 'rate_limited' || typeof failure.data.retryAfter !== 'number') return null
  return Math.max(1, Math.ceil(failure.data.retryAfter / 1000))
}

/**
 * The runner a flow wraps each action in: `pending` while it runs, the
 * failure (see `failureOf`) into `error`, never a rejection.
 */
export function stepRunner(state: { pending: Ref<boolean>, error: Ref<BackendError | null>, retryAfter: Ref<number | null> }) {
  const clearError = () => {
    state.error.value = null
    state.retryAfter.value = null
  }

  async function run(action: () => Promise<void>): Promise<void> {
    state.pending.value = true
    clearError()
    try {
      // The composable calls a step makes report to its `error`, not to the
      // app's `backend:error` hook: the step machine shows them itself.
      await quietly(action)
    }
    catch (cause) {
      // The step only advances on success, so a refusal leaves the user where
      // they were — with the wait beside the message for a countdown.
      const failure = failureOf(cause)
      state.error.value = failure
      state.retryAfter.value = secondsToWait(failure)
    }
    finally {
      state.pending.value = false
    }
  }

  /** Refuse before any call: the reason in `error`, nothing to wait for. */
  const refuse = (failure: BackendError) => {
    state.error.value = failure
    state.retryAfter.value = null
  }

  return { run, clearError, refuse }
}
