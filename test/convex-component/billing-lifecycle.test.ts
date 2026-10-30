/// <reference types="vite/client" />
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { componentsGeneric, defineSchema, makeFunctionReference, type FunctionReference } from 'convex/server'
import { convexTest, type TestConvex } from 'convex-test'
import { syncBillingCatalog } from '../../src/cli/billing/sync'
import { createPolarFake, type PolarFake, routeToFake } from '../fixtures/polar-fake/server'
import type { BillingCatalog } from '../../src/convex/catalog'
import type { ComponentApi } from '../../src/convex/components/backend/_generated/component'
import schema from '../../src/convex/components/backend/schema'
import { MAINTENANCE_TASKS, RENEWAL_CONSENT_RETENTION_MS } from '../../src/convex/components/backend/maintenance'
import { SAVE_OFFER_OPEN_MS } from '../../src/convex/components/backend/subscriptions'
import { asUser, defineBackendTestApp } from '../../src/convex/test'
import { signingSecret } from '../helpers/secrets'

// The billing lifecycle (LIFECYCLE): the component's own records, taken once
// each, and the reverse trial end to end on the fake provider: a new
// workspace starts on the plan's pass with no card, one address starts one,
// and the gift sweep tells it three days before and returns it to the free
// plan at its end.

const SCAFFOLD = '../fixtures/registration/backend/'
const SITE = 'http://localhost:3000'
const FAKE = 'http://127.0.0.1:4752'
const ENDPOINT = 'https://scaffold.convex.site/billing/events'
const SECRET = signingSecret()
const DAY = 24 * 60 * 60 * 1000

const CATALOG: BillingCatalog = {
  meters: { credits: { eventName: 'credits', property: 'amount' } },
  plans: {
    free: { name: 'Free', prices: { month: 0 }, credits: { meter: 'credits', units: 20 } },
    pro: { name: 'Pro', prices: { month: 1200 }, credits: { meter: 'credits', units: 500 }, features: ['priority'], trial: { interval: 'day', count: 14, pass: true } },
  },
  features: { priority: { description: 'Priority support' } },
}

vi.mock('../fixtures/registration/backend/billing.generated', async () => {
  const { stableId } = await import('../fixtures/polar-fake/state')
  const product = (key: string) => stableId('product', key)
  return {
    catalog: {
      sandbox: {
        products: { free: product('free'), pro: product('pro') },
        plans: { free: { month: product('free') }, pro: { month: product('pro') } },
        free: 'free',
        passes: { pro: { pass: product('pro-pass'), months: {}, trialDays: 14 } },
        meters: { credits: { meterId: stableId('meter', 'credits'), eventName: 'credits', property: 'amount' } },
      },
    },
  }
})

vi.stubEnv('BILLING_ACCESS_TOKEN', 'polar_oat_fake')
vi.stubEnv('EMAIL_API_KEY', 're_test_key')
vi.stubEnv('BILLING_WEBHOOK_SECRET', SECRET)
vi.stubEnv('SITE_URL', SITE)
vi.stubEnv('AUTH_SECRET', 'lifecycle-suite-secret-0123456789abcdefghijklmnop')

const scaffold = import.meta.glob(['../fixtures/registration/backend/*.ts', '!**/convex.config.ts', '!**/auth.config.ts'])
const testApp = defineBackendTestApp(defineSchema({}), {
  ...scaffold,
  [`${SCAFFOLD}_generated/api.js`]: () => Promise.resolve({}),
})
const modules = import.meta.glob('../../src/convex/components/backend/**/*.ts')

const fn = <Kind extends 'query' | 'mutation' | 'action'>(path: string) => makeFunctionReference<Kind>(path) as FunctionReference<Kind, 'public'>
const internalFn = (path: string) => makeFunctionReference<'action'>(path) as unknown as FunctionReference<'action', 'internal'>
const components = componentsGeneric() as unknown as { backend: ComponentApi<'backend'> }
const lifecycle = makeFunctionReference

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval', 'Date'] })
  for (const level of ['log', 'info', 'warn', 'error'] as const) vi.spyOn(console, level).mockImplementation(() => {})
})

