import type { FunctionReference } from 'convex/server'
import { computed, type ComputedRef, inject } from 'vue'
import { ConvexAuthStateKey } from 'nuxt-convex-module/client'
import type { SignInAlert } from '../../../../convex/client/auth-types.js'
import type { BackendError } from '../../utils/backend-error'
import { absentQuery, useLiveQuery } from '../../utils/live-query'
import { useApiNamespace } from '../../utils/namespace'

export type { SignInAlert } from '../../../../convex/client/auth-types.js'

/** The Alerts section's data: the account's latest sign-ins from a new device, and with its recovery code. */
export interface SignInAlertsState {
  /** Newest first, live: `[]` signed out or without `listSignInAlerts`, `undefined` until the first read lands. */
  alerts: ComputedRef<SignInAlert[] | undefined>
  /** `true` until the first read lands. */
  isLoading: ComputedRef<boolean>
  /** Why the list could not be read, else `null`. */
  error: ComputedRef<BackendError | null>
}

interface SignInAlertsApi {
  listSignInAlerts?: FunctionReference<'query', 'public', Record<string, never>, SignInAlert[] | null>
}

/**
 * The Alerts section, as state: `listSignInAlerts` from `backend/auth.ts`,
 * live. An app whose auth.ts does not re-export it reads an empty list.
 *
 * @internal
 */
export function useSignInAlertsState(): SignInAlertsState {
  const api = useApiNamespace<SignInAlertsApi>('auth')
  const auth = inject(ConvexAuthStateKey, null)
  const signedOut = computed(() => auth == null || !auth.isAuthenticated.value)
  const authLoading = computed(() => auth != null && auth.isLoading.value)
  const read = api?.listSignInAlerts
    ? useLiveQuery(api.listSignInAlerts, () => (signedOut.value ? 'skip' : {}))
    : absentQuery<SignInAlert[] | null>()
  return {
    alerts: computed(() => {
      if (authLoading.value) return undefined
      if (signedOut.value || !api?.listSignInAlerts) return []
      return read.data.value === null ? [] : read.data.value
    }),
    isLoading: computed(() => authLoading.value || (!signedOut.value && Boolean(api?.listSignInAlerts) && read.isLoading.value)),
    error: computed(() => (signedOut.value ? null : read.error.value)),
  }
}
