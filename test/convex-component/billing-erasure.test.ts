/// <reference types="vite/client" />
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { actionGeneric, componentsGeneric, defineSchema, httpActionGeneric, httpRouter, internalActionGeneric, makeFunctionReference, type FunctionReference } from 'convex/server'
import { v } from 'convex/values'
import type { TestConvex } from 'convex-test'
import { syncBillingCatalog } from '../../src/cli/billing/sync'
import { createPolarFake, type PolarFake, routeToFake } from '../fixtures/polar-fake/server'
import { type CustomerRecord, newId, stableId } from '../fixtures/polar-fake/state'
import type { BillingCatalog } from '../../src/convex/catalog'
import type { ComponentApi } from '../../src/convex/components/backend/_generated/component'
import { getBackendError } from '../../src/convex/errors'
import { setupAccount } from '../../src/convex/integrations/account'
import { type AccountBillingRecord, setupBilling } from '../../src/convex/integrations/billing'
import type { BillingCatalogIds } from '../../src/convex/integrations/billing/types/records'
import { setupEmail } from '../../src/convex/integrations/email'
import { asUser, defineBackendTestApp, seedWorkspace } from '../../src/convex/test'
import { signingSecret } from '../helpers/secrets'

// Billing's part of an account's erasure and export, as an app runs it with
// `setupAccount({ billing })`: the provider customer of each billing entity
// that goes with the account is deleted and anonymized by its external id
// (a customer only mapped, never keyed, by its own id; one already gone is
// fine), the account's member of each team customer that stays is removed,
// and a refusal fails the participant so the erasure runs it again. The
// export lists each entity's synced subscriptions and its newest orders.

const SITE = 'http://localhost:3000'
const FAKE = 'http://127.0.0.1:4792'
const ENDPOINT = 'https://billing-erasure.convex.site/billing/events'
const SECRET = signingSecret()

const CATALOG: BillingCatalog = {
  currency: 'usd',
  plans: { pro: { name: 'Pro', prices: { month: 1200 } } },
  packs: { credits500: { name: '500 credits', price: 2000, credits: { meter: 'credits', units: 500 } } },
  meters: { credits: { eventName: 'credits', property: 'amount' } },
}

const product = (key: string) => stableId('product', key)
const GENERATED: BillingCatalogIds = {
  products: { pro: product('pro'), credits500: product('credits500') },
  plans: { pro: { month: product('pro') } },
  packs: ['credits500'],
  gifts: { credits500: product('credits500-gift') },
  meters: { credits: { meterId: stableId('meter', 'credits'), eventName: 'credits', property: 'amount' } },
}

vi.stubEnv('BILLING_WEBHOOK_SECRET', SECRET)
vi.stubEnv('SITE_URL', SITE)
vi.stubEnv('AUTH_SECRET', 'billing-erasure-secret-0123456789abcdefghijklm')

const components = componentsGeneric() as unknown as { backend: ComponentApi<'backend'>, polar: { lib: Record<string, FunctionReference<'mutation' | 'query', 'internal'>> } }
const email = setupEmail(components as never)
const catalog = { sandbox: GENERATED }
// A deployment that has no BILLING_ACCESS_TOKEN yet: nothing at the provider to erase.
vi.stubEnv('BILLING_ACCESS_TOKEN', '')
const tokenless = setupBilling(components as never, { email, catalog })
vi.stubEnv('BILLING_ACCESS_TOKEN', 'polar_oat_fake')
const billing = setupBilling(components as never, { email, catalog })
/** An app that bills each account on its own. */
const perUser = setupBilling(components as never, { email, catalog, billTo: 'user' })
const account = setupAccount(components as never, { billing })

const vErasure = { userId: v.string(), deleted: v.array(v.string()), left: v.array(v.string()) }
/** What `setupAccount` runs of each billing instance, called the way it calls them. */
const parts = (instance: typeof billing) => ({
  forget: internalActionGeneric({ args: vErasure, handler: (ctx, erasure) => instance.forgetAccount(ctx, erasure) }),
  exportOf: internalActionGeneric({ args: { userId: v.string(), deleted: v.array(v.string()) }, handler: (ctx, entities) => instance.exportAccount(ctx, entities) }),
})

