import { describe, expect, it } from 'vitest'
import { buildPricing, type PricingSources } from '../../src/convex/integrations/billing/pricing'

// What a pricing read adds to a plan from the generated ids, pure: each gift
// length at its purchase product's live price, and the free plan's welcome
// credits. The same read on the fake provider is in
// test/convex-component/billing-welcome-credits.test.ts.

/** A product row as the products table keeps it. */
function row(id: string, amount: number, fields: Record<string, unknown> = {}) {
  return { id, name: id, isRecurring: false, isArchived: false, prices: [{ amountType: 'fixed', isArchived: false, priceAmount: amount, priceCurrency: 'usd' }], ...fields }
}
const monthly = (id: string, amount: number, fields: Record<string, unknown> = {}) => row(id, amount, { isRecurring: true, recurringInterval: 'month', ...fields })

const sources = (extra: Partial<PricingSources> = {}): PricingSources => ({
  products: { free: 'p_free', pro: 'p_pro' },
  retired: new Set(),
  hidden: new Set(),
  meterNames: new Map(),
  free: 'free',
  passes: { pro: { pass: 'p_pass', months: { 1: 'p_g1', 3: 'p_g3', 12: 'p_g12' } } },
  ...extra,
})

describe('a priced plan\'s gift', () => {
  it('lists each length on sale at its live price, shortest first, with what it saves', () => {
    const rows = [monthly('p_free', 0), monthly('p_pro', 1000), row('p_g12', 10000), row('p_g1', 1000), row('p_g3', 3000)]
    const pro = buildPricing(rows, sources()).plans.find(plan => plan.key === 'pro')!
    expect(pro.gift).toEqual({
      lengths: [
        { months: 1, amount: 1000, currency: 'usd', monthly: 1000 },
        { months: 3, amount: 3000, currency: 'usd', monthly: 1000 },
        { months: 12, amount: 10000, currency: 'usd', monthly: 10000 / 12, savings: 16 },
      ],
    })
  })

  it('leaves out a length whose product is archived or not loaded, and saves nothing against another currency', () => {
    const rows = [monthly('p_pro', 1000), row('p_g1', 1000, { isArchived: true }), row('p_g3', 2500, { prices: [{ amountType: 'fixed', isArchived: false, priceAmount: 2500, priceCurrency: 'eur' }] })]
    expect(buildPricing(rows, sources()).plans.find(plan => plan.key === 'pro')!.gift).toEqual({ lengths: [{ months: 3, amount: 2500, currency: 'eur', monthly: 2500 / 3 }] })
  })

  it('is absent for a plan with no gift product loaded, and for a retired plan', () => {
    expect(buildPricing([monthly('p_pro', 1000)], sources()).plans[0]).not.toHaveProperty('gift')
    const retired = buildPricing([monthly('p_pro', 1000), row('p_g1', 1000)], sources({ retired: new Set(['p_pro']) }))
    expect(retired.plans[0]).toMatchObject({ retired: true })
    expect(retired.plans[0]).not.toHaveProperty('gift')
  })
})

describe('the free plan\'s welcome credits', () => {
  it('ride on the catalog\'s free plan alone, with the meter\'s unit', () => {
    const rows = [monthly('p_free', 0), monthly('p_pro', 1000)]
    const unit = { one: 'coin', other: 'coins' }
    const pricing = buildPricing(rows, sources({ welcome: { meter: 'coins', units: 8 }, meterUnits: new Map([['coins', unit]]) }))
    expect(pricing.plans.find(plan => plan.key === 'free')!.welcome).toEqual({ meter: 'coins', unit, units: 8 })
    expect(pricing.plans.find(plan => plan.key === 'pro')).not.toHaveProperty('welcome')
    expect(buildPricing(rows, sources()).plans.find(plan => plan.key === 'free')).not.toHaveProperty('welcome')
  })
})
