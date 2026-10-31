/// <reference types="vite/client" />
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { defineSchema, makeFunctionReference, type FunctionReference } from 'convex/server'
import type { TestConvex } from 'convex-test'
import { PolarCore } from '@polar-sh/sdk/core.js'
import { benefitsUpdate } from '@polar-sh/sdk/funcs/benefitsUpdate.js'
import { syncBillingCatalog } from '../../src/cli/billing/sync'
import { createPolarFake, type PolarFake, routeToFake } from '../fixtures/polar-fake/server'
import type { BillingCatalog } from '../../src/convex/catalog'
import { getBackendError } from '../../src/convex/errors'
import type { Pricing } from '../../src/convex/integrations/billing/types/records'
import { asUser, defineBackendTestApp } from '../../src/convex/test'
import { signingSecret } from '../helpers/secrets'

// Pricing on the fake provider, end to end: a catalog with monthly and
// yearly prices, a retired plan and two packs is synced to the fake provider,
// its products reach the scaffold's deployment as webhooks, and the public
// `getPricing` reads them as the pricing page does — every figure the live
// product's. A retired plan is refused at checkout and as a plan change; a
// switch from the yearly price to the monthly one waits for the paid year's
// end; a benefit edited at the provider re-syncs the products, so the
// pricing follows it.

const SCAFFOLD = '../fixtures/registration/backend/'
const SITE = 'http://localhost:3000'
const FAKE = 'http://127.0.0.1:4748'
const ENDPOINT = 'https://scaffold.convex.site/billing/events'
const SECRET = signingSecret()

const CATALOG: BillingCatalog = {
  meters: { credits: { eventName: 'credits', property: 'amount' } },
  plans: {
    pro: { name: 'Pro', prices: { month: 2900, year: 29000 }, credits: { meter: 'credits', units: 500 }, features: ['priority'], trial: { interval: 'day', count: 14 } },
    legacy: { name: 'Legacy', prices: { month: 1900 } },
  },
  packs: {
    credits100: { name: '100 credits', price: 1000, credits: { meter: 'credits', units: 100 } },
    credits500: { name: '500 credits', price: 4000, credits: { meter: 'credits', units: 500 } },
  },
  features: { priority: { description: 'Priority support' } },
}
/** The same catalog once `legacy` is retired. */
const RETIRED: BillingCatalog = { ...CATALOG, plans: { ...CATALOG.plans, legacy: { ...CATALOG.plans!.legacy!, retired: true } } }

// What `billing sync` writes once `legacy` is retired: the fake provider's ids are
// the same on every machine (checked against the real syncs below).
vi.mock('../fixtures/registration/backend/billing.generated', async () => {
  const { stableId } = await import('../fixtures/polar-fake/state')
  const product = (key: string) => stableId('product', key)
  return {
    catalog: {
      sandbox: {
        products: { 'pro': product('pro'), 'pro:year': product('pro:year'), 'legacy': product('legacy'), 'credits100': product('credits100'), 'credits500': product('credits500') },
        plans: { pro: { month: product('pro'), year: product('pro:year') }, legacy: { month: product('legacy') } },
        retired: ['legacy'],
        packs: ['credits100', 'credits500'],
        gifts: { credits100: product('credits100-gift'), credits500: product('credits500-gift') },
        meters: { credits: { meterId: stableId('meter', 'credits'), eventName: 'credits', property: 'amount' } },
      },
    },
  }
})

vi.stubEnv('BILLING_ACCESS_TOKEN', 'polar_oat_fake')
vi.stubEnv('BILLING_WEBHOOK_SECRET', SECRET)
vi.stubEnv('SITE_URL', SITE)
vi.stubEnv('AUTH_SECRET', 'pricing-suite-secret-0123456789abcdefghijklmnopqr')