const http = httpRouter()
http.route({ path: '/billing/events', method: 'POST', handler: httpActionGeneric((ctx, request) => billing.webhookHandler(ctx as never, request)) })

const testApp = defineBackendTestApp(defineSchema({}), {
  './_generated/api.js': () => Promise.resolve({}),
  './billing.js': () => Promise.resolve({ ...billing.api, ...parts(billing) }),
  './perUser.js': () => Promise.resolve(parts(perUser)),
  './tokenless.js': () => Promise.resolve(parts(tokenless)),
  './account.js': () => Promise.resolve({ eraseAccountData: account.api.eraseAccountData, forget: actionGeneric({ args: { userId: v.string() }, handler: (ctx, target) => account.forget(ctx as never, target) }) }),
  './http.js': () => Promise.resolve({ default: http }),
})

const fn = <Kind extends 'query' | 'mutation' | 'action'>(path: string) => makeFunctionReference<Kind>(path) as FunctionReference<Kind, 'public'>
const internalFn = (path: string) => makeFunctionReference<'action'>(path) as unknown as FunctionReference<'action', 'internal'>

let t: TestConvex<ReturnType<typeof defineSchema>>
let fake: PolarFake

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
  vi.setSystemTime(new Date('2027-02-01T09:00:00Z'))
  t = testApp()
  const app = t
  fake = createPolarFake({
    baseUrl: FAKE,
    fetcher: (url, init) => app.fetch(new URL(url).pathname, { method: 'POST', headers: init.headers, body: init.body as string }),
  })
  vi.stubGlobal('fetch', routeToFake(fake, FAKE))
  fake.ensureEndpoint(ENDPOINT, SECRET)
  const { ids } = await syncBillingCatalog(CATALOG, { rootDir: '.', environment: 'sandbox', accessToken: 'polar_oat_fake', dryRun: false, adopt: {} })
  expect(ids).toEqual(GENERATED)
  await fake.idle()
})

afterEach(async () => {
  await fake.idle()
  fake.close()
  vi.unstubAllGlobals()
})

type Caller = Awaited<ReturnType<typeof asUser>>
type Erasure = { userId: string, deleted: string[], left: string[] }

const refusal = (promise: Promise<unknown>) => promise.then(() => null, (error: unknown) => getBackendError(error))

/** Pay a checkout on its page, then let its events land. */
async function pay(url: string): Promise<void> {
  await fake.handle(new Request(`${url}/pay`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'origin': FAKE } }))
  await fake.idle()
}

const buy = async (caller: Caller, productId: string) =>
  pay((await caller.action(fn<'action'>('billing:generateCheckoutLink'), { productIds: [productId], origin: SITE, successUrl: `${SITE}/billing` }) as { url: string }).url)

/** The provider customer keyed by an entity's id, deleted or not. */
const customerOf = (externalId: string) => Object.values(fake.state.customers).find(customer => customer.externalId === externalId)

/** A customer the provider holds without the package having made it: a team one with members, or one never keyed. */
function seedCustomer(fields: Partial<CustomerRecord>, members: Array<{ externalId: string, email: string }> = []): CustomerRecord {
  const customer: CustomerRecord = { id: newId(), type: 'individual', email: `${newId()}@example.com`, name: 'Someone', externalId: null, metadata: {}, createdAt: Date.now(), modifiedAt: null, ...fields }
  fake.state.customers[customer.id] = customer
  for (const member of members) {
    const id = newId()
    fake.state.members[id] = { id, customerId: customer.id, email: member.email, name: null, externalId: member.externalId, role: 'member', createdAt: Date.now() }
  }
  return customer
}

/** An entity's entitlement cache, as a sync leaves it. */
const cacheOf = (entityId: string) => t.query(components.backend.billing.getByUser, { userId: entityId })
const seedCache = (entityId: string) => t.mutation(components.backend.billing.upsert, { userId: entityId, customerId: 'cus_cached', activeProductIds: [product('pro')], benefits: [], meters: [] })

/** Route the provider SDK's calls to the fake, but refuse the ones `matches` picks. */
function failing(matches: (method: string, path: string) => boolean, status = 500): void {
  const route = routeToFake(fake, FAKE)
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init)
    return matches(request.method, new URL(request.url).pathname.replace(/\/+$/, '')) ? Response.json({ error: 'Unavailable' }, { status }) : route(request)
  })
}

