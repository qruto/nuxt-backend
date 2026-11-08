/// <reference types="vite/client" />
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { defineSchema, makeFunctionReference, type FunctionReference } from 'convex/server'
import type { TestConvex } from 'convex-test'
import { syncBillingCatalog } from '../../src/cli/billing/sync'
import { createPolarFake, type PolarFake, routeToFake } from '../fixtures/polar-fake/server'
import type { BillingCatalog } from '../../src/convex/catalog'
import type { Pricing } from '../../src/convex/integrations/billing/types/records'
import { asUser, defineBackendTestApp } from '../../src/convex/test'
import { signingSecret } from '../helpers/secrets'

// Welcome credits (`credits: { meter, units, once: true }` on the free
// plan) and a plan's gift lengths, end to end on the fake provider through
// the scaffold an app gets: `billing sync` pushes no benefit for them and
// writes them to the generated ids; a new workspace's first start runs the
// reverse trial, then grants them once, however often the grant runs and
// however many starts race; a grant the provider refuses is retried on the
// workpool; the pricing shows them on the free plan, and each gift length
// at its live price.

const SCAFFOLD = '../fixtures/registration/backend/'
const SITE = 'http://localhost:3000'
const FAKE = 'http://127.0.0.1:4771'
const ENDPOINT = 'https://scaffold.convex.site/billing/events'
const SECRET = signingSecret()

const CATALOG: BillingCatalog = {
  meters: { credits: { eventName: 'credits', property: 'amount', unit: { one: 'credit', other: 'credits' } } },
  plans: {
    free: { name: 'Free', prices: { month: 0 }, credits: { meter: 'credits', units: 8, once: true } },
    pro: {
      name: 'Pro',
      prices: { month: 1200, year: 12000 },
      credits: { meter: 'credits', units: 500 },
      trial: { interval: 'day', count: 14, pass: true },
      gift: { months: [1, 3, 12] },
    },
  },
}

// What `billing sync` writes as the fake provider's entry (checked against the real sync below).
vi.mock('../fixtures/registration/backend/billing.generated', async () => {
  const { stableId } = await import('../fixtures/polar-fake/state')
  const product = (key: string) => stableId('product', key)
  return {
    catalog: {
      sandbox: {
        products: { 'free': product('free'), 'pro': product('pro'), 'pro:year': product('pro:year') },
        meters: { credits: { meterId: stableId('meter', 'credits'), eventName: 'credits', property: 'amount', unit: { one: 'credit', other: 'credits' } } },
        plans: { free: { month: product('free') }, pro: { month: product('pro'), year: product('pro:year') } },
        passes: { pro: { pass: product('pro-pass'), months: { 1: product('pro-gift-1'), 3: product('pro-gift-3'), 12: product('pro-gift-12') }, trialDays: 14 } },
        free: 'free',
        welcome: { meter: 'credits', units: 8 },
      },
    },
  }
})

vi.stubEnv('BILLING_ACCESS_TOKEN', 'polar_oat_fake')
vi.stubEnv('BILLING_WEBHOOK_SECRET', SECRET)
vi.stubEnv('SITE_URL', SITE)
vi.stubEnv('AUTH_SECRET', 'welcome-credits-suite-secret-0123456789abcdefgh')

const scaffold = import.meta.glob(['../fixtures/registration/backend/*.ts', '!**/convex.config.ts', '!**/auth.config.ts'])
const testApp = defineBackendTestApp(defineSchema({}), {
  ...scaffold,
  [`${SCAFFOLD}_generated/api.js`]: () => Promise.resolve({}),
})

const fn = <Kind extends 'query' | 'mutation' | 'action'>(path: string) => makeFunctionReference<Kind>(path) as FunctionReference<Kind, 'public'>
const internalFn = (path: string) => makeFunctionReference<'action'>(path) as unknown as FunctionReference<'action', 'internal'>

let t: TestConvex<ReturnType<typeof defineSchema>>
let fake: PolarFake
let ids: Awaited<ReturnType<typeof syncBillingCatalog>>['ids']

beforeAll(() => {
  // The clock too: the workpool's loop schedules itself by it, and drains only while it stands still.
  vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval', 'Date'] })
  for (const level of ['log', 'info', 'warn', 'error'] as const) vi.spyOn(console, level).mockImplementation(() => {})
})

