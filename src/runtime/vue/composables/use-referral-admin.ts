import { computed, type ComputedRef, inject, type MaybeRefOrGetter, toValue } from 'vue'
import { ConvexAuthStateKey, useMutation } from 'nuxt-convex-module/client'
import { useActionState } from '../utils/action-state'
import type { BackendError } from '../utils/backend-error'
import { absentQuery, diagnostics, useLiveQuery } from '../utils/live-query'
import { useBackendNamespace } from '../utils/namespace'
import type { ReferralConsole, ReferralsApiRefs } from './use-referrals'

export interface UseReferralAdminOptions {
  /** Override the injected `api.referrals` namespace. */
  api?: ReferralsApiRefs
  /** Show this referrer's history beside the totals. */
  referrerId?: MaybeRefOrGetter<string | undefined>
}

export interface UseReferralAdminReturn {
  /** The Referrals tab's data, live. `null` for a caller who is no administrator, `undefined` while it is read. */
  console: ComputedRef<ReferralConsole | null | undefined>
  /** `true` while it is first read. */
  isLoading: ComputedRef<boolean>
  /** `true` once the read answered that this caller is no administrator. */
  isRefused: ComputedRef<boolean>
  /** `true` while a decision is saved. */
  isPending: ComputedRef<boolean>
  /** Why the last decision failed, else why the read failed, else `null`. */
  error: ComputedRef<BackendError | null>
  /** Release a flagged referral's reward, or void the referral. Takes a recent sign-in (`useReauthentication().withReauthentication` asks for one). Rejects on failure. */
  resolve: (id: string, resolution: 'release' | 'void') => Promise<boolean>
}

/**
 * The admin console's Referrals tab, as data: the program's totals, the top
 * referrers, the flagged queue and one referrer's history, through
 * `backend/referrals.ts`, and the decision an administrator makes on a
 * flagged referral.
 */
export function useReferralAdmin(options: UseReferralAdminOptions = {}): UseReferralAdminReturn {
  const api = useBackendNamespace<ReferralsApiRefs>('referrals', 'useReferralAdmin', options.api)
  const auth = inject(ConvexAuthStateKey, null)
  const signedOut = computed(() => auth == null || !auth.isAuthenticated.value)
  const authLoading = computed(() => auth != null && auth.isLoading.value)
  const read = api.getReferralConsole
    ? useLiveQuery(api.getReferralConsole, () => (signedOut.value ? 'skip' : (toValue(options.referrerId) ? { referrerId: toValue(options.referrerId)! } : {})))
    : absentQuery<ReferralConsole | null>()
  const { isPending, failure, run } = useActionState(() => signedOut.value)
  if (!api.resolveReferral && diagnostics.enabled) console.warn('[nuxt-backend] useReferralAdmin(): the backend exports no `resolveReferral`: re-export it from backend/referrals.ts with the rest of `referrals.api`.')
  const resolveCall = api.resolveReferral ? useMutation(api.resolveReferral) : null

  return {
    console: computed(() => {
      if (authLoading.value) return undefined
      if (signedOut.value) return null
      return read.data.value
    }),
    isLoading: computed(() => authLoading.value || (!signedOut.value && read.isLoading.value)),
    isRefused: computed(() => !signedOut.value && read.data.value === null),
    isPending,
    error: computed(() => failure.value ?? (signedOut.value ? null : read.error.value)),
    resolve: (id, resolution) => run(async () => {
      if (!resolveCall) throw new Error('[nuxt-backend] The Referrals tab needs `resolveReferral` re-exported from setupReferrals() in backend/referrals.ts, or pass `{ api }` to useReferralAdmin().')
      return (await resolveCall({ id, resolution })).resolved
    }),
  }
}
