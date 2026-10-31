/// <reference types="vite/client" />
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { actionGeneric, componentsGeneric, defineSchema, internalActionGeneric, makeFunctionReference, type FunctionReference } from 'convex/server'
import { v } from 'convex/values'
import type { TestConvex } from 'convex-test'
import { syncBillingCatalog } from '../../src/cli/billing/sync'
import { createPolarFake, type PolarFake, routeToFake } from '../fixtures/polar-fake/server'
import type { BillingCatalog } from '../../src/convex/catalog'
import { getBackendError } from '../../src/convex/errors'
import type { Billing } from '../../src/convex/integrations/billing/types/surface'
import type { Pricing } from '../../src/convex/integrations/billing/types/records'
import { asUser, defineBackendTestApp } from '../../src/convex/test'
import { signingSecret } from '../helpers/secrets'

// Promotions end to end on the fake provider: the catalog's discounts
// synced by `billing sync`, then applied by key at checkout (a client names
// only a public one), picked per checkout by `checkoutDiscount`, put on a
// subscription by `applyDiscount`, and shown by `getPricing`. Every provider
// call goes through the provider SDK to the fake provider, and its webhooks
// reach the scaffold's own `/billing/events`.

const SCAFFOLD = '../fixtures/registration/backend/'
const SITE = 'http://localhost:3000'
const FAKE = 'http://127.0.0.1:4747'
const ENDPOINT = 'https://scaffold.convex.site/billing/events'
const SECRET = signingSecret()
const ENDS = '2099-12-31T23:59:59.000Z'

const CATALOG: BillingCatalog = {
  currency: 'usd',
  meters: { credits: { eventName: 'credits', property: 'amount' } },
  plans: {
    pro: { name: 'Pro', prices: { month: 2900, year: 29000 }, credits: { meter: 'credits', units: 500 } },
    team: { name: 'Team', prices: { month: 9900 } },
  },
  packs: { credits500: { name: '500 credits', price: 2000, credits: { meter: 'credits', units: 500 } } },
  discounts: {
    launch: { name: 'Launch offer', percentOff: 20, duration: { months: 3 }, code: 'LAUNCH20', maxRedemptions: 100, perCustomer: 1, endsAt: ENDS, products: { plans: ['pro'], interval: 'month' } },
    founder: { name: 'Founder pricing', percentOff: 30, duration: 'forever', perCustomer: 1, products: { plans: ['pro', 'team'] } },
    packdeal: { name: 'Pack deal', amountOff: 500, duration: 'once', code: 'PACK5', maxRedemptions: 50, perCustomer: 1, endsAt: ENDS, products: { packs: ['credits500'] } },
  },
}

// What `billing sync` writes as the fake provider's entry: the same on every
// machine (checked against a real sync below).
vi.mock('../fixtures/registration/backend/billing.generated', async () => {
  const { stableId } = await import('../fixtures/polar-fake/state')
  const product = (key: string) => stableId('product', key)
  return {
    catalog: {
      sandbox: {
        products: { 'pro': product('pro'), 'pro:year': product('pro:year'), 'team': product('team'), 'credits500': product('credits500') },
        plans: { pro: { month: product('pro'), year: product('pro:year') }, team: { month: product('team') } },
        packs: ['credits500'],
        gifts: { credits500: product('credits500-gift') },
        meters: { credits: { meterId: stableId('meter', 'credits'), eventName: 'credits', property: 'amount' } },
        discounts: {
          launch: { id: stableId('discount', 'launch'), name: 'Launch offer', code: 'LAUNCH20', percentOff: 20, duration: 'repeating', months: 3, endsAt: '2099-12-31T23:59:59.000Z', productIds: [product('pro')] },
          founder: { id: stableId('discount', 'founder'), name: 'Founder pricing', percentOff: 30, duration: 'forever', productIds: [product('pro'), product('pro:year'), product('team')] },
          packdeal: { id: stableId('discount', 'packdeal'), name: 'Pack deal', code: 'PACK5', amountOff: { usd: 500 }, duration: 'once', endsAt: '2099-12-31T23:59:59.000Z', productIds: [product('credits500')] },
        },
      },
    },
  }
})

