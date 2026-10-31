/// <reference types="vite/client" />
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { componentsGeneric, defineSchema, makeFunctionReference, type FunctionReference } from 'convex/server'
import type { TestConvex } from 'convex-test'
import { syncBillingCatalog } from '../../src/cli/billing/sync'
import { createPolarFake, type PolarFake, routeToFake } from '../fixtures/polar-fake/server'
import type { BillingCatalog } from '../../src/convex/catalog'
import type { ComponentApi } from '../../src/convex/components/backend/_generated/component'
import type { Billing } from '../../src/convex/integrations/billing/types/surface'
import type { ReferralsView } from '../../src/convex/integrations/referrals'
import { addMonths } from '../../src/convex/integrations/billing/passes'
import { asUser, defineBackendTestApp } from '../../src/convex/test'
import { signingSecret } from '../helpers/secrets'

// A program that pays in time: trial days for the person referred and free
// months for the referrer. A paid plan's renewal date moves later by the
// months; a workspace on the free plan gets the plan's pass.

const SCAFFOLD = '../fixtures/registration/backend/'
const SITE = 'http://localhost:3000'
const FAKE = 'http://127.0.0.1:4762'
const ENDPOINT = 'https://scaffold.convex.site/billing/events'
const SECRET = signingSecret()
const DAY = 24 * 60 * 60 * 1000

const CATALOG: BillingCatalog = {
  meters: { credits: { eventName: 'credits', property: 'amount' } },
  plans: {
    free: { name: 'Free', prices: { month: 0 }, credits: { meter: 'credits', units: 20 } },
    pro: { name: 'Pro', prices: { month: 1200 }, credits: { meter: 'credits', units: 500 }, gift: { months: [1, 3] } },
  },
  packs: { credits500: { name: '500 credits', price: 2000, credits: { meter: 'credits', units: 500 } } },
}

vi.mock('../fixtures/registration/backend/billing.generated', async () => {
  const { stableId } = await import('../fixtures/polar-fake/state')
  const product = (key: string) => stableId('product', key)
  return {
    catalog: {
      sandbox: {
        products: { free: product('free'), pro: product('pro'), credits500: product('credits500') },
        plans: { free: { month: product('free') }, pro: { month: product('pro') } },
        free: 'free',
        packs: ['credits500'],
        gifts: { credits500: product('credits500-gift') },
        passes: { pro: { pass: product('pro-pass'), months: { 1: product('pro-gift-1'), 3: product('pro-gift-3') } } },
        meters: { credits: { meterId: stableId('meter', 'credits'), eventName: 'credits', property: 'amount' } },
      },
    },
  }
})

vi.stubEnv('BILLING_ACCESS_TOKEN', 'polar_oat_fake')
vi.stubEnv('BILLING_WEBHOOK_SECRET', SECRET)
vi.stubEnv('SITE_URL', SITE)
vi.stubEnv('AUTH_SECRET', 'referrals-months-secret-0123456789abcdefghijklmn')

const components = componentsGeneric() as unknown as { backend: ComponentApi<'backend'> }
const scaffold = import.meta.glob(['../fixtures/registration/backend/*.ts', '!**/convex.config.ts', '!**/auth.config.ts'])
const testApp = defineBackendTestApp(defineSchema({}), {
  ...scaffold,
  [`${SCAFFOLD}_generated/api.js`]: () => Promise.resolve({}),
  [`${SCAFFOLD}referrals.ts`]: async () => {
    const { setupReferrals } = await import('nuxt-backend/billing')
    // The fixture is typed from the built package, whose `Billing` leaves out the @internal members.
    const { billing } = await import('../fixtures/registration/backend/billing') as unknown as { billing: Billing }
    return { ...setupReferrals(components as never, { billing, rewards: { referred: { trialDays: 14 }, referrer: { months: 1 } }, hold: 14 * DAY }).api }
  },
})

const fn = <Kind extends 'query' | 'mutation' | 'action'>(path: string) => makeFunctionReference<Kind>(path) as FunctionReference<Kind, 'public'>
const internalFn = (path: string) => makeFunctionReference<'action'>(path) as unknown as FunctionReference<'action', 'internal'>

let t: TestConvex<ReturnType<typeof defineSchema>>
let fake: PolarFake
let ids: Awaited<ReturnType<typeof syncBillingCatalog>>['ids']

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

beforeAll(() => {
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
  await fake.idle()
})

afterEach(async () => {
  await fake.idle()
  fake.close()
  vi.unstubAllGlobals()
})

type Caller = Awaited<ReturnType<typeof asUser>>

