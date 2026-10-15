import { computed, ref, type ComputedRef, type Ref } from 'vue'
import { DEFAULT_EMAIL_MESSAGE, defaultValidateEmail, ensureOk, stepRunner } from '../utils/auth-steps'
import { useAuth } from './use-auth'

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
  pending: Ref<boolean>
  error: Ref<string | null>
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

interface EmailChangeClient {
  emailOtp: {
    requestEmailChange: (args: { newEmail: string, otp: string }) => Promise<unknown>
    changeEmail: (args: { newEmail: string, otp: string }) => Promise<unknown>
  }
}

/**
 * The headless email change behind `<ProfileSettings>`: a code from the
 * current address proves the person asking still holds it, a code from the
 * new address proves they hold that one too. No link is ever sent, so nobody
 * who merely opens an email can change the account.
 *
 * Like `useLoginFlow`, a step machine that never rejects: a failed step
 * leaves `step` where it was and puts the reason in `error` (with the wait
 * of a 429 in `retryAfter`).
 */
export function useEmailChange(options: UseEmailChangeOptions = {}): UseEmailChangeReturn {
  const auth = useAuth()
  const client = auth.client as unknown as EmailChangeClient

  const step = ref<EmailChangeStep>('enter-email')
  const newEmail = ref('')
  const otp = ref('')
  const pending = ref(false)
  const error = ref<string | null>(null)
  const retryAfter = ref<number | null>(null)
  const { run, clearError } = stepRunner({ pending, error, retryAfter })

  const currentEmail = () => (auth.user.value?.email as string | undefined) ?? ''
  const target = () => newEmail.value.trim()

  const validate = (value: string): true | string => {
    if (value.toLowerCase() === currentEmail().toLowerCase()) return 'That is already your email address.'
    const result = (options.validateEmail ?? defaultValidateEmail)(value)
    if (result === true) return true
    return typeof result === 'string' ? result : DEFAULT_EMAIL_MESSAGE
  }
  const emailValid = computed(() => validate(target()) === true)

  const start = async () => {
    clearError()
    const verdict = validate(target())
    if (verdict !== true) {
      error.value = verdict
      return
    }
    await run('Failed to send the code', async () => {
      if (!currentEmail()) throw new Error('Sign in to change your email address.')
      ensureOk(await auth.sendOtp(currentEmail(), 'email-verification'), 'Failed to send the code')
      otp.value = ''
      step.value = 'confirm-current'
    })
  }

  const confirmCurrent = () => run('Invalid code', async () => {
    ensureOk(await client.emailOtp.requestEmailChange({ newEmail: target(), otp: otp.value.trim() }), 'Invalid code')
    otp.value = ''
    step.value = 'verify-new'
  })

  const verifyNew = () => run('Invalid code', async () => {
    ensureOk(await client.emailOtp.changeEmail({ newEmail: target(), otp: otp.value.trim() }), 'Invalid code')
    await (auth.session.value as unknown as { refetch?: () => Promise<unknown> }).refetch?.()
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

  return { step, newEmail, otp, pending, error, retryAfter, emailValid, start, confirmCurrent, verifyNew, reset }
}
