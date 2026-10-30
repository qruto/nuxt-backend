import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getFunctionName, type FunctionReference } from 'convex/server'
import { syncBillingCatalog } from '../../src/cli/billing/sync'
import { deletionGuardsOf, entityListenersOf, type EntityCreatedListener } from '../../src/convex/client/entities'
import { registerBackendRoutes } from '../../src/convex/integrations/http'
import { createPolarFake, type PolarFake } from '../fixtures/polar-fake/server'
import { freePlanOf, isFreePlan, type BillingCatalog } from '../../src/convex/catalog'
import { isFreePlanEvent } from '../../src/convex/integrations/billing/events'
import { buildPricing, type PricingSources } from '../../src/convex/integrations/billing/pricing'
import { parseBillingEvent } from '../../src/convex/integrations/billing/provider-events'
import { verifyWebhookSignature } from '../../src/convex/webhook-signatures'
import { foldFreePlanDeliveries } from '../../src/runtime/devtools/webhook-feed'
import { currencyOfCountry, visitorCurrency } from '../../src/runtime/vue/utils/currency'
import { freePlanWebhooks } from '../fixtures/free-plan-webhooks'
import { authFlow } from '../helpers/auth-flow'

// The free plan as a real subscription and prices in several currencies, as
// far as they are pure or reach only the fake provider: the catalog's
// rules, what `billing sync` makes of them, the pricing read, the visitor's
// currency, and the free plan's deliveries — the fixture the audit trail and
// notifications test against.

const BASE = 'http://127.0.0.1:4791'

const sync = (catalog: BillingCatalog, dryRun = false) =>
  syncBillingCatalog(catalog, { rootDir: '.', environment: 'sandbox', accessToken: 'polar_oat_fake', dryRun, adopt: {} })

describe('the free plan in the catalog', () => {
  it('is the one plan priced at nothing, never a retired one', () => {
    const catalog: BillingCatalog = {
      plans: {
        legacy: { name: 'Old free', prices: { month: 0 }, retired: true },
        free: { name: 'Free', prices: { month: 0 } },
        pro: { name: 'Pro', prices: { usd: { month: 2900 }, eur: { month: 2700 } } },
      },
    }
    expect(freePlanOf(catalog)?.[0]).toBe('free')
    expect(isFreePlan(catalog.plans!.pro!)).toBe(false)
    expect(freePlanOf({ plans: { pro: catalog.plans!.pro! } })).toBeUndefined()
  })
})

