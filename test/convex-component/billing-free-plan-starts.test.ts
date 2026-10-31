/// <reference types="vite/client" />
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { PolarCore } from '@polar-sh/sdk/core.js'
import { subscriptionsUpdate } from '@polar-sh/sdk/funcs/subscriptionsUpdate.js'
import { componentsGeneric, defineSchema, makeFunctionReference, mutationGeneric, type FunctionReference } from 'convex/server'
import { v } from 'convex/values'
import type { TestConvex } from 'convex-test'
import { syncBillingCatalog } from '../../src/cli/billing/sync'
import { createPolarFake, type PolarFake, routeToFake } from '../fixtures/polar-fake/server'
import type { BillingCatalog } from '../../src/convex/catalog'
import type { ComponentApi } from '../../src/convex/components/backend/_generated/component'
import type { Billing } from '../../src/convex/integrations/billing/types/surface'
import { asUser, defineBackendTestApp, seedWorkspace } from '../../src/convex/test'
import { signingSecret } from '../helpers/secrets'

// The free plan's start from the package's sources, where an app is set up
// short of the scaffold: a catalog with no free plan, a deployment with no
// access token, an app that mounts no workpool. And at its scale and its
// end: the backfill past its first page, and a revoke for a workspace no one
// owns any more, which starts nothing.

const SCAFFOLD = '../fixtures/registration/backend/'
const FAKE = 'http://127.0.0.1:4763'
const ENDPOINT = 'https://scaffold.convex.site/billing/events'
const SECRET = signingSecret()

const CATALOG: BillingCatalog = {
  plans: {
    free: { name: 'Free', prices: { month: 0 } },
    pro: { name: 'Pro', prices: { month: 2900 } },
  },
}

/** The billing setups the scaffold's billing.ts built. */
const built = vi.hoisted(() => ({ instances: {} as Record<'billing' | 'noFree' | 'unconfigured' | 'bare', Billing> }))

// The scaffold's `nuxt-backend/billing` (the built package) is the
// sources' here, so every line this suite runs counts against src/. Beside
// the scaffold's own billing, its setupBilling builds one whose catalog has
// no free plan, one with no access token, and one passed no workpool.
vi.mock('nuxt-backend/billing', async () => {
  const source = await import('../../src/convex/integrations/billing')
  const setupBilling: typeof source.setupBilling = (components, config) => {
    const { free: _free, ...noFree } = config.catalog!.sandbox!
    // The generic components resolve any name, the workpool's included: an app without it passes only these.
    const { backend, polar } = components as unknown as Record<string, unknown>
    const unpooled = { backend, polar }
    built.instances = {
      billing: source.setupBilling(components, config),
      noFree: source.setupBilling(components, { ...config, catalog: { sandbox: noFree } }),
      unconfigured: source.setupBilling(components, { ...config, accessToken: '' }),
      bare: source.setupBilling(unpooled as never, config),
    }
    return built.instances.billing
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
      },
    },
  }
})

vi.stubEnv('BILLING_ACCESS_TOKEN', 'polar_oat_fake')
vi.stubEnv('BILLING_WEBHOOK_SECRET', SECRET)
vi.stubEnv('SITE_URL', 'http://localhost:3000')
vi.stubEnv('AUTH_SECRET', 'free-plan-starts-suite-secret-0123456789abcdefgh')

const instances = async () => {
  await import('../fixtures/registration/backend/billing')
  return built.instances
}

const scaffold = import.meta.glob(['../fixtures/registration/backend/*.ts', '!**/convex.config.ts', '!**/auth.config.ts'])
const testApp = defineBackendTestApp(defineSchema({}), {
  ...scaffold,
  [`${SCAFFOLD}_generated/api.js`]: () => Promise.resolve({}),
  [`${SCAFFOLD}variants.ts`]: async () => {
    const { noFree, unconfigured, bare } = await instances()
    const created = (billing: Billing) => mutationGeneric({ args: { entityId: v.string() }, handler: async (ctx, { entityId }) => {
      await billing.entityCreated(ctx, { kind: 'workspace', id: entityId })
      return null
    } })
    return {
      startWithoutFreePlan: noFree.api.startFreePlan,
      startUnconfigured: unconfigured.api.startFreePlan,
      createdWithoutFreePlan: created(noFree),
      createdWithoutPool: created(bare),
    }
  },
})

const fn = <Kind extends 'query' | 'mutation' | 'action'>(path: string) => makeFunctionReference<Kind>(path) as FunctionReference<Kind, 'public'>
const internalFn = (path: string) => makeFunctionReference<'action'>(path) as unknown as FunctionReference<'action', 'internal'>
const components = componentsGeneric() as unknown as { backend: ComponentApi<'backend'> }

