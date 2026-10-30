import { describe, expect, it } from 'vitest'
import { featureKeyOf, grantsFeature } from '../../src/convex/catalog'
import { buildPricing, type PricingSources } from '../../src/convex/integrations/billing/pricing'

// `getPricing`'s reading of the products table, as a pure function: plans
// grouped from their interval products, packs compared credit for credit,
// and every figure the live row's.

type Row = Parameters<typeof buildPricing>[0][number]

/** A product row as the billing component keeps it. */
function row(id: string, fields: Partial<Row> & { amount?: number, currency?: string, credits?: { units: number, rollover?: boolean, meterId?: string } } = {}): Row {
  const { amount = 1000, currency = 'usd', credits, ...rest } = fields
  return {
    id,
    name: id,
    description: null,
    isRecurring: false,
    isArchived: false,
    prices: [{ amountType: 'fixed', isArchived: false, priceAmount: amount, priceCurrency: currency }],
    benefits: credits ? [{ type: 'meter_credit', description: 'credits', properties: { units: credits.units, rollover: credits.rollover ?? true, meterId: credits.meterId ?? 'm_credits' } }] : [],
    ...rest,
  }
}

const sources = (products: Record<string, string>, extra: Partial<PricingSources> = {}): PricingSources =>
  ({ products, retired: new Set(), hidden: new Set(), meterNames: new Map([['m_credits', 'credits']]), ...extra })