const codeOf = async (caller: Caller) => (await caller.mutation(fn<'mutation'>('referrals:getReferralCode'), {}) as { code: string }).code
const mine = (caller: Caller) => caller.query(fn<'query'>('referrals:getReferrals'), {}) as Promise<ReferralsView | null>
const sweep = () => t.action(internalFn('referrals:runReferralSweep'), { op: 'sweep' })
const checkoutAt = (url: string) => Object.values(fake.state.checkouts).find(entry => url.endsWith(entry.id))!

async function pay(url: string): Promise<void> {
  await fake.handle(new Request(`${url}/pay`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'origin': FAKE } }))
  await fake.idle()
}

const link = (caller: Caller, productId: string) => caller.action(fn<'action'>('billing:generateCheckoutLink'), { productIds: [productId], origin: SITE, successUrl: `${SITE}/billing` }) as Promise<{ url: string }>

/** A friend who signs up through the code and pays for a pack: a paid order, which starts the hold. */
async function friendWhoPays(code: string, email: string) {
  const friend = await asUser(t, { email })
  expect(await friend.mutation(fn<'mutation'>('referrals:claimReferral'), { code })).toEqual({ claimed: true })
  await pay((await link(friend, ids.products.credits500!)).url)
}

describe('the person referred', () => {
  test('opens a plan checkout with the program\'s trial days, and a pack checkout with none', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    const grace = await asUser(t, { email: 'grace@example.com' })
    await grace.mutation(fn<'mutation'>('referrals:claimReferral'), { code: await codeOf(ada) })
    const plan = checkoutAt((await link(grace, ids.products.pro!)).url)
    expect(plan).toMatchObject({ trialInterval: 'day', trialIntervalCount: 14 })
    const pack = checkoutAt((await link(grace, ids.products.credits500!)).url)
    expect(pack.trialInterval ?? null).toBeNull()
  })
})

describe('free months for the referrer', () => {
  test('on a paid plan move the renewal date later by the months, once however often the sweep runs', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    await pay((await link(ada, ids.products.pro!)).url)
    const subscription = Object.values(fake.state.subscriptions).find(entry => entry.productId === ids.products.pro)!
    const before = new Date(subscription.currentPeriodEnd).getTime()
    await friendWhoPays(await codeOf(ada), 'grace@example.com')
    vi.setSystemTime(Date.now() + 15 * DAY)
    await sweep()
    await fake.idle()
    await sweep()
    await fake.idle()
    expect(await mine(ada)).toMatchObject({ rewarded: 1 })
    expect(new Date(Object.values(fake.state.subscriptions).find(entry => entry.productId === ids.products.pro)!.currentPeriodEnd).getTime()).toBe(addMonths(before, 1))
  })

  test('on the free plan start the plan\'s pass for the months', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    await t.action(internalFn('billing:startFreePlan'), { entityId: ada.workspaceId })
    await fake.idle()
    await friendWhoPays(await codeOf(ada), 'grace@example.com')
    vi.setSystemTime(Date.now() + 15 * DAY)
    await sweep()
    await fake.idle()
    expect(await mine(ada)).toMatchObject({ rewarded: 1 })
    const current = await ada.query(fn<'query'>('billing:getCurrentSubscription'), {}) as { pass?: { plan: string, endsAt: number } } | null
    expect(current?.pass).toMatchObject({ plan: 'pro' })
    expect(current!.pass!.endsAt).toBe(addMonths(Date.now(), 1))
  })

  test('on a workspace that holds a pass wait for it to end: never stacked on it, nor lost', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    await t.action(internalFn('billing:startFreePlan'), { entityId: ada.workspaceId })
    await fake.idle()
    const code = await codeOf(ada)
    await friendWhoPays(code, 'grace@example.com')
    await friendWhoPays(code, 'linus@example.com')
    vi.setSystemTime(Date.now() + 15 * DAY)
    await sweep()
    await fake.idle()
    // The first reward is a month's pass; the second waits for it.
    expect(await mine(ada)).toMatchObject({ rewarded: 1, held: 1 })
    const pass = (await ada.query(fn<'query'>('billing:getCurrentSubscription'), {}) as { pass?: { endsAt: number } } | null)?.pass
    expect(pass).toBeDefined()
    await sweep()
    expect(await mine(ada)).toMatchObject({ rewarded: 1, held: 1 })
    // The pass ends and the workspace is back on the free plan: the second month starts a pass of its own.
    vi.setSystemTime(pass!.endsAt + 1000)
    await t.action(internalFn('billing:runGiftSweep'), { op: 'sweep' })
    await fake.idle()
    await sweep()
    await fake.idle()
    expect(await mine(ada)).toMatchObject({ rewarded: 2, held: 0 })
    const next = (await ada.query(fn<'query'>('billing:getCurrentSubscription'), {}) as { pass?: { endsAt: number } } | null)?.pass
    expect(next!.endsAt).toBe(addMonths(Date.now(), 1))
  })
})
