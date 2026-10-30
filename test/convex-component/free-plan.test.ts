/// <reference types="vite/client" />
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { componentsGeneric, defineSchema, makeFunctionReference, mutationGeneric, queryGeneric, type FunctionReference } from 'convex/server'
import { v } from 'convex/values'
import type { TestConvex } from 'convex-test'
import { syncBillingCatalog } from '../../src/cli/billing/sync'
import { signDelivery } from '../fixtures/polar-fake/deliver'
import { createPolarFake, type PolarFake, routeToFake } from '../fixtures/polar-fake/server'
import type { BillingCatalog } from '../../src/convex/catalog'
import type { ComponentApi } from '../../src/convex/components/backend/_generated/component'
import { getBackendError } from '../../src/convex/errors'
import type { Pricing } from '../../src/convex/integrations/billing/types/records'
import type { Billing } from '../../src/convex/integrations/billing/types/surface'
import { asUser, defineBackendTestApp, seedWorkspace } from '../../src/convex/test'
import { signingSecret } from '../helpers/secrets'

// The free plan as a real subscription, and prices in two currencies, end to
// end on the fake provider through the scaffold an app gets: a new
// workspace is put on the free plan through the workpool, its credits are
// granted by the provider; a checkout of a paid plan upgrades the free
// subscription in place, its trial kept; the free plan is never checked out,
// changed, cancelled or paused; a paid plan that ends puts the workspace back
// on it, unless the workspace is gone; the backfill reaches every workspace.
// And the visitor's currency: pricing and checkout in euros, a currency the
// catalog does not price refused.

const SCAFFOLD = '../fixtures/registration/backend/'
const SITE = 'http://localhost:3000'
const FAKE = 'http://127.0.0.1:4749'
const ENDPOINT = 'https://scaffold.convex.site/billing/events'
const SECRET = signingSecret()

const CATALOG: BillingCatalog = {
  meters: { credits: { eventName: 'credits', property: 'amount' } },
  plans: {
    free: { name: 'Free', prices: { month: 0 }, credits: { meter: 'credits', units: 10 } },
    pro: { name: 'Pro', prices: { usd: { month: 2900 }, eur: { month: 2700 } }, credits: { meter: 'credits', units: 500 }, trial: { interval: 'day', count: 14 } },
  },
  packs: { credits500: { name: '500 credits', price: { usd: 4000, eur: 3600 }, credits: { meter: 'credits', units: 500 } } },
}

// What `billing sync` writes as the fake provider's entry (checked against the real sync below).
vi.mock('../fixtures/registration/backend/billing.generated', async () => {
  const { stableId } = await import('../fixtures/polar-fake/state')
  const product = (key: string) => stableId('product', key)
  return {
    catalog: {
      sandbox: {
        products: { free: product('free'), pro: product('pro'), credits500: product('credits500') },
        meters: { credits: { meterId: stableId('meter', 'credits'), eventName: 'credits', property: 'amount' } },
        currency: 'usd',
        plans: { free: { month: product('free') }, pro: { month: product('pro') } },
        free: 'free',
        gifts: { credits500: product('credits500-gift') },
        packs: ['credits500'],
      },
    },
  }
})

vi.stubEnv('BILLING_ACCESS_TOKEN', 'polar_oat_fake')
vi.stubEnv('BILLING_WEBHOOK_SECRET', SECRET)
vi.stubEnv('SITE_URL', SITE)
vi.stubEnv('AUTH_SECRET', 'free-plan-suite-secret-0123456789abcdefghijklmno')

