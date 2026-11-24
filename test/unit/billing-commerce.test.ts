import { describe, expect, test, vi } from 'vitest'
import type { BillingCatalog } from '../../src/convex/catalog'
import { adapterCatalogIds, applyCommerceUpdate, catalogProductOf, catalogProductRows, commerceFailure, commerceModeOf, type CommerceMode, localPlanProductId, refusingPolarClient } from '../../src/convex/integrations/billing/commerce'
import { ProviderHttpError, ProviderUnsupportedError, type CommerceProvider } from '../../src/convex/integrations/billing/providers/types'
import { getBackendError } from '../../src/convex/errors'

// Adapter mode's pure parts (commerce.ts): the id map and the product rows
// it derives from the catalog definition, what a product id sells, the
// refusals at the package boundary, and the lifecycle arms it maps onto an
// adapter's calls. The end-to-end flows run in
// test/convex-component/billing-commerce.test.ts.

const CATALOG: BillingCatalog = {
  currency: 'usd',
  meters: { credits: {}, renders: { aggregation: 'count' } },
  plans: {
    free: { name: 'Free', prices: { month: 0 }, credits: { meter: 'credits', units: 20, once: true } },
    pro: { name: 'Pro', prices: { usd: { month: 1200, year: 12000 }, eur: { month: 1100 } }, credits: { meter: 'credits', units: 400 }, features: ['priority'], quotas: { projects: 'unlimited' }, trial: { interval: 'day', count: 7 } },
    team: { name: 'Team', prices: { month: 4900, year: 49000 }, credits: { meter: 'credits', units: 1000, rollover: true }, meterCycle: 'month' },
    legacy: { name: 'Legacy', prices: { month: 900 }, retired: true },
  },
  packs: { credits100: { name: '100 credits', price: 500, credits: { meter: 'credits', units: 100 } } },
  features: { priority: { description: 'Priority queue' } },
  quotas: { projects: { description: 'Projects' } },
}

const IDS = { 'pro': 'price_pro', 'pro:year': 'price_pro_y', 'team:year': 'price_team_y', 'legacy': 'price_legacy', 'credits100': 'price_pack' }

describe('the id map adapter mode derives from the catalog', () => {
  const ids = adapterCatalogIds(CATALOG, IDS)

  test('names each product the app gave an id, the free plan a local one, and nothing it gave none', () => {
    expect(ids.products).toEqual({ ...IDS, free: localPlanProductId('free') })
    expect(ids.plans).toEqual({ free: { month: 'local:plan:free' }, pro: { month: 'price_pro', year: 'price_pro_y' }, team: { year: 'price_team_y' }, legacy: { month: 'price_legacy' } })
    expect(ids).toMatchObject({ free: 'free', packs: ['credits100'], retired: ['legacy'], welcome: { meter: 'credits', units: 20 }, quotas: { projects: 'Projects' }, currency: 'usd' })
  })

  test('keys each meter by its catalog key, a count meter with no property', () => {
    expect(ids.meters).toEqual({ credits: { meterId: 'credits', eventName: 'credits', property: 'amount' }, renders: { meterId: 'renders', eventName: 'renders' } })
  })

  test('leaves out the currency and the welcome credits of a catalog without them', () => {
    const plain = adapterCatalogIds({ plans: { pro: { name: 'Pro', prices: { month: 100 } } } }, { pro: 'p' })
    expect(plain).toEqual({ products: { pro: 'p' }, plans: { pro: { month: 'p' } }, meters: {} })
  })
})

