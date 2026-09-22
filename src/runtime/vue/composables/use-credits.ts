import { computed, type ComputedRef, type MaybeRefOrGetter, toValue } from 'vue'
import { useAction, useQuery } from 'nuxt-convex-module/client'
import { useBackendNamespace } from '../utils/namespace'
import { type BillingApi, type CheckoutOptions, createCheckout, createGiftCheckout, type Credits, type GiftOptions } from './use-billing'

/** The billing period a meter's credited units belong to. */
export interface CreditCycle {
  /** Start of the current cycle, when the provider reports one. */
  start?: Date
  /** End of the current cycle — when unspent credits expire, if they do. */
  end?: Date
}

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
  /**
   * Units consumed beyond what was credited — what a pay-as-you-go meter has
   * run up this cycle and the provider will invoice. `0` for a meter that is
   * still in prepaid credit; `undefined` while loading.
   */
  overage: ComputedRef<number | undefined>
  /**
   * The billing cycle these credits belong to: `undefined` while loading,
   * `null` for a meter with no cycle at all (credits bought as a one-time
   * pack), otherwise the current period.
   */
  cycle: ComputedRef<CreditCycle | null | undefined>
  /**
   * Whether the remaining balance expires at {@link CreditCycle.end} — `true`
   * only when the plan's credits are known not to roll over and a cycle end is
   * known. `undefined` while loading; `false` when credits carry over (or the
   * provider has not said).
   */
  expiresAtCycleEnd: ComputedRef<boolean | undefined>
  /** The resolved meter id (the one read above) — pass it to your server-side spend. */
  meterId: ComputedRef<string | undefined>
  /** `true` until credit balances have loaded. */
  isLoading: ComputedRef<boolean>
  /** Buy a credit pack (a one-time product) via checkout — returns the URL. */
  topUp: (productIds: string | string[], options?: CheckoutOptions) => Promise<string>
  /** Buy a credit pack as a gift for someone else (by email). Opens checkout. */
  gift: (productIds: string | string[], options: GiftOptions & { recipientEmail: string }) => Promise<string>
  /** Refresh the cached balance from the provider (e.g. right after a top-up completes). */
  refresh: () => Promise<void>
}

/**
 * Reactive prepaid-credit balance for the current user, plus a `topUp()` checkout
 * and a `refresh()` re-sync. Credits are the provider's native model: a credit pack is a
 * one-time product whose Credits benefit tops up a meter balance, drawn down by
 * server-side consumption (`setupBilling().spendCredits`). Reads the component's
 * webhook-synced cache via `getCredits`. Zero-arg via the auto-provided
 * `api.billing` namespace; pass `{ api }` to override.
 *
 * Alongside the balance it exposes what a credits UI actually needs to say:
 * the current `cycle`, whether the remainder `expiresAtCycleEnd`, and the
 * `overage` a pay-as-you-go meter has run up.
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
 * @param meterId - Optional meter to read (reactive): a configured meter name
 * (`'credits'`) or a raw meter id; defaults to the user's first meter.
 */
export function useCredits(meterId?: MaybeRefOrGetter<string>, options: UseCreditsOptions = {}): UseCreditsReturn {
  const billing = useBackendNamespace<BillingApi>('billing', 'useCredits', options.api)

  const credits = billing.getCredits
    ? useQuery(billing.getCredits)
    : computed<Credits | null | undefined>(() => null)

  // Resolve the target meter — by configured name first (`useCredits('credits')`),
  // then by raw meter id, else the user's primary meter: the first one this
  // app configured. A customer can carry meters the catalog no longer
  // declares (a retired meter still holds its old balance), and picking those
  // by position would report someone else's zero as the balance.
  // `undefined` ⇒ still loading; `null` ⇒ loaded but no such meter (treat as 0).
  const meter = computed(() => {
    const list = credits.value?.meters
    if (list === undefined) return undefined
    const id = meterId === undefined ? undefined : toValue(meterId)
    if (!id) return list.find(m => m.name !== undefined) ?? list[0] ?? null
    return list.find(m => m.name === id) ?? list.find(m => m.meterId === id) ?? null
  })

  const pick = (key: 'balance' | 'creditedUnits' | 'consumedUnits') =>
    computed(() => {
      const m = meter.value
      if (m === undefined) return undefined
      return m?.[key] ?? 0
    })

  const topUp = createCheckout(billing)
  const gift = createGiftCheckout(billing)
  const runSync = billing.syncEntitlements ? useAction(billing.syncEntitlements) : null

  return {
    balance: pick('balance'),
    credited: pick('creditedUnits'),
    consumed: pick('consumedUnits'),
    // Consumption past the credited grant. Derived, not stored: `balance` is
    // already credited − consumed, so overage is just its negative half — a
    // meter with no credit benefit behind it starts at zero and runs down.
    overage: computed(() => {
      const m = meter.value
      if (m === undefined) return undefined
      return Math.max(0, (m?.consumedUnits ?? 0) - (m?.creditedUnits ?? 0))
    }),
    cycle: computed(() => {
      const m = meter.value
      if (m === undefined) return undefined
      if (!m || (m.cycleStart === undefined && m.cycleEnd === undefined)) return null
      return {
        start: m.cycleStart === undefined ? undefined : new Date(m.cycleStart),
        end: m.cycleEnd === undefined ? undefined : new Date(m.cycleEnd),
      }
    }),
    expiresAtCycleEnd: computed(() => {
      const m = meter.value
      if (m === undefined) return undefined
      return m?.rollover === false && m.cycleEnd !== undefined
    }),
    meterId: computed(() => meter.value?.meterId),
    isLoading: computed(() => credits.value === undefined),
    topUp,
    gift,
    refresh: async () => {
      if (runSync) await runSync({})
    },
  }
}
