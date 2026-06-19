import { computed, type ComputedRef, type MaybeRefOrGetter, toValue } from 'vue'
import { useAction } from './use-action'
import { useQuery } from './use-query'
import { type BillingApi, type CheckoutOptions, createCheckout, type Credits } from './use-billing'
import { useBackendNamespace } from '../provide'

export interface UseCreditsOptions {
  /** Override the injected `api.billing` namespace. */
  api?: BillingApi
}

export interface UseCreditsReturn {
  /** Remaining prepaid credit balance for the meter, or `undefined` while loading. */
  balance: ComputedRef<number | undefined>
  /** Total credits granted for the meter (top-ups + plan grants), or `undefined` while loading. */
  credited: ComputedRef<number | undefined>
  /** Credits consumed for the meter, or `undefined` while loading. */
  consumed: ComputedRef<number | undefined>
  /** The resolved meter id (the one read above) — pass it to your server-side spend. */
  meterId: ComputedRef<string | undefined>
  /** `true` until credit balances have loaded. */
  isLoading: ComputedRef<boolean>
  /** Buy a credit pack (a one-time product) via Polar checkout — returns the URL. */
  topUp: (productIds: string | string[], options?: CheckoutOptions) => Promise<string>
  /** Refresh the cached balance from Polar (e.g. right after a top-up completes). */
  refresh: () => Promise<void>
}

/**
 * Reactive prepaid-credit balance for the current user, plus a `topUp()` checkout
 * and a `refresh()` re-sync. Credits are Polar's official model: a credit pack is a
 * one-time product whose Credits benefit tops up a meter balance, drawn down by
 * server-side consumption (`setupBilling().spendCredits`). Reads the component's
 * webhook-synced cache via `getCredits`. Zero-arg via the auto-provided
 * `api.billing` namespace; pass `{ api }` to override.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const credits = useCredits()
 * </script>
 * <template>
 *   <p>{{ credits.balance.value ?? '—' }} credits</p>
 *   <button @click="credits.topUp(creditPackId)">Buy 100 credits</button>
 * </template>
 * ```
 *
 * @param meterId - Optional meter id to read (reactive); defaults to the user's first meter.
 */
export function useCredits(meterId?: MaybeRefOrGetter<string>, options: UseCreditsOptions = {}): UseCreditsReturn {
  const billing = (options.api ?? useBackendNamespace<BillingApi>('billing') ?? {}) as BillingApi

  const credits = billing.getCredits
    ? useQuery(billing.getCredits)
    : computed<Credits | null | undefined>(() => null)

  // Resolve the target meter — by id if given, else the user's first/primary meter.
  // `undefined` ⇒ still loading; `null` ⇒ loaded but no such meter (treat as 0).
  const meter = computed(() => {
    const list = credits.value?.meters
    if (list === undefined) return undefined
    const id = meterId === undefined ? undefined : toValue(meterId)
    return (id ? list.find(m => m.meterId === id) : list[0]) ?? null
  })

  const pick = (key: 'balance' | 'creditedUnits' | 'consumedUnits') =>
    computed(() => {
      const m = meter.value
      if (m === undefined) return undefined
      return m?.[key] ?? 0
    })

  const topUp = createCheckout(billing)
  const runSync = billing.syncEntitlements ? useAction(billing.syncEntitlements) : null

  return {
    balance: pick('balance'),
    credited: pick('creditedUnits'),
    consumed: pick('consumedUnits'),
    meterId: computed(() => meter.value?.meterId),
    isLoading: computed(() => credits.value === undefined),
    topUp,
    refresh: async () => {
      if (runSync) await runSync({})
    },
  }
}

/** @public */
export const useConvexCredits = useCredits