vi.stubEnv('BILLING_ACCESS_TOKEN', 'polar_oat_fake')
vi.stubEnv('BILLING_WEBHOOK_SECRET', SECRET)
vi.stubEnv('SITE_URL', SITE)
vi.stubEnv('AUTH_SECRET', 'promotions-suite-secret-0123456789abcdefghijklmnop')

const scaffold = import.meta.glob(['../fixtures/registration/backend/*.ts', '!**/convex.config.ts', '!**/auth.config.ts'])
const testApp = defineBackendTestApp(defineSchema({}), {
  ...scaffold,
  [`${SCAFFOLD}_generated/api.js`]: () => Promise.resolve({}),
  // The app's own server code: a checkout with a discount only the server
  // applies, and a discount put on a subscription.
  [`${SCAFFOLD}promotions.ts`]: async () => {
    // The fixture is typed from the built package, whose `Billing` leaves out the @internal members.
    const { billing } = await import('../fixtures/registration/backend/billing') as unknown as { billing: Billing }
    const urls = { origin: SITE, successUrl: `${SITE}/billing` }
    return {
      founderCheckout: actionGeneric({ args: { productId: v.string() }, handler: (ctx, { productId }) => billing.checkout(ctx, { productIds: [productId], ...urls, discount: 'founder' }) }),
      apply: internalActionGeneric({
        args: { entityId: v.string(), discount: v.union(v.string(), v.null()) },
        handler: async (ctx, args) => (await billing.applyDiscount(ctx, args)).discountId ?? null,
      }),
    }
  },
  // Another billing setup with the cohort hook: every Pro checkout gets founder pricing.
  [`${SCAFFOLD}cohort.ts`]: async () => {
    const { setupBilling } = await import('../../src/convex/integrations/billing')
    const { email } = await import('../fixtures/registration/backend/email') as { email: Parameters<typeof setupBilling>[1]['email'] }
    const { catalog } = await import('../fixtures/registration/backend/billing.generated') as { catalog: Parameters<typeof setupBilling>[1]['catalog'] }
    const cohort = setupBilling(componentsGeneric() as never, {
      email,
      catalog,
      checkoutDiscount: (_ctx, { plan }) => (plan === 'pro' ? 'founder' : plan === 'team' ? 'unknown' : null),
    })
    return { generateCheckoutLink: cohort.api.generateCheckoutLink }
  },
})

const fn = <Kind extends 'query' | 'mutation' | 'action'>(path: string) => makeFunctionReference<Kind>(path) as FunctionReference<Kind, 'public'>

let t: TestConvex<ReturnType<typeof defineSchema>>
let fake: PolarFake
let ids: Awaited<ReturnType<typeof syncBillingCatalog>>['ids']

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval'] })
  for (const level of ['log', 'info', 'warn'] as const) vi.spyOn(console, level).mockImplementation(() => {})
})

afterAll(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

beforeEach(async () => {
  t = testApp()
  const app = t
  fake = createPolarFake({
    baseUrl: FAKE,
    fetcher: (url, init) => app.fetch(new URL(url).pathname, { method: 'POST', headers: init.headers, body: init.body as string }),
  })
  vi.stubGlobal('fetch', routeToFake(fake, FAKE))
  fake.ensureEndpoint(ENDPOINT, SECRET)
  ids = (await syncBillingCatalog(CATALOG, { rootDir: '.', environment: 'sandbox', accessToken: 'polar_oat_fake', dryRun: false, adopt: {} })).ids
  await fake.idle()
})

afterEach(async () => {
  await fake.idle()
  fake.close()
  vi.unstubAllGlobals()
})

type Caller = Awaited<ReturnType<typeof asUser>>

const checkout = (productId: string, extra: Record<string, unknown> = {}) => ({ productIds: [productId], origin: SITE, successUrl: `${SITE}/billing?checkout_id={CHECKOUT_ID}`, ...extra })

/** The fake provider's checkout behind a checkout URL. */
const checkoutAt = (url: string) => Object.values(fake.state.checkouts).find(entry => url.endsWith(entry.id))!

/** Pay a checkout on its page, then let its events land. */
async function pay(url: string): Promise<void> {
  await fake.handle(new Request(`${url}/pay`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'origin': FAKE } }))
  await fake.idle()
}

