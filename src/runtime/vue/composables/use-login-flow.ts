import { computed, getCurrentInstance, getCurrentScope, onMounted, onScopeDispose, ref, useId, watch, type ComputedRef, type Ref } from 'vue'
import { AUTOFILL_FIELD, AUTOFILL_RENEW_MS } from '../passkey-client'
import { quietly } from '../utils/action-state'
import { checkEmail, invalidInput, stepRunner } from '../utils/auth-steps'
import { useActiveLocale } from '../utils/active-locale'
import { type BackendError, failureOf } from '../utils/backend-error'
import { onLastSignInSettled } from '../utils/last-sign-in'
import { type SignInMethod, useAuthSession } from '../utils/auth-session'
import { loginBindings, type LoginBindings } from '../utils/login-bindings'
import { useLabels } from './use-labels'
import { canSavePasskey } from '../utils/passkey-signals'
import { forgetInvite, keepInvite, keptInvite } from '../utils/kept-invite'
import { useApiNamespace } from '../utils/namespace'
import { useMutation } from 'nuxt-convex-module/client'
import { backendError } from '../../../convex/errors.js'
import { readAge } from '../../../convex/consent-rules.js'
import { TICKET_STEPS } from '../../../convex/access-tickets'
import type { AccessApiRefs } from './use-access'

export type { LoginBindings } from '../utils/login-bindings'

/**
 * The passwordless login state machine:
 * `choose` → `signInWithPasskey` (returning users with a passkey on-device)
 * `choose` → `request-code` → `verify-code` → `passkey-offer` (OTP, then save a passkey)
 * `request-code` → `undeliverable` → `request-code` (an address the email provider stopped delivering to: no code was sent; the same for new and existing accounts)
 * `choose` → `recover` → `passkey-offer` (a passkey-only account's recovery code, then a passkey it must save)
 * `verify-code` → `waitlisted` / `invite-code` → `passkey-offer` (a new address while the app is closed, without a ticket)
 * `verify-code` → `age` → `passkey-offer` (a new address, when the app sets a minimum age)
 *
 * New accounts are always created through the OTP flow (which verifies email
 * ownership); a passkey is added afterwards from the authenticated session.
 */
export type { SignInMethod } from '../utils/auth-session'

export type LoginStep = 'choose' | 'request-code' | 'verify-code' | 'passkey-offer' | 'recover' | 'waitlisted' | 'invite-code' | 'age' | 'undeliverable'

export interface UseLoginFlowOptions {
  /**
   * Gate the email before sending. Return `true` to accept, `false` for the
   * default message, or a string for a custom one. Default: a basic shape check.
   */
  validateEmail?: (email: string) => boolean | string
  /**
   * Called once the user is signed in and the flow is complete (e.g. `navigateTo`):
   * once per flow, however the last step is reached. If it rejects, the failure is
   * in `error`, and the next action that completes the flow (Skip, Add, a passkey
   * sign-in) calls it again.
   */
  onSuccess?: () => unknown | Promise<unknown>
  /**
   * Offer this browser's saved passkeys in the autofill of the email field
   * (WebAuthn conditional mediation), so a person who has one signs in by
   * picking it there, without a code. The field's `autocomplete` must end in
   * `webauthn`: `autocomplete="username webauthn"`. The flow asks once it is
   * mounted, on a step before a code was sent (`choose`, `request-code`)
   * whose markup has such a field, and never while signed in. One offer
   * waits at a time, renewed every four and a half minutes while the page
   * is in view (a challenge lasts five), and once the page comes back into
   * view after that. It asks again when a step brings the field back after
   * the offer ended (a passkey prompt opened in its place, a passkey
   * refused), and when a passkey picked there met an expired challenge. A
   * passkey picked there finishes the flow as `signInWithPasskey` does; one
   * the server refuses lands in `error`. An offer that ends before anyone
   * picks a passkey says nothing. Default `false`: `<AuthForm>` turns it on.
   */
  autofill?: boolean
  /**
   * Open on the step of the way this browser last signed in
   * (`lastMethod`): the email step after a code (`request-code`), the
   * first step otherwise, where the passkey button is. `reset()` returns
   * there too. The server render reads the same cookie, so both open on the
   * same step; a page prerendered or served from a cache moves to this
   * browser's own once hydrated, while it is still on the step it opened
   * on. Default `false`: `<AuthForm>` turns it on.
   */
  preferLastMethod?: boolean
}

