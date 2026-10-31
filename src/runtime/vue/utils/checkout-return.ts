import { inject, shallowRef } from 'vue'
import type { LocationQuery } from 'vue-router'
import { until } from '@vueuse/core'
import { ConvexAuthStateKey, useAction } from 'nuxt-convex-module/client'
import { CHECKOUT_RETURN_PARAM } from '../../../convex/constants.js'
import type { BillingApi } from '../composables/use-billing'
import { useBackendNamespace } from './namespace'

// The return from checkout. The server appends `checkout_return` with the
// provider's placeholder to the success URL of every plan and pack checkout
// and of a gift's claim, so a customer who paid comes back with the
// checkout's id on the address. The client's
// checkout-return plugin hands it here: the parameter comes off the address
// at once, and the entitlements are refreshed from the provider once, so the
// new plan reads back before its webhooks land.

/**
 * `true` while the page refreshes the entitlements after a return from
 * checkout, behind `useBilling().isFinishingCheckout`. Written only in the
 * browser, by the checkout-return plugin, so the server render never shares
 * it between requests.
 */
export const finishingCheckout = shallowRef(false)

/** The checkouts this page already finished: a second return with one id refreshes nothing. */
const finished = new Set<string>()

/** How long the refresh waits for the session to settle before it gives up. */
const AUTH_WAIT_MS = 10_000

/** What finishing a return needs from the page. */
export interface CheckoutReturn {
  /** The address's query. */
  query: LocationQuery
  /** Replace the address's query with this one: the same address without the parameter. */
  strip: (query: LocationQuery) => unknown
  /** Refresh the entitlements from the provider once. A failure is left to the webhooks. */
  sync: () => Promise<unknown>
}

/**
 * Finish a return from checkout: take `checkout_return` off the address, then,
 * once per checkout, refresh the entitlements while
 * {@link finishingCheckout} is `true`. Answers whether a refresh ran and
 * went through. A refresh that fails changes nothing the customer sees: the
 * provider's webhooks bring the new plan all the same.
 */
export async function finishCheckoutReturn({ query, strip, sync }: CheckoutReturn): Promise<boolean> {
  const value = query[CHECKOUT_RETURN_PARAM]
  if (value === undefined) return false
  const { [CHECKOUT_RETURN_PARAM]: _returned, ...rest } = query
  await strip(rest)
  const id = (Array.isArray(value) ? value[0] : value) ?? ''
  if (!id || finished.has(id)) return false
  finished.add(id)
  finishingCheckout.value = true
  try {
    await sync()
    return true
  }
  catch {
    return false
  }
  finally {
    finishingCheckout.value = false
  }
}

/**
 * The refresh a return makes, bound to the app's backend client: it waits
 * for the session to settle (a return is a fresh page load, and the token
 * comes a moment later), then calls the scaffolded `syncEntitlements` for a
 * signed-in person. Nothing for a signed-out visitor, nor where the backend
 * exports no `syncEntitlements`. Call it inside the app's injection context.
 */
export function entitlementSync(): () => Promise<void> {
  const auth = inject(ConvexAuthStateKey, null)
  const billing = useBackendNamespace<BillingApi>('billing', 'useBilling')
  const run = billing.syncEntitlements ? useAction(billing.syncEntitlements) : null
  return async () => {
    if (!run) return
    if (auth) {
      await until(() => auth.isLoading.value).toBe(false, { timeout: AUTH_WAIT_MS, throwOnTimeout: true })
      if (!auth.isAuthenticated.value) return
    }
    await run({})
  }
}