const scaffold = import.meta.glob(['../fixtures/registration/backend/*.ts', '!**/convex.config.ts', '!**/auth.config.ts'])
const testApp = defineBackendTestApp(defineSchema({}), {
  ...scaffold,
  [`${SCAFFOLD}_generated/api.js`]: () => Promise.resolve({}),
})

const fn = <Kind extends 'query' | 'mutation' | 'action'>(path: string) => makeFunctionReference<Kind>(path) as FunctionReference<Kind, 'public'>

let t: TestConvex<ReturnType<typeof defineSchema>>
let fake: PolarFake

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
  const sync = (catalog: BillingCatalog) => syncBillingCatalog(catalog, { rootDir: '.', environment: 'sandbox', accessToken: 'polar_oat_fake', dryRun: false, adopt: {} })
  // Sold first, then retired: the second sync archives what the first created.
  await sync(CATALOG)
  const { ids, log } = await sync(RETIRED)
  const { catalog } = await import('../fixtures/registration/backend/billing.generated') as { catalog: { sandbox: unknown } }
  expect(ids).toEqual(catalog.sandbox)
  expect(log).toContainEqual(expect.objectContaining({ action: 'archived', key: 'legacy' }))
  await fake.idle()
})

afterEach(async () => {
  await fake.idle()
  fake.close()
  vi.unstubAllGlobals()
})

const pricing = () => t.query(fn<'query'>('billing:getPricing'), {}) as Promise<Pricing>

/** Pay a checkout on its page, then let its events land. */
async function pay(url: string): Promise<void> {
  await fake.handle(new Request(`${url}/pay`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'origin': FAKE } }))
  await fake.idle()
}

/** Ada, subscribed to `productId` through a paid checkout. */
async function subscribed(productId: string) {
  const ada = await asUser(t, { email: 'ada@example.com' })
  const { url } = await ada.action(fn<'action'>('billing:generateCheckoutLink'), { productIds: [productId], origin: SITE, successUrl: `${SITE}/pricing` }) as { url: string }
  await pay(url)
  return ada
}

type Caller = Awaited<ReturnType<typeof asUser>>
const current = (caller: Caller) => caller.query(fn<'query'>('billing:getCurrentSubscription'), {}) as Promise<{ productId: string, pendingChange: { productId: string } | null } | null>
const balance = async (caller: Caller) => (await caller.query(fn<'query'>('billing:getCredits'), {}) as { meters: Array<{ balance: number }> } | null)?.meters[0]?.balance