describe('the product rows adapter mode writes for pricing, features and quotas', () => {
  const ids = adapterCatalogIds(CATALOG, IDS)
  const rows = catalogProductRows(CATALOG, ids)
  const row = (id: string) => rows.find(entry => entry.id === id)!

  test('prices a plan in every currency the catalog names at its interval, with its trial', () => {
    expect(row('price_pro').prices.map(price => [price.priceCurrency, price.priceAmount])).toEqual([['usd', 1200], ['eur', 1100]])
    expect(row('price_pro_y').prices.map(price => [price.priceCurrency, price.priceAmount])).toEqual([['usd', 12000]])
    expect(row('price_pro')).toMatchObject({ isRecurring: true, recurringInterval: 'month', trialInterval: 'day', trialIntervalCount: 7, isArchived: false })
    expect(row('price_legacy').isArchived).toBe(true)
  })

  test('grants a plan its features, its quotas and its credits per cycle, a year\'s on the yearly price', () => {
    const benefits = row('price_pro').benefits
    expect(benefits.map(benefit => benefit.metadata)).toEqual([{ key: 'priority' }, { key: 'pro-quotas', quota_projects: 'unlimited' }, { key: 'pro-credits' }])
    expect(benefits[2]!.properties).toEqual({ units: 400, rollover: false, meterId: 'credits' })
    expect(row('price_pro_y').benefits[2]!.properties).toEqual({ units: 4800, rollover: false, meterId: 'credits' })
    // On a monthly meter cycle a yearly price grants a month's at a time.
    expect(row('price_team_y').benefits[0]!.properties).toEqual({ units: 1000, rollover: true, meterId: 'credits' })
  })

  test('makes the free plan free and grants its welcome credits no benefit, and a pack its credits once, kept', () => {
    expect(row('local:plan:free')).toMatchObject({ isRecurring: true, prices: [{ amountType: 'free', priceAmount: 0 }], benefits: [], trialInterval: null })
    expect(row('price_pack')).toMatchObject({ isRecurring: false, recurringInterval: null, prices: [{ type: 'one_time', priceAmount: 500 }] })
    expect(row('price_pack').benefits[0]!.properties).toEqual({ units: 100, rollover: true, meterId: 'credits' })
  })

  test('reads back what a product id sells', () => {
    expect(catalogProductOf(CATALOG, ids, 'price_pro_y')).toMatchObject({ kind: 'plan', key: 'pro', interval: 'year' })
    expect(catalogProductOf(CATALOG, ids, 'price_pack')).toEqual({ kind: 'pack', key: 'credits100' })
    expect(catalogProductOf(CATALOG, ids, 'price_other')).toBeNull()
    expect(catalogProductOf(CATALOG, ids, null)).toBeNull()
  })
})