const scaffold = import.meta.glob(['../fixtures/registration/backend/*.ts', '!**/convex.config.ts', '!**/auth.config.ts'])
const testApp = defineBackendTestApp(defineSchema({}), {
  ...scaffold,
  [`${SCAFFOLD}_generated/api.js`]: () => Promise.resolve({}),
  // A workspace the app made itself, queued for the free plan as registerBackendRoutes queues each new one.
  [`${SCAFFOLD}workspaces.ts`]: async () => {
    // The fixture is typed from the built package, whose `Billing` leaves out the @internal members.
    const { billing } = await import('../fixtures/registration/backend/billing') as unknown as { billing: Billing }
    return {
      created: mutationGeneric({ args: { entityId: v.string(), kind: v.optional(v.union(v.literal('workspace'), v.literal('user'))) }, handler: async (ctx, { entityId, kind }) => {
        await billing.entityCreated(ctx, { kind: kind ?? 'workspace', id: entityId })
        return null
      } }),
      // What the workspace delete route asks billing before a workspace goes.
      deletionRefusal: queryGeneric({ args: { entityId: v.string() }, handler: async (ctx, { entityId }) => billing.deletionRefusal(ctx, { kind: 'workspace', id: entityId }) }),
    }
  },
})

const fn = <Kind extends 'query' | 'mutation' | 'action'>(path: string) => makeFunctionReference<Kind>(path) as FunctionReference<Kind, 'public'>
const internalFn = (path: string) => makeFunctionReference<'action'>(path) as unknown as FunctionReference<'action', 'internal'>
const components = componentsGeneric() as unknown as { backend: ComponentApi<'backend'> }

let t: TestConvex<ReturnType<typeof defineSchema>>
let fake: PolarFake
/**
 * Rewrites a delivery's event on its way to the deployment, signed again
 * with the endpoint's secret: what the provider sends and the fake provider
 * does not model (a customer deleted at the provider). `true` when it changed it.
 */
let rewrite: ((event: { type: string, data: Record<string, any> }) => boolean) | null = null

/** A delivery as the fake provider posts it, rewritten (and signed again) when a test asks. */
function rewritten(init: { headers: HeadersInit, body: string }): { headers: HeadersInit, body: string } {
  const event = JSON.parse(init.body) as { type: string, data: Record<string, any> }
  if (!rewrite?.(event)) return init
  const body = JSON.stringify(event)
  const headers = new Headers(init.headers)
  headers.set('webhook-signature', signDelivery(SECRET, headers.get('webhook-id')!, new Date(Number(headers.get('webhook-timestamp')) * 1000), body))
  return { headers, body }
}

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
  t = testApp()
  const app = t
  fake = createPolarFake({
    baseUrl: FAKE,
    fetcher: (url, init) => app.fetch(new URL(url).pathname, { method: 'POST', ...rewritten({ headers: init.headers as HeadersInit, body: init.body as string }) }),
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
  rewrite = null
})

type Caller = Awaited<ReturnType<typeof asUser>>
type Current = { id: string, productId: string, productKey?: string, status: string, free?: true, trialEnd?: string | null } | null

const current = (caller: Caller) => caller.query(fn<'query'>('billing:getCurrentSubscription'), {}) as Promise<Current>
const balance = async (caller: Caller) => (await caller.query(fn<'query'>('billing:getCredits'), {}) as { meters: Array<{ balance: number }> } | null)?.meters[0]?.balance
const start = (entityId: string) => t.action(internalFn('billing:startFreePlan'), { entityId })
const refusal = (promise: Promise<unknown>) => promise.then(() => null, (error: unknown) => getBackendError(error))

/** Run the queue (the workpool and the scheduler) until nothing is left, then let the deliveries land. */
async function drain(): Promise<void> {
  await t.finishAllScheduledFunctions(() => vi.runAllTimers())
  await fake.idle()
}

/** Have the fake provider send one event about a record as it stands, and nothing else, then let it land. */
async function fire(type: string, id: string): Promise<void> {
  await fake.handle(new Request(`${FAKE}/_fake/fire`, { method: 'POST', headers: { 'content-type': 'application/json', 'origin': FAKE }, body: JSON.stringify({ type, id }) }))
  await fake.idle()
}

/** End a subscription at the provider without a word to the deployment: its events are the test's to send. */
function endQuietly(id: string): void {
  const time = Date.now()
  Object.assign(fake.state.subscriptions[id]!, { status: 'canceled', cancelAtPeriodEnd: false, canceledAt: time, endsAt: time, endedAt: time })
}