describe('buildPricing', () => {
  it('groups a plan\'s interval products, and works out what the year saves', () => {
    const pricing = buildPricing([
      row('p_month', { name: 'Pro', isRecurring: true, recurringInterval: 'month', amount: 2900, trialInterval: 'day', trialIntervalCount: 14 }),
      row('p_year', { name: 'Pro', isRecurring: true, recurringInterval: 'year', amount: 29000 }),
    ], sources({ 'pro': 'p_month', 'pro:year': 'p_year' }))
    expect(pricing.plans).toEqual([{
      key: 'pro',
      name: 'Pro',
      description: null,
      retired: false,
      features: [],
      featureKeys: [],
      quotas: {},
      prices: {
        month: { productId: 'p_month', amount: 2900, currency: 'usd', monthly: 2900, trial: { interval: 'day', count: 14 } },
        year: { productId: 'p_year', amount: 29000, currency: 'usd', monthly: 29000 / 12, savings: 16 },
      },
    }])
  })

  it('reads a map from before plans had intervals by each product\'s own billing interval', () => {
    const pricing = buildPricing([
      row('p_pro', { isRecurring: true, recurringInterval: 'month', amount: 900 }),
      row('p_annual', { isRecurring: true, recurringInterval: 'year', amount: 9000 }),
    ], sources({ pro: 'p_pro', annual: 'p_annual' }))
    expect(pricing.plans.map(plan => [plan.key, Object.keys(plan.prices)])).toEqual([['pro', ['month']], ['annual', ['year']]])
    // No monthly price beside it: nothing saved to say.
    expect(pricing.plans[1]!.prices.year).not.toHaveProperty('savings')
  })

  it('marks a plan retired when none of its products sells, and keeps it listed', () => {
    const pricing = buildPricing([
      row('l_month', { isRecurring: true, recurringInterval: 'month', isArchived: true }),
      row('o_month', { isRecurring: true, recurringInterval: 'month' }),
    ], sources({ legacy: 'l_month', old: 'o_month' }, { retired: new Set(['o_month']) }))
    expect(pricing.plans.map(plan => [plan.key, plan.retired])).toEqual([['legacy', true], ['old', true]])
    // Every price of a retired plan is its subscribers' alone.
    expect(pricing.plans.map(plan => plan.prices.month!.archived)).toEqual([true, true])
  })

  it('marks a live plan\'s archived price, so nothing offers it, and saves nothing against it', () => {
    const pricing = buildPricing([
      row('p_month', { name: 'Pro (old)', isRecurring: true, recurringInterval: 'month', amount: 2900, isArchived: true }),
      row('p_year', { name: 'Pro', isRecurring: true, recurringInterval: 'year', amount: 29000 }),
    ], sources({ 'pro': 'p_month', 'pro:year': 'p_year' }))
    const [pro] = pricing.plans
    expect(pro).toMatchObject({ key: 'pro', name: 'Pro', retired: false })
    expect(pro!.prices.month).toMatchObject({ productId: 'p_month', archived: true })
    expect(pro!.prices.year).not.toHaveProperty('archived')
    expect(pro!.prices.year).not.toHaveProperty('savings')
  })

  it('reads the features and the credits of each price off its live benefits', () => {
    const pricing = buildPricing([
      row('p', { isRecurring: true, recurringInterval: 'month', credits: { units: 500, rollover: false }, benefits: [
        { type: 'meter_credit', description: '500 credits', properties: { units: 500, rollover: false, meterId: 'm_credits' } },
        { type: 'feature_flag', description: 'Priority support' },
        { type: 'license_keys', description: 'A license' },
      ] }),
    ], sources({ pro: 'p' }))
    expect(pricing.plans[0]!.features).toEqual(['Priority support'])
    expect(pricing.plans[0]!.prices.month!.credits).toEqual({ meter: 'credits', units: 500, rollover: false })
  })

  it('lists the key every price on sale grants a gate by, credits included, as featureKeys', () => {
    const keyed = (id: string, key?: string) => ({ id, type: 'feature_flag', description: id, ...(key ? { metadata: { managedBy: 'nuxt-backend', key } } : {}) })
    const pricing = buildPricing([
      row('p_month', { isRecurring: true, recurringInterval: 'month', benefits: [keyed('b_reports', 'reports'), keyed('b_plain'), { id: 'b_credits', type: 'meter_credit', description: 'credits', metadata: { key: 'pro-credits' } }] }),
      row('p_year', { isRecurring: true, recurringInterval: 'year', benefits: [keyed('b_reports', 'reports'), keyed('b_audit', 'audit')] }),
      // An archived price grants nothing anyone can buy any more.
      row('o_month', { isRecurring: true, recurringInterval: 'month', isArchived: true, benefits: [keyed('b_old', 'old')] }),
      row('o_year', { isRecurring: true, recurringInterval: 'year', benefits: [keyed('b_reports', 'reports')] }),
      // A retired plan keeps the keys of all its prices.
      row('l_month', { isRecurring: true, recurringInterval: 'month', isArchived: true, benefits: [keyed('b_legacy', 'legacy')] }),
    ], sources({ 'pro': 'p_month', 'pro:year': 'p_year', 'other': 'o_month', 'other:year': 'o_year', 'legacy': 'l_month' }))
    expect(pricing.plans.map(plan => [plan.key, plan.featureKeys])).toEqual([
      ['pro', ['reports', 'b_plain', 'pro-credits', 'audit']],
      ['other', ['reports']],
      ['legacy', ['legacy']],
    ])
  })

  it('names a benefit by its live metadata where the cache has a snapshot, as the gate does, over the row\'s copy', () => {
    const benefits = [
      { id: 'b_reports', type: 'feature_flag', description: 'Reports', metadata: { key: 'reports' } },
      // Re-keyed in the dashboard: the snapshot has the new key before the products are synced again.
      { id: 'b_renamed', type: 'feature_flag', description: 'Audit', metadata: { key: 'audit' } },
      // A key given to a benefit that had none.
      { id: 'b_plain', type: 'feature_flag', description: 'Plain' },
    ]
    const pricing = buildPricing([row('p_month', { isRecurring: true, recurringInterval: 'month', benefits })], sources({ pro: 'p_month' }, {
      benefitMetadata: new Map([['b_renamed', { key: 'audit-log' }], ['b_plain', { key: 'plain' }]]),
    }))
    expect(pricing.plans[0]!.featureKeys).toEqual(['reports', 'audit-log', 'plain'])
  })

  it('lists each plan\'s quotas from the prices on sale, the most any benefit allows, and keeps the benefit carrying them out of its features', () => {
    const quotas = (id: string, metadata: Record<string, unknown>) => ({ id, type: 'feature_flag', description: `${id} limits`, metadata: { managedBy: 'nuxt-backend', key: id, ...metadata } })
    const pricing = buildPricing([
      row('p_month', { isRecurring: true, recurringInterval: 'month', benefits: [quotas('pro-quotas', { quota_projects: 10 }), { id: 'b_reports', type: 'feature_flag', description: 'Reports', metadata: { key: 'reports' } }] }),
      // A dashboard add-on on the yearly price: the larger limit wins, never the sum.
      row('p_year', { isRecurring: true, recurringInterval: 'year', benefits: [quotas('pro-quotas', { quota_projects: 10 }), quotas('extra', { quota_projects: 25, quota_exports: 'unlimited' })] }),
      // An archived price allows nothing anyone can buy any more; a retired plan keeps all of its.
      row('o_month', { isRecurring: true, recurringInterval: 'month', isArchived: true, benefits: [quotas('old', { quota_projects: 99 })] }),
      row('o_year', { isRecurring: true, recurringInterval: 'year', benefits: [quotas('other-quotas', { quota_projects: 1 })] }),
      row('l_month', { isRecurring: true, recurringInterval: 'month', isArchived: true, benefits: [quotas('legacy-quotas', { quota_projects: 5 })] }),
      // A plan that dropped its quotas keeps its benefit, cleared: no quota, and no feature either.
      row('d_month', { isRecurring: true, recurringInterval: 'month', benefits: [quotas('dropped-quotas', {})] }),
    ], sources({ 'pro': 'p_month', 'pro:year': 'p_year', 'other': 'o_month', 'other:year': 'o_year', 'legacy': 'l_month', 'dropped': 'd_month' }, {
      // A limit pushed since the products were synced: the snapshot wins, as the gate reads it.
      benefitMetadata: new Map([['legacy-quotas', { key: 'legacy-quotas', quota_projects: 6 }]]),
    }))
    expect(pricing.plans.map(plan => [plan.key, plan.quotas, plan.features])).toEqual([
      ['pro', { projects: 25, exports: 'unlimited' }, ['Reports']],
      ['other', { projects: 1 }, []],
      ['legacy', { projects: 6 }, []],
      ['dropped', {}, []],
    ])
  })

  it('prices the whole table in a currency every product is priced in, never some in one and some in another', () => {
    const priced = (id: string, amounts: Record<string, number>, extra: Partial<Row> = {}) => row(id, {
      ...extra,
      prices: Object.entries(amounts).map(([currency, amount]) => ({ amountType: 'fixed', isArchived: false, priceAmount: amount, priceCurrency: currency })),
    })
    // The plan was created in the organization's default currency only; the pack sells in both.
    const rows = [priced('p_studio', { eur: 1200 }, { isRecurring: true, recurringInterval: 'month' } as Partial<Row>), priced('p_pack', { usd: 1100, eur: 1000 })]
    const pricing = buildPricing(rows, sources({ studio: 'p_studio', credits100: 'p_pack' }, { currencies: ['usd'] }))
    expect(pricing.currencies).toEqual(['eur'])
    expect(pricing.currency).toBe('eur')
    expect(pricing.packs.map(pack => pack.currency)).toEqual(['eur'])
    expect(pricing.plans.flatMap(plan => Object.values(plan.prices).map(price => price!.currency))).toEqual(['eur'])
  })

  it('compares packs credit for credit on one meter and currency, and marks the one cheapest', () => {
    const pricing = buildPricing([
      row('small', { amount: 1000, credits: { units: 100 } }),
      row('big', { amount: 4000, credits: { units: 500 } }),
      row('euro', { amount: 900, currency: 'eur', credits: { units: 100 } }),
    ], sources({ small: 'small', big: 'big', euro: 'euro' }))
    const [small, big, euro] = pricing.packs
    expect(small).toMatchObject({ perCredit: 10, isBestValue: false })
    expect(small).not.toHaveProperty('lessPerCredit')
    expect(big).toMatchObject({ perCredit: 8, lessPerCredit: 20, isBestValue: true })
    // Alone in its currency: compared with nothing.
    expect(euro).toMatchObject({ perCredit: 9, isBestValue: false })
    expect(euro).not.toHaveProperty('lessPerCredit')
  })

  it('leaves out of the comparison a pack whose credits lapse, a free one, and one with no single credit benefit', () => {
    const pricing = buildPricing([
      row('lapsing', { amount: 500, credits: { units: 100, rollover: false } }),
      row('free', { amount: 0, credits: { units: 100 } }),
      row('none', { amount: 500 }),
      row('a', { amount: 1000, credits: { units: 100 } }),
      row('b', { amount: 2000, credits: { units: 200 } }),
    ], sources({ lapsing: 'lapsing', free: 'free', none: 'none', a: 'a', b: 'b' }))
    for (const pack of pricing.packs.slice(0, 3)) expect(pack).not.toHaveProperty('perCredit')
    // A tie for the cheapest is no best value.
    expect(pricing.packs.slice(3).map(pack => [pack.perCredit, pack.isBestValue])).toEqual([[10, false], [10, false]])
  })

  it('leaves out gift and pass twins, archived packs, rows not loaded yet and prices it can\'t show', () => {
    const pricing = buildPricing([
      row('pack', { credits: { units: 100 } }),
      row('twin', { metadata: { giftOf: 'pack' } }),
      row('pass', { metadata: { passOf: 'pro' } }),
      row('hidden'),
      row('archived', { isArchived: true }),
      row('custom', { prices: [{ amountType: 'custom', isArchived: false }] }),
      row('weekly', { isRecurring: true, recurringInterval: 'week' }),
    ], sources({ pack: 'pack', twin: 'twin', pass: 'pass', hidden: 'hidden', archived: 'archived', custom: 'custom', weekly: 'weekly', ghost: 'not_loaded' }, { hidden: new Set(['hidden']) }))
    expect(pricing.packs.map(pack => pack.key)).toEqual(['pack'])
    expect(pricing.plans).toEqual([])
  })
})

describe('the feature match', () => {
  const managed = { benefitId: 'b_1', metadata: { managedBy: 'nuxt-backend', key: 'reports' } }

  it('knows a benefit by its key, else its benefit id', () => {
    expect(featureKeyOf(managed)).toBe('reports')
    expect(featureKeyOf({ benefitId: 'b_2' })).toBe('b_2')
    expect(featureKeyOf({ benefitId: 'b_3', metadata: { key: '' } })).toBe('b_3')
    expect(featureKeyOf({ benefitId: 'b_4', metadata: { key: 7 } })).toBe('b_4')
  })

  it('matches that one name and nothing else: not the id of a keyed benefit, nor another metadata value', () => {
    expect(grantsFeature(managed, 'reports')).toBe(true)
    expect(grantsFeature(managed, 'b_1')).toBe(false)
    expect(grantsFeature(managed, 'nuxt-backend')).toBe(false)
    expect(grantsFeature({ benefitId: 'b_2' }, 'b_2')).toBe(true)
    expect(grantsFeature({ benefitId: '' }, '')).toBe(false)
  })
})
