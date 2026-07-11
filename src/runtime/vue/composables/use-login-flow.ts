import { computed, ref, type ComputedRef, type Ref } from 'vue'
import { useAuth } from './use-auth'

/**
 * The passwordless login state machine:
 * `choose` → `register-passkey` (new account via passkey)
 * `choose` → `request-code` → `verify-code` → `add-passkey` (OTP, then save a passkey)
 */
export type LoginStep = 'choose' | 'register-passkey' | 'request-code' | 'verify-code' | 'add-passkey'

export interface UseLoginFlowOptions {
  /** Require a name on the registration steps. Default `true`. */
  requireName?: boolean
  /**
   * Gate the email before sending. Return `true` to accept, `false` for the
   * default message, or a string for a custom one. Default: a basic shape check.
   */
  validateEmail?: (email: string) => boolean | string
  /** Skip the post-OTP "save a passkey" step. Default `true` (offer it). */
  offerPasskey?: boolean
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
  /** Whether the current email passes `validateEmail`. */
  emailValid: ComputedRef<boolean>
  /** Sign in with a passkey already saved on this device. */
  signInWithPasskey: () => Promise<void>
  /** Create a new account with just a passkey (uses `email` + `name`). */
  registerWithPasskey: () => Promise<void>
  /** Email an OTP code to `email` → `verify-code`. */
  sendCode: () => Promise<void>
  /** Verify the entered code (signs in / signs up) → `add-passkey` or done. */
  verifyCode: () => Promise<void>
  /** Save a passkey on the current account (post-OTP step) → done. */
  addPasskey: () => Promise<void>
  /** Skip the passkey offer → done. */
  skipPasskey: () => Promise<void>
  goTo: (step: LoginStep) => void
  reset: () => void
}

type AuthResult = { error?: { message?: string } | null }

const DEFAULT_EMAIL_MESSAGE = 'Enter a valid email address.'

function defaultValidateEmail(email: string): boolean {
  const value = email.trim()
  const at = value.indexOf('@')
  return at > 0 && value.indexOf('.', at) > at + 1 && !value.includes(' ') && at === value.lastIndexOf('@')
}

/**
 * The headless login flow behind `<AuthForm>` — bring your own markup and wire
 * these refs/actions to it. Encodes the proven passwordless sequencing:
 * session-refetch after sign-in, and the sign-out-before-passkey-registration
 * guard (without it, the passkey endpoint silently attaches the credential to
 * a lingering session's user instead of creating the typed account).
 */
export function useLoginFlow(options: UseLoginFlowOptions = {}): UseLoginFlowReturn {
  const auth = useAuth()
  const requireName = options.requireName ?? true
  const offerPasskey = options.offerPasskey ?? true

  const step = ref<LoginStep>('choose')
  const email = ref('')
  const name = ref('')
  const otp = ref('')
  const pending = ref(false)
  const error = ref<string | null>(null)

  const validate = (value: string): true | string => {
    const result = (options.validateEmail ?? defaultValidateEmail)(value)
    if (result === true) return true
    return typeof result === 'string' ? result : DEFAULT_EMAIL_MESSAGE
  }
  const emailValid = computed(() => validate(email.value) === true)

  const trimmedEmail = () => email.value.trim()
  const trimmedName = () => name.value.trim()

  function ensureOk(result: unknown, fallback: string) {
    const { error: resultError } = (result ?? {}) as AuthResult
    if (resultError) throw new Error(resultError.message ?? fallback)
  }

  async function run(fallback: string, action: () => Promise<void>): Promise<void> {
    pending.value = true
    error.value = null
    try {
      await action()
    }
    catch (cause) {
      error.value = cause instanceof Error ? cause.message : fallback
    }
    finally {
      pending.value = false
    }
  }

  async function refreshSession() {
    await (auth.session.value as unknown as { refetch: () => Promise<unknown> }).refetch()
  }

  async function complete() {
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

  const registerWithPasskey = async () => {
    error.value = null
    if (requireName && !trimmedName()) {
      error.value = 'Enter your name to register a passkey.'
      return
    }
    if (!requireValidEmail()) return
    await run('Passkey registration failed', async () => {
      // Creating a NEW account: drop any lingering session first, otherwise
      // the passkey endpoint attaches the credential to the *current* user
      // and the typed email is silently ignored.
      if (auth.user.value) {
        await auth.signOut()
        await refreshSession()
      }
      const context = JSON.stringify({ email: trimmedEmail(), name: trimmedName() })
      ensureOk(await auth.registerPasskey(context), 'Failed to register passkey')
      await refreshSession()
      await complete()
    })
  }

  const sendCode = async () => {
    error.value = null
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
    if (offerPasskey) {
      step.value = 'add-passkey'
    }
    else {
      await complete()
    }
  })

  const addPasskey = () => run('Passkey registration failed', async () => {
    ensureOk(await auth.registerPasskey(), 'Failed to register passkey')
    await complete()
  })

  const skipPasskey = async () => {
    await complete()
  }

  const goTo = (target: LoginStep) => {
    error.value = null
    otp.value = ''
    step.value = target
  }

  const reset = () => {
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
    emailValid,
    signInWithPasskey,
    registerWithPasskey,
    sendCode,
    verifyCode,
    addPasskey,
    skipPasskey,
    goTo,
    reset,
  }
}
