import { computed, type ComputedRef, inject, type MaybeRefOrGetter, toValue } from 'vue'
import { ConvexAuthStateKey, useAction } from 'nuxt-convex-module/client'
import { useActionState } from '../utils/action-state'
import type { BackendError } from '../utils/backend-error'
import { absentQuery, useLiveQuery, warnCallShape } from '../utils/live-query'
import { useBackendNamespace } from '../utils/namespace'
import { type BillingApi, type CheckoutOptions, createCheckout, type Credits } from './use-billing'
import { notConfigured } from './billing-provider'

/** The billing period a meter's credited units belong to. */
export interface CreditCycle {
  /** Start of the current cycle, when the provider reports one. */
  start?: Date
  /** End of the current cycle — when unspent credits expire, if they do. */
  end?: Date
}

export interface UseCreditsOptions {
  /**
   * Which meter to read: a configured meter name (`'credits'`) or a raw
   * meter id, as a value, ref or getter. Omitted or blank, the entity's first
   * configured meter.
   */
  meter?: MaybeRefOrGetter<string | null | undefined>
  /** Override the injected `api.billing` namespace. */
  api?: BillingApi
}

export interface UseCreditsReturn {
  /**
   * Remaining prepaid credit balance for the meter: `undefined` while
   * loading, and when the read failed (see `error`) or the backend exports
   * no `getCredits`; `0` while signed out or before the billing entity
   * has any.
   */
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
   * only when every benefit crediting the meter is known not to roll over
   * and a cycle end is known. `undefined` while loading; `false` when any
   * of the credits carry over (a pack bought on top of a plan's allowance),
   * or the provider has not said.
   */
  expiresAtCycleEnd: ComputedRef<boolean | undefined>
  /** The resolved meter id (the one read above) — pass it to your server-side spend. */
  meterId: ComputedRef<string | undefined>
  /** `true` until credit balances have loaded (`false` once the read failed). */
  isLoading: ComputedRef<boolean>
  /** `true` while `topUp` or `refresh` runs. */
  isPending: ComputedRef<boolean>
  /** Why the last action failed, else why the balances could not be read, else `null`. */
  error: ComputedRef<BackendError | null>
  /** Buy a credit pack (a one-time product) via checkout — returns the URL. Rejects on failure, which `error` also holds. */
  topUp: (productIds: string | string[], options?: CheckoutOptions) => Promise<string>
  /** Refresh the cached balance from the provider (e.g. right after a top-up completes). Rejects on failure, and when the backend does not export `syncEntitlements`. */
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
 * `overage` a pay-as-you-go meter has run up. The balance read never throws
 * (a failed read shows in `error`); the actions reject on failure and
 * mirror it into `error`.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const { balance, topUp, isPending, error } = useCredits({ meter: 'credits' })
 * </script>
 * <template>
 *   <p>{{ balance ?? '—' }} credits</p>
 *   <p v-if="error">{{ error.message }}</p>
 *   <button :aria-disabled="isPending || undefined" @click="isPending || topUp(creditPackId)">Buy 100 credits</button>
 * </template>
 * ```
 */
export function useCredits(options: UseCreditsOptions = {}): UseCreditsReturn {
  // The old shape, `useCredits(meter, { api })`, passed a second argument.
  warnCallShape('useCredits', arguments.length > 1 ? null : options, 'useCredits({ meter: \'credits\' })')
  const billing = useBackendNamespace<BillingApi>('billing', 'useCredits', options?.api)

  // Read only for a signed-in session: signed out, there are no credits to read.
  const auth = inject(ConvexAuthStateKey, null)
  const signedOut = computed(() => auth != null && !auth.isAuthenticated.value)
  const read = billing.getCredits ? useLiveQuery(billing.getCredits, () => (signedOut.value ? 'skip' : {})) : absentQuery<Credits | null>()
  const credits = read.data

  // Resolve the target meter — by configured name first (`{ meter: 'credits' }`),
  // then by raw meter id, else the user's primary meter: the first one this
  // app configured. A customer can carry meters the catalog no longer
  // declares (a retired meter still holds its old balance), and picking those
  // by position would report someone else's zero as the balance.
  // `undefined` ⇒ still loading (or unread); `null` ⇒ no such meter (treat
  // as 0): signed out, no billing entity yet (`getCredits` answered null),
  // or none of that name.
  const meter = computed(() => {
    if (signedOut.value || credits.value === null) return null
    const list = credits.value?.meters
    if (list === undefined) return undefined
    const id = toValue(options?.meter)?.trim()
    if (!id) return list.find(m => m.name !== undefined) ?? list[0] ?? null
    return list.find(m => m.name === id) ?? list.find(m => m.meterId === id) ?? null
  })

  const pick = (key: 'balance' | 'creditedUnits' | 'consumedUnits') =>
    computed(() => {
      const m = meter.value
      if (m === undefined) return undefined
      return m?.[key] ?? 0
    })

  const { isPending, failure, run } = useActionState(() => signedOut.value)
  const topUp = createCheckout(billing)
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
    isLoading: read.isLoading,
    isPending,
    error: computed(() => failure.value ?? read.error.value),
    topUp: (productIds, opts) => run(() => topUp(productIds, opts)),
    refresh: () => run(async () => {
      if (!runSync) notConfigured('refresh')
      await runSync({})
    }),
  }
}