/** Pay a checkout on its page, then let its events land. */
async function pay(url: string): Promise<void> {
  await fake.handle(new Request(`${url}/pay`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'origin': FAKE } }))
  await fake.idle()
}

/** Ada, owner of her workspace, on the free plan. */
async function onFree(): Promise<Caller> {
  const ada = await asUser(t, { email: 'ada@example.com' })
  expect(await start(ada.workspaceId!)).toBe('started')
  await fake.idle()
  return ada
}

describe('the free plan, end to end', () => {
  test('starts once for a new workspace, as a real subscription whose credits the provider grants', async () => {
    const ada = await onFree()
    expect(await current(ada)).toMatchObject({ productKey: 'free', status: 'active', free: true })
    expect(await balance(ada)).toBe(10)
    // Once: a workspace on a plan is left as it is.
    expect(await start(ada.workspaceId!)).toBe('subscribed')
    expect(Object.values(fake.state.subscriptions)).toHaveLength(1)
    // No order: the provider makes none for it, and the history lists none.
    expect(await ada.action(fn<'action'>('billing:getOrders'), {})).toMatchObject({ items: [] })
  })

  test('is queued through the workpool as a workspace is created, and only for the kind billing bills', async () => {
    const workspaceId = await seedWorkspace(t)
    const ada = await asUser(t, { email: 'ada@example.com', workspace: workspaceId, workspaceRole: 'owner' })
    await t.mutation(fn<'mutation'>('workspaces:created'), { entityId: ada.userId, kind: 'user' })
    await drain()
    expect(Object.values(fake.state.subscriptions)).toHaveLength(0)
    await t.mutation(fn<'mutation'>('workspaces:created'), { entityId: workspaceId })
    await drain()
    expect(await current(ada)).toMatchObject({ productKey: 'free', free: true })
  })

  test('leaves a workspace that is gone, or has no owner, alone', async () => {
    expect(await start(await seedWorkspace(t))).toBe('gone')
    expect(await start('j57f8h3a5mv0rq0ktbq7tv4n7d7sgk3e')).toBe('gone')
    expect(Object.values(fake.state.customers)).toEqual([])
  })

  test('is upgraded in place by a checkout of a paid plan, which keeps its trial', async () => {
    const ada = await onFree()
    const free = (await current(ada))!
    const pro = Object.values(fake.state.products).find(product => product.metadata.key === 'pro')!.id
    const { url } = await ada.action(fn<'action'>('billing:generateCheckoutLink'), { productIds: [pro], origin: SITE, successUrl: `${SITE}/pricing` }) as { url: string }
    const checkout = Object.values(fake.state.checkouts).at(-1)!
    expect(checkout.subscriptionId).toBe(free.id)
    await pay(url)
    const upgraded = (await current(ada))!
    // The same subscription, on the plan, trialing: the owner's one trial is still theirs.
    expect(upgraded).toMatchObject({ id: free.id, productKey: 'pro', status: 'trialing' })
    expect(upgraded).not.toHaveProperty('free')
    expect(Object.values(fake.state.subscriptions)).toHaveLength(1)
    expect(await balance(ada)).toBe(500)
  })

  test('is never checked out, changed, cancelled or paused', async () => {
    const ada = await onFree()
    const free = (await current(ada))!
    expect(await refusal(ada.action(fn<'action'>('billing:generateCheckoutLink'), { productIds: [free.productId], origin: SITE, successUrl: `${SITE}/pricing` })))
      .toMatchObject({ code: 'invalid_input', data: { field: 'productIds', reason: 'free_plan' } })
    for (const [name, args] of [['cancelSubscription', {}], ['pauseSubscription', {}], ['updateSubscription', { productId: free.productId }]] as const) {
      const refused = await refusal(ada.action(fn<'action'>(`billing:${name}`), args))
      expect(refused, name).toMatchObject({ code: 'invalid_input', data: { reason: 'free_plan' } })
      // No sentence of its own: the `errors.invalid_input_free_plan` label speaks, in the app's words.
      expect(refused!.data, name).not.toHaveProperty('message')
    }
    expect(Object.values(fake.state.subscriptions)).toMatchObject([{ status: 'active', cancelAtPeriodEnd: false }])
  })

  test('comes back when a paid plan ends, through the queue', async () => {
    const ada = await onFree()
    const pro = Object.values(fake.state.products).find(product => product.metadata.key === 'pro')!.id
    const { url } = await ada.action(fn<'action'>('billing:generateCheckoutLink'), { productIds: [pro], origin: SITE, successUrl: `${SITE}/pricing` }) as { url: string }
    await pay(url)
    await ada.action(fn<'action'>('billing:cancelSubscription'), { atPeriodEnd: false })
    await fake.idle()
    await drain()
    const back = (await current(ada))!
    expect(back).toMatchObject({ productKey: 'free', free: true, status: 'active' })
    expect(Object.values(fake.state.subscriptions).map(subscription => subscription.status).sort()).toEqual(['active', 'canceled'])
  })

  test('comes back when a paid plan\'s revoke lands before the update that ends it', async () => {
    const ada = await onFree()
    const pro = Object.values(fake.state.products).find(product => product.metadata.key === 'pro')!.id
    const { url } = await ada.action(fn<'action'>('billing:generateCheckoutLink'), { productIds: [pro], origin: SITE, successUrl: `${SITE}/pricing` }) as { url: string }
    await pay(url)
    const paid = (await current(ada))!
    // The provider ends it, and its revoke arrives first: the synced table still reads it live.
    endQuietly(paid.id)
    await fire('subscription.revoked', paid.id)
    expect(await current(ada)).toMatchObject({ id: paid.id, productKey: 'pro' })
    await drain()
    const live = Object.values(fake.state.subscriptions).filter(subscription => subscription.status === 'active')
    expect(live).toHaveLength(1)
    expect(live[0]!.id).not.toBe(paid.id)
    expect(fake.state.products[live[0]!.productId]!.metadata.key).toBe('free')
  })

  test('is not started again once the provider deleted the customer', async () => {
    await onFree()
    const [free] = Object.values(fake.state.subscriptions)
    endQuietly(free!.id)
    // An erasure at the provider: the customer is gone, and the plan ended with it.
    rewrite = (event) => {
      if (event.type !== 'subscription.revoked') return false
      event.data.customer.deleted_at = new Date().toISOString()
      return true
    }
    await fire('subscription.revoked', free!.id)
    await drain()
    expect(Object.values(fake.state.subscriptions).map(subscription => subscription.status)).toEqual(['canceled'])
  })

  test('is queued for every workspace by the backfill, a page at a time', async () => {
    const workspaces = [await seedWorkspace(t), await seedWorkspace(t)]
    const owners = await Promise.all(workspaces.map((workspace, index) => asUser(t, { email: `owner-${index}@example.com`, workspace, workspaceRole: 'owner' })))
    await t.action(internalFn('billing:startFreePlan'), {})
    await drain()
    for (const owner of owners) expect(await current(owner), owner.email).toMatchObject({ productKey: 'free' })
    expect(Object.values(fake.state.subscriptions)).toHaveLength(2)
  })

  test('records none of its own events on the activity trail, and a paid plan\'s checkout and subscription', async () => {
    const ada = await onFree()
    const billingEvents = async () => (await t.query(components.backend.audit.list, { view: { kind: 'workspace', workspaceId: ada.workspaceId!, viewerId: ada.userId }, paginationOpts: { numItems: 100, cursor: null } }))
      .page.filter(entry => entry.type.startsWith('billing.'))
    // The inbox of the workspace's owner, by the kinds of notification in it.
    const inbox = async () => (await t.query(components.backend.notifications.list, { userId: ada.userId, paginationOpts: { numItems: 50, cursor: null } })).page.map(item => item.type)
    // Its start, its subscription, its credits: the free plan's own lifecycle, recorded nowhere, and so told to no one.
    expect(await billingEvents()).toEqual([])
    expect(await inbox()).toEqual([])
    const pro = Object.values(fake.state.products).find(product => product.metadata.key === 'pro')!.id
    const { url } = await ada.action(fn<'action'>('billing:generateCheckoutLink'), { productIds: [pro], origin: SITE, successUrl: `${SITE}/pricing` }) as { url: string }
    await pay(url)
    const recorded = await billingEvents()
    expect(recorded).toEqual(expect.arrayContaining([
      // The billing manager who opened it acted; the provider's side is the app's.
      expect.objectContaining({ type: 'billing.checkout_started', actor: expect.objectContaining({ kind: 'you' }), data: { productId: pro } }),
      expect.objectContaining({ type: 'billing.subscription_updated', actor: expect.objectContaining({ kind: 'app' }), data: expect.objectContaining({ productId: pro, status: 'trialing' }) }),
      expect.objectContaining({ type: 'billing.benefit_granted', actor: expect.objectContaining({ kind: 'app' }) }),
    ]))
    // The trial's start charged nothing: no payment to record.
    expect(recorded.map(entry => entry.type)).not.toContain('billing.order_paid')
    // Nothing in it reaches the inbox: a checkout, a trial's subscription and its benefits are not notifications.
    expect(await inbox()).toEqual([])
  })

  test('holds a workspace on a paid plan from deletion until the plan is set to end', async () => {
    const ada = await onFree()
    const refusal = () => t.query(fn<'query'>('workspaces:deletionRefusal'), { entityId: ada.workspaceId! })
    // The free plan bills nothing: no reason to keep the workspace.
    expect(await refusal()).toBeNull()
    const pro = Object.values(fake.state.products).find(product => product.metadata.key === 'pro')!.id
    const { url } = await ada.action(fn<'action'>('billing:generateCheckoutLink'), { productIds: [pro], origin: SITE, successUrl: `${SITE}/pricing` }) as { url: string }
    await pay(url)
    expect(await refusal()).toBe('paid_subscription')
    const [paid] = Object.values(fake.state.subscriptions)
    fake.state.subscriptions[paid!.id]!.cancelAtPeriodEnd = true
    await fire('subscription.updated', paid!.id)
    expect(await refusal()).toBeNull()
  })

  test('is not started again for a workspace an account\'s erasure is deleting, whatever the revoke says', async () => {
    const ada = await onFree()
    const [free] = Object.values(fake.state.subscriptions)
    // The revoke arrives without the customer's deletion on it: the mark alone holds the plan off.
    rewrite = (event) => {
      if (event.type !== 'subscription.revoked') return false
      event.data.customer.deleted_at = null
      return true
    }
    const plan = await t.mutation(components.backend.account.forget, { userId: ada.userId })
    expect(plan.deleted).toEqual([ada.workspaceId])
    await t.action(makeFunctionReference<'action'>('account:eraseAccountData') as unknown as FunctionReference<'action', 'internal'>, { userId: ada.userId, deleted: plan.deleted, left: plan.left, ...(plan.email ? { email: plan.email } : {}) })
    await drain()
    // Deleted and anonymized at the provider, its plan ended with it, and none started again.
    const customer = Object.values(fake.state.customers)[0]!
    expect(customer).toMatchObject({ externalId: ada.workspaceId, name: null, deletedAt: expect.any(Number) })
    expect(Object.values(fake.state.subscriptions).map(subscription => [subscription.id, subscription.status])).toEqual([[free!.id, 'canceled']])
    expect(await start(ada.workspaceId!)).toBe('gone')
  })

  test('deletes a customer an earlier release never keyed by the id the app mapped it to', async () => {
    const ada = await onFree()
    // A 0.1-era customer: mapped to the workspace, its external id never set at the provider.
    const customer = Object.values(fake.state.customers)[0]!
    customer.externalId = null
    const plan = await t.mutation(components.backend.account.forget, { userId: ada.userId })
    await t.action(internalFn('account:eraseAccountData'), { userId: ada.userId, deleted: plan.deleted, left: plan.left })
    await drain()
    expect(customer).toMatchObject({ name: null, deletedAt: expect.any(Number) })
    expect(Object.values(fake.state.subscriptions).map(subscription => subscription.status)).toEqual(['canceled'])
  })

  test('records nothing more of a workspace an account\'s erasure deleted, whatever the provider sends after', async () => {
    const ada = await onFree()
    const pro = Object.values(fake.state.products).find(product => product.metadata.key === 'pro')!.id
    const { url } = await ada.action(fn<'action'>('billing:generateCheckoutLink'), { productIds: [pro], origin: SITE, successUrl: `${SITE}/pricing` }) as { url: string }
    await pay(url)
    const trail = async () => (await t.query(components.backend.audit.list, { view: { kind: 'all', viewerId: 'reader' }, paginationOpts: { numItems: 100, cursor: null } }))
      .page.filter(entry => entry.type.startsWith('billing.'))
    expect(await trail()).not.toEqual([])
    // The component's part first: the workspace's trail goes with it.
    const plan = await t.mutation(components.backend.account.forget, { userId: ada.userId })
    await drain()
    expect(await trail()).toEqual([])
    // Then its customer goes at the provider, which revokes the paid plan: those deliveries name the erased workspace, and record nothing.
    await t.action(makeFunctionReference<'action'>('account:eraseAccountData') as unknown as FunctionReference<'action', 'internal'>, { userId: ada.userId, deleted: plan.deleted, left: plan.left })
    await drain()
    expect(Object.values(fake.state.subscriptions).some(subscription => subscription.productId === pro && subscription.status === 'canceled')).toBe(true)
    expect(await trail()).toEqual([])
    // Nor does the cache come back for it.
    expect(await t.query(components.backend.billing.getByUser, { userId: ada.workspaceId! })).toBeNull()
  })

  test('marks its deliveries in the webhook log, which DevTools folds', async () => {
    await onFree()
    const rows = await t.query(components.backend.webhooks.listRecent, { limit: 50 }) as Array<{ type?: string, note?: string }>
    expect(rows.filter(row => row.note === 'free plan').map(row => row.type)).toEqual(expect.arrayContaining(['subscription.created', 'subscription.active']))
    expect(rows.find(row => row.type === 'customer.created')).not.toHaveProperty('note')
  })
})

