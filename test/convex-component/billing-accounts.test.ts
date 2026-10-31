/// <reference types="vite/client" />
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { PolarCore } from '@polar-sh/sdk/core.js'
import { customersCreate } from '@polar-sh/sdk/funcs/customersCreate.js'
import { defineSchema, makeFunctionReference, mutationGeneric, type FunctionReference } from 'convex/server'
import type { TestConvex } from 'convex-test'
import { syncBillingCatalog } from '../../src/cli/billing/sync'
import { createPolarFake, type PolarFake, routeToFake } from '../fixtures/polar-fake/server'
import type { BillingCatalog } from '../../src/convex/catalog'
import { getBackendError } from '../../src/convex/errors'
import type { Billing } from '../../src/convex/integrations/billing/types/surface'
import { asUser, defineBackendTestApp } from '../../src/convex/test'
import { signingSecret } from '../helpers/secrets'

// Billing per account (`billTo: 'user'`) from the package's sources, on the
// fake provider: every account starts on its own free plan, adopting the
// customer its proven email already had and leaving alone one another
// account's customer holds; the backfill pages the accounts, not their
// workspaces; and a quota refuses in an account's words.

const SCAFFOLD = '../fixtures/registration/backend/'
const FAKE = 'http://127.0.0.1:4764'
const ENDPOINT = 'https://scaffold.convex.site/billing/events'
const SECRET = signingSecret()

const CATALOG: BillingCatalog = {
  plans: {
    free: { name: 'Free', prices: { month: 0 }, quotas: { projects: 1 } },
    pro: { name: 'Pro', prices: { month: 2900 }, quotas: { projects: 10 } },
  },
  quotas: { projects: { description: 'Projects' } },
}

/** The billing setup the scaffold's billing.ts built. */
const built = vi.hoisted(() => ({ billing: null as unknown }))

// The scaffold's `nuxt-backend/billing` (the built package) is the
// sources' here, so every line this suite runs counts against src/, and
// its billing is per account.
vi.mock('nuxt-backend/billing', async () => {
  const source = await import('../../src/convex/integrations/billing')
  const setupBilling: typeof source.setupBilling = (components, config) => {
    const billing = source.setupBilling(components, { ...config, billTo: 'user' })
    built.billing = billing
    return billing
  }
  return { ...source, setupBilling }
})

vi.mock('../fixtures/registration/backend/billing.generated', async () => {
  const { stableId } = await import('../fixtures/polar-fake/state')
  const product = (key: string) => stableId('product', key)
  return {
    catalog: {
      sandbox: {
        products: { free: product('free'), pro: product('pro') },
        meters: {},
        plans: { free: { month: product('free') }, pro: { month: product('pro') } },
        free: 'free',
        quotas: { projects: 'Projects' },
      },
    },
  }
})

vi.stubEnv('BILLING_ACCESS_TOKEN', 'polar_oat_fake')
vi.stubEnv('BILLING_WEBHOOK_SECRET', SECRET)
vi.stubEnv('SITE_URL', 'http://localhost:3000')
vi.stubEnv('AUTH_SECRET', 'billing-accounts-suite-secret-0123456789abcdefgh')

const scaffold = import.meta.glob(['../fixtures/registration/backend/*.ts', '!**/convex.config.ts', '!**/auth.config.ts'])
const testApp = defineBackendTestApp(defineSchema({}), {
  ...scaffold,
  [`${SCAFFOLD}_generated/api.js`]: () => Promise.resolve({}),
  [`${SCAFFOLD}projects.ts`]: async () => {
    const { billing } = await import('../fixtures/registration/backend/billing') as unknown as { billing: Billing }
    return { create: mutationGeneric({ args: {}, handler: ctx => billing.requireQuota(ctx, 'projects') }) }
  },
})

const fn = <Kind extends 'query' | 'mutation' | 'action'>(path: string) => makeFunctionReference<Kind>(path) as FunctionReference<Kind, 'public'>
const internalFn = (path: string) => makeFunctionReference<'action'>(path) as unknown as FunctionReference<'action', 'internal'>

let t: TestConvex<ReturnType<typeof defineSchema>>
let fake: PolarFake
let ids: Awaited<ReturnType<typeof syncBillingCatalog>>['ids']