const refusal = (promise: Promise<unknown>) => promise.then(() => null, (error: unknown) => getBackendError(error))

describe('promotions at checkout, on the fake provider', () => {
  test('the catalog\'s discounts synced to the fake provider are the generated entry the backend reads', async () => {
    const { catalog } = await import('../fixtures/registration/backend/billing.generated') as { catalog: { sandbox: unknown } }
    expect(ids).toEqual(catalog.sandbox)
  })

  test('a client checks out with a public promotion by its key: applied up front, and taken off the order', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    const { url } = await ada.action(fn<'action'>('billing:generateCheckoutLink'), checkout(ids.products.pro!, { discount: 'launch', utm: { source: 'newsletter', campaign: 'launch' } }))
    expect(checkoutAt(url)).toMatchObject({ discountId: ids.discounts!.launch!.id, allowDiscountCodes: true })
    await pay(url)
    const order = Object.values(fake.state.orders)[0]!
    expect(order).toMatchObject({ discountId: ids.discounts!.launch!.id, subtotalAmount: 2900, discountAmount: 580, metadata: { utm_source: 'newsletter', utm_campaign: 'launch' } })
  })

  test('a client may name only a public promotion, for a product it applies to, and one discount at a time', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    const link = (extra: Record<string, unknown>, productId = ids.products.pro!) => refusal(ada.action(fn<'action'>('billing:generateCheckoutLink'), checkout(productId, extra)))
    // The server's own, and a key that is no discount, are refused alike.
    expect(await link({ discount: 'founder' })).toMatchObject({ code: 'invalid_input', data: { field: 'discount' } })
    expect(await link({ discount: 'nope' })).toMatchObject({ code: 'invalid_input', data: { field: 'discount' } })
    // Pro's yearly price is no product the launch offer is for.
    expect(await link({ discount: 'launch' }, ids.products['pro:year'])).toMatchObject({ code: 'invalid_input', data: { field: 'discount' } })
    expect(await link({ discount: 'launch', discountCode: 'PACK5' })).toMatchObject({ code: 'invalid_input', data: { field: 'discount' } })
    expect(Object.values(fake.state.checkouts)).toEqual([])
  })

  test('a promotion the provider no longer redeems is refused by name, so the page can sell without it', async () => {
    fake.state.discounts[ids.discounts!.launch!.id]!.endsAt = Date.now() - 1000
    const ada = await asUser(t, { email: 'ada@example.com' })
    expect(await refusal(ada.action(fn<'action'>('billing:generateCheckoutLink'), checkout(ids.products.pro!, { discount: 'launch' })))).toMatchObject({ code: 'invalid_input', data: { field: 'discount' } })
    const { url } = await ada.action(fn<'action'>('billing:generateCheckoutLink'), checkout(ids.products.pro!))
    expect(checkoutAt(url).discountId).toBeNull()
  })

  test('server code applies a discount only it may name, locked on: the customer can\'t swap it for a code', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    const { url } = await ada.action(fn<'action'>('promotions:founderCheckout'), { productId: ids.products.team! })
    expect(checkoutAt(url)).toMatchObject({ discountId: ids.discounts!.founder!.id, allowDiscountCodes: false })
  })
})

describe('the checkoutDiscount hook, on the fake provider', () => {
  test('picks a cohort\'s discount for a plan checkout that names none', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    const { url } = await ada.action(fn<'action'>('cohort:generateCheckoutLink'), checkout(ids.products.pro!))
    expect(checkoutAt(url)).toMatchObject({ discountId: ids.discounts!.founder!.id, allowDiscountCodes: false })
    // A pack is no plan: the hook is not asked.
    const pack = await ada.action(fn<'action'>('cohort:generateCheckoutLink'), checkout(ids.products.credits500!))
    expect(checkoutAt(pack.url).discountId).toBeNull()
    // A promotion the checkout names wins over the hook.
    const named = await ada.action(fn<'action'>('cohort:generateCheckoutLink'), checkout(ids.products.pro!, { discount: 'launch' }))
    expect(checkoutAt(named.url).discountId).toBe(ids.discounts!.launch!.id)
  })

  test('drops a discount the provider no longer redeems: the checkout opens at the regular price, and the log says so', async () => {
    fake.state.discounts[ids.discounts!.founder!.id]!.endsAt = Date.now() - 1000
    const warn = vi.mocked(console.warn)
    warn.mockClear()
    const ada = await asUser(t, { email: 'ada@example.com' })
    const { url } = await ada.action(fn<'action'>('cohort:generateCheckoutLink'), checkout(ids.products.pro!))
    expect(checkoutAt(url).discountId).toBeNull()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('billing.checkout_discount_dropped'))
  })

  test('throws on a key the catalog does not have: the app\'s mistake, named', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    await expect(ada.action(fn<'action'>('cohort:generateCheckoutLink'), checkout(ids.products.team!))).rejects.toThrow(/checkoutDiscount picked 'unknown'/)
  })
})