describe('prices in the visitor\'s currency, end to end', () => {
  const pricing = (currency?: string) => t.query(fn<'query'>('billing:getPricing'), currency ? { currency } : {}) as Promise<Pricing>

  test('reads every price in the currency asked for, the catalog\'s own for one it does not price', async () => {
    const euros = await pricing('EUR')
    // The catalog's own first, whichever is shown: a switch whose options stay put.
    expect(euros).toMatchObject({ currency: 'eur', currencies: ['usd', 'eur'] })
    expect(euros.plans.find(plan => plan.key === 'pro')!.prices.month).toMatchObject({ amount: 2700, currency: 'eur' })
    expect(euros.plans.find(plan => plan.key === 'free')).toMatchObject({ free: true, prices: { month: { amount: 0 } } })
    expect(euros.packs[0]).toMatchObject({ amount: 3600, currency: 'eur' })
    const fallback = await pricing('gbp')
    expect(fallback).toMatchObject({ currency: 'usd', currencies: ['usd', 'eur'] })
    expect((await pricing()).packs[0]).toMatchObject({ amount: 4000, currency: 'usd' })
  })

  test('checks out in the currency asked for, and refuses one the catalog does not price', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    const pack = (await pricing()).packs[0]!.productId
    await ada.action(fn<'action'>('billing:generateCheckoutLink'), { productIds: [pack], origin: SITE, successUrl: `${SITE}/pricing`, currency: 'EUR' })
    expect(Object.values(fake.state.checkouts).at(-1)).toMatchObject({ currency: 'eur' })
    expect(await refusal(ada.action(fn<'action'>('billing:generateCheckoutLink'), { productIds: [pack], origin: SITE, successUrl: `${SITE}/pricing`, currency: 'gbp' })))
      .toMatchObject({ code: 'invalid_input', data: { field: 'currency' } })
  })
})
