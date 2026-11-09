import { CATALOG_INTERVALS } from '../../../convex/catalog.js'
import { minorUnitDigits, toMajorUnits } from '../../../convex/money.js'
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
  // The price in the currency's main unit, with its own digits: 19.99 USD, 1999 JPY.
  const major = (amount: number, currency: string) => toMajorUnits(amount, currency).toFixed(minorUnitDigits(currency))
  const offer = (amount: number, currency: string, duration?: string) => ({
    '@type': 'Offer',
    'price': major(amount, currency),
    'priceCurrency': currency.toUpperCase(),
    ...(duration ? { priceSpecification: { '@type': 'UnitPriceSpecification', 'price': major(amount, currency), 'priceCurrency': currency.toUpperCase(), 'billingDuration': duration } } : {}),
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