describe('pricing on the fake provider, end to end', () => {
  test('is public, and reads every plan price, trial and credit grant off the live products', async () => {
    const { plans } = await pricing()
    const pro = plans.find(plan => plan.key === 'pro')!
    expect(pro).toMatchObject({ name: 'Pro', retired: false, features: ['Priority support'] })
    // The keys a feature gate names the plan by: its feature, and each price's credit benefit.
    expect(pro.featureKeys).toEqual(expect.arrayContaining(['priority']))
    expect(pro.featureKeys).not.toContain('nuxt-backend')
    expect(pro.prices.month).toMatchObject({ amount: 2900, currency: 'usd', monthly: 2900, trial: { interval: 'day', count: 14 }, credits: { meter: 'credits', units: 500, rollover: false } })
    // A year's worth of credits, once a year, and what twelve months would have cost more.
    expect(pro.prices.year).toMatchObject({ amount: 29000, monthly: 29000 / 12, savings: 16, credits: { units: 6000 } })
    // The retired plan is listed, marked, for its subscribers' card alone.
    expect(plans.find(plan => plan.key === 'legacy')).toMatchObject({ retired: true, prices: { month: { amount: 1900 } } })
  })

  test('compares the packs credit for credit, and leaves the gift twins out', async () => {
    const { packs } = await pricing()
    expect(packs.map(pack => pack.key)).toEqual(['credits100', 'credits500'])
    expect(packs[0]).toMatchObject({ perCredit: 10, isBestValue: false })
    expect(packs[0]).not.toHaveProperty('lessPerCredit')
    expect(packs[1]).toMatchObject({ perCredit: 8, lessPerCredit: 20, isBestValue: true })
  })

  test('refuses a checkout of a retired plan, and sells its siblings', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    const { plans } = await pricing()
    const legacy = plans.find(plan => plan.key === 'legacy')!.prices.month!.productId
    const refused = await ada.action(fn<'action'>('billing:generateCheckoutLink'), { productIds: [legacy], origin: SITE, successUrl: `${SITE}/pricing` })
      .catch((error: unknown) => getBackendError(error))
    expect(refused).toMatchObject({ code: 'invalid_input', data: { field: 'productIds', reason: 'retired' } })
    const yearly = plans.find(plan => plan.key === 'pro')!.prices.year!.productId
    const { url } = await ada.action(fn<'action'>('billing:generateCheckoutLink'), { productIds: [yearly], origin: SITE, successUrl: `${SITE}/pricing` }) as { url: string }
    expect(url).toMatch(`${FAKE}/checkout/`)
  })

  test('refuses a plan change to a retired plan as retired, before the provider hears of it', async () => {
    const { plans } = await pricing()
    const ada = await subscribed(plans.find(plan => plan.key === 'pro')!.prices.month!.productId)
    const legacy = plans.find(plan => plan.key === 'legacy')!.prices.month!.productId
    const changes = Object.keys(fake.state.subscriptions).length
    const refused = await ada.action(fn<'action'>('billing:updateSubscription'), { productId: legacy })
      .catch((error: unknown) => getBackendError(error))
    expect(refused).toMatchObject({ code: 'invalid_input', data: { field: 'productId', reason: 'retired' } })
    await fake.idle()
    expect(Object.keys(fake.state.subscriptions)).toHaveLength(changes)
    expect((await current(ada))?.productId).toBe(plans.find(plan => plan.key === 'pro')!.prices.month!.productId)
  })

  test('switches a yearly subscriber to the monthly price only when the paid year ends, keeping the year\'s credits and the money', async () => {
    const { plans } = await pricing()
    const { month, year } = plans.find(plan => plan.key === 'pro')!.prices
    const ada = await subscribed(year!.productId)
    expect(await balance(ada)).toBe(6000)
    const orders = Object.keys(fake.state.orders).length

    // Asked to settle the difference now, it is scheduled all the same.
    await ada.action(fn<'action'>('billing:updateSubscription'), { productId: month!.productId, proration: 'prorate' })
    await fake.idle()

    expect(await current(ada)).toMatchObject({ productId: year!.productId, pendingChange: { productId: month!.productId } })
    expect(await balance(ada)).toBe(6000)
    // Nothing charged or credited back.
    expect(Object.keys(fake.state.orders)).toHaveLength(orders)

    // Undone, the year runs on.
    await ada.action(fn<'action'>('billing:cancelPendingChange'), {})
    await fake.idle()
    expect(await current(ada)).toMatchObject({ productId: year!.productId, pendingChange: null })
  })

  test('follows a benefit edited at the provider: the products table re-syncs on benefit.updated', async () => {
    const { packs } = await pricing()
    const benefitId = Object.values(fake.state.benefits).find(benefit => benefit.metadata.key === 'credits500-credits')!.id
    const core = new PolarCore({ accessToken: 'polar_oat_fake', server: 'sandbox' })
    const updated = await benefitsUpdate(core, { id: benefitId, requestBody: { type: 'meter_credit', properties: { units: 600, rollover: true, meterId: fake.state.meters[Object.keys(fake.state.meters)[0]!]!.id } } })
    expect(updated.ok).toBe(true)
    await fake.idle()
    expect(packs[1]!.credits!.units).toBe(500)
    const after = (await pricing()).packs.find(pack => pack.key === 'credits500')!
    expect(after.credits!.units).toBe(600)
    expect(after.perCredit).toBeCloseTo(4000 / 600)
  })
})