export interface UseLoginFlowReturn {
  step: Ref<LoginStep>
  /**
   * How this browser last signed in — `'passkey'` or `'email-otp'` — or
   * `null`: the one place to read it, for a "Last used" mark on that
   * method's button.
   */
  lastMethod: ComputedRef<SignInMethod | null>
  email: Ref<string>
  otp: Ref<string>
  /**
   * The recovery code a passkey-only account types on `recover`. Once
   * `recover()` signed in, it holds the new code that replaced the used
   * one, to show once.
   */
  recoveryCode: Ref<string>
  /**
   * The invite code a new address types on `invite-code` (or on
   * `waitlisted`, when it has one), while the app is closed.
   */
  inviteCode: Ref<string>
  /**
   * The age a new address types on `age`, when the app sets a minimum age.
   * The question has an empty field and never names the minimum; the number
   * is checked on the server and never kept.
   */
  age: Ref<string>
  /**
   * Where the address stands on the waitlist, once its code checked while
   * the app is in early access (the `waitlisted` step shows it); `null`
   * otherwise.
   */
  waitlist: Ref<{ position: number, total: number, token: string } | null>
  /** `true` on `passkey-offer` after a recovery: a passkey must be saved, and `skipPasskey()` does nothing. */
  passkeyRequired: ComputedRef<boolean>
  /** `true` while a step's call runs. */
  isPending: ComputedRef<boolean>
  /**
   * Why the last step failed, or `null`: `invalid_input` on `email` for an
   * address `validateEmail` refused, `rate_limited`, `forbidden` with reason
   * `banned` for a banned account, … Set it to `null` to clear it.
   */
  error: Ref<BackendError | null>
  /**
   * Seconds until a rate-limited step can be retried, for a countdown next
   * to `error`; `null` when the last failure was not a rate limit or gave no wait.
   */
  retryAfter: Ref<number | null>
  /** Whether the current email passes `validateEmail`. */
  emailValid: ComputedRef<boolean>
  /** Sign in with a passkey already saved on this device, through the browser's passkey prompt. */
  signInWithPasskey: () => Promise<void>
  /** Email an OTP code to `email` → `verify-code`, or `undeliverable` when the email provider stopped delivering to the address. */
  sendCode: () => Promise<void>
  /**
   * Verify the entered code (signs in / signs up) → `passkey-offer`, or
   * done at once where this browser can save no passkey.
   */
  verifyCode: () => Promise<void>
  /**
   * Check `inviteCode` and sign up with it and the code already typed →
   * `passkey-offer`. A code that admits nobody stays on `invite-code`,
   * refused as `invalid_input` on `inviteCode` (reason `invite_expired`,
   * `invite_used_up` or `invite_revoked`, none for an unknown code).
   */
  redeemInviteCode: () => Promise<void>
  /**
   * Send the same code again with the age typed → `passkey-offer`. An age
   * that is no number stays on `age`, refused as `invalid_input` on `age`;
   * one under the minimum is refused as `forbidden` (reason `under_age`)
   * and this browser is refused for a day.
   */
  submitAge: () => Promise<void>
  /** Save a passkey on the current account (the offer after a code, or the one a recovery requires) → done. */
  addPasskey: () => Promise<void>
  /** Decline the passkey offer → done. Does nothing while `passkeyRequired`. */
  skipPasskey: () => Promise<void>
  /**
   * Check `email` and `recoveryCode` for a passkey-only account → `passkey-offer`
   * with `passkeyRequired`: the new passkey is saved before anything else.
   */
  recover: () => Promise<void>
  goTo: (step: LoginStep) => void
  /**
   * Attribute and handler bags for markup of your own, one per element:
   * `emailInput`, `codeInput`, `submit`, `passkeyButton`, `back` and
   * `status`. Spread each with `v-bind`; they carry the accessibility
   * attributes the packaged form has.
   */
  bind: LoginBindings
  /** Back to the opening step (`choose`, or the one `preferLastMethod` picks) with every field cleared. */
  reset: () => void
}