const membersOf = (customerId: string) => Object.values(fake.state.members).filter(member => member.customerId === customerId).map(member => member.externalId)

describe('an account\'s erasure', () => {
  test('deletes and anonymizes the customer of each workspace that goes with it, and takes its member off each team customer that stays', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    await buy(ada, product('pro'))
    const shared = await seedWorkspace(t, { name: 'Shared' })
    const grace = await asUser(t, { email: 'grace@example.com', workspace: shared, workspaceRole: 'owner' })
    await t.mutation(components.backend.adapter.create, { input: { model: 'member', data: { organizationId: shared, userId: ada.userId, role: 'member', createdAt: Date.now() } } } as never)
    const team = seedCustomer({ type: 'team', externalId: shared, email: null }, [{ externalId: grace.userId, email: 'grace@example.com' }, { externalId: ada.userId, email: 'ada@example.com' }])

    await t.action(fn<'action'>('account:forget'), { userId: ada.userId })
    await t.finishAllScheduledFunctions(() => vi.runAllTimers())
    await fake.idle()

    const own = customerOf(ada.workspaceId!)!
    expect(own.deletedAt).toEqual(expect.any(Number))
    // A workspace's customer is a team one: its name and address are gone.
    expect(own).toMatchObject({ type: 'team', name: null, email: null })
    // Its plan ended with it; the provider keeps the order for its books.
    expect(Object.values(fake.state.subscriptions).filter(subscription => subscription.customerId === own.id)).toEqual([expect.objectContaining({ endedAt: expect.any(Number) })])
    expect(Object.values(fake.state.orders).some(order => order.customerId === own.id)).toBe(true)
    // The shared workspace's customer stays, without Ada.
    expect(team.deletedAt ?? null).toBeNull()
    expect(membersOf(team.id)).toEqual([grace.userId])
    expect(await cacheOf(ada.workspaceId!)).toBeNull()
  })

  test('is safe to run again: a customer and a member already gone are fine', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    await buy(ada, product('pro'))
    const erasure: Erasure = { userId: ada.userId, deleted: [ada.workspaceId!], left: ['org_left_without_a_customer'] }
    await t.action(internalFn('billing:forget'), erasure)
    await fake.idle()
    const deleted = customerOf(ada.workspaceId!)!.deletedAt
    // The external id reads as gone now, and the customer the app mapped is deleted already.
    await t.action(internalFn('billing:forget'), erasure)
    expect(customerOf(ada.workspaceId!)!.deletedAt).toBe(deleted)
  })

  test('deletes a customer an earlier release mapped but never keyed, by its own id', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    const legacy = seedCustomer({ email: 'ada@example.com' })
    await t.mutation(components.polar.lib.insertCustomer as FunctionReference<'mutation', 'internal'>, { id: legacy.id, userId: ada.workspaceId! })
    await t.action(internalFn('billing:forget'), { userId: ada.userId, deleted: [ada.workspaceId!], left: [] })
    expect(legacy.deletedAt).toEqual(expect.any(Number))
    expect(legacy.email).toBe(`deleted-${legacy.id}@anonymized.invalid`)
  })

  test('fails its billing part while the provider refuses, keeps the cache meanwhile, and the erasure runs it again', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    await buy(ada, product('pro'))
    await seedCache(ada.workspaceId!)
    failing((method, path) => method === 'DELETE' && path.startsWith('/v1/customers/external/'))
    const erasure: Erasure = { userId: ada.userId, deleted: [ada.workspaceId!], left: [] }
    expect(await refusal(t.action(internalFn('billing:forget'), erasure))).toMatchObject({ code: 'unavailable', data: { service: 'billing', reason: 'provider_refused' } })
    expect(await cacheOf(ada.workspaceId!)).not.toBeNull()
    // The account's erasure takes the refusal as its participant's, and tries again.
    await t.action(internalFn('account:eraseAccountData'), erasure)
    expect(customerOf(ada.workspaceId!)!.deletedAt ?? null).toBeNull()
    vi.stubGlobal('fetch', routeToFake(fake, FAKE))
    await t.finishAllScheduledFunctions(() => vi.runAllTimers())
    expect(customerOf(ada.workspaceId!)!.deletedAt).toEqual(expect.any(Number))
    expect(await cacheOf(ada.workspaceId!)).toBeNull()
  })

  test('with billTo: user, deletes the account\'s own customer and touches no team customer', async () => {
    const ada = await asUser(t, { email: 'ada@example.com', workspace: false })
    const own = seedCustomer({ externalId: ada.userId, email: 'ada@example.com' })
    const team = seedCustomer({ type: 'team', externalId: 'org_shared', email: null }, [{ externalId: ada.userId, email: 'ada@example.com' }])
    await seedCache(ada.userId)
    await t.action(internalFn('perUser:forget'), { userId: ada.userId, deleted: ['org_gone'], left: ['org_shared'] })
    expect(own.deletedAt).toEqual(expect.any(Number))
    expect(membersOf(team.id)).toEqual([ada.userId])
    expect(await cacheOf(ada.userId)).toBeNull()
  })

  test('without an access token erases the cache alone, and asks the provider nothing', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    const own = seedCustomer({ externalId: ada.workspaceId!, email: 'ada@example.com' })
    const team = seedCustomer({ type: 'team', externalId: 'org_shared', email: null }, [{ externalId: ada.userId, email: 'ada@example.com' }])
    await seedCache(ada.workspaceId!)
    vi.stubGlobal('fetch', async () => {
      throw new Error('the provider was asked')
    })
    await t.action(internalFn('tokenless:forget'), { userId: ada.userId, deleted: [ada.workspaceId!], left: ['org_shared'] })
    expect(own.deletedAt ?? null).toBeNull()
    expect(membersOf(team.id)).toEqual([ada.userId])
    expect(await cacheOf(ada.workspaceId!)).toBeNull()
    expect(await t.action(internalFn('tokenless:exportOf'), { userId: ada.userId, deleted: [ada.workspaceId!] })).toEqual([{ entityId: ada.workspaceId, subscriptions: [], orders: [] }])
  })
})

