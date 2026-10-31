import { describe, expect, it } from 'vitest'
import { getBackendError } from '../../src/convex/errors'
import { createCatalogDiscounts, offerOf, promotionOf, refusedDiscount } from '../../src/convex/integrations/billing/discounts'
import { buildPricing, type PricingSources } from '../../src/convex/integrations/billing/pricing'
import type { BillingCatalogDiscount } from '../../src/convex/integrations/billing/types/records'

// What a promotion takes off a price, which provider refusals are a
// discount's, what a pricing page may show of a promotion, how a checkout
// finds the catalog's discount by key or code, and the pricing read's edges:
// prices with no figure, a year that saves nothing, credits on a meter the
// catalog does not name, and a deployment with no catalog yet.

const percent = (percentOff: number): BillingCatalogDiscount => ({ id: 'd_pct', name: 'Percent', percentOff, duration: 'once', productIds: ['prod_pro'] })
const flat = (amountOff: Record<string, number>): BillingCatalogDiscount => ({ id: 'd_flat', name: 'Flat', amountOff, duration: 'once', productIds: ['prod_pack'] })

describe('offerOf', () => {
  it('takes a percentage off, rounded to the cent', () => {
    expect(offerOf(percent(20), 2900, 'usd')).toEqual({ amount: 2320, off: 580 })
    expect(offerOf(percent(15), 999, 'usd')).toEqual({ amount: 849, off: 150 })
  })

  it('takes a flat amount off in the price\'s own currency, whatever its case, never more than the price', () => {
    expect(offerOf(flat({ usd: 500 }), 2000, 'USD')).toEqual({ amount: 1500, off: 500 })
    expect(offerOf(flat({ usd: 5000 }), 2000, 'usd')).toEqual({ amount: 0, off: 2000 })
  })

  it('makes no offer where it takes nothing off: another currency, nothing off, or a price of nothing', () => {
    expect(offerOf(flat({ usd: 500 }), 2000, 'eur')).toBeUndefined()
    expect(offerOf(percent(0), 2900, 'usd')).toBeUndefined()
    expect(offerOf(percent(20), 0, 'usd')).toBeUndefined()
  })
})

describe('refusedDiscount', () => {
  it('is a provider refusal that names the discount, and no other', () => {
    expect(refusedDiscount({ detail: [{ loc: ['body', 'discount_id'], msg: 'Discount has ended' }] })).toBe(true)
    expect(refusedDiscount({ detail: [{ loc: ['body', 'products'] }, { loc: 'discount_id' }] })).toBe(false)
    expect(refusedDiscount({ detail: 'Discount has ended' })).toBe(false)
    expect(refusedDiscount(null)).toBe(false)
  })
})

describe('promotionOf', () => {
  it('shows a promotion\'s terms and dates, never its code', () => {
    const shown = promotionOf({ key: 'launch', id: 'd_1', name: 'Launch', code: 'LAUNCH20', percentOff: 20, duration: 'repeating', months: 3, startsAt: '2027-01-01T00:00:00.000Z', endsAt: '2027-02-01T00:00:00.000Z', productIds: ['prod_pro'] })
    expect(shown).toEqual({ key: 'launch', name: 'Launch', percentOff: 20, duration: 'repeating', months: 3, startsAt: '2027-01-01T00:00:00.000Z', endsAt: '2027-02-01T00:00:00.000Z' })
  })

  it('shows a flat promotion with no dates as just its name and duration', () => {
    expect(promotionOf({ key: 'packdeal', ...flat({ usd: 500 }), code: 'PACK5' })).toEqual({ key: 'packdeal', name: 'Flat', duration: 'once' })
  })
})