describe('billing sync of a free plan and of prices in several currencies', () => {
  let fake: PolarFake

  beforeEach(() => {
    fake = createPolarFake({ baseUrl: BASE, fetcher: async () => new Response('Accepted', { status: 202 }) })
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => fake.handle(new Request(input, init)))
  })

  afterEach(async () => {
    await fake.idle()
    fake.close()
    vi.unstubAllGlobals()
  })

  it.each<[string, BillingCatalog, string]>([
    ['two free plans', { plans: { free: { name: 'Free', prices: { month: 0 } }, hobby: { name: 'Hobby', prices: { month: 0 } } } }, 'are all free plans'],
    ['a yearly free price', { plans: { free: { name: 'Free', prices: { month: 0, year: 0 } } } }, 'priced once, by the month'],
    ['a free plan in several currencies', { plans: { free: { name: 'Free', prices: { usd: { month: 0 }, eur: { month: 0 } } } } }, 'priced once, by the month'],
    ['a free plan with a trial', { plans: { free: { name: 'Free', prices: { month: 0 }, trial: { interval: 'day', count: 7 } } } }, 'no trial to offer'],
    ['a free plan with usage', { meters: { credits: {} }, plans: { free: { name: 'Free', prices: { month: 0 }, usage: [{ meter: 'credits', unitAmount: 5 }] } } }, 'can\'t bill `usage`'],
    ['a plan free at one interval only', { plans: { pro: { name: 'Pro', prices: { month: 0, year: 29000 } } } }, 'priced 0 somewhere and above 0 elsewhere'],
    ['a price that is no whole number of cents', { plans: { pro: { name: 'Pro', prices: { month: 29.5 } } } }, 'no whole number of cents'],
    ['a currency that is no code', { plans: { pro: { name: 'Pro', prices: { dollars: { month: 2900 } } } } }, 'no ISO 4217 currency code'],
    ['currencies that price other intervals', { plans: { pro: { name: 'Pro', prices: { usd: { month: 2900, year: 29000 }, eur: { month: 2700 } } } } }, 'other intervals in each currency'],
    ['usage on a plan in several currencies', { meters: { credits: {} }, plans: { pro: { name: 'Pro', prices: { usd: { month: 2900 }, eur: { month: 2700 } }, usage: [{ meter: 'credits', unitAmount: 5 }] } } }, 'billed in one currency'],
    ['no price in the catalog\'s currency', { currency: 'usd', packs: { pack: { name: 'Pack', price: { eur: 900 }, credits: { meter: 'credits', units: 10 } } } }, 'no price in usd'],
    ['no price in the organization\'s currency', { plans: { pro: { name: 'Pro', prices: { eur: { month: 2700 }, gbp: { month: 2300 } } } } }, 'no price in usd'],
  ])('refuses %s before the provider hears of it', async (_name, catalog, message) => {
    await expect(sync(catalog)).rejects.toThrow(message)
    expect(Object.keys(fake.state.products)).toEqual([])
  })

  it('makes the free plan a $0 monthly product, recorded as the free plan', async () => {
    const { ids } = await sync({ meters: { credits: {} }, plans: { free: { name: 'Free', prices: { month: 0 }, credits: { meter: 'credits', units: 10 } }, pro: { name: 'Pro', prices: { month: 2900 } } } })
    expect(ids.free).toBe('free')
    // One currency: no default to name.
    expect(ids).not.toHaveProperty('currency')
    const product = fake.state.products[ids.plans!.free!.month!]!
    expect(product).toMatchObject({ recurringInterval: 'month', trialInterval: null })
    expect(product.prices.map(price => [price.amountType, price.priceAmount, price.priceCurrency])).toEqual([['fixed', 0, 'usd']])
    expect(product.benefitIds).toHaveLength(1)
  })

  it('records no free plan for a retired one, nor before its product exists', async () => {
    expect((await sync({ plans: { free: { name: 'Free', prices: { month: 0 } } } }, true)).ids).not.toHaveProperty('free')
    expect((await sync({ plans: { free: { name: 'Free', prices: { month: 0 }, retired: true } } })).ids).not.toHaveProperty('free')
  })

  it('prices each product in every currency, and adds a currency to products that exist', async () => {
    const single: BillingCatalog = {
      meters: { credits: {} },
      plans: { pro: { name: 'Pro', prices: { month: 2900, year: 29000 } } },
      packs: { credits500: { name: '500 credits', price: 4000, credits: { meter: 'credits', units: 500 } } },
    }
    await sync(single)
    const both: BillingCatalog = {
      ...single,
      plans: { pro: { name: 'Pro', prices: { usd: { month: 2900, year: 29000 }, eur: { month: 2700, year: 27000 } } } },
      packs: { credits500: { ...single.packs!.credits500!, price: { usd: 4000, eur: 3600 } } },
    }
    const preview = await sync(both, true)
    expect(preview.log.filter(entry => entry.action === 'would-update').map(entry => [entry.key, entry.note])).toEqual([
      ['pro', 'adds its price in eur'],
      ['pro:year', 'adds its price in eur'],
      ['credits500', 'adds its price in eur'],
      // The gift twin follows the pack's live prices, once the pack has them.
    ])
    const { ids, log } = await sync(both)
    expect(ids.currency).toBe('usd')
    const prices = (id: string) => fake.state.products[id]!.prices.filter(price => !price.isArchived).map(price => `${price.priceAmount} ${price.priceCurrency}`)
    expect(prices(ids.products['pro:year']!)).toEqual(['29000 usd', '27000 eur'])
    expect(prices(ids.products.credits500!)).toEqual(['4000 usd', '3600 eur'])
    // The existing prices kept: nobody's order or subscription moves.
    expect(fake.state.products[ids.products.pro!]!.prices.every(price => !price.isArchived)).toBe(true)
    expect(log).toContainEqual(expect.objectContaining({ action: 'updated', key: 'credits500-gift', note: 'priced 4000 usd, the pack is 4000 usd, 3600 eur' }))
    expect(prices(ids.gifts!.credits500!)).toEqual(['4000 usd', '3600 eur'])
    // Then nothing is left to add, and an amount changed in one currency is drift.
    const again = await sync({ ...both, packs: { credits500: { ...both.packs!.credits500!, price: { usd: 4000, eur: 3900 } } } })
    expect(again.log.filter(entry => entry.action === 'updated')).toEqual([])
    expect(again.log).toContainEqual(expect.objectContaining({ action: 'drift', key: 'credits500', note: expect.stringContaining('priced 3600 eur, catalog says 3900 eur') }))
  })
})

