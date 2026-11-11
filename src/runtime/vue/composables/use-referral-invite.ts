import { computed, type ComputedRef, inject, ref, shallowRef, watch } from 'vue'
import { useTimeout } from '@vueuse/core'
import { useRoute } from '#imports'
import { useAsyncQuery } from 'nuxt-convex-module/app'
import { ConvexAuthStateKey, useMutation } from 'nuxt-convex-module/client'
import type { ReferralPreview } from '../../../convex/integrations/referrals'
import type { BackendError } from '../utils/backend-error'
import { failureOf } from '../utils/backend-error'
import { absentQuery } from '../utils/live-query'
import { useApiNamespace, useBackendNamespace } from '../utils/namespace'
import { type AccessApiRefs, useAccessPhase } from './use-access'
import { useBackendPagePath } from './use-backend-page-path'
import type { ReferralsApiRefs } from './use-referrals'

/**
 * How long a page waits for the launch phase before it offers the sign-up
 * anyway, as for a phase that could not be read: a connection that never
 * opens leaves no visitor without a way in.
 */
const PHASE_WAIT_MS = 5000

/** Where the page a referral link opens is: reading the link, ready to claim, claiming, or settled. */
export type ReferralInviteState = 'checking' | 'invalid' | 'ready' | 'claimable' | 'claiming' | 'claimed' | 'ignored' | 'own'

/** The options of {@link useReferralInvite}. */
export interface UseReferralInviteOptions {
  /** Override the injected `api.referrals` namespace. */
  api?: ReferralsApiRefs
}

/** What {@link useReferralInvite} returns. */
export interface UseReferralInviteReturn {
  /** The code of the link, from its address. */
  code: ComputedRef<string>
  state: ComputedRef<ReferralInviteState>
  /** What the link offers: the inviter's first name and what each side gets. `undefined` while it loads, `null` for a link that is none or could not be read. */
  preview: ComputedRef<ReferralPreview | null | undefined>
  /** `true` until the link has been read. */
  isLoading: ComputedRef<boolean>
  /** `true` while the claim runs. */
  isPending: ComputedRef<boolean>
  /** Where the sign-in page sends a visitor, who is returned to this page to claim. `null` with the sign-in page turned off. */
  signInTo: ComputedRef<string | null>
  /**
   * The invite page for a visitor who holds an invite while the app is
   * `closed`: `/invite?ref=<code>`, so the sign-in it leads to comes back
   * here to claim (`useInvite().signInTo`). `null` with the invite page
   * turned off.
   */
  inviteTo: ComputedRef<string | null>
  /**
   * `true` while the app is not public (`useAccessPhase`): a new account
   * needs a ticket first, an invite or an admitted place on the waitlist,
   * so signing up here without one only joins the waitlist. An account
   * claims within a day of its sign-up, so it comes back to the link then.
   * `false` once the app is public, for an app without `backend/access.ts`,
   * and when the phase could not be read (the sign-up's own check still
   * holds a visitor without a ticket to the waitlist). `undefined` while
   * the phase loads, so a page offers neither the sign-up nor the ways to a
   * ticket before it knows which one applies; a phase still unread after
   * five seconds reads as `false`, as one that could not be read.
   */
  closed: ComputedRef<boolean | undefined>
  /** Claim the referral for the signed-in account: the explicit step. Never rejects: a code that cannot be used is `ignored`. */
  claim: () => Promise<void>
  /** Why the claim failed, or else why the link could not be read. */
  error: ComputedRef<BackendError | null>
}

/**
 * The state of the page a referral link (`/r/<code>`) opens, headless: what
 * the link offers, the sign-in that returns to the page, and the claim. The
 * code travels in the address; nothing is stored on the device. A visitor
 * who signed in through this page comes back with `?claim=1`, and the claim
 * runs once on its own, the step they chose by signing up here. The server
 * holds it to a sign-in from the last ten minutes, so a link carrying
 * `?claim=1` that someone signed in earlier opens claims nothing by itself:
 * they, and anyone else who is signed in, claim with a button.
 *
 * The link is read on the server too, so the offer is in the first paint,
 * and stays live in the browser. The server renders nobody as signed in, so
 * `state` starts at `ready` there, and the claim only ever runs in the
 * browser. A link that cannot be read reads as `invalid`, with the reason in
 * `error`. While the app is not public, `closed` says a visitor needs a
 * ticket before the sign-up can make them an account; it is `undefined`
 * until the phase is read.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const { state, preview, signInTo, claim } = useReferralInvite()
 * </script>
 * <template>
 *   <p v-if="preview">{{ preview.inviter ?? 'A friend' }} invited you.</p>
 *   <NuxtLink v-if="state === 'ready' && closed === false && signInTo" :to="signInTo">Sign up to claim</NuxtLink>
 *   <button v-else-if="state === 'claimable'" @click="claim()">Claim</button>
 * </template>
 * ```
 */
