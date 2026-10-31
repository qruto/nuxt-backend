import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, h, toValue } from 'vue'
import { mount } from '@vue/test-utils'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { useRuntimeConfig } from '#imports'
import type { PricedPack, PricedPlan } from '../../src/convex/integrations/billing/types/records'
import { pricingStructuredData } from '../../src/runtime/vue/utils/pricing-seo'

// The pricing page's head: its meta description always, and with an SEO
// module installed (`runtimeConfig.public.backend.seo`) Open Graph tags and
// its plans and packs as schema.org products, one offer per price.

const PLANS: PricedPlan[] = [
  { key: 'pro', name: 'Pro', description: 'For teams.', retired: false, features: [], featureKeys: [], prices: {
    month: { productId: 'p_m', amount: 2900, currency: 'usd', monthly: 2900 },
    year: { productId: 'p_y', amount: 29000, currency: 'usd', monthly: 29000 / 12, savings: 16 },
  } },
  { key: 'legacy', name: 'Legacy', description: null, retired: true, features: [], featureKeys: [], prices: { month: { productId: 'l_m', amount: 1900, currency: 'usd', monthly: 1900 } } },
]
const PACKS: PricedPack[] = [{ key: 'credits500', productId: 'c', name: '500 credits', description: null, amount: 4000, currency: 'eur', isBestValue: false }]

const { useSeoMeta, useHead } = vi.hoisted(() => ({ useSeoMeta: vi.fn(), useHead: vi.fn() }))
mockNuxtImport('useSeoMeta', () => useSeoMeta)
mockNuxtImport('useHead', () => useHead)

/** Whether an SEO module is installed, as the module publishes it. */
function withSeo(on: boolean): void {
  const config = useRuntimeConfig().public as { backend?: Record<string, unknown> }
  config.backend = { ...config.backend, seo: on }
}
vi.mock('../../src/runtime/vue/composables/use-pricing', () => ({
  usePricing: () => ({ plans: computed(() => PLANS), packs: computed(() => PACKS) }),
}))
// The page's own parts stand in: what is checked here is its head.
vi.mock('../../src/runtime/vue/components/billing/PricingTable.vue', () => ({ default: defineComponent({ render: () => h('div') }) }))
vi.mock('../../src/runtime/vue/components/shell/PageFrame.vue', () => ({ default: defineComponent({ setup: (_props, { slots }) => () => h('main', slots.default?.()) }) }))

const { default: PricingPage } = await import('../../src/runtime/vue/pages/pricing.vue')

/** The head the page set: its meta, resolved, and its structured data, as the head manager gets it. */
function head() {
  const meta = Object.fromEntries(Object.entries(useSeoMeta.mock.calls.at(-1)?.[0] ?? {}).map(([key, value]) => [key, toValue(value as never)]))
  const script = (useHead.mock.calls.at(-1)?.[0] as { script?: Array<{ type: string, innerHTML: () => unknown }> } | undefined)?.script?.[0]
  return { meta, data: script?.innerHTML(), type: script?.type }
}

beforeEach(() => {
  vi.clearAllMocks()
  withSeo(false)
})
afterEach(() => withSeo(false))

describe('the pricing page\'s head', () => {
  it('sets the meta description from the labels, and nothing more without an SEO module', () => {
    mount(PricingPage)
    expect(head().meta).toEqual({ description: 'Plans and prices.' })
    expect(useHead).not.toHaveBeenCalled()
  })

  it('adds Open Graph tags and the products as structured data with one', () => {
    withSeo(true)
    mount(PricingPage)
    const { meta, data, type } = head()
    expect(meta).toEqual({ description: 'Plans and prices.', ogTitle: 'Pricing', ogDescription: 'Plans and prices.', ogType: 'website' })
    expect(type).toBe('application/ld+json')
    // An object, which the head manager serializes and escapes itself.
    expect(data).toEqual(pricingStructuredData({ plans: PLANS, packs: PACKS }))
  })
})

describe('pricingStructuredData', () => {
  it('leaves out a plan\'s archived price: nobody new can buy it', () => {
    const archived: PricedPlan = { ...PLANS[0]!, prices: { ...PLANS[0]!.prices, year: { ...PLANS[0]!.prices.year!, archived: true } } }
    const graph = pricingStructuredData({ plans: [archived], packs: [] })['@graph'] as Array<{ offers: Array<{ priceSpecification?: { billingDuration: string } }> }>
    expect(graph[0]!.offers.map(offer => offer.priceSpecification?.billingDuration)).toEqual(['P1M'])
  })

  it('describes each plan on sale and each pack as a product, with an offer per price', () => {
    expect(pricingStructuredData({ plans: PLANS, packs: PACKS })).toEqual({
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'Product', 'name': 'Pro', 'description': 'For teams.', 'offers': [
          { '@type': 'Offer', 'price': '29.00', 'priceCurrency': 'USD', 'priceSpecification': { '@type': 'UnitPriceSpecification', 'price': '29.00', 'priceCurrency': 'USD', 'billingDuration': 'P1M' } },
          { '@type': 'Offer', 'price': '290.00', 'priceCurrency': 'USD', 'priceSpecification': { '@type': 'UnitPriceSpecification', 'price': '290.00', 'priceCurrency': 'USD', 'billingDuration': 'P1Y' } },
        ] },
        // The retired plan is left out: nobody can buy it.
        { '@type': 'Product', 'name': '500 credits', 'offers': [{ '@type': 'Offer', 'price': '40.00', 'priceCurrency': 'EUR' }] },
      ],
    })
  })
})
