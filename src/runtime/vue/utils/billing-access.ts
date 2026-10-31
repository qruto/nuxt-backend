import type { FunctionReference } from 'convex/server'
import { computed, inject, type ComputedRef } from 'vue'
import { ConvexAuthStateKey } from 'nuxt-convex-module/client'
import { useLiveQuery } from './live-query'

/** The scaffolded `getBillingAccess` query: whether the caller may buy and manage, as the server decides it. */
type BillingAccessQuery = FunctionReference<'query', 'public', Record<string, never>, { canManage: boolean, saveOffers?: boolean, softOptIn?: boolean } | null>

/**
 * Whether the caller may buy and manage the billing entity's billing, read
 * from the server's own decision (`getBillingAccess`): a workspace's owner
 * and admins may, its other members may not, and with `billTo: 'user'`
 * every account manages its own; a caller who may not read the billing at
 * all (no member of the workspace any more) manages none of it, and so
 * does one whose read failed: a control the server might refuse is hidden.
 * `true` while signed out, still loading, or on a backend without the
 * query, so a pricing page shows its plans to a visitor; the server
 * refuses whoever it must either way.
 */
export function useCanManage(getBillingAccess: BillingAccessQuery | undefined): ComputedRef<boolean> {
  return useBillingAccess(getBillingAccess).canManage
}

/**
 * The server's billing access read: {@link useCanManage}, and whether the
 * cancel flow has a save offer for some reason (`saveOffers`, LIFECYCLE),
 * which is `false` until known: the billing section then keeps its
 * one-step cancellation; and whether a paid checkout joins topics with
 * `softOptIn` (`softOptIn`), `false` until known: no checkout shows its box.
 */
export function useBillingAccess(getBillingAccess: BillingAccessQuery | undefined): { canManage: ComputedRef<boolean>, saveOffers: ComputedRef<boolean>, softOptIn: ComputedRef<boolean> } {
  const auth = inject(ConvexAuthStateKey, null)
  const signedOut = computed(() => auth != null && !auth.isAuthenticated.value)
  const read = getBillingAccess ? useLiveQuery(getBillingAccess, () => (signedOut.value ? 'skip' as const : {})) : null
  return {
    canManage: computed(() => {
      if (read?.error.value) return false
      const access = read?.data.value
      return access === undefined || access?.canManage === true
    }),
    saveOffers: computed(() => read?.data.value?.saveOffers === true),
    softOptIn: computed(() => read?.data.value?.softOptIn === true),
  }
}