let t: TestConvex<ReturnType<typeof defineSchema>>
let fake: PolarFake
let ids: Awaited<ReturnType<typeof syncBillingCatalog>>['ids']

beforeAll(async () => {
  // The clock too: the workpool's loop schedules itself by it, and drains only while it stands still.
  vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval', 'Date'] })
  for (const level of ['log', 'info', 'warn', 'error'] as const) vi.spyOn(console, level).mockImplementation(() => {})
  // Loaded once, before any function runs: every module of the scaffold then imports this one billing.
  const { billing } = await import('../fixtures/registration/backend/billing') as { billing: unknown }
  expect(billing).toBe(built.instances.billing)
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
})

type Caller = Awaited<ReturnType<typeof asUser>>
type Current = { id: string, productId: string, status: string, free?: true } | null

const current = (caller: Caller) => caller.query(fn<'query'>('billing:getCurrentSubscription'), {}) as Promise<Current>
const live = () => Object.values(fake.state.subscriptions).filter(subscription => subscription.status === 'active')

/** Run the queue (the workpool and the scheduler) until nothing is left, then let the deliveries land. */
async function drain(): Promise<void> {
  await t.finishAllScheduledFunctions(() => vi.runAllTimers())
  await fake.idle()
}

describe('the free plan, where the app is set up short of the scaffold', { timeout: 30_000 }, () => {
  test('starts nothing where the catalog has no free plan: a start says so, and a new workspace or the backfill queues nothing', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    expect(await t.action(internalFn('variants:startWithoutFreePlan'), { entityId: ada.workspaceId! })).toBe('no_plan')
    await t.mutation(fn<'mutation'>('variants:createdWithoutFreePlan'), { entityId: ada.workspaceId! })
    expect(await t.action(internalFn('variants:startWithoutFreePlan'), {})).toBeNull()
    await drain()
    expect(Object.values(fake.state.customers)).toEqual([])
    expect(Object.values(fake.state.subscriptions)).toEqual([])
  })

  test('asks the provider nothing on a deployment with no access token, nor for the kind of entity billing does not bill', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    expect(await t.action(internalFn('variants:startUnconfigured'), { entityId: ada.workspaceId! })).toBe('not_configured')
    expect(await t.action(internalFn('billing:startFreePlan'), { entityId: ada.userId, kind: 'user' })).toBe('not_billed')
    expect(Object.values(fake.state.customers)).toEqual([])
  })

  test('is queued on the scheduler for a new workspace in an app that mounts no workpool', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    await t.mutation(fn<'mutation'>('variants:createdWithoutPool'), { entityId: ada.workspaceId! })
    await drain()
    expect(await current(ada)).toMatchObject({ productId: ids.products.free, free: true })
  })
})

describe('the free plan at scale and at its end', { timeout: 30_000 }, () => {
  test('reaches every workspace in the backfill, past its first page of a hundred', { timeout: 60_000 }, async () => {
    const workspaces: string[] = []
    for (let n = 0; n < 101; n++) workspaces.push(await seedWorkspace(t))
    const first = await asUser(t, { email: 'first@example.com', workspace: workspaces[0], workspaceRole: 'owner' })
    const last = await asUser(t, { email: 'last@example.com', workspace: workspaces.at(-1), workspaceRole: 'owner' })

    expect(await t.action(internalFn('billing:startFreePlan'), {})).toBeNull()
    await drain()

    // The workspaces nobody owns can hold no customer; one of the two owned is on each page.
    expect(await current(first)).toMatchObject({ productId: ids.products.free, free: true })
    expect(await current(last)).toMatchObject({ productId: ids.products.free, free: true })
    expect(live()).toHaveLength(2)
  })

  test('is not started again when the plan of a workspace no one owns any more is revoked', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    expect(await t.action(internalFn('billing:startFreePlan'), { entityId: ada.workspaceId! })).toBe('started')
    await fake.idle()
    const [free] = live()
    await t.mutation(components.backend.adapter.deleteOne, { input: { model: 'member', where: [{ field: 'organizationId', value: ada.workspaceId! }, { field: 'userId', value: ada.userId }] } } as never)

    const ended = await subscriptionsUpdate(new PolarCore({ accessToken: 'polar_oat_fake', server: 'sandbox' }), { id: free!.id, subscriptionUpdate: { revoke: true } })
    expect(ended.ok).toBe(true)
    await fake.idle()
    await drain()

    expect(live()).toEqual([])
    expect(Object.values(fake.state.subscriptions).map(subscription => [subscription.id, subscription.status])).toEqual([[free!.id, 'canceled']])
  })
})
