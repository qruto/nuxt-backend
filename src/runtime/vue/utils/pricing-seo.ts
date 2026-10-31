import { CATALOG_INTERVALS } from '../../../convex/catalog.js'
import type { Pricing } from '../composables/use-pricing'

/** ISO 8601 durations of the intervals a plan is billed at. */
const BILLING_DURATION = { month: 'P1M', year: 'P1Y' } as const

/**
 * The plans and packs on sale as schema.org `Product`s with an `Offer` per
 * price — what a search engine reads off a pricing page. A retired plan,
 * and a plan's archived price, are left out: nobody new can buy them.
 *
 * @internal
 */
export function pricingStructuredData(pricing: Pricing): Record<string, unknown> {
  const offer = (amount: number, currency: string, duration?: string) => ({
    '@type': 'Offer',
    'price': (amount / 100).toFixed(2),
    'priceCurrency': currency.toUpperCase(),
    ...(duration ? { priceSpecification: { '@type': 'UnitPriceSpecification', 'price': (amount / 100).toFixed(2), 'priceCurrency': currency.toUpperCase(), 'billingDuration': duration } } : {}),
  })
  const product = (name: string, description: string | null, offers: unknown[]) => ({
    '@type': 'Product',
    name,
    ...(description ? { description } : {}),
    offers,
  })
  return {
    '@context': 'https://schema.org',
    '@graph': [
      ...pricing.plans.filter(plan => !plan.retired).map(plan => product(plan.name, plan.description, CATALOG_INTERVALS.flatMap((interval) => {
        const price = plan.prices[interval]
        return price && !price.archived ? [offer(price.amount, price.currency, BILLING_DURATION[interval])] : []
      }))),
      ...pricing.packs.map(pack => product(pack.name, pack.description, [offer(pack.amount, pack.currency)])),
    ],
  }
}
