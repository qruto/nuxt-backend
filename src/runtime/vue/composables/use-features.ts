import { computed, type ComputedRef } from 'vue'
import { useQuery } from './use-query'
import type { BillingApi, EntitlementBenefit, Features } from './use-billing'
import { useBackendNamespace } from '../provide'

export interface UseFeaturesOptions {
  /** Override the injected `api.billing` namespace (or the `getFeatures` ref). */
  api?: BillingApi
}

export interface UseFeaturesReturn {
  /** Active product ids the user is subscribed to, or `undefined` while loading. */
  plans: ComputedRef<string[] | undefined>
  /** Granted benefits (entitlements), or `undefined` while loading. */
  benefits: ComputedRef<EntitlementBenefit[] | undefined>
  /** `true` until features have loaded. */
  isLoading: ComputedRef<boolean>
  /** Whether the user has the given benefit (matched by `benefitId`, grant `id`, `type`, or any metadata value). */
  has: (feature: string) => boolean
  /** Whether the user has an active subscription to the given product id. */
  hasPlan: (productId: string) => boolean
}

/**
 * Reactive feature-gating for the current user — the SaaS access primitive.
 * Backed by the `getFeatures` query (the component's webhook-synced cache), so it
 * updates live as subscriptions/benefits change. Zero-arg via the auto-provided
 * `api.billing` namespace; pass `{ api }` to override.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const { has, hasPlan } = useFeatures()
 * </script>
 * <template>
 *   <PremiumPanel v-if="has('priority_support')" />
 * </template>
 * ```
 */
export function useFeatures(options: UseFeaturesOptions = {}): UseFeaturesReturn {
  const billing = (options.api ?? useBackendNamespace<BillingApi>('billing') ?? {}) as BillingApi

  const features = billing.getFeatures
    ? useQuery(billing.getFeatures)
    : computed<Features | null | undefined>(() => null)

  const plans = computed(() => features.value?.plans)
  const benefits = computed(() => features.value?.benefits)

  return {
    plans,
    benefits,
    isLoading: computed(() => features.value === undefined),
    has: (feature) => {
      const list = benefits.value
      if (!list) return false
      return list.some(b =>
        b.benefitId === feature
        || b.id === feature
        || b.type === feature
        || (b.metadata != null && Object.values(b.metadata).some(val => String(val) === feature)),
      )
    },
    hasPlan: productId => plans.value?.includes(productId) ?? false,
  }
}

/** @public */
export const useConvexFeatures = useFeatures