type Row = Parameters<typeof buildPricing>[0][number]

/** A product row priced in each of `prices` (currency → amount). */
function row(id: string, prices: Record<string, number>, fields: Partial<Row> = {}): Row {
  return {
    id,
    name: id,
    description: null,
    isRecurring: true,
    isArchived: false,
    recurringInterval: 'month',
    prices: Object.entries(prices).map(([currency, amount]) => ({ amountType: 'fixed', isArchived: false, priceAmount: amount, priceCurrency: currency })),
    benefits: [],
    ...fields,
  }
}

const sources = (extra: Partial<PricingSources> = {}): PricingSources => ({
  products: { free: 'p_free', pro: 'p_pro', pack: 'p_pack' },
  retired: new Set(),
  hidden: new Set(),
  meterNames: new Map(),
  free: 'free',
  catalogCurrency: 'usd',
  ...extra,
})

describe('the pricing read in the visitor\'s currency', () => {
  const rows = [
    row('p_free', { usd: 0 }),
    row('p_pro', { usd: 2900, eur: 2700 }),
    row('p_pack', { usd: 4000, eur: 3600 }, { isRecurring: false, recurringInterval: null }),
  ]

  it('prices every product in the currency asked for, and lists the currencies', () => {
    const pricing = buildPricing(rows, sources({ currencies: ['eur', 'usd'] }))
    expect(pricing.currency).toBe('eur')
    // The catalog's own first, whichever is shown: a switch whose options stay put.
    expect(pricing.currencies).toEqual(['usd', 'eur'])
    expect(pricing.plans.find(plan => plan.key === 'pro')!.prices.month).toMatchObject({ amount: 2700, currency: 'eur' })
    expect(pricing.packs[0]).toMatchObject({ amount: 3600, currency: 'eur' })
    // The free plan is priced in one currency, and is free in all of them.
    expect(pricing.plans.find(plan => plan.key === 'free')).toMatchObject({ free: true, prices: { month: { amount: 0, currency: 'usd' } } })
  })

  it('falls back to the catalog\'s own for a currency it does not price', () => {
    const pricing = buildPricing(rows, sources({ currencies: ['gbp', 'usd'] }))
    expect(pricing.currency).toBe('usd')
    expect(pricing.currencies).toEqual(['usd', 'eur'])
    expect(pricing.plans.find(plan => plan.key === 'pro')!.prices.month).toMatchObject({ amount: 2900, currency: 'usd' })
    expect(pricing.plans.find(plan => plan.key === 'pro')).not.toHaveProperty('free')
  })

  it('reads a plan at nothing everywhere as free, its key aside', () => {
    const pricing = buildPricing([row('p_old', { usd: 0 }, { isArchived: true })], sources({ products: { old: 'p_old' }, free: undefined }))
    expect(pricing.plans[0]).toMatchObject({ key: 'old', free: true, retired: true })
  })
})