describe('applyDiscount, on the fake provider', () => {
  async function subscribed(): Promise<{ ada: Caller, entityId: string, subscriptionId: string }> {
    const ada = await asUser(t, { email: 'ada@example.com' })
    const { url } = await ada.action(fn<'action'>('billing:generateCheckoutLink'), checkout(ids.products.pro!))
    await pay(url)
    const subscription = Object.values(fake.state.subscriptions)[0]!
    const entityId = fake.state.customers[subscription.customerId]!.externalId!
    return { ada, entityId, subscriptionId: subscription.id }
  }

  test('puts a catalog discount on the entity\'s subscription from its next payment, and takes it off again', async () => {
    const { entityId, subscriptionId } = await subscribed()
    expect(await t.action(makeFunctionReference<'action'>('promotions:apply'), { entityId, discount: 'founder' })).toBe(ids.discounts!.founder!.id)
    await fake.handle(new Request(`${FAKE}/_fake/clock`, { method: 'POST', body: JSON.stringify({ action: 'renew' }) }))
    await fake.idle()
    const cycle = Object.values(fake.state.orders).find(order => order.billingReason === 'subscription_cycle')
    expect(cycle).toMatchObject({ subtotalAmount: 2900, discountAmount: 870, discountId: ids.discounts!.founder!.id })
    expect(await t.action(makeFunctionReference<'action'>('promotions:apply'), { entityId, discount: null })).toBeNull()
    expect(fake.state.subscriptions[subscriptionId]!.discountId).toBeNull()
  })

  test('refuses a key the catalog does not have, and a discount for another plan', async () => {
    const { entityId } = await subscribed()
    const apply = (discount: string) => refusal(t.action(makeFunctionReference<'action'>('promotions:apply'), { entityId, discount }))
    expect(await apply('nope')).toMatchObject({ code: 'invalid_input', data: { field: 'discount' } })
    expect(await apply('packdeal')).toMatchObject({ code: 'invalid_input', data: { field: 'discount' } })
  })
})

describe('getPricing with a promotion', () => {
  test('shows a public promotion\'s terms, by its key or its code, and its offer on the prices it applies to', async () => {
    await t.action(makeFunctionReference<'action'>('billing:syncProducts'), {})
    await fake.idle()
    const read = (discount?: string) => t.query(fn<'query'>('billing:getPricing'), discount ? { discount } : {}) as Promise<Pricing>
    const pricing = await read('launch')
    expect(pricing.promotion).toEqual({ key: 'launch', name: 'Launch offer', percentOff: 20, duration: 'repeating', months: 3, endsAt: ENDS })
    const pro = pricing.plans.find(plan => plan.key === 'pro')!
    expect(pro.prices.month?.promotion).toEqual({ amount: 2320, off: 580 })
    expect(pro.prices.year?.promotion).toBeUndefined()
    expect(pricing.plans.find(plan => plan.key === 'team')!.prices.month?.promotion).toBeUndefined()
    // A campaign link's code names the same promotion, whatever its letter case.
    expect((await read('launch20')).promotion?.key).toBe('launch')
    expect((await read('PACK5')).packs[0]?.promotion).toEqual({ amount: 1500, off: 500 })
    // Never one only the server applies, never its code, and nothing unasked.
    expect((await read('founder')).promotion).toBeUndefined()
    expect(JSON.stringify(await read('launch'))).not.toContain('LAUNCH20')
    expect((await read()).promotion).toBeUndefined()
  })
})