describe('the catalog\'s discounts at checkout', () => {
  const { requireDiscount, promotionNamed, discountOf } = createCatalogDiscounts({
    catalogIds: {
      discounts: {
        launch: { id: 'd_launch', name: 'Launch', code: 'Launch20', percentOff: 20, duration: 'once', productIds: ['prod_pro'] },
        founder: { id: 'd_founder', name: 'Founder', percentOff: 30, duration: 'forever', productIds: ['prod_pro'] },
      },
    },
  })
  const refusal = (call: () => unknown) => {
    try {
      call()
      return null
    }
    catch (error) {
      return getBackendError(error)
    }
  }

  it('finds a public promotion by its key, or by its code in any case, and nothing the server alone applies', () => {
    expect(promotionNamed('launch')?.id).toBe('d_launch')
    expect(promotionNamed('  LAUNCH20 ')?.id).toBe('d_launch')
    expect(promotionNamed('founder')).toBeUndefined()
    expect(promotionNamed('toString')).toBeUndefined()
    expect(discountOf('constructor')).toBeUndefined()
  })

  it('lets server code name any discount of the catalog, for a product it applies to, and says how to declare one it does not have', () => {
    expect(requireDiscount('founder', ['prod_pro'], { client: false }).id).toBe('d_founder')
    const unknown = refusal(() => requireDiscount('summer', ['prod_pro'], { client: false }))
    expect(unknown).toMatchObject({ code: 'invalid_input', data: { field: 'discount' } })
    expect(() => requireDiscount('summer', ['prod_pro'], { client: false })).toThrow(/declare it in billing\.catalog\.ts/)
    expect(() => requireDiscount('founder', ['prod_pack'], { client: false })).toThrow(/discount 'founder' applies to none of this checkout's products/)
  })

  it('lets a client name only a public promotion, refused as one the catalog does not have', () => {
    expect(requireDiscount('launch', ['prod_pro'], { client: true }).id).toBe('d_launch')
    expect(() => requireDiscount('founder', ['prod_pro'], { client: true })).toThrow(/names no public promotion of the catalog/)
  })
})

type Row = Parameters<typeof buildPricing>[0][number]

const row = (id: string, fields: Partial<Row> = {}): Row => ({
  id,
  name: id,
  description: null,
  isRecurring: false,
  isArchived: false,
  prices: [{ amountType: 'fixed', isArchived: false, priceAmount: 1000, priceCurrency: 'usd' }],
  ...fields,
})
const sources = (products: Record<string, string> | undefined, extra: Partial<PricingSources> = {}): PricingSources =>
  ({ products, retired: new Set(), hidden: new Set(), meterNames: new Map([['m_credits', 'credits']]), ...extra })

describe('buildPricing at its edges', () => {
  it('shows a free price as nothing, and leaves out a product whose fixed price has no amount', () => {
    const pricing = buildPricing([
      row('p_free', { isRecurring: true, recurringInterval: 'month', prices: [{ amountType: 'free', isArchived: false, priceCurrency: 'usd' }] }),
      row('p_broken', { isRecurring: true, recurringInterval: 'month', prices: [{ amountType: 'fixed', isArchived: false, priceCurrency: 'usd' }] }),
      row('pack_broken', { prices: [{ amountType: 'fixed', isArchived: false }] }),
    ], sources({ hobby: 'p_free', broken: 'p_broken', pack: 'pack_broken' }))
    expect(pricing.plans.map(plan => [plan.key, plan.free, plan.prices.month?.amount])).toEqual([['hobby', true, 0]])
    expect(pricing.packs).toEqual([])
  })

  it('says nothing is saved when the year costs as much as twelve months, or more', () => {
    const pricing = buildPricing([
      row('p_month', { isRecurring: true, recurringInterval: 'month', prices: [{ amountType: 'fixed', isArchived: false, priceAmount: 1000, priceCurrency: 'usd' }] }),
      row('p_year', { isRecurring: true, recurringInterval: 'year', prices: [{ amountType: 'fixed', isArchived: false, priceAmount: 12_000, priceCurrency: 'usd' }] }),
    ], sources({ 'pro': 'p_month', 'pro:year': 'p_year' }))
    expect(pricing.plans[0]!.prices.year).not.toHaveProperty('savings')
  })

  it('shows credits on a meter the catalog does not name without a meter, and compares packs on it as one meter', () => {
    const credits = (units: unknown, meterId?: unknown) => [{ type: 'meter_credit', description: 'credits', properties: { units, rollover: true, meterId } }]
    const pricing = buildPricing([
      row('small', { prices: [{ amountType: 'fixed', isArchived: false, priceAmount: 1000, priceCurrency: 'usd' }], benefits: credits(100, 'm_elsewhere') }),
      row('big', { prices: [{ amountType: 'fixed', isArchived: false, priceAmount: 1500, priceCurrency: 'usd' }], benefits: credits(300) }),
      row('odd', { benefits: credits('lots', 'm_credits') }),
    ], sources({ small: 'small', big: 'big', odd: 'odd' }))
    const [small, big, odd] = pricing.packs
    expect(small!.credits).toEqual({ units: 100, rollover: true })
    expect(big).toMatchObject({ credits: { units: 300, rollover: true }, isBestValue: true, lessPerCredit: 50 })
    // Units that are no number are no credits to show.
    expect(odd).not.toHaveProperty('credits')
  })

  it('reads a deployment with no catalog yet as nothing on sale', () => {
    expect(buildPricing([row('stray')], sources(undefined))).toEqual({ plans: [], packs: [], currencies: [] })
  })
})