describe('the visitor\'s currency', () => {
  it('is the country\'s, from the platform\'s header first', () => {
    expect(visitorCurrency({ 'x-vercel-ip-country': 'DE', 'accept-language': 'en-US' })).toBe('eur')
    expect(visitorCurrency({ 'cf-ipcountry': 'gb' })).toBe('gbp')
  })

  it('else the region of the app\'s language, else of the language the browser weighs highest', () => {
    expect(visitorCurrency({ 'accept-language': 'en-US' }, 'de-AT')).toBe('eur')
    // `fr` weighs most (1 by default), and names no country.
    expect(visitorCurrency({ 'accept-language': 'en;q=0.4, de-CH;q=0.8, fr' })).toBeUndefined()
    expect(visitorCurrency({ 'accept-language': 'en;q=0.4, de-CH;q=0.8' })).toBe('chf')
    // A low-weight tag never names the country: the one weighed highest names none here.
    expect(visitorCurrency({ 'accept-language': 'fr;q=0.9, en-US;q=0.1' })).toBeUndefined()
    expect(visitorCurrency({ 'accept-language': 'en, not a tag' })).toBeUndefined()
    expect(visitorCurrency({})).toBeUndefined()
  })

  it('knows the euro countries and nothing it can\'t name', () => {
    expect(['AT', 'BG', 'HR', 'IE'].map(currencyOfCountry)).toEqual(['eur', 'eur', 'eur', 'eur'])
    expect(currencyOfCountry('XX')).toBeUndefined()
    expect(currencyOfCountry(undefined)).toBeUndefined()
  })
})

describe('the free plan\'s deliveries', () => {
  it('are signed for the endpoint, parse as the SDK reads them, and are all about the free plan', async () => {
    const { deliveries, secret } = await freePlanWebhooks()
    const types = deliveries.map(delivery => delivery.type)
    expect(types).toEqual(expect.arrayContaining(['subscription.created', 'subscription.active', 'order.created', 'order.paid', 'benefit_grant.cycled', 'subscription.revoked']))
    for (const delivery of deliveries) {
      expect(verifyWebhookSignature([secret], delivery.body, delivery.headers, { legacyKey: true }), delivery.type).toBe(true)
      const event = parseBillingEvent(delivery.body)
      expect(event.type).toBe(delivery.type)
      // Every subscription and order event of it: the free plan's, never a charge.
      if (/^(?:subscription|order)\./.test(delivery.type)) expect(isFreePlanEvent(event), delivery.type).toBe(true)
    }
    // No order at its start: the provider makes none for a subscription without a checkout.
    expect(types.indexOf('order.created')).toBeGreaterThan(types.indexOf('subscription.active'))
  })

  it('tells a paid plan\'s events apart', () => {
    expect(isFreePlanEvent({ type: 'subscription.active', data: { amount: 2900 } })).toBe(false)
    expect(isFreePlanEvent({ type: 'order.paid', data: { totalAmount: 0, subscriptionId: null } })).toBe(false)
    expect(isFreePlanEvent({ type: 'order.paid', data: { total_amount: 0, subscription_id: 'sub_1' } })).toBe(true)
    expect(isFreePlanEvent({ type: 'customer.updated', data: {} })).toBe(false)
  })

  it('fold into one row a run in DevTools, as a tally does', () => {
    const row = (deliveryId: string, fields: Partial<Parameters<typeof foldFreePlanDeliveries>[0][number]> = {}) => ({ service: 'billing', deliveryId, outcome: 'ok', receivedAt: Number(deliveryId), ...fields })
    expect(foldFreePlanDeliveries([
      row('6', { type: 'order.paid', note: 'free plan' }),
      row('5', { type: 'order.paid', note: 'free plan' }),
      row('4', { type: 'order.created', note: 'free plan' }),
      row('3', { type: 'order.paid' }),
      row('2', { type: 'subscription.updated', note: 'free plan' }),
    ])).toEqual([
      row('6', { note: 'free plan', count: 3, type: undefined }),
      row('3', { type: 'order.paid' }),
      row('2', { type: 'subscription.updated', note: 'free plan' }),
    ])
  })
})