describe('an account\'s export', () => {
  test('lists each workspace it owns alone with its synced subscriptions and its orders, newest first', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    await buy(ada, product('pro'))
    vi.setSystemTime(Date.now() + 60_000)
    await buy(ada, product('credits500'))
    const [record] = await t.action(internalFn('billing:exportOf'), { userId: ada.userId, deleted: [ada.workspaceId!] }) as AccountBillingRecord[]
    expect(record!.entityId).toBe(ada.workspaceId)
    expect(record!.subscriptions).toEqual([expect.objectContaining({ productId: product('pro'), status: 'active' })])
    expect(record!.orders).toEqual([
      { id: expect.any(String), createdAt: new Date(Date.now()).toISOString(), status: 'paid', productId: product('credits500'), amount: 2000, currency: 'usd', billingReason: 'purchase' },
      { id: expect.any(String), createdAt: new Date(Date.now() - 60_000).toISOString(), status: 'paid', productId: product('pro'), amount: 1200, currency: 'usd', billingReason: 'subscription_create' },
    ])
  })

  test('lists no orders for an entity the provider has no customer of, and none at all, said so, when it can\'t be read', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    expect(await t.action(internalFn('billing:exportOf'), { userId: ada.userId, deleted: [ada.workspaceId!] })).toEqual([{ entityId: ada.workspaceId, subscriptions: [], orders: [] }])
    await buy(ada, product('credits500'))
    failing((method, path) => method === 'GET' && path === '/v1/orders')
    expect(await t.action(internalFn('billing:exportOf'), { userId: ada.userId, deleted: [ada.workspaceId!] })).toEqual([{ entityId: ada.workspaceId, subscriptions: [], orders: null }])
  })

  test('with billTo: user, is the account\'s own entity, whatever workspaces it owned', async () => {
    const ada = await asUser(t, { email: 'ada@example.com', workspace: false })
    expect(await t.action(internalFn('perUser:exportOf'), { userId: ada.userId, deleted: ['org_gone'] })).toEqual([{ entityId: ada.userId, subscriptions: [], orders: [] }])
  })
})
