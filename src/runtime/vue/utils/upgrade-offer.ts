import { computed, type ComputedRef } from 'vue'
import type { BillingApi } from '../composables/use-billing'
import { useBackendPagePath } from '../composables/use-backend-page-path'
import { usePricing, type PricedPlan } from '../composables/use-pricing'
import { useCanManage } from './billing-access'
import { inLocale } from './intl'
import { useBackendNamespace } from './namespace'

/** What a prompt to upgrade offers, and where its one action goes. */
export interface UpgradeOffer {
  /** The plans on sale it offers, in pricing order: none while the pricing loads, or could not be read. */
  plans: ComputedRef<PricedPlan[]>
  /** The plan the action opens: the first of {@link UpgradeOffer.plans}. */
  plan: ComputedRef<PricedPlan | undefined>
  /** The pricing page, on that plan (`?plan=<key>`) when there is one. */
  href: ComputedRef<string>
  /** Whether the person may buy a plan, as the server decides it. */
  canManage: ComputedRef<boolean>
  /** `true` while the pricing loads. */
  isLoading: ComputedRef<boolean>
}

/**
 * The plans on sale that `offers` accepts, in the pricing's own order, the
 * pricing-page link to the first, and whether the person may buy it: what
 * `<UpgradePrompt>` and `<Gate quota>` show someone a gate turned away.
 * The pricing is read in the browser, so no page waits on the server for a
 * prompt that shows only after a refusal.
 */
export function useUpgradeOffer(offers: (plan: PricedPlan) => boolean, component: string): UpgradeOffer {
  const pricing = usePricing({ server: false, actions: false })
  const canManage = useCanManage(useBackendNamespace<BillingApi>('billing', component).getBillingAccess)
  const pricingPath = useBackendPagePath('pricing')
  const plans = computed(() => (pricing.plans.value ?? []).filter(plan => !plan.retired && offers(plan)))
  const plan = computed(() => plans.value[0])
  // No pricing page (`pages.pricing: false`): no link, `''`.
  const href = computed(() => !pricingPath.value ? '' : plan.value ? `${pricingPath.value}?plan=${encodeURIComponent(plan.value.key)}` : pricingPath.value)
  return { plans, plan, href, canManage, isLoading: pricing.isLoading }
}

/** "Pro or Ultra": the plans' names joined in the locale's words (English without `@nuxtjs/i18n`). */
export function planNames(plans: PricedPlan[], locale: string | undefined): string {
  return inLocale(locale ?? 'en', tag => new Intl.ListFormat(tag, { type: 'disjunction' }).format(plans.map(plan => plan.name)))
}
