import { computed, type ComputedRef, inject, ref, type Ref, shallowRef, watch } from 'vue'
import { useRoute } from '#imports'
import { ConvexAuthStateKey, useMutation } from 'nuxt-convex-module/client'
import type { ReferralPreview } from '../../../convex/integrations/referrals'
import type { BackendError } from '../utils/backend-error'
import { failureOf } from '../utils/backend-error'
import { absentQuery, useLiveQuery } from '../utils/live-query'
import { useBackendNamespace } from '../utils/namespace'
import { useBackendPagePath } from './use-backend-page-path'
import type { ReferralsApiRefs } from './use-referrals'

/** Where the page a referral link opens is: reading the link, ready to claim, claiming, or settled. */
export type ReferralInviteState = 'checking' | 'invalid' | 'ready' | 'claimable' | 'claiming' | 'claimed' | 'ignored' | 'own'

/** What {@link useReferralInvite} returns. */
export interface UseReferralInviteReturn {
  /** The code of the link, from its address. */
  code: ComputedRef<string>
  state: ComputedRef<ReferralInviteState>
  /** What the link offers: the inviter's first name and what each side gets. `undefined` while it loads, `null` for a link that is none. */
  preview: ComputedRef<ReferralPreview | null | undefined>
  /** Where the sign-in page sends a visitor, who is returned to this page to claim. `null` with the sign-in page turned off. */
  signInTo: ComputedRef<string | null>
  /** Claim the referral for the signed-in account: the explicit step. Never rejects: a code that cannot be used is `ignored`. */
  claim: () => Promise<void>
  error: Ref<BackendError | null>
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
 */
export function useReferralInvite(): UseReferralInviteReturn {
  const route = useRoute()
  const api = useBackendNamespace<ReferralsApiRefs>('referrals', 'useReferralInvite')
  const auth = inject(ConvexAuthStateKey, null)
  const signedIn = computed(() => auth != null && auth.isAuthenticated.value)
  const loginPath = useBackendPagePath('login')
  const landing = useBackendPagePath('referral')

  const code = computed(() => {
    const value = route.params.code
    return String(Array.isArray(value) ? value[0] : value ?? '')
  })
  const read = api.previewReferral ? useLiveQuery(api.previewReferral, () => ({ code: code.value })) : absentQuery<ReferralPreview | null>()
  const preview = computed(() => (read.isLoading.value ? undefined : read.data.value))
  const runClaim = api.claimReferral ? useMutation(api.claimReferral) : null

  const outcome = ref<'claiming' | 'claimed' | 'ignored' | 'own' | null>(null)
  const error = shallowRef<BackendError | null>(null)

  const run = async (fromSignIn: boolean) => {
    if (!runClaim || outcome.value === 'claiming' || outcome.value === 'claimed') return
    outcome.value = 'claiming'
    error.value = null
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
      error.value = found
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

  return { code, state, preview, signInTo, claim, error }
}