afterAll(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('the lifecycle records', () => {
  const component = () => convexTest(schema, modules)
  const m = (name: string) => lifecycle<'mutation'>(`subscriptions:${name}`) as FunctionReference<'mutation'>
  const q = (name: string) => lifecycle<'query'>(`subscriptions:${name}`) as FunctionReference<'query'>

  beforeEach(() => vi.setSystemTime(new Date('2027-01-05T10:00:00Z')))

  test('an offer is taken once, by the entity it was made to, while it is open', async () => {
    const t = component()
    const offer = { kind: 'pause' as const, months: 2, resumesAt: Date.now() + 90 * DAY }
    const id = await t.mutation(m('recordOffer'), { entityId: 'org_1', subscriptionId: 'sub_1', reason: 'unused', offer, since: Date.now() - 365 * DAY }) as string
    expect(await t.query(q('lastOffer'), { entityId: 'org_1', since: Date.now() - 365 * DAY })).toBe(Date.now())
    // One offer in the window: a second cancellation at the same time gets none.
    expect(await t.mutation(m('recordOffer'), { entityId: 'org_1', subscriptionId: 'sub_1', reason: 'too_expensive', offer, since: Date.now() - 365 * DAY })).toBeNull()
    expect(await t.mutation(m('takeOffer'), { offerId: id, entityId: 'org_2' })).toBeNull()
    expect(await t.mutation(m('takeOffer'), { offerId: id, entityId: 'org_1' })).toMatchObject({ subscriptionId: 'sub_1', offer })
    expect(await t.mutation(m('takeOffer'), { offerId: id, entityId: 'org_1' })).toBeNull()
    // Given back when the provider refused it, it can be taken again, but not once the flow's sitting is over.
    await t.mutation(m('releaseOffer'), { offerId: id })
    vi.setSystemTime(Date.now() + SAVE_OFFER_OPEN_MS + 1)
    expect(await t.mutation(m('takeOffer'), { offerId: id, entityId: 'org_1' })).toBeNull()
    expect(await t.mutation(m('takeOffer'), { offerId: 'not-an-id', entityId: 'org_1' })).toBeNull()
  })

  test('a step is marked once per window, a withdrawal once per subscription', async () => {
    const t = component()
    expect(await t.mutation(m('markOnce'), { key: 'checkout:co_1' })).toBe(true)
    expect(await t.mutation(m('markOnce'), { key: 'checkout:co_1' })).toBe(false)
    expect(await t.mutation(m('markOnce'), { key: 'renewal:sub_1', every: 330 * DAY })).toBe(true)
    vi.setSystemTime(Date.now() + 331 * DAY)
    expect(await t.mutation(m('markOnce'), { key: 'renewal:sub_1', every: 330 * DAY })).toBe(true)
    const withdrawal = { entityId: 'org_1', subscriptionId: 'sub_1', userId: 'u1', productId: 'prod_pro', at: Date.now() }
    expect(await t.mutation(m('recordWithdrawal'), withdrawal)).toBe(true)
    expect(await t.mutation(m('recordWithdrawal'), withdrawal)).toBe(false)
    expect(await t.query(q('withdrawalOf'), { subscriptionId: 'sub_1' })).toEqual({ at: withdrawal.at, userId: 'u1' })
  })

  test('a consent proof is confirmed by its subscription, and deleted three years after; one that started nothing after two days', async () => {
    const t = component()
    const proof = { entityId: 'org_1', userId: 'u1', productId: 'prod_pro', amount: 2900, currency: 'usd', interval: 'month', intervalCount: 1, termsVersion: '2026-10-01' }
    await t.mutation(m('recordConsent'), { ...proof, checkoutId: 'co_kept' })
    await t.mutation(m('recordConsent'), { ...proof, checkoutId: 'co_left' })
    expect(await t.mutation(m('confirmConsent'), { checkoutId: 'co_kept', subscriptionId: 'sub_1', at: Date.now() })).toBe(true)
    expect(await t.mutation(m('confirmConsent'), { checkoutId: 'co_kept', subscriptionId: 'sub_1', at: Date.now() })).toBe(false)
    const { entityId: _entity, ...kept } = proof
    expect(await t.query(q('consents'), { entityId: 'org_1' })).toEqual([{ ...kept, subscriptionId: 'sub_1', consentedAt: Date.now() }])
    await t.run(ctx => MAINTENANCE_TASKS.billingConsents(ctx as never, Date.now() + 3 * DAY))
    expect((await t.run(ctx => ctx.db.query('billingRenewalConsents').collect())).map(row => row.checkoutId)).toEqual(['co_kept'])
    await t.run(ctx => MAINTENANCE_TASKS.billingConsents(ctx as never, Date.now() + RENEWAL_CONSENT_RETENTION_MS + DAY))
    expect(await t.run(ctx => ctx.db.query('billingRenewalConsents').collect())).toEqual([])
  })
})

describe('the Billing tab', () => {
  const component = () => convexTest(schema, modules)
  const m = (name: string) => lifecycle<'mutation'>(`subscriptions:${name}`) as FunctionReference<'mutation'>
  const q = (name: string) => lifecycle<'query'>(`subscriptions:${name}`) as FunctionReference<'query'>

  beforeEach(() => vi.setSystemTime(new Date('2027-01-05T10:00:00Z')))

  test('lists the offers, withdrawals and confirmed consent proofs newest first, all of them or one entity\'s', async () => {
    const t = component()
    const since = Date.now() - 365 * DAY
    await t.mutation(m('recordOffer'), { entityId: 'org_1', subscriptionId: 'sub_1', reason: 'unused', offer: { kind: 'pause', months: 2 }, since })
    vi.setSystemTime(Date.now() + DAY)
    const taken = await t.mutation(m('recordOffer'), { entityId: 'org_2', subscriptionId: 'sub_2', reason: 'too_expensive', offer: { kind: 'discount', discount: 'stay30' }, since }) as string
    await t.mutation(m('takeOffer'), { offerId: taken, entityId: 'org_2' })
    await t.mutation(m('recordWithdrawal'), { entityId: 'org_1', subscriptionId: 'sub_1', userId: 'u1', productId: 'prod_pro', at: Date.now() })
    const proof = { userId: 'u1', productId: 'prod_pro', amount: 2900, currency: 'usd', interval: 'month', intervalCount: 1 }
    await t.mutation(m('recordConsent'), { ...proof, entityId: 'org_1', checkoutId: 'co_1' })
    await t.mutation(m('recordConsent'), { ...proof, entityId: 'org_2', checkoutId: 'co_2' })
    await t.mutation(m('recordConsent'), { ...proof, entityId: 'org_2', checkoutId: 'co_left' })
    await t.mutation(m('confirmConsent'), { checkoutId: 'co_1', subscriptionId: 'sub_1', at: Date.now() - 1000 })
    await t.mutation(m('confirmConsent'), { checkoutId: 'co_2', subscriptionId: 'sub_2', at: Date.now() })

    const all = await t.query(q('lifecycleConsole'), {}) as { saveOffers: Array<Record<string, unknown>>, withdrawals: unknown[], consents: Array<Record<string, unknown>> }
    expect(all.saveOffers.map(row => [row.entityId, row.acceptedAt !== undefined])).toEqual([['org_2', true], ['org_1', false]])
    expect(all.withdrawals).toEqual([{ entityId: 'org_1', subscriptionId: 'sub_1', userId: 'u1', productId: 'prod_pro', at: Date.now() }])
    // The checkout that started nothing is no proof.
    expect(all.consents.map(row => row.subscriptionId)).toEqual(['sub_2', 'sub_1'])

    const one = await t.query(q('lifecycleConsole'), { entityId: 'org_1' }) as typeof all
    expect(one.saveOffers.map(row => row.entityId)).toEqual(['org_1'])
    expect(one.consents.map(row => row.subscriptionId)).toEqual(['sub_1'])
    expect((await t.query(q('lifecycleConsole'), { entityId: 'org_9' }) as typeof all).withdrawals).toEqual([])
  })
})

describe('the reverse trial', () => {
  let t: TestConvex<ReturnType<typeof defineSchema>>
  let fake: PolarFake
  let ids: Awaited<ReturnType<typeof syncBillingCatalog>>['ids']

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
    await fake.idle()
  })

  afterEach(async () => {
    await fake.idle()
    fake.close()
    vi.unstubAllGlobals()
  })

  type Current = { productId: string, free?: true, pass?: { plan: string, endsAt: number, trial?: true } } | null
  const current = (caller: Awaited<ReturnType<typeof asUser>>) => caller.query(fn<'query'>('billing:getCurrentSubscription'), {}) as Promise<Current>
  const startFree = (entityId: string) => t.action(internalFn('billing:startFreePlan'), { entityId })
  const sweep = () => t.action(internalFn('billing:runGiftSweep'), { op: 'sweep' })
  const drain = async () => {
    await t.finishAllScheduledFunctions(() => vi.runAllTimers())
    await fake.idle()
  }

  test('billing sync records the trial\'s pass and its length, and the plan sells with no trial of its own', async () => {
    expect(ids.passes?.pro).toEqual({ pass: expect.any(String), months: {}, trialDays: 14 })
    const pro = Object.values(fake.state.products).find(product => product.id === ids.products.pro)!
    expect(pro.trialInterval ?? null).toBeNull()
  })

  test('starts a new workspace on the plan\'s pass for 14 days, once per address, and returns it to the free plan', async () => {
    const ana = await asUser(t, { email: 'delivered@resend.dev' })
    const startedAt = Date.now()
    await startFree(ana.workspaceId!)
    await drain()
    const row = await current(ana)
    expect(row).toMatchObject({ productId: ids.passes!.pro!.pass, pass: { plan: 'pro', trial: true } })
    expect(Math.abs(row!.pass!.endsAt - (startedAt + 14 * DAY))).toBeLessThan(5000)
    expect(Object.values(fake.state.orders)).toEqual([])

    // The same address with a plus tag and a dot gets none.
    const again = await asUser(t, { email: 'deli.vered+second@resend.dev' })
    await startFree(again.workspaceId!)
    await drain()
    expect(await current(again)).toMatchObject({ productId: ids.products.free, free: true })

    // Three days before its end the workspace is told, then it returns to the free plan.
    const endsAt = row!.pass!.endsAt
    await sweep()
    await fake.idle()
    vi.setSystemTime(endsAt - 2 * DAY)
    await sweep()
    const [trial] = await t.query(components.backend.gifts.listByPurchaser, { purchaserUserId: '' })
    expect(trial).toMatchObject({ plan: 'pro', reverseTrial: true, passNoticedAt: expect.any(Number) })
    vi.setSystemTime(endsAt + 1000)
    await sweep()
    await fake.idle()
    expect(await current(ana)).toMatchObject({ productId: ids.products.free, free: true })
  })
})