beforeAll(async () => {
  // The clock too: the workpool's loop schedules itself by it, and drains only while it stands still.
  vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval', 'Date'] })
  for (const level of ['log', 'info', 'warn', 'error'] as const) vi.spyOn(console, level).mockImplementation(() => {})
  // Loaded once, before any function runs: every module of the scaffold then imports this one billing.
  const { billing } = await import('../fixtures/registration/backend/billing') as { billing: unknown }
  expect(billing).toBe(built.billing)
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
  const { catalog } = await import('../fixtures/registration/backend/billing.generated') as { catalog: { sandbox: unknown } }
  expect(ids).toEqual(catalog.sandbox)
  await fake.idle()
})

afterEach(async () => {
  await fake.idle()
  fake.close()
  vi.unstubAllGlobals()
  vi.mocked(console.warn).mockClear()
})

const start = (entityId: string) => t.action(internalFn('billing:startFreePlan'), { entityId })
const polar = () => new PolarCore({ accessToken: 'polar_oat_fake', server: 'sandbox' })

/** A customer made at the provider before this account was ever billed: by a checkout of an earlier app, say. */
async function earlierCustomer(email: string, externalId?: string) {
  const created = await customersCreate(polar(), { email, name: 'Earlier', ...(externalId ? { externalId } : {}) })
  if (!created.ok) throw created.error
  await fake.idle()
  return created.value
}

/** The account's subscriptions at the provider, as the fake keeps them. */
function subscriptionsOf(entityId: string) {
  const customer = Object.values(fake.state.customers).find(entry => entry.externalId === entityId)
  return Object.values(fake.state.subscriptions).filter(subscription => subscription.customerId === customer?.id)
}

describe('the free plan, per account', { timeout: 30_000 }, () => {
  test('starts on the customer the account\'s proven email already had, now keyed to the account', async () => {
    const earlier = await earlierCustomer('ada@example.com')
    const ada = await asUser(t, { email: 'ada@example.com' })

    expect(await start(ada.userId)).toBe('started')
    await fake.idle()

    expect(Object.values(fake.state.customers)).toEqual([expect.objectContaining({ id: earlier.id, externalId: ada.userId })])
    expect(subscriptionsOf(ada.userId)).toEqual([expect.objectContaining({ productId: ids.products.free, status: 'active' })])
  })

  test('leaves off the plan an account whose email another account\'s customer holds, and says why', async () => {
    await earlierCustomer('grace@example.com', 'another-account')
    const grace = await asUser(t, { email: 'grace@example.com' })

    expect(await start(grace.userId)).toBe('customer_taken')

    expect(vi.mocked(console.warn).mock.calls.flat().join('\n')).toContain('billing.free_plan_customer_taken')
    expect(Object.values(fake.state.subscriptions)).toEqual([])
  })

  test('starts nothing for an account that no longer exists', async () => {
    expect(await start('j57f8h3a5mv0rq0ktbq7tv4n7d7sgk3e')).toBe('gone')
    expect(Object.values(fake.state.customers)).toEqual([])
  })

  test('is queued for every account by the backfill, never for their workspaces', async () => {
    const accounts = [await asUser(t, { email: 'ada@example.com' }), await asUser(t, { email: 'grace@example.com' })]

    await t.action(internalFn('billing:startFreePlan'), {})
    await t.finishAllScheduledFunctions(() => vi.runAllTimers())
    await fake.idle()

    for (const account of accounts) expect(subscriptionsOf(account.userId), account.email).toEqual([expect.objectContaining({ productId: ids.products.free })])
    expect(Object.values(fake.state.customers).map(customer => customer.externalId).sort()).toEqual(accounts.map(account => account.userId).sort())
  })
})

describe('quotas, per account', { timeout: 30_000 }, () => {
  test('refuse a claim past the free plan\'s limit in the account\'s words, naming the plan that allows more', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    expect(await start(ada.userId)).toBe('started')
    await fake.idle()

    expect(await ada.mutation(fn<'mutation'>('projects:create'), {})).toEqual({ limit: 1, used: 1, description: 'Projects' })
    const refused = await ada.mutation(fn<'mutation'>('projects:create'), {}).catch((error: unknown) => error)

    expect(getBackendError(refused)).toMatchObject({ code: 'quota_exceeded', data: { quota: 'projects', limit: 1, used: 1, amount: 1, plans: ['pro'] } })
    expect((refused as Error).message).toContain('This account\'s plan allows 1 projects and 1 is used, so 1 more does not fit; pro allows enough.')
  })
})
