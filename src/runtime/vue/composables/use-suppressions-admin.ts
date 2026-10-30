import type { FunctionReference } from 'convex/server'
import { computed, type ComputedRef, inject } from 'vue'
import { ConvexAuthStateKey, useAction } from 'nuxt-convex-module/client'
import type { Suppression, SuppressionsPage } from '../../../convex/integrations/email-suppressions.js'
import { useActionState } from '../utils/action-state'
import type { BackendError } from '../utils/backend-error'
import { absentQuery, useLiveQuery } from '../utils/live-query'
import { useBackendNamespace } from '../utils/namespace'

export type { Suppression } from '../../../convex/integrations/email-suppressions.js'

/** The addresses the Suppressions tab lists: the newest page. */
const PAGE_SIZE = 100

type PaginationArgs = { numItems: number, cursor: string | null }

/** The functions of `email.api` the Suppressions tab calls. */
export interface SuppressionsApiRefs {
  getSuppressions?: FunctionReference<'query', 'public', { paginationOpts: PaginationArgs }, SuppressionsPage | null>
  liftSuppression?: FunctionReference<'action', 'public', { email: string }, { lifted: boolean }>
}

export interface UseSuppressionsAdminOptions {
  /** Override the injected `api.email` namespace. */
  api?: SuppressionsApiRefs
}

export interface UseSuppressionsAdminReturn {
  /** The newest suppressed addresses, live. `null` for a caller who is no administrator, `undefined` until it is read. */
  suppressions: ComputedRef<Suppression[] | null | undefined>
  /** `true` when more addresses are suppressed than the tab lists. */
  hasMore: ComputedRef<boolean>
  isLoading: ComputedRef<boolean>
  isRefused: ComputedRef<boolean>
  isPending: ComputedRef<boolean>
  error: ComputedRef<BackendError | null>
  /** Lift an address's suppression through the provider. Rejects with the failure, which `error` holds too. */
  lift: (email: string) => Promise<{ lifted: boolean }>
}

/**
 * The admin console's Suppressions tab, as data: the addresses the email
 * provider stopped delivering to, mirrored from its webhook through
 * `backend/email.ts`, and a lift through the provider's suppressions API.
 * A lift is an administrator's in person and takes a recent sign-in.
 *
 * @internal
 */
export function useSuppressionsAdmin(options: UseSuppressionsAdminOptions = {}): UseSuppressionsAdminReturn {
  const api = useBackendNamespace<SuppressionsApiRefs>('email', 'useSuppressionsAdmin', options.api)
  const auth = inject(ConvexAuthStateKey, null)
  const signedOut = computed(() => auth == null || !auth.isAuthenticated.value)
  const authLoading = computed(() => auth != null && auth.isLoading.value)
  const read = api?.getSuppressions
    ? useLiveQuery(api.getSuppressions, () => (signedOut.value ? 'skip' : { paginationOpts: { numItems: PAGE_SIZE, cursor: null } }))
    : absentQuery<SuppressionsPage | null>()
  const send = api?.liftSuppression ? useAction(api.liftSuppression) : null
  const { isPending, failure, run } = useActionState(() => signedOut.value)

  return {
    suppressions: computed(() => {
      if (authLoading.value) return undefined
      if (signedOut.value) return null
      const page = read.data.value
      return page === undefined ? undefined : page === null ? null : page.page
    }),
    hasMore: computed(() => read.data.value?.isDone === false),
    isLoading: computed(() => authLoading.value || (!signedOut.value && read.isLoading.value)),
    isRefused: computed(() => !signedOut.value && read.data.value === null),
    isPending,
    error: computed(() => failure.value ?? (signedOut.value ? null : read.error.value)),
    lift: email => run(async () => {
      if (!send) throw new Error('[nuxt-backend] Lifting a suppression needs `liftSuppression` re-exported from setupEmail() in backend/email.ts (`export const { getSuppressions, liftSuppression } = email.api`), or pass `{ api }` to useSuppressionsAdmin().')
      return await send({ email })
    }),
  }
}