export function useReferralInvite(options: UseReferralInviteOptions = {}): UseReferralInviteReturn {
  const route = useRoute()
  const api = useBackendNamespace<ReferralsApiRefs>('referrals', 'useReferralInvite', options.api)
  const auth = inject(ConvexAuthStateKey, null)
  const signedIn = computed(() => auth != null && auth.isAuthenticated.value)
  const loginPath = useBackendPagePath('login')
  const landing = useBackendPagePath('referral')
  const invitePath = useBackendPagePath('invite')
  // An app without backend/access.ts is open, and lacks no file: its phase reads as public, with no warning.
  const { phase, isLoading: phaseLoading } = useAccessPhase({ api: useApiNamespace<AccessApiRefs>('access') ?? {} })
  // In the browser only: the server renders the wait, and hydrates unchanged.
  const phaseWaited = useTimeout(PHASE_WAIT_MS)

  const code = computed(() => {
    const value = route.params.code
    return String(Array.isArray(value) ? value[0] : value ?? '')
  })
  const read = api.previewReferral ? useAsyncQuery(api.previewReferral, () => ({ code: code.value })) : absentQuery<ReferralPreview | null>()
  const readFailure = computed(() => (read.error.value ? failureOf(read.error.value) : null))
  const preview = computed(() => (read.data.value === undefined && readFailure.value ? null : read.data.value))
  const runClaim = api.claimReferral ? useMutation(api.claimReferral) : null

  const outcome = ref<'claiming' | 'claimed' | 'ignored' | 'own' | null>(null)
  const claimFailure = shallowRef<BackendError | null>(null)

  const run = async (fromSignIn: boolean) => {
    if (!runClaim || outcome.value === 'claiming' || outcome.value === 'claimed') return
    outcome.value = 'claiming'
    claimFailure.value = null
    try {
      const result = await runClaim({ code: code.value, ...(fromSignIn ? { fromSignIn: true } : {}) })
      outcome.value = result.claimed ? 'claimed' : result.reason === 'own_code' ? 'own' : 'ignored'
    }
    catch (failure) {
      const found = failureOf(failure)
      // No sign-in just happened here: the visitor claims with the button, if they choose to.
      if (fromSignIn && found.code === 'reauthentication_required') {
        outcome.value = null
        return
      }
      claimFailure.value = found
      outcome.value = 'ignored'
    }
  }
  const claim = () => run(false)

  // The sign-in this page sent the visitor to returns here with `claim=1`: signing up here is the claim, tried once.
  const claimQuery = computed(() => route.query.claim === '1')
  let tried = false
  watch([signedIn, preview, claimQuery], ([authed, found, requested]) => {
    if (!authed || !found || !requested || tried || outcome.value !== null) return
    tried = true
    void run(true)
  }, { immediate: true })

  const state = computed<ReferralInviteState>(() => {
    if (outcome.value) return outcome.value
    if (preview.value === undefined) return 'checking'
    if (preview.value === null) return 'invalid'
    return signedIn.value ? 'claimable' : 'ready'
  })

  const signInTo = computed(() => {
    if (!loginPath.value) return null
    const here = (landing.value ?? '/r/:code').replace(':code', encodeURIComponent(code.value))
    return `${loginPath.value}?redirect=${encodeURIComponent(`${here}?claim=1`)}`
  })

  const inviteTo = computed(() => (invitePath.value ? `${invitePath.value}?ref=${encodeURIComponent(code.value)}` : null))

  return {
    code,
    state,
    preview,
    isLoading: computed(() => Boolean(api.previewReferral) && preview.value === undefined),
    isPending: computed(() => outcome.value === 'claiming'),
    signInTo,
    inviteTo,
    closed: computed(() => {
      if (phaseLoading.value) return phaseWaited.value ? false : undefined
      return phase.value !== undefined && phase.value !== 'public'
    }),
    claim,
    error: computed(() => claimFailure.value ?? readFailure.value),
  }
}
