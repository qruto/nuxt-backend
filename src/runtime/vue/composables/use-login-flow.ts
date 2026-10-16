import { computed, ref, type ComputedRef, type Ref } from 'vue'
import { DEFAULT_EMAIL_MESSAGE, defaultValidateEmail, ensureOk, stepRunner } from '../utils/auth-steps'
import { useAuth } from './use-auth'

/**
 * The passwordless login state machine:
 * `choose` → `signInWithPasskey` (returning users with a passkey on-device)
 * `choose` → `request-code` → `verify-code` → `add-passkey` (OTP, then save a passkey)
 *
 * New accounts are always created through the OTP flow (which verifies email
 * ownership); a passkey is added afterwards from the authenticated session.
 */
export type LoginStep = 'choose' | 'request-code' | 'verify-code' | 'add-passkey'

export interface UseLoginFlowOptions {
  /** UI hint for `<AuthForm>`: show a name field on the email step. Default `true`. */
  requireName?: boolean
  /**
   * Gate the email before sending. Return `true` to accept, `false` for the
   * default message, or a string for a custom one. Default: a basic shape check.
   */
  validateEmail?: (email: string) => boolean | string
  /** Called once the user is signed in and the flow is complete (e.g. `navigateTo`). */
  onSuccess?: () => unknown | Promise<unknown>
}

export interface UseLoginFlowReturn {
  step: Ref<LoginStep>
  email: Ref<string>
  name: Ref<string>
  otp: Ref<string>
  pending: Ref<boolean>
  error: Ref<string | null>
  /**
   * Seconds until a rate-limited action can be retried, for a countdown next
   * to `error`; `null` when the last error was not a 429 or gave no wait.
   */
  retryAfter: Ref<number | null>
  /** Whether the current email passes `validateEmail`. */
  emailValid: ComputedRef<boolean>
  /** Sign in with a passkey already saved on this device. */
  signInWithPasskey: () => Promise<void>
  /** Email an OTP code to `email` → `verify-code`. */
  sendCode: () => Promise<void>
  /** Verify the entered code (signs in / signs up) → `add-passkey`. */
  verifyCode: () => Promise<void>
  /** Save a passkey on the current account (post-OTP step) → done. */
  addPasskey: () => Promise<void>
  /** Skip the passkey offer → done. */
  skipPasskey: () => Promise<void>
  goTo: (step: LoginStep) => void
  reset: () => void
}

/**
 * The headless login flow behind `<AuthForm>` — bring your own markup and wire
 * these refs/actions to it. Encodes the proven passwordless sequencing:
 * session-refetch after sign-in, then an optional post-OTP passkey enrolment.
 */
export function useLoginFlow(options: UseLoginFlowOptions = {}): UseLoginFlowReturn {
  const auth = useAuth()

  const step = ref<LoginStep>('choose')
  const email = ref('')
  const name = ref('')
  const otp = ref('')
  const pending = ref(false)
  const error = ref<string | null>(null)
  const retryAfter = ref<number | null>(null)

  const validate = (value: string): true | string => {
    const result = (options.validateEmail ?? defaultValidateEmail)(value)
    if (result === true) return true
    return typeof result === 'string' ? result : DEFAULT_EMAIL_MESSAGE
  }
  const emailValid = computed(() => validate(email.value) === true)

  const trimmedEmail = () => email.value.trim()
  const trimmedName = () => name.value.trim()

  const { run, clearError } = stepRunner({ pending, error, retryAfter })

  async function refreshSession() {
    await (auth.session.value as unknown as { refetch: () => Promise<unknown> }).refetch()
  }

  // The hand-off runs once, however the last step is reached: a double click
  // on "Skip", or a passkey prompt that resolves after it.
  let completed = false
  async function complete() {
    if (completed) return
    completed = true
    await options.onSuccess?.()
  }

  function requireValidEmail(): boolean {
    const result = validate(email.value)
    if (result !== true) {
      error.value = result
      return false
    }
    return true
  }

  const signInWithPasskey = () => run('Passkey sign-in failed', async () => {
    ensureOk(await auth.signInWithPasskey(), 'Passkey sign-in failed')
    await refreshSession()
    await complete()
  })

  const sendCode = async () => {
    clearError()
    if (!requireValidEmail()) return
    await run('Failed to send code', async () => {
      ensureOk(await auth.sendOtp(trimmedEmail()), 'Failed to send code')
      step.value = 'verify-code'
    })
  }

  const verifyCode = () => run('Verification failed', async () => {
    const displayName = trimmedName()
    ensureOk(
      await auth.signInWithOtp({ email: trimmedEmail(), otp: otp.value.trim(), ...(displayName ? { name: displayName } : {}) }),
      'Invalid code',
    )
    await refreshSession()
    step.value = 'add-passkey'
  })

  const addPasskey = () => run('Passkey registration failed', async () => {
    const result = await auth.registerPasskey() as { error?: { code?: string } | null } | undefined
    // This device already holds a passkey for the account: nothing to save.
    if (result?.error?.code !== 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED') ensureOk(result, 'Failed to register passkey')
    await complete()
  })

  const skipPasskey = () => run('Could not continue', complete)

  const goTo = (target: LoginStep) => {
    clearError()
    otp.value = ''
    step.value = target
  }

  const reset = () => {
    completed = false
    goTo('choose')
    email.value = ''
    name.value = ''
    pending.value = false
  }

  return {
    step,
    email,
    name,
    otp,
    pending,
    error,
    retryAfter,
    emailValid,
    signInWithPasskey,
    sendCode,
    verifyCode,
    addPasskey,
    skipPasskey,
    goTo,
    reset,
  }
}