afterAll(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

beforeEach(async () => {
  vi.setSystemTime(new Date('2027-01-05T10:00:00Z'))
  t = testApp()
  const app = t
  fake = createPolarFake({
    baseUrl: FAKE,
    fetcher: (url, init) => app.fetch(new URL(url).pathname, { method: 'POST', headers: init.headers, body: init.body as string }),
  })
  vi.stubGlobal('fetch', routeToFake(fake, FAKE))
  fake.ensureEndpoint(ENDPOINT, SECRET)
  ids = (await syncBillingCatalog(CATALOG, { rootDir: '.', environment: 'sandbox', accessToken: 'polar_oat_fake', dryRun: false, adopt: {} })).ids
  const { catalog } = await import('../fixtures/registration/backend/billing.generated') as { catalog: { sandbox: unknown } }
  expect(ids).toEqual(catalog.sandbox)
  await fake.idle()
})

afterEach(async () => {
  await fake.idle()
  fake.close()
  vi.unstubAllGlobals()
})

type Caller = Awaited<ReturnType<typeof asUser>>
type Current = { productId: string, free?: true, pass?: { plan: string, trial?: true } } | null

const current = (caller: Caller) => caller.query(fn<'query'>('billing:getCurrentSubscription'), {}) as Promise<Current>
const balance = async (caller: Caller) => (await caller.query(fn<'query'>('billing:getCredits'), {}) as { meters: Array<{ balance: number }> } | null)?.meters[0]?.balance
const start = (entityId: string) => t.action(internalFn('billing:startFreePlan'), { entityId })
const grantWelcome = (entityId: string) => t.action(internalFn('billing:startFreePlan'), { entityId, welcome: true })
const welcomeEvents = (entityId: string) => fake.state.events.filter(event => event.externalId === `welcome:${entityId}`)

/** Run the queue (the workpool and the scheduler) until nothing is left, then let the deliveries land. */
async function drain(): Promise<void> {
  await t.finishAllScheduledFunctions(() => vi.runAllTimers())
  await fake.idle()
}

describe('welcome credits', () => {
  test('billing sync writes them to the generated ids and pushes no credit benefit for them', () => {
    expect(ids.welcome).toEqual({ meter: 'credits', units: 8 })
    const free = fake.state.products[ids.products.free!]!
    expect(free.benefitIds.map(id => fake.state.benefits[id]!.type)).not.toContain('meter_credit')
  })

  test('are granted once as the free plan first starts, after the reverse trial, which still runs', async () => {
    const ada = await asUser(t, { email: 'delivered@resend.dev' })
    expect(await start(ada.workspaceId!)).toBe('started')
    await drain()
    // The reverse trial ran: the workspace holds the plan's pass, with its 500 credits.
    expect(await current(ada)).toMatchObject({ productId: ids.passes!.pro!.pass, pass: { plan: 'pro', trial: true } })
    // Then the welcome credits: one refund-shaped event of 8, keyed by the workspace.
    expect(welcomeEvents(ada.workspaceId!)).toEqual([expect.objectContaining({ name: 'credits', externalCustomerId: ada.workspaceId, metadata: { reason: 'welcome', amount: -8 } })])
    expect(await balance(ada)).toBe(508)
  })

  test('are granted once under retries of the grant', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    await start(ada.workspaceId!)
    await drain()
    expect(await balance(ada)).toBe(508)
    // The workpool runs the grant again (a retry after a lost answer, say): the provider drops the event under the same key.
    expect(await grantWelcome(ada.workspaceId!)).toBe('granted_before')
    expect(await grantWelcome(ada.workspaceId!)).toBe('granted_before')
    await drain()
    expect(welcomeEvents(ada.workspaceId!)).toHaveLength(1)
    expect(await balance(ada)).toBe(508)
    // A later start of a workspace on a plan grants nothing either.
    expect(await start(ada.workspaceId!)).toBe('subscribed')
    await drain()
    expect(welcomeEvents(ada.workspaceId!)).toHaveLength(1)
  })

  test('are granted once when two first starts race', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    const outcomes = await Promise.all([start(ada.workspaceId!), start(ada.workspaceId!)])
    expect(outcomes).toContain('started')
    await drain()
    expect(welcomeEvents(ada.workspaceId!)).toHaveLength(1)
    expect(await balance(ada)).toBe(508)
  })

  test('a grant the provider refuses is retried on the workpool, and lands once', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    const route = routeToFake(fake, FAKE)
    let refusals = 1
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init)
      if (new URL(request.url).pathname === '/v1/events/ingest' && refusals > 0) {
        refusals -= 1
        return Response.json({ error: 'InternalServerError', detail: 'down for a moment' }, { status: 500 })
      }
      return route(request)
    })
    await start(ada.workspaceId!)
    await drain()
    expect(refusals).toBe(0)
    expect(welcomeEvents(ada.workspaceId!)).toHaveLength(1)
    expect(await balance(ada)).toBe(508)
  })

  test('an entity whose customer is gone is not granted, nor retried', async () => {
    expect(await grantWelcome('j57f8h3a5mv0rq0ktbq7tv4n7d7sgk3e')).toBe('gone')
    expect(fake.state.events).toEqual([])
  })
})

describe('the pricing', () => {
  test('shows the welcome credits on the free plan, with the meter\'s unit', async () => {
    const pricing = await t.query(fn<'query'>('billing:getPricing'), {}) as Pricing
    const free = pricing.plans.find(plan => plan.key === 'free')!
    expect(free.welcome).toEqual({ meter: 'credits', unit: { one: 'credit', other: 'credits' }, units: 8 })
    expect(free.prices.month?.credits).toBeUndefined()
    expect(pricing.plans.find(plan => plan.key === 'pro')).not.toHaveProperty('welcome')
    expect(pricing.launched).toBe(true)
  })

  test('shows each gift length of a giftable plan at its live price, and what it saves', async () => {
    const pricing = await t.query(fn<'query'>('billing:getPricing'), {}) as Pricing
    expect(pricing.plans.find(plan => plan.key === 'pro')!.gift).toEqual({
      lengths: [
        { months: 1, amount: 1200, currency: 'usd', monthly: 1200 },
        { months: 3, amount: 3600, currency: 'usd', monthly: 1200 },
        { months: 12, amount: 12000, currency: 'usd', monthly: 1000, savings: 16 },
      ],
    })
    expect(pricing.plans.find(plan => plan.key === 'free')).not.toHaveProperty('gift')
  })
})