/** The steps before a code was sent: where a passkey picked from the email field's autofill signs in. */
const AUTOFILL_STEPS: readonly LoginStep[] = ['choose', 'request-code']

/** The Better Auth code a failed auth call carries (`ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED`, …). */
function authCode(cause: unknown): unknown {
  return (cause as { cause?: { code?: unknown } } | null)?.cause?.code
}

/**
 * The headless login flow behind `<AuthForm>` — bring your own markup and wire
 * these refs/actions to it. Encodes the proven passwordless sequencing:
 * session-refetch after sign-in, then an optional post-OTP passkey enrolment.
 *
 * A step machine: its actions never reject. A failed step stays where it
 * is, with the reason in `error` (a `BackendError`) and the wait of a rate
 * limit in `retryAfter`, so a form never needs a `try`.
 */
export function useLoginFlow(options: UseLoginFlowOptions = {}): UseLoginFlowReturn {
  const auth = useAuthSession()
  // The app's language, which a new account and its first code are written in.
  const activeLocale = useActiveLocale()

  // Read as the flow opens: the server render reads the same cookie.
  const opening = (): LoginStep => (options.preferLastMethod && auth.lastSignInMethod.value === 'email-otp' ? 'request-code' : 'choose')
  const step = ref<LoginStep>(opening())
  let disposed = false
  // Whether the step on screen is one an action moved to (a field it opens
  // may take focus), not the one the flow opened on or settled on once hydrated.
  let settling = false
  let moved = false
  watch(step, () => {
    moved = !settling
    settling = false
  }, { flush: 'sync' })
  if (options.preferLastMethod) {
    // A page prerendered or served from a cache opened on the method of the
    // render it came from (none, or another visitor's). Once hydrated, the
    // browser reads its own cookie, and a flow still on the step it opened
    // on moves to the browser's.
    const opened = step.value
    onLastSignInSettled(() => {
      if (disposed || step.value !== opened) return
      settling = true
      step.value = opening()
    })
  }
  const email = ref('')
  const otp = ref('')
  const recoveryCode = ref('')
  const inviteCode = ref('')
  const age = ref('')
  const waitlist = ref<{ position: number, total: number, token: string } | null>(null)
  const access = useApiNamespace<AccessApiRefs>('access')
  const checkInvite = access?.checkInvite ? useMutation(access.checkInvite) : null
  const recovering = ref(false)
  const pending = ref(false)
  const error = ref<BackendError | null>(null)
  const retryAfter = ref<number | null>(null)

  const validate = (value: string): true | string | undefined => checkEmail(options.validateEmail, value)
  const emailValid = computed(() => validate(email.value) === true)

  const trimmedEmail = () => email.value.trim()

  const { run, clearError, refuse } = stepRunner({ pending, error, retryAfter })

  async function refreshSession() {
    await auth.session.value.refetch()
  }

  // The hand-off runs once, however the last step is reached: a double click
  // on "Skip", or a passkey prompt that resolves after it. A hand-off that
  // failed (an `onSuccess` that rejected) did not happen, so the next Skip
  // or Add tries it again rather than doing nothing.
  let completed = false
  async function complete() {
    if (completed) return
    completed = true
    try {
      await options.onSuccess?.()
    }
    catch (error) {
      completed = false
      throw error
    }
  }

  // Passkey autofill: one offer at a time, made while the step's markup has
  // a field marked `webauthn`. It waits outside `isPending` (the person may
  // never pick one), and ends quietly when the browser has nothing to offer
  // or a passkey prompt opened in its place. A new offer needs a new reason:
  // a step that brings the field back, a prompt the person closed, a
  // challenge about to expire, or one that expired under a pick. Never in a
  // loop: each of those is the person's doing or the clock's.
  let offer = 0
  let offers = 0
  let mounted = false
  let renewal: ReturnType<typeof setTimeout> | undefined
  let onSight: (() => void) | undefined

  const canOffer = () => options.autofill && mounted && !disposed && !completed
    && AUTOFILL_STEPS.includes(step.value) && !auth.isAuthenticated.value
    && document.querySelector(AUTOFILL_FIELD) !== null

  /** Stop waiting to renew the offer: its timer, and a hidden page's wait to be seen again. */
  function stopRenewal() {
    clearTimeout(renewal)
    if (onSight) document.removeEventListener('visibilitychange', onSight)
    onSight = undefined
  }

  /**
   * Replace offer `mine` with a fresh one before its challenge expires: now
   * when the page is in view, once it is seen again when it is hidden (no
   * challenge spent on a tab no one looks at). A step without the field
   * leaves it to end: the step that brings the field back offers anew.
   */
  function renew(mine: number) {
    stopRenewal()
    if (offer !== mine) return
    if (!canOffer()) {
      offer = 0
      return
    }
    if (document.visibilityState === 'hidden') {
      onSight = () => {
        if (document.visibilityState !== 'hidden') renew(mine)
      }
      document.addEventListener('visibilitychange', onSight)
      return
    }
    void offerAutofill(true)
  }

  /** Offer this browser's passkeys in the field; `fresh` replaces an offer still waiting (its ceremony then ends). */
  async function offerAutofill(fresh = false) {
    if ((offer && !fresh) || !canOffer()) return
    const mine = offer = ++offers
    stopRenewal()
    renewal = setTimeout(() => renew(mine), AUTOFILL_RENEW_MS)
    try {
      const user = await quietly(() => auth.signInWithPasskey({ autoFill: true }))
      // A passkey picked from any offer, a replaced one included, signs in.
      if (user && !disposed) {
        await run(async () => {
          await refreshSession()
          await complete()
        })
      }
    }
    catch (cause) {
      if (disposed) return
      if (authCode(cause) === 'CHALLENGE_NOT_FOUND') {
        // The challenge expired under the pick (a device that slept through
        // the renewal): a fresh offer, and the person picks again.
        if (offer === mine) offer = 0
        void offerAutofill()
      }
      // The passkey the person picked was refused: say why, where they are.
      else refuse(failureOf(cause))
    }
    finally {
      if (offer === mine) {
        offer = 0
        stopRenewal()
      }
    }
  }
  if (options.autofill && getCurrentInstance()) {
    onMounted(() => {
      mounted = true
      void offerAutofill()
    })
    // After the step's markup is on the page, so its field is too.
    watch(step, () => void offerAutofill(), { flush: 'post' })
  }
  if (getCurrentScope()) {
    onScopeDispose(() => {
      disposed = true
      stopRenewal()
    })
  }

  const signInWithPasskey = async () => {
    await run(async () => {
      await auth.signInWithPasskey()
      await refreshSession()
      await complete()
    })
    // The prompt took the autofill's place; once it closed without a
    // sign-in, the field offers passkeys again.
    void offerAutofill()
  }

  const sendCode = async () => {
    clearError()
    const verdict = validate(email.value)
    if (verdict !== true) return refuse(invalidInput('email', verdict))
    await run(async () => {
      try {
        await auth.sendOtp(trimmedEmail(), 'sign-in', { locale: activeLocale() })
      }
      catch (cause) {
        // The provider stopped delivering to the address: a step, not an
        // error, with the same words whether or not an account holds it.
        if (!isSuppressed(cause)) throw cause
        step.value = 'undeliverable'
        return
      }
      step.value = 'verify-code'
    })
  }

  /**
   * Sign in, or up, with the code: a kept invite code or access link rides
   * along. A new address without a ticket in a closed phase moves to the
   * phase's step, the code kept for the second try. A new address of an app
   * with a minimum age moves to `age` the same way.
   */
  const signIn = async (invite: string | null, typedAge?: number) => {
    try {
      await auth.signInWithOtp({ email: trimmedEmail(), otp: otp.value.trim(), ...(invite ? { inviteCode: invite } : {}), ...(typedAge !== undefined ? { age: typedAge } : {}), locale: activeLocale() })
    }
    catch (cause) {
      const failure = failureOf(cause)
      if (failure.code === 'forbidden' && failure.data.reason === 'age_required') {
        step.value = 'age'
        return false
      }
      if (failure.code !== 'forbidden' || failure.data.reason !== 'ticket_required') throw cause
      const phase = failure.data.phase as keyof typeof TICKET_STEPS | undefined
      step.value = phase && phase in TICKET_STEPS ? TICKET_STEPS[phase] : 'invite-code'
      waitlist.value = (failure.data.waitlist as { position: number, total: number, token: string } | undefined) ?? null
      return false
    }
    forgetInvite()
    return true
  }

  const finishSignIn = async () => {
    await refreshSession()
    // The offer only where it can work: a browser without a passkey
    // provider goes straight on (`getClientCapabilities()`).
    if (await canSavePasskey()) step.value = 'passkey-offer'
    else await complete()
  }

  const verifyCode = () => run(async () => {
    if (await signIn(keptInvite())) await finishSignIn()
  })

  const redeemInviteCode = () => run(async () => {
    const code = inviteCode.value.trim()
    const status = checkInvite ? (await checkInvite({ code })).status : 'valid'
    if (status !== 'valid') {
      throw backendError('invalid_input', { field: 'inviteCode', ...(status === 'unknown' ? {} : { reason: `invite_${status.replace('-', '_')}` }) })
    }
    keepInvite(code)
    if (await signIn(code)) await finishSignIn()
  })

  const submitAge = () => run(async () => {
    const typed = readAge(age.value)
    if (typed === null) throw backendError('invalid_input', { field: 'age' })
    if (await signIn(keptInvite(), typed)) await finishSignIn()
  })

  const addPasskey = () => run(async () => {
    try {
      await auth.registerPasskey()
    }
    catch (cause) {
      // This device already holds a passkey for the account: nothing to
      // save, unless a recovery needs a new one.
      if (recovering.value || authCode(cause) !== 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED') throw cause
    }
    if (recovering.value) {
      // The recovery session is an ordinary one now: read it again.
      recovering.value = false
      await refreshSession()
    }
    await complete()
  })

  const skipPasskey = () => (recovering.value ? Promise.resolve() : run(complete))

  const recover = () => run(async () => {
    const answer = await auth.signInWithRecoveryCode({ email: trimmedEmail(), recoveryCode: recoveryCode.value.trim() })
    recovering.value = true
    // The used code is gone: the new one, to show once.
    recoveryCode.value = answer.recoveryCode
    await refreshSession()
    step.value = 'passkey-offer'
  })

  const goTo = (target: LoginStep) => {
    if (recovering.value) return
    clearError()
    // The ticket steps send the same code again: it stays.
    if (!(target === 'invite-code' && step.value === 'waitlisted')) otp.value = ''
    step.value = target
  }

  const reset = () => {
    // A recovery session saves its passkey first: the flow stays on it.
    if (recovering.value) return
    completed = false
    goTo(opening())
    email.value = ''
    recoveryCode.value = ''
    inviteCode.value = ''
    age.value = ''
    waitlist.value = null
    pending.value = false
  }

  const { t, errorMessage } = useLabels('auth')
  const id = getCurrentInstance() ? useId() : `bk-login-${++flows}`
  const bind = loginBindings({
    step,
    isPending: pending,
    error,
    lastMethod: auth.lastSignInMethod,
    email,
    signInWithPasskey: () => signInWithPasskey(),
    goTo: next => goTo(next),
    ids: { error: `${id}-error`, sent: `${id}-sent`, lastUsed: `${id}-last-used` },
    sentText: () => t('sent', { email: email.value }),
    errorText: () => (error.value ? errorMessage(error.value) : null),
    movedByPerson: () => moved,
  })

  return {
    step,
    lastMethod: auth.lastSignInMethod,
    email,
    otp,
    recoveryCode,
    inviteCode,
    age,
    waitlist,
    passkeyRequired: computed(() => recovering.value),
    isPending: computed(() => pending.value),
    error,
    retryAfter,
    emailValid,
    signInWithPasskey,
    sendCode,
    verifyCode,
    redeemInviteCode,
    submitAge,
    addPasskey,
    skipPasskey,
    recover,
    goTo,
    bind,
    reset,
  }
}

/** Whether a code request was refused because the email provider suppressed the address. */
function isSuppressed(cause: unknown): boolean {
  const failure = failureOf(cause)
  return failure.code === 'unavailable' && failure.data.reason === 'suppressed'
}

/** Ids for flows made outside a component, where `useId` has none to give. */
let flows = 0
