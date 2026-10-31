import { computed, getCurrentInstance, inject, nextTick, onBeforeUnmount, ref, watch, type ComputedRef, type Ref } from 'vue'
import { tryUseNuxtApp } from '#imports'
import { ConvexAuthStateKey } from 'nuxt-convex-module/client'
import { REAUTHENTICATE_HEADER } from '../../../convex/constants.js'
import { backendError } from '../../../convex/errors.js'
import { unwrapAuth } from '../utils/auth-result'
import { stepRunner } from '../utils/auth-steps'
import { type BackendError, getBackendError } from '../utils/backend-error'
import { useLastSignInState } from '../utils/last-sign-in'
import { type SignInMethod, useAuthSession } from '../utils/auth-session'

/** Where a re-authentication is: choosing a passkey or a code, then entering the code. */
export type ReauthenticationStep = 'choose' | 'verify-code'

export interface UseReauthenticationOptions {
  /**
   * This component asks the person itself, with markup of its own over
   * `isRequired`, `step` and the step actions. While it is mounted,
   * `reauthenticate()` waits for it, and a `<ReauthenticateDialog>`
   * mounted after it stays closed. With no prompt on the page, neither one
   * of these nor a `<ReauthenticateDialog>`, nobody can confirm: what asks
   * is refused at once, as it came, and a development build warns.
   */
  prompt?: boolean
}

export interface UseReauthenticationReturn {
  /**
   * `true` while the app waits for the person to sign in again: an action
   * was refused as `reauthentication_required`, or `reauthenticate()` asked.
   * `<ReauthenticateDialog>` is open while it is. App-wide: every call of
   * the composable reads the same one.
   */
  isRequired: ComputedRef<boolean>
  /** Where the person is: `choose` (a passkey, or a code), then `verify-code`. */
  step: Ref<ReauthenticationStep>
  /** The address the code goes to: the signed-in account's own, never one typed in. */
  email: ComputedRef<string | null>
  /** The code the person typed, for `verifyCode`. */
  otp: Ref<string>
  /** `true` while a step's call runs. */
  isPending: ComputedRef<boolean>
  /**
   * Why the last step failed, or `null`: a closed passkey prompt
   * (`invalid_input` on `passkey`), a wrong code, another account's passkey
   * (`forbidden`, reason `other_account`), a rate limit.
   */
  error: Ref<BackendError | null>
  /** Seconds until a rate-limited step can be retried; `null` otherwise. */
  retryAfter: Ref<number | null>
  /** Sign in again with a passkey on this device. Never rejects: a failure stays in `error`. */
  withPasskey: () => Promise<void>
  /** Email a code to the account's own address → `verify-code`. Never rejects. */
  sendCode: () => Promise<void>
  /** Sign in again with the code. Never rejects. */
  verifyCode: () => Promise<void>
  /** Back to `choose`, the code cleared. */
  back: () => void
  /** Stop waiting: what waits rejects with the `reauthentication_required` refusal, and the session stays as it was. */
  cancel: () => void
  /**
   * Ask the person to sign in again now. Resolves once they did, with a
   * fresh session and the token that names it; rejects with the
   * `reauthentication_required` refusal when they cancel, and at once when
   * no prompt is mounted to ask them (`<ReauthenticateDialog>`, or a
   * component of your own with `prompt: true`). One request at a time: a
   * second call waits on the same sign-in.
   */
  reauthenticate: () => Promise<void>
  /**
   * Run `action`. When the server refuses it as `reauthentication_required`
   * (a sensitive action, and a sign-in older than it takes), ask the person
   * to sign in again, then run it once more and settle with that. A
   * cancelled sign-in rejects with the first refusal; any other failure
   * rejects as it came.
   */
  withReauthentication: <T>(action: () => Promise<T>) => Promise<T>
}

/** One app's re-authentication: every call of the composable and every dialog read the same. */
interface Coordinator {
  required: Ref<boolean>
  step: Ref<ReauthenticationStep>
  otp: Ref<string>
  pending: Ref<boolean>
  error: Ref<BackendError | null>
  retryAfter: Ref<number | null>
  waiting: Array<{ resolve: () => void, reject: (reason: unknown) => void }>
  /** The prompts on the page (dialogs, and components with `prompt: true`), oldest first: only the oldest dialog opens. */
  prompts: Ref<number[]>
  /** How the last wait ended, for the dialog's event. */
  outcome: 'confirmed' | 'cancelled' | null
}