describe('adapter mode at the package boundary', () => {
  test('refuses a call the provider has no API for with its hint, a refused request as worth a retry', () => {
    const unsupported = getBackendError(commerceFailure(new ProviderUnsupportedError('creem', 'refund an order', 'refund it in the dashboard.'), 'refund'))
    expect(unsupported).toMatchObject({ code: 'unavailable', data: { service: 'billing', reason: 'provider_unsupported' } })
    expect(getBackendError(commerceFailure(new ProviderHttpError('stripe', 'checkout', 500), 'checkout'))?.data).toMatchObject({ reason: 'provider_refused' })
    const own = new Error('own')
    expect(commerceFailure(own, 'x')).toBe(own)
    expect(commerceFailure('text', 'x').message).toBe('text')
  })

  test('refuses every use of the Polar client, past the probes a promise makes', () => {
    const client = refusingPolarClient<{ _options: unknown, then?: unknown }>('dodo')
    expect(client.then).toBeUndefined()
    expect(() => client._options).toThrow(/Polar's for now — dodo billing does not offer it/)
  })

  test('needs the catalog and the component\'s records on an adapter provider, and is off on Polar', () => {
    const components = { backend: { commerce: {} } } as never
    expect(commerceModeOf(components, {}, undefined, 'sandbox', 'k')).toBeNull()
    expect(commerceModeOf(components, {}, 'polar', 'sandbox', 'k')).toBeNull()
    expect(() => commerceModeOf(components, {}, 'stripe', 'sandbox', 'k')).toThrow(/needs `commerce: \{ definition, products \}`/)
    expect(() => commerceModeOf({ backend: {} } as never, { commerce: { definition: CATALOG, products: {} } }, 'dodo', 'sandbox', 'k')).toThrow(/no commerce records/)
    const mode = commerceModeOf(components, { commerce: { definition: CATALOG, products: { production: IDS } } }, 'creem', 'production', 'k')!
    expect(mode.ids.products?.pro).toBe('price_pro')
    expect(mode.client().name).toBe('creem')
    expect(mode.client()).toBe(mode.client())
  })
})

describe('a lifecycle change on an adapter provider', () => {
  const adapter = (): CommerceProvider => ({
    name: 'dodo',
    changePlan: vi.fn(async () => {}),
    cancelSubscription: vi.fn(async () => {}),
    uncancelSubscription: vi.fn(async () => {}),
    pauseSubscription: vi.fn(async () => {}),
    resumeSubscription: vi.fn(async () => {}),
    getSubscription: vi.fn(async () => ({ id: 'sub_1', customerId: 'c', entityId: 'e', productId: 'p', status: 'active' as const, cancelAtPeriodEnd: true, currentPeriodEnd: Date.UTC(2027, 0, 1), metadata: {} })),
  }) as unknown as CommerceProvider
  const modeOf = (client: CommerceProvider) => ({ name: 'dodo', client: () => client }) as unknown as CommerceMode

  test('maps each of Polar\'s update arms onto the adapter\'s call, and reads the subscription back', async () => {
    const client = adapter()
    const mode = modeOf(client)
    await applyCommerceUpdate(mode, 'sub_1', { productId: 'p2', prorationBehavior: 'next_period' }, 'plan change')
    expect(client.changePlan).toHaveBeenCalledWith({ subscriptionId: 'sub_1', productId: 'p2', proration: 'next_period' })
    await applyCommerceUpdate(mode, 'sub_1', { productId: 'p2', prorationBehavior: 'invoice' }, 'plan change')
    expect(client.changePlan).toHaveBeenLastCalledWith({ subscriptionId: 'sub_1', productId: 'p2', proration: 'immediately' })
    await applyCommerceUpdate(mode, 'sub_1', { revoke: true }, 'cancellation')
    expect(client.cancelSubscription).toHaveBeenCalledWith('sub_1', { immediately: true })
    const canceled = await applyCommerceUpdate(mode, 'sub_1', { cancelAtPeriodEnd: true }, 'cancellation')
    expect(client.cancelSubscription).toHaveBeenLastCalledWith('sub_1')
    expect(canceled.endsAt).toEqual(new Date(Date.UTC(2027, 0, 1)))
    await applyCommerceUpdate(mode, 'sub_1', { cancelAtPeriodEnd: false }, 'uncancellation')
    expect(client.uncancelSubscription).toHaveBeenCalledWith('sub_1')
    await applyCommerceUpdate(mode, 'sub_1', { pauseAtPeriodEnd: true }, 'pause')
    expect(client.pauseSubscription).toHaveBeenCalledWith('sub_1')
    await applyCommerceUpdate(mode, 'sub_1', { resume: true }, 'resume')
    expect(client.resumeSubscription).toHaveBeenCalledWith('sub_1')
  })

  test('refuses what the adapters have no call for, before the provider is asked', async () => {
    const client = adapter()
    for (const update of [{ pendingUpdate: null }, { discountId: 'd' }, {}]) {
      const refusal = await applyCommerceUpdate(modeOf(client), 'sub_1', update, 'change').catch((error: unknown) => error)
      expect(getBackendError(refusal)?.data).toMatchObject({ reason: 'provider_unsupported' })
    }
    expect(client.getSubscription).not.toHaveBeenCalled()
  })

  test('reads an ended subscription back as canceled, ending now', async () => {
    const client = adapter()
    vi.mocked(client.getSubscription).mockResolvedValueOnce({ id: 'sub_1', customerId: null, entityId: null, productId: null, status: 'ended', cancelAtPeriodEnd: false, currentPeriodEnd: null, metadata: {} })
    const ended = await applyCommerceUpdate(modeOf(client), 'sub_1', { revoke: true }, 'cancellation')
    expect(ended).toMatchObject({ status: 'canceled', currentPeriodEnd: null })
    expect(ended.endsAt).toBeInstanceOf(Date)
  })
})
