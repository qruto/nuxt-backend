import { computed, type ComputedRef } from 'vue'
import { grantsFeature } from '../../../convex/catalog.js'
import type { QuotaUsage } from '../../../convex/integrations/billing/types/records.js'
import type { BackendError } from '../utils/backend-error'
import { absentQuery, useLiveQuery } from '../utils/live-query'
import { useBackendNamespace } from '../utils/namespace'
import type { BillingApi, EntitlementBenefit, Features } from './use-billing'

export type { QuotaUsage } from '../../../convex/integrations/billing/types/records.js'

export interface UseFeaturesOptions {
  /** Override the injected `api.billing` namespace (or the `getFeatures` ref). */
  api?: BillingApi
}

export interface UseFeaturesReturn {
  /** Active product ids the user is subscribed to, or `undefined` while loading. */
  plans: ComputedRef<string[] | undefined>
  /** Granted benefits (entitlements), or `undefined` while loading. */
  benefits: ComputedRef<EntitlementBenefit[] | undefined>
  /**
   * Every quota the catalog declares or a grant names, by key, or
   * `undefined` while loading.
   *
   * @experimental
   */
  quotas: ComputedRef<Record<string, QuotaUsage> | undefined>
  /** `true` until features have loaded (`false` once the read failed). */
  isLoading: ComputedRef<boolean>
  /** Why the features could not be read, else `null`. While it is set, `has` and `hasPlan` say no. */
  error: ComputedRef<BackendError | null>
  /**
   * Whether a granted benefit is `feature`: by its catalog key (the `key`
   * in its metadata), or by its benefit id when it has no key. The match
   * `billing.requireFeature` and the `withFeature` tier make on the server.
   */
  has: (feature: string) => boolean
  /** Whether the user has an active subscription to the given product id. */
  hasPlan: (productId: string) => boolean
  /**
   * How many of `quota` the plan allows and how many are held, as
   * `billing.getQuota` reads them on the server: `{ limit: 0, used: 0 }`
   * for a quota no grant names, so it fails closed; `undefined` while
   * loading or when the features could not be read.
   *
   * @experimental
   */
  quota: (quota: string) => QuotaUsage | undefined
  /**
   * How many more of `quota` fit: `Infinity` when the plan allows any
   * number, and `0` while loading, when the features could not be read, or
   * when none is left, so a gate fails closed. `billing.requireQuota`
   * enforces it in the mutation.
   *
   * @experimental
   */
  remaining: (quota: string) => number
}

/**
 * Reactive feature-gating for the current user — the SaaS access primitive.
 * Backed by the `getFeatures` query (the component's webhook-synced cache), so it
 * updates live as subscriptions/benefits change. Zero-arg via the auto-provided
 * `api.billing` namespace; pass `{ api }` to override. The read never throws:
 * a failed one shows in `error`, and gates closed. A gate in the UI is for
 * the UI: enforce in the function with `billing.requireFeature` or the
 * `withFeature` tier, and a quota with `billing.requireQuota`, which read
 * the same cache and match the same way.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const { has, hasPlan, remaining } = useFeatures()
 * </script>
 * <template>
 *   <PremiumPanel v-if="has('priority_support')" />
 *   <NewProjectButton :disabled="remaining('projects') < 1" />
 * </template>
 * ```
 */
export function useFeatures(options: UseFeaturesOptions = {}): UseFeaturesReturn {
  const billing = useBackendNamespace<BillingApi>('billing', 'useFeatures', options.api)

  const read = billing.getFeatures ? useLiveQuery(billing.getFeatures, {}) : absentQuery<Features | null>()

  const plans = computed(() => read.data.value?.plans)
  const benefits = computed(() => read.data.value?.benefits)
  // A signed-out caller reads `null`: no plan, so every quota allows none.
  const quotas = computed(() => read.data.value === undefined ? undefined : read.data.value?.quotas ?? {})

  const quota = (key: string): QuotaUsage | undefined => {
    const known = quotas.value
    if (known === undefined) return undefined
    // Its own entry only: a key like `constructor` names no quota, and allows none.
    return Object.hasOwn(known, key) ? known[key] : { limit: 0, used: 0 }
  }

  return {
    plans,
    benefits,
    quotas,
    isLoading: read.isLoading,
    error: read.error,
    has: feature => benefits.value?.some(benefit => grantsFeature(benefit, feature)) ?? false,
    hasPlan: productId => plans.value?.includes(productId) ?? false,
    quota,
    remaining: (key) => {
      const usage = quota(key)
      if (!usage) return 0
      return usage.limit === 'unlimited' ? Number.POSITIVE_INFINITY : Math.max(0, usage.limit - usage.used)
    },
  }
}
