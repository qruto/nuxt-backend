/// <reference types="vite/client" />
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { defineSchema, type FunctionReference, makeFunctionReference } from 'convex/server'
import type { TestConvex } from 'convex-test'
import { syncBillingCatalog } from '../../src/cli/billing/sync'
import type { BillingCatalog } from '../../src/convex/catalog'
import { asUser, defineBackendTestApp } from '../../src/convex/test'
import { applyPendingEvents } from '../fixtures/polar-fake/ledger'
import { createPolarFake, type PolarFake, routeToFake } from '../fixtures/polar-fake/server'
import { signingSecret } from '../helpers/secrets'

// Welcome credits with `billTo: 'user'` from the package's sources, on the
// fake provider: each account is its own billing entity and gets them once,
// on a free plan that grants no credits of its own, so the meter exists only
// through the grant. A provider that applies the grant late leaves the
// balance shown all the same, and another account of the same person gets
// none.

const SCAFFOLD = '../fixtures/registration/backend/'
const FAKE = 'http://127.0.0.1:4773'
const ENDPOINT = 'https://scaffold.convex.site/billing/events'
const SECRET = signingSecret()

const CATALOG: BillingCatalog = {
  meters: { coins: { unit: { one: 'coin', other: 'coins' } } },
  plans: {
    free: { name: 'Free', prices: { month: 0 }, credits: { meter: 'coins', units: 8, once: true } },
    pro: { name: 'Pro', prices: { month: 699 }, credits: { meter: 'coins', units: 30, rollover: true } },
  },
}

// The scaffold's `nuxt-backend/billing` is the sources', billing per account.
vi.mock('nuxt-backend/billing', async () => {
  const source = await import('../../src/convex/integrations/billing')
  const setupBilling: typeof source.setupBilling = (components, config) => source.setupBilling(components, { ...config, billTo: 'user' })
  return { ...source, setupBilling }
})

vi.mock('../fixtures/registration/backend/billing.generated', async () => {
  const { stableId } = await import('../fixtures/polar-fake/state')
  const product = (key: string) => stableId('product', key)
  return {
    catalog: {
      sandbox: {
        products: { free: product('free'), pro: product('pro') },
        meters: { coins: { meterId: stableId('meter', 'coins'), eventName: 'coins', property: 'amount', unit: { one: 'coin', other: 'coins' } } },
        plans: { free: { month: product('free') }, pro: { month: product('pro') } },
        free: 'free',
        welcome: { meter: 'coins', units: 8 },
      },
    },
  }
})

vi.stubEnv('BILLING_ACCESS_TOKEN', 'polar_oat_fake')
vi.stubEnv('BILLING_WEBHOOK_SECRET', SECRET)
vi.stubEnv('SITE_URL', 'http://localhost:3000')
vi.stubEnv('AUTH_SECRET', 'welcome-accounts-suite-secret-0123456789abcdefg')

const scaffold = import.meta.glob(['../fixtures/registration/backend/*.ts', '!**/convex.config.ts', '!**/auth.config.ts'])
const testApp = defineBackendTestApp(defineSchema({}), {
  ...scaffold,
  [`${SCAFFOLD}_generated/api.js`]: () => Promise.resolve({}),
})

const fn = <Kind extends 'query' | 'mutation' | 'action'>(path: string) => makeFunctionReference<Kind>(path) as FunctionReference<Kind, 'public'>
const internalFn = (path: string) => makeFunctionReference<'action'>(path) as unknown as FunctionReference<'action', 'internal'>

let t: TestConvex<ReturnType<typeof defineSchema>>
let fake: PolarFake

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
  t = testApp()
  const app = t
  fake = createPolarFake({
    baseUrl: FAKE,
    fetcher: (url, init) => app.fetch(new URL(url).pathname, { method: 'POST', headers: init.headers, body: init.body as string }),
  })
  vi.stubGlobal('fetch', routeToFake(fake, FAKE))
  fake.ensureEndpoint(ENDPOINT, SECRET)
  const { ids } = await syncBillingCatalog(CATALOG, { rootDir: '.', environment: 'sandbox', accessToken: 'polar_oat_fake', dryRun: false, adopt: {} })
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
const balance = async (caller: Caller) => (await caller.query(fn<'query'>('billing:getCredits'), {}) as { meters: Array<{ balance: number }> } | null)?.meters[0]?.balance
const start = (userId: string) => t.action(internalFn('billing:startFreePlan'), { entityId: userId, kind: 'user' })
const welcomeEvents = (entityId: string) => fake.state.events.filter(event => event.externalId === `welcome:${entityId}`)

/** Run the queue for a while, short of the check five and a half minutes after a grant, then let the deliveries land. */
async function runQueue(): Promise<void> {
  for (let step = 0; step < 20; step++) {
    vi.advanceTimersByTime(2000)
    await t.finishInProgressScheduledFunctions()
  }
  await fake.idle()
}

/** Run the queue (the workpool and the scheduler) until nothing is left, then let the deliveries land. */
async function drain(): Promise<void> {
  await t.finishAllScheduledFunctions(() => vi.runAllTimers())
  await fake.idle()
}

describe('welcome credits for accounts billed on their own', () => {
  test('are the account\'s once, on a meter only the grant touches', async () => {
    const ada = await asUser(t, { email: 'ada@example.com', workspace: false })
    expect(await start(ada.userId)).toBe('started')
    await drain()
    expect(welcomeEvents(ada.userId)).toEqual([expect.objectContaining({ name: 'coins', externalCustomerId: ada.userId, metadata: { reason: 'welcome', amount: -8 } })])
    expect(await balance(ada)).toBe(8)
  })

  test('show at once while the provider has not applied them, then from the provider', async () => {
    fake.state.lagEvents = true
    const ada = await asUser(t, { email: 'ada@example.com', workspace: false })
    await start(ada.userId)
    await runQueue()
    // The provider lists no meter for the account yet: the cache holds the one the grant made.
    expect(await balance(ada)).toBe(8)
    await ada.action(fn<'action'>('billing:syncEntitlements'), {})
    expect(await balance(ada)).toBe(8)
    fake.state.lagEvents = false
    applyPendingEvents(fake.state, Date.now())
    await drain()
    expect(await balance(ada)).toBe(8)
  })

  test('are none for another account of the same person: its address with a tag and a dot added', async () => {
    const ada = await asUser(t, { email: 'ada@example.com', workspace: false })
    await start(ada.userId)
    await drain()
    const again = await asUser(t, { email: 'a.da+again@example.com', workspace: false })
    expect(await start(again.userId)).toBe('started')
    await drain()
    expect(welcomeEvents(again.userId)).toEqual([])
    expect(welcomeEvents(ada.userId)).toHaveLength(1)
  })
})