const coordinators = new WeakMap<object, Coordinator>()
/** Outside a Nuxt app (a unit test of a component), one for the module. */
let standalone: Coordinator | undefined

function createCoordinator(): Coordinator {
  return {
    required: ref(false),
    step: ref<ReauthenticationStep>('choose'),
    otp: ref(''),
    pending: ref(false),
    error: ref<BackendError | null>(null),
    retryAfter: ref<number | null>(null),
    waiting: [],
    prompts: ref([]),
    outcome: null,
  }
}

let promptIds = 0

/**
 * Count the calling component as a prompt while it is mounted; its id,
 * oldest lowest. When the last prompt leaves the page while someone waits
 * (the person navigated away from the dialog), nobody is left to ask:
 * what waits is refused, as on a cancel.
 */
function registerPrompt(state: Coordinator): number {
  const id = ++promptIds
  if (!getCurrentInstance()) return id
  state.prompts.value = [...state.prompts.value, id]
  onBeforeUnmount(() => {
    state.prompts.value = state.prompts.value.filter(other => other !== id)
    if (state.prompts.value.length === 0 && state.waiting.length > 0) settle(state, 'cancelled')
  })
  return id
}

/** Settle everything waiting, and close: resolved once confirmed, else refused. */
function settle(state: Coordinator, outcome: 'confirmed' | 'cancelled'): void {
  const waiting = state.waiting.splice(0)
  state.outcome = outcome
  state.required.value = false
  state.step.value = 'choose'
  state.otp.value = ''
  state.error.value = null
  state.retryAfter.value = null
  for (const waiter of waiting) {
    if (outcome === 'confirmed') waiter.resolve()
    else waiter.reject(cancelled())
  }
}

/**
 * Whether this `<ReauthenticateDialog>` is the one that opens (`active`):
 * the oldest prompt still mounted, so a page with one in its layout and one
 * in a settings component shows a single dialog. `outcome` says how the
 * last wait ended.
 *
 * @internal
 */
export function useDialogTurn(): { active: ComputedRef<boolean>, outcome: () => 'confirmed' | 'cancelled' | null } {
  const state = coordinator()
  const id = registerPrompt(state)
  return { active: computed(() => state.prompts.value[0] === id), outcome: () => state.outcome }
}

function coordinator(): Coordinator {
  const app = tryUseNuxtApp()
  if (!app) return standalone ??= createCoordinator()
  let found = coordinators.get(app)
  if (!found) coordinators.set(app, found = createCoordinator())
  return found
}

/** The headers that mark a sign-in as a re-authentication of this browser's session. */
const MARKED = { headers: { [REAUTHENTICATE_HEADER]: '1' } }

/** How long the live connection may take to take up the new session's token before the action runs anyway. */
const TOKEN_WAIT_MS = 10_000

/**
 * After a confirmed sign-in, how often and how far apart the action is
 * tried again while it still reads the old token: the connection may not
 * have started taking up the new one when the session's refetch returns.
 */
const RETRIES = 6
const RETRY_DELAY_MS = 500

/** The refusal a cancelled sign-in rejects with, or one nobody was asked for. */
function cancelled(detail = '[nuxt-backend] The person cancelled the sign-in this action needed.'): Error {
  return backendError('reauthentication_required', {}, detail)
}

/**
 * Asking the person to confirm it is them before a sensitive action: the
 * client half of `requireRecentSignIn` and of the routes that take a recent
 * sign-in. A sensitive action refused as `reauthentication_required` goes
 * through `withReauthentication`, which opens `<ReauthenticateDialog>`
 * (mounted by the packaged pages and settings components, or once by your
 * layout), waits for the person to sign in again — passkey first, or a
 * code to the account's own address — and runs the action once more.
 *
 * Signing in again opens a new session for the same account: the server
 * refuses another account's passkey (`forbidden`, reason `other_account`),
 * keeps the active workspace, and signs the old session out. The flow then
 * refreshes the session and waits for the live connection to take up the
 * new token, so the retried action carries the new sign-in; while it still
 * carries the old one, the action is tried again a moment later, a few times.
 *
 * The state is the app's: every call reads the same `isRequired`, `step`
 * and `error`, so one dialog serves every action, and a component that
 * builds its own dialog wires these to its markup and says `prompt: true`.
 * With no prompt mounted, nobody can confirm: `withReauthentication`
 * rejects with the refusal as it came. The step actions never reject;
 * `reauthenticate` and `withReauthentication` resolve or reject.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const { withReauthentication } = useReauthentication()
 * const { remove } = usePasskeys()
 *
 * // Asks the person to confirm it is them when their sign-in is too old.
 * const removePasskey = (id: string) => withReauthentication(() => remove(id))
 * </script>
 * <template>
 *   <ReauthenticateDialog />
 * </template>
 * ```
 */