describe('the billing entities the auth routes make', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  /** An auth flow whose created entities a listener hears of, as registerBackendRoutes connects billing. */
  async function heard(listener: EntityCreatedListener = vi.fn(async () => {})) {
    const flow = await authFlow({ runtime: { entityCreated: () => [listener] } })
    return { flow, listener: vi.mocked(listener) }
  }

  it('tells of a new account and its personal workspace on the first sign-in, and of nothing on the next', async () => {
    const { flow, listener } = await heard()
    const { userId } = await flow.signInWithCode('ada@example.com')
    const [workspace] = flow.db.organization!
    // The session's workspace is made as the sign-up's session opens, before the account's after-hook runs.
    expect(listener.mock.calls.map(([, entity]) => entity)).toEqual([{ kind: 'workspace', id: workspace!.id }, { kind: 'user', id: userId }])
    // The listener gets the request's context, which can queue work.
    expect(listener.mock.calls[0]![0]).toBe(flow.runtime.ctx)
    await flow.signInWithCode('ada@example.com')
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('tells of a workspace a member creates, once the route answered', async () => {
    const { flow, listener } = await heard()
    const grace = await flow.signedIn('grace@example.com')
    const created = await flow.post('/organization/create', { name: 'Acme', slug: 'acme' }, { cookie: grace.cookie })
    const { id } = await created.json() as { id: string }
    expect(listener).toHaveBeenLastCalledWith(flow.runtime.ctx, { kind: 'workspace', id })
    // A refused create tells of nothing.
    const calls = listener.mock.calls.length
    expect((await flow.post('/organization/create', { name: 'Acme', slug: 'acme' }, { cookie: grace.cookie })).ok).toBe(false)
    expect(listener).toHaveBeenCalledTimes(calls)
  })

  it('tells of a workspace the server makes through the auth API, after the app\'s own hook ran', async () => {
    const order: string[] = []
    const appHook = vi.fn(async () => {
      order.push('app')
    })
    const listener = vi.fn(async () => {
      order.push('billing')
    })
    const flow = await authFlow({ runtime: { entityCreated: () => [listener] }, build: { workspaces: { onCreate: appHook } } })
    const grace = await flow.signedIn('grace@example.com')
    // Her session's personal workspace was told of already.
    order.length = 0
    const api = (flow.auth as unknown as { api: { createOrganization: (input: { body: Record<string, unknown> }) => Promise<{ id: string }> } }).api
    const created = await api.createOrganization({ body: { name: 'Acme', slug: 'acme', userId: grace.userId } })
    expect(listener).toHaveBeenLastCalledWith(flow.runtime.ctx, { kind: 'workspace', id: created.id })
    expect(appHook).toHaveBeenCalledOnce()
    expect(order).toEqual(['app', 'billing'])
  })

  it('queues the free plan by its function\'s name where billing is not connected', async () => {
    const flow = await authFlow()
    const { userId } = await flow.signInWithCode('ada@example.com')
    const [workspace] = flow.db.organization!
    const runAfter = (flow.runtime.ctx as unknown as { scheduler: { runAfter: ReturnType<typeof vi.fn> } }).scheduler.runAfter
    const queued = runAfter.mock.calls
      .map(([delay, reference, args]) => [delay, getFunctionName(reference as FunctionReference<'action'>), args])
      .filter(([, name]) => name === 'billing:startFreePlan')
    // `billing:startFreePlan` decides: nothing without a free plan, nor for the kind billing does not bill.
    expect(queued).toEqual([[0, 'billing:startFreePlan', { entityId: workspace!.id, kind: 'workspace' }], [0, 'billing:startFreePlan', { entityId: userId, kind: 'user' }]])
  })

  it('holds a member to a few new workspaces an hour: each one is a billing entity', async () => {
    const flow = await authFlow()
    const grace = await flow.signedIn('grace@example.com')
    const capacity = 5
    for (let index = 0; index < capacity; index += 1) {
      expect((await flow.post('/organization/create', { name: `Team ${index}`, slug: `team-${index}` }, { cookie: grace.cookie })).ok).toBe(true)
    }
    const refused = await flow.post('/organization/create', { name: 'One more', slug: 'one-more' }, { cookie: grace.cookie })
    expect(refused.status).toBe(429)
    expect(await refused.json()).toMatchObject({ code: 'rate_limited', limit: 'workspaceCreate' })
    expect(flow.db.organization).toHaveLength(capacity)
  })

  it('signs in all the same when a listener fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { flow } = await heard(vi.fn(async () => {
      throw new Error('the queue is down')
    }))
    const { response } = await flow.signInWithCode('ada@example.com')
    expect(response.status).toBe(200)
    expect(warn.mock.calls.map(([line]) => String(line))).toContainEqual(expect.stringContaining('billing.free_plan_unqueued'))
    warn.mockRestore()
  })

  it('keeps a workspace that still holds a paid subscription, with a refusal the app can show', async () => {
    const guard = vi.fn(async () => 'paid_subscription' as string | null)
    const flow = await authFlow({ runtime: { entityDeleting: () => [guard] } })
    const grace = await flow.signedIn('grace@example.com')
    const { id } = await (await flow.post('/organization/create', { name: 'Acme', slug: 'acme' }, { cookie: grace.cookie })).json() as { id: string }
    const refused = await flow.post('/organization/delete', { organizationId: id }, { cookie: grace.cookie })
    expect(refused.status).toBe(403)
    expect(await refused.json()).toMatchObject({ code: 'forbidden', reason: 'paid_subscription' })
    expect(guard).toHaveBeenCalledWith(flow.runtime.ctx, { kind: 'workspace', id })
    expect(flow.db.organization!.some(row => row.id === id)).toBe(true)
    // Once the plan is cancelled, it goes.
    guard.mockResolvedValue(null)
    expect((await flow.post('/organization/delete', { organizationId: id }, { cookie: grace.cookie })).status).toBe(200)
    expect(flow.db.organization!.some(row => row.id === id)).toBe(false)
  })

  it('is connected to billing by registerBackendRoutes, on the createAuth it mounts', async () => {
    const createAuth = () => {}
    const entityCreated = vi.fn(async () => {})
    const deletionRefusal = vi.fn(async () => 'paid_subscription')
    registerBackendRoutes({ route: vi.fn() } as never, {
      auth: { authComponent: { registerRoutes: vi.fn() }, createAuth },
      billing: { webhookHandler: vi.fn(), entityCreated, deletionRefusal },
      email: { webhookHandler: vi.fn() },
      ai: { httpHandler: vi.fn(), corsOrigin: 'https://app.test' },
    })
    const [listener] = entityListenersOf(createAuth)()
    const ctx = { runMutation: vi.fn(), runQuery: vi.fn(), scheduler: { runAfter: vi.fn() } }
    await listener!(ctx as never, { kind: 'workspace', id: 'org_1' })
    expect(entityCreated).toHaveBeenCalledWith(ctx, { kind: 'workspace', id: 'org_1' })
    const [guard] = deletionGuardsOf(createAuth)()
    expect(await guard!(ctx as never, { kind: 'workspace', id: 'org_1' })).toBe('paid_subscription')
    expect(deletionRefusal).toHaveBeenCalledWith(ctx, { kind: 'workspace', id: 'org_1' })
    // Another router's createAuth hears nothing of it.
    expect(entityListenersOf(() => {})()).toEqual([])
    expect(deletionGuardsOf(() => {})()).toEqual([])
  })
})
