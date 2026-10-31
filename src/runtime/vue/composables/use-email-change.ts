import { computed, ref, type ComputedRef, type Ref } from 'vue'
import { backendError } from '../../../convex/errors.js'
import { checkEmail, invalidInput, stepRunner } from '../utils/auth-steps'
import { unwrapAuth } from '../utils/auth-result'
import type { BackendError } from '../utils/backend-error'
import { useAuthSession } from '../utils/auth-session'
import { signalUserDetails } from '../utils/passkey-signals'
import { useLabels } from './use-labels'

/**
 * The email change, by code at both addresses:
 * `enter-email` → `start` emails a code to the current address →
 * `confirm-current` → `confirmCurrent` checks it and emails a code to the new
 * address → `verify-new` → `verifyNew` checks that one and moves the account →
 * `done`.
 */
export type EmailChangeStep = 'enter-email' | 'confirm-current' | 'verify-new' | 'done'

export interface UseEmailChangeOptions {
  /**
   * Gate the new address before any code is sent. Return `true` to accept,
   * `false` for the default message, or a string for a custom one. Default: a
   * basic shape check.
   */
  validateEmail?: (email: string) => boolean | string
  /** Called once the account has moved to the new address. */
  onChanged?: (newEmail: string) => unknown | Promise<unknown>
}

export interface UseEmailChangeReturn {
  step: Ref<EmailChangeStep>
  /** The address the account moves to. */
  newEmail: Ref<string>
  /** The code of the current step. */
  otp: Ref<string>
  /** `true` while a step's call runs. */
  isPending: ComputedRef<boolean>
  /**
   * Why the last step failed, or `null`: `invalid_input` on `email` for an
   * address that does not pass, `rate_limited`, … Set it to `null` to clear it.
   */
  error: Ref<BackendError | null>
  /** Seconds until a rate-limited step can be retried; `null` otherwise. */
  retryAfter: Ref<number | null>
  /** Whether `newEmail` passes `validateEmail` and differs from the current address. */
  emailValid: ComputedRef<boolean>
  /** Email a code to the current address → `confirm-current`. */
  start: () => Promise<void>
  /** Check the current address's code, then email a code to the new one → `verify-new`. */
  confirmCurrent: () => Promise<void>
  /** Check the new address's code: the account moves to it → `done`. */
  verifyNew: () => Promise<void>
  /** Back to `enter-email`, everything cleared. */
  reset: () => void
}

/**
 * The headless email change behind `<ProfileSettings>`: a code from the
 * current address proves the person asking still holds it, a code from the
 * new address proves they hold that one too. No link is ever sent, so nobody
 * who merely opens an email can change the account.
 *
 * Like `useLoginFlow`, a step machine that never rejects: a failed step
 * leaves `step` where it was and puts the reason in `error` (with the wait
 * of a rate limit in `retryAfter`).
 */
export function useEmailChange(options: UseEmailChangeOptions = {}): UseEmailChangeReturn {
  const auth = useAuthSession()
  const { client } = auth
  const { t } = useLabels('profile')

  const step = ref<EmailChangeStep>('enter-email')
  const newEmail = ref('')
  const otp = ref('')
  const pending = ref(false)
  const error = ref<BackendError | null>(null)
  const retryAfter = ref<number | null>(null)
  const { run, clearError, refuse } = stepRunner({ pending, error, retryAfter })

  const currentEmail = () => auth.user.value?.email ?? ''
  const target = () => newEmail.value.trim()

  const validate = (value: string): true | string | undefined => {
    if (value.toLowerCase() === currentEmail().toLowerCase()) return t('sameEmail')
    return checkEmail(options.validateEmail, value)
  }
  const emailValid = computed(() => validate(target()) === true)

  const start = async () => {
    clearError()
    const verdict = validate(target())
    if (verdict !== true) return refuse(invalidInput('email', verdict))
    await run(async () => {
      if (!currentEmail()) throw backendError('unauthenticated')
      await auth.sendOtp(currentEmail(), 'email-verification')
      otp.value = ''
      step.value = 'confirm-current'
    })
  }

  const confirmCurrent = () => run(async () => {
    unwrapAuth(await client.emailOtp.requestEmailChange({ newEmail: target(), otp: otp.value.trim() }))
    otp.value = ''
    step.value = 'verify-new'
  })

  const verifyNew = () => run(async () => {
    unwrapAuth(await client.emailOtp.changeEmail({ newEmail: target(), otp: otp.value.trim() }))
    await auth.session.value.refetch()
    // The passkeys on this device show the new address (the WebAuthn Signal API).
    const user = auth.user.value
    if (user) void signalUserDetails({ id: user.id, email: target(), name: user.name })
    otp.value = ''
    step.value = 'done'
    await options.onChanged?.(target())
  })

  const reset = () => {
    clearError()
    step.value = 'enter-email'
    newEmail.value = ''
    otp.value = ''
    pending.value = false
  }

  return {
    step,
    newEmail,
    otp,
    isPending: computed(() => pending.value),
    error,
    retryAfter,
    emailValid,
    start,
    confirmCurrent,
    verifyNew,
    reset,
  }
}