export function useReauthentication(options: UseReauthenticationOptions = {}): UseReauthenticationReturn {
  const auth = useAuthSession()
  const state = coordinator()
  if (options.prompt) registerPrompt(state)
  const connection = inject(ConvexAuthStateKey, null)
  const lastMethod = useLastSignInState()
  const { run, clearError } = stepRunner(state)

  const email = computed(() => {
    const address = (auth.user.value as { email?: unknown } | null)?.email
    return typeof address === 'string' && address ? address : null
  })

  /**
   * Once signed in again: the new session, then the live connection on its
   * token (the session's change sets it off), so the action that runs next
   * carries the new sign-in.
   */
  async function confirmed(method: SignInMethod): Promise<void> {
    await auth.session.value.refetch()
    lastMethod.value = method
    await nextTick()
    if (connection?.isLoading.value) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(done, TOKEN_WAIT_MS)
        const stop = watch(() => connection.isLoading.value, (loading) => {
          if (!loading) done()
        })
        function done() {
          clearTimeout(timer)
          stop()
          resolve()
        }
      })
    }
    settle(state, 'confirmed')
  }

  const withPasskey = () => run(async () => {
    unwrapAuth(await auth.client.signIn.passkey({ fetchOptions: MARKED }))
    await confirmed('passkey')
  })

  const sendCode = () => run(async () => {
    if (!email.value) throw backendError('unauthenticated')
    unwrapAuth(await auth.client.emailOtp.sendVerificationOtp({ email: email.value, type: 'sign-in', fetchOptions: MARKED }))
    state.otp.value = ''
    state.step.value = 'verify-code'
  })

  const verifyCode = () => run(async () => {
    if (!email.value) throw backendError('unauthenticated')
    unwrapAuth(await auth.client.signIn.emailOtp({ email: email.value, otp: state.otp.value.trim(), fetchOptions: MARKED }))
    await confirmed('email-otp')
  })

  const reauthenticate = () => new Promise<void>((resolve, reject) => {
    // Nobody on the page can ask: refused as it came, never left waiting.
    if (state.prompts.value.length === 0) {
      if (import.meta.dev) console.warn('[nuxt-backend] An action needs the person to confirm it is them, and no <ReauthenticateDialog /> is mounted to ask (nor a component with useReauthentication({ prompt: true })): mount one in your layout. The action is refused as it came.')
      reject(cancelled('[nuxt-backend] No prompt is mounted to ask the person to confirm it is them.'))
      return
    }
    state.waiting.push({ resolve, reject })
    if (!state.required.value) {
      clearError()
      state.step.value = 'choose'
      state.otp.value = ''
      state.required.value = true
    }
  })

  async function withReauthentication<T>(action: () => Promise<T>): Promise<T> {
    try {
      return await action()
    }
    catch (refusal) {
      if (getBackendError(refusal)?.code !== 'reauthentication_required') throw refusal
      try {
        await reauthenticate()
      }
      catch {
        throw refusal
      }
      // Signed in again: tried once more, and a moment later while the
      // connection still carries the old token. Any other outcome is final.
      for (let attempt = 1; ; attempt++) {
        try {
          return await action()
        }
        catch (stale) {
          if (attempt >= RETRIES || getBackendError(stale)?.code !== 'reauthentication_required') throw stale
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS))
        }
      }
    }
  }

  return {
    isRequired: computed(() => state.required.value),
    step: state.step,
    email,
    otp: state.otp,
    isPending: computed(() => state.pending.value),
    error: state.error,
    retryAfter: state.retryAfter,
    withPasskey,
    sendCode,
    verifyCode,
    back: () => {
      clearError()
      state.otp.value = ''
      state.step.value = 'choose'
    },
    cancel: () => settle(state, 'cancelled'),
    reauthenticate,
    withReauthentication,
  }
}
