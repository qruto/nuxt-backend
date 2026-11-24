/// <reference types="vite/client" />
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { defineSchema, makeFunctionReference, type FunctionReference } from 'convex/server'
import type { TestConvex } from 'convex-test'
import type { BillingCatalog } from '../../src/convex/catalog'
import { getBackendError } from '../../src/convex/errors'
import type { Billing } from '../../src/convex/integrations/billing/types/surface'
import { asUser, defineBackendTestApp } from '../../src/convex/test'

// The flows every adapter provider must carry the same way, run against a
// fake of one provider's API and its signed webhooks: the free plan, a
// checkout, a subscription and its charge filling the plan, a pack bought,
// refunded and disputed, the portal, a cancellation taken back and ended,
// a pause, the invoice and the admin's refund. Each provider's suite
// (billing-commerce-dodo, billing-commerce-creem) gives its fake, its
// event payloads and what its API was asked; Stripe's runs in
// billing-commerce.test.ts.

export const SITE = 'http://localhost:3000'

export const CATALOG: BillingCatalog = {
  currency: 'usd',
  meters: { credits: {} },
  plans: {
    free: { name: 'Free', prices: { month: 0 }, credits: { meter: 'credits', units: 30 } },
    pro: { name: 'Pro', prices: { month: 1200, year: 12000 }, meterCycle: 'month', credits: { meter: 'credits', units: 400 }, features: ['priority_queue'], quotas: { projects: 10 } },
  },
  packs: {
    credits100: { name: '100 credits', price: 500, credits: { meter: 'credits', units: 100 } },
  },
  features: { priority_queue: { description: 'Your strips start drawing first' } },
  quotas: { projects: { description: 'Projects' } },
}

/** One call the fake API took. */
export interface FakeCall { method: string, path: string, query: URLSearchParams, body: Record<string, unknown> }

/** A provider's fake API: what it was asked, and the subscriptions it holds by id. */
export interface FakeApi {
  calls: FakeCall[]
  subscriptions: Record<string, Record<string, unknown>>
}

/** A webhook event, before it is wrapped and signed. */
export interface FakeEvent { type: string, object: Record<string, unknown> }

/** What one provider's suite gives the shared flows. */
export interface ProviderFixture {
  name: 'dodo' | 'creem'
  /** The catalog keys' provider ids: `pro`, `pro:year` and `credits100`. */
  ids: { 'pro': string, 'pro:year': string, 'credits100': string }
  /** Stub `fetch` with the provider's API. */
  fake: () => FakeApi
  /** The delivery `/billing/events` takes: its body and signed headers. */
  delivery: (event: FakeEvent, id: string) => Promise<{ body: string, headers: Record<string, string> }>
  events: {
    /** The entity's subscription to the monthly Pro price, as the API and the webhooks carry it. */
    subscription: (entityId: string, fields?: Record<string, unknown>) => Record<string, unknown>
    /** The same, to the yearly Pro price. */
    yearly: (entityId: string) => Record<string, unknown>
    /** The subscription renewed: its period now ends at `periodEnd` (epoch ms). */
    renewed: (subscription: Record<string, unknown>, periodEnd: number) => Record<string, unknown>
    created: (subscription: Record<string, unknown>) => FakeEvent
    updated: (subscription: Record<string, unknown>) => FakeEvent
    ended: (subscription: Record<string, unknown>) => FakeEvent
    /** The subscription's paid charge, an order of `orderId`. */
    charge: (subscription: Record<string, unknown>, orderId: string) => FakeEvent
    pack: (entityId: string, orderId: string) => FakeEvent
    refund: (orderId: string, refundId: string) => FakeEvent
    dispute: (orderId: string) => FakeEvent
  }
  /** The checkout the API was asked for: its product and the entity in its metadata. */
  checkoutOf: (call: FakeCall) => { productId: unknown, entityId: unknown }
  portalUrl: string
  /** The call a cancellation at the period's end makes, a take-back, an immediate one, and a pause. */
  lifecycle: { cancel: (call: FakeCall) => boolean, uncancel: (call: FakeCall) => boolean, cancelNow: (call: FakeCall) => boolean, pause: (call: FakeCall) => boolean }
  /** Whether a plan change for the next period waits there (else the provider makes it at once). */
  schedulesChanges: boolean
  /** Whether the provider answers an invoice and an admin's refund through its API. */
  invoices: boolean
  refunds: boolean
}

const fn = <Kind extends 'query' | 'mutation' | 'action'>(path: string) => makeFunctionReference<Kind>(path) as FunctionReference<Kind, 'public'>
const internalFn = (path: string) => makeFunctionReference<'action'>(path) as unknown as FunctionReference<'action', 'internal'>

const SCAFFOLD = '../fixtures/registration/backend/'
const scaffold = import.meta.glob(['../fixtures/registration/backend/*.ts', '!**/convex.config.ts', '!**/auth.config.ts'])
const testApp = defineBackendTestApp(defineSchema({}), { ...scaffold, [`${SCAFFOLD}_generated/api.js`]: () => Promise.resolve({}) })

/** Answer `value` as the providers answer JSON. */
export const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } })

/** Stub `fetch` for one host: each call recorded, then answered by `answer`, a 404 when it answers nothing. */
export function stubApi(host: string, prefix: string, answer: (call: FakeCall, state: FakeApi) => Response | undefined): FakeApi {
  const state: FakeApi = { calls: [], subscriptions: {} }
  vi.stubGlobal('fetch', async (input: string | URL, init: RequestInit = {}) => {
    const url = new URL(String(input))
    if (url.host !== host) throw new Error(`unexpected fetch to ${url.host}`)
    const call: FakeCall = { method: init.method ?? 'GET', path: url.pathname.slice(prefix.length), query: url.searchParams, body: typeof init.body === 'string' ? JSON.parse(init.body) as Record<string, unknown> : {} }
    state.calls.push(call)
    return answer(call, state) ?? new Response(JSON.stringify({ code: 'NOT_FOUND' }), { status: 404 })
  })
  return state
}

/** The shared flows, against `fixture`'s provider. `built` is where the suite's mocked `setupBilling` keeps what it built. */
export function commerceSuite(fixture: ProviderFixture, built: { billing: Billing | undefined }) {
  let t: TestConvex<ReturnType<typeof defineSchema>>
  let api: FakeApi
  type Caller = Awaited<ReturnType<typeof asUser>>
  const { events } = fixture

  const deliver = async (event: FakeEvent, id = `evt_${crypto.randomUUID()}`) => {
    const { body, headers } = await fixture.delivery(event, id)
    return t.fetch('/billing/events', { method: 'POST', body, headers })
  }
  const credits = async (caller: Caller) => ((await caller.query(fn<'query'>('billing:getCredits'), {})) as { meters: Array<{ name?: string, balance: number }> } | null)?.meters.find(meter => meter.name === 'credits')?.balance
  const features = (caller: Caller) => caller.query(fn<'query'>('billing:getFeatures'), {}) as Promise<{ plans: string[], benefits: Array<{ metadata?: Record<string, unknown> }>, quotas: Record<string, { limit: number | 'unlimited' }> } | null>
  const current = (caller: Caller) => caller.query(fn<'query'>('billing:getCurrentSubscription'), {}) as Promise<{ id: string, productId: string, status: string, cancelAtPeriodEnd: boolean, pendingChange: { productId: string, appliesAt: string } | null } | null>
  /** Run what the deliveries scheduled to run now (the credit cycle), never what waits for a later month. */
  const runScheduledNow = async () => {
    vi.advanceTimersByTime(1)
    await t.finishInProgressScheduledFunctions()
  }
  // `null` for a call that went through; a failure that is no backend refusal fails the test.
  const refusal = (promise: Promise<unknown>) => promise.then(() => null, (error: unknown) => {
    const refused = getBackendError(error)
    if (!refused) throw error
    return refused
  })

  /** Ada on the free plan. */
  const freeAda = async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    expect(await t.action(internalFn('billing:startFreePlan'), { entityId: ada.workspaceId! })).toBe('started')
    return ada
  }
  /** Ada subscribed to Pro, its first charge paid. */
  const subscribedAda = async () => {
    const ada = await freeAda()
    const subscription = events.subscription(ada.workspaceId!)
    api.subscriptions[String(subscription.id ?? subscription.subscription_id)] = subscription
    expect((await deliver(events.created(subscription))).status).toBe(200)
    expect((await deliver(events.charge(subscription, 'order_plan_1'))).status).toBe(200)
    return { ada, subscription }
  }

  beforeAll(async () => {
    for (const level of ['log', 'info', 'warn', 'error'] as const) vi.spyOn(console, level).mockImplementation(() => {})
    await import('../fixtures/registration/backend/billing')
    expect(built.billing).toBeDefined()
  })

  afterAll(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  beforeEach(async () => {
    t = testApp()
    api = fixture.fake()
    await t.action(internalFn('billing:syncProducts'), {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe(`billing on ${fixture.name} (BILLING_PROVIDER=${fixture.name})`, { timeout: 30_000 }, () => {
    test('prices the catalog by the provider ids the app named, and starts the free plan without asking the provider', async () => {
      const ada = await freeAda()
      const pricing = await ada.query(fn<'query'>('billing:getPricing'), {}) as { plans: Array<{ key: string, prices: Record<string, { productId?: string }> }>, packs: Array<{ productId: string }> }
      const pro = pricing.plans.find(plan => plan.key === 'pro')
      expect([pro?.prices.month?.productId, pro?.prices.year?.productId]).toEqual([fixture.ids.pro, fixture.ids['pro:year']])
      expect(pricing.packs.map(pack => pack.productId)).toEqual([fixture.ids.credits100])
      expect(await current(ada)).toBeNull()
      expect(await credits(ada)).toBe(30)
      expect(api.calls).toEqual([])
    })

    test('opens a checkout for one catalog product with the entity in its metadata', async () => {
      const ada = await freeAda()
      const { url } = await ada.action(fn<'action'>('billing:generateCheckoutLink'), { productIds: [fixture.ids.pro], origin: SITE, successUrl: `${SITE}/billing` }) as { url: string }
      expect(url).toMatch(/^https:\/\//)
      expect(fixture.checkoutOf(api.calls.find(call => call.path === 'checkouts')!)).toEqual({ productId: fixture.ids.pro, entityId: ada.workspaceId })
      expect(await refusal(ada.action(fn<'action'>('billing:generateCheckoutLink'), { productIds: [fixture.ids.pro, fixture.ids.credits100], origin: SITE, successUrl: `${SITE}/billing` }))).toMatchObject({ code: 'invalid_input', data: { field: 'productIds' } })
    })

    test('fills the plan from the subscription and its charge, once however often the charge arrives', async () => {
      const { ada, subscription } = await subscribedAda()
      expect(await current(ada)).toMatchObject({ productId: fixture.ids.pro, status: 'active', cancelAtPeriodEnd: false })
      const granted = await features(ada)
      expect(granted?.plans).toEqual([fixture.ids.pro])
      expect(granted?.benefits.map(benefit => benefit.metadata?.key)).toContain('priority_queue')
      expect(granted?.quotas.projects?.limit).toBe(10)
      // The free month's 30 lapsed as the plan's 400 landed.
      expect(await credits(ada)).toBe(400)
      await deliver(events.charge(subscription, 'order_plan_1'))
      expect(await credits(ada)).toBe(400)
      // A monthly plan's credits come with its invoices: the cycle grants it none.
      expect(await t.action(internalFn('billing:startFreePlan'), { entityId: ada.workspaceId! })).toBe('subscribed')
      expect(await credits(ada)).toBe(400)
      const orders = await ada.action(fn<'action'>('billing:getOrders'), {}) as { items: Array<{ id: string, totalAmount: number }> }
      expect(orders.items).toMatchObject([{ id: 'order_plan_1', totalAmount: 1200 }])
    })

    test('opens the portal on the provider customer the deliveries linked', async () => {
      const { ada } = await subscribedAda()
      expect(await ada.action(fn<'action'>('billing:generateCustomerPortalUrl'), {})).toEqual({ url: fixture.portalUrl })
    })

    test('grants a pack\'s credits on its paid order, and takes them back on its whole refund, once', async () => {
      const ada = await freeAda()
      await deliver(events.pack(ada.workspaceId!, 'order_pack_1'))
      expect(await credits(ada)).toBe(130)
      await deliver(events.refund('order_pack_1', 'refund_1'))
      expect(await credits(ada)).toBe(30)
      await deliver(events.refund('order_pack_1', 'refund_1'))
      expect(await credits(ada)).toBe(30)
    })

    test('takes a pack\'s credits back when its charge is disputed', async () => {
      const ada = await freeAda()
      await deliver(events.pack(ada.workspaceId!, 'order_pack_2'))
      expect((await deliver(events.dispute('order_pack_2'))).status).toBe(200)
      expect(await credits(ada)).toBe(30)
    })

    test('grants a yearly plan its month once its subscription syncs, whichever arrives first, and takes it back on a dispute', async () => {
      const ada = await freeAda()
      const entityId = ada.workspaceId!
      const subscription = events.yearly(entityId)
      api.subscriptions[String(subscription.id ?? subscription.subscription_id)] = subscription
      vi.useFakeTimers({ toFake: ['setTimeout'] })
      // The order first: no subscription is synced yet, so no month of the plan's is granted on its word.
      // (An order that names only its subscription fails, for the provider to send it again.)
      await deliver(events.charge(subscription, 'order_year_1')).catch(() => null)
      expect(await credits(ada)).toBe(30)
      expect((await deliver(events.created(subscription))).status).toBe(200)
      // The subscription's delivery alone starts the cycle: the plan's month, the free one lapsing.
      await runScheduledNow()
      expect(await credits(ada)).toBe(400)
      expect((await deliver(events.charge(subscription, 'order_year_1'))).status).toBe(200)
      // The cycle the deliveries started on their own: the plan's month, the free one lapsing; once, however often it runs.
      await runScheduledNow()
      expect(await credits(ada)).toBe(400)
      expect((await deliver(events.updated(subscription))).status).toBe(200)
      await runScheduledNow()
      expect(await credits(ada)).toBe(400)
      vi.useRealTimers()
      // A chargeback on the year takes back the month its order paid for.
      expect((await deliver(events.dispute('order_year_1'))).status).toBe(200)
      expect(await credits(ada)).toBe(0)
    })

    test('holds a refund and a dispute that arrive before their order, and applies each as the order lands', async () => {
      const ada = await freeAda()
      // The refund first, delivered twice: held once, acknowledged so the provider stops sending it.
      expect((await deliver(events.refund('order_pack_early', 'refund_early'))).status).toBe(200)
      expect((await deliver(events.refund('order_pack_early', 'refund_early'))).status).toBe(200)
      await deliver(events.pack(ada.workspaceId!, 'order_pack_early'))
      expect(await credits(ada)).toBe(30)
      // The order again changes nothing: its credits went back once.
      await deliver(events.pack(ada.workspaceId!, 'order_pack_early'))
      expect(await credits(ada)).toBe(30)
      expect((await deliver(events.dispute('order_pack_late'))).status).toBe(200)
      await deliver(events.pack(ada.workspaceId!, 'order_pack_late'))
      expect(await credits(ada)).toBe(30)
      // An order no reversal came before keeps its credits.
      await deliver(events.pack(ada.workspaceId!, 'order_pack_kept'))
      expect(await credits(ada)).toBe(130)
    })

    test('takes back a yearly order\'s months alone, past its renewal and a renewal order that arrives after its month', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'Date'], now: Date.UTC(2027, 0, 10, 12) })
      try {
        const ada = await freeAda()
        const subscription = events.yearly(ada.workspaceId!)
        api.subscriptions[String(subscription.id ?? subscription.subscription_id)] = subscription
        await deliver(events.created(subscription))
        await deliver(events.charge(subscription, 'order_year_1'))
        await runScheduledNow()
        expect(await credits(ada)).toBe(400)
        // A year on the subscription renews, and the cycle grants the new period's month before its order arrives.
        vi.setSystemTime(Date.UTC(2028, 0, 10, 12))
        const renewed = events.renewed(subscription, Date.UTC(2029, 0, 10, 12))
        expect((await deliver(events.updated(renewed))).status).toBe(200)
        await runScheduledNow()
        expect(await credits(ada)).toBe(400)
        // Last year's order delivered again claims none of the new period's months.
        expect((await deliver(events.charge(subscription, 'order_year_1'))).status).toBe(200)
        expect((await deliver(events.charge(renewed, 'order_year_2'))).status).toBe(200)
        await runScheduledNow()
        expect(await credits(ada)).toBe(400)
        // A chargeback on the first year leaves the renewal's month alone; one on the renewal takes it back.
        await deliver(events.dispute('order_year_1'))
        expect(await credits(ada)).toBe(400)
        await deliver(events.dispute('order_year_2'))
        expect(await credits(ada)).toBe(0)
        // The disputed period grants no more months.
        vi.setSystemTime(Date.UTC(2028, 1, 10, 12))
        await t.action(internalFn('billing:startFreePlan'), { entityId: ada.workspaceId! })
        expect(await credits(ada)).toBe(0)
      }
      finally {
        vi.useRealTimers()
      }
    })

    test(fixture.schedulesChanges ? 'keeps a plan change for the next period through later deliveries' : 'makes a plan change for the next period at once, as the provider does', async () => {
      const ada = await freeAda()
      const subscription = events.yearly(ada.workspaceId!)
      api.subscriptions[String(subscription.id ?? subscription.subscription_id)] = subscription
      expect((await deliver(events.created(subscription))).status).toBe(200)
      // From the yearly price to the monthly one: at the paid year's end.
      await ada.action(fn<'action'>('billing:updateSubscription'), { productId: fixture.ids.pro })
      const changed = await current(ada)
      if (!fixture.schedulesChanges) {
        expect(changed?.pendingChange).toBeNull()
        return
      }
      expect(changed?.pendingChange).toMatchObject({ productId: fixture.ids.pro })
      expect((await deliver(events.updated(subscription))).status).toBe(200)
      expect((await current(ada))?.pendingChange).toMatchObject({ productId: fixture.ids.pro })
      // A later lifecycle call reads back no schedule, and keeps the one recorded.
      await ada.action(fn<'action'>('billing:pauseSubscription'), {})
      expect((await current(ada))?.pendingChange).toMatchObject({ productId: fixture.ids.pro })
    })

    test('refuses a pause with a resume date, which no adapter can schedule', async () => {
      const { ada } = await subscribedAda()
      expect(await refusal(ada.action(fn<'action'>('billing:pauseSubscription'), { resumesAt: Date.now() + 60 * 24 * 3600 * 1000 }))).toMatchObject({ code: 'unavailable', data: { reason: 'provider_unsupported' } })
    })

    test('cancels at the period\'s end, takes it back, pauses, and returns to the free plan when it ends', async () => {
      const { ada, subscription } = await subscribedAda()
      // As it was before the calls below change the fake's copy: a late update restoring it.
      const active = { ...subscription }
      await ada.action(fn<'action'>('billing:cancelSubscription'), { offer: false })
      expect(api.calls.some(fixture.lifecycle.cancel)).toBe(true)
      await deliver(events.updated(api.subscriptions[String(subscription.id ?? subscription.subscription_id)]!))
      expect(await current(ada)).toMatchObject({ cancelAtPeriodEnd: true })
      await ada.action(fn<'action'>('billing:uncancelSubscription'), {})
      expect(api.calls.some(fixture.lifecycle.uncancel)).toBe(true)
      await ada.action(fn<'action'>('billing:pauseSubscription'), {})
      expect(api.calls.some(fixture.lifecycle.pause)).toBe(true)
      await ada.action(fn<'action'>('billing:cancelSubscription'), { offer: false, atPeriodEnd: false })
      expect(api.calls.some(fixture.lifecycle.cancelNow)).toBe(true)
      await deliver(events.ended(subscription))
      expect(await current(ada)).toBeNull()
      expect((await features(ada))?.plans).toEqual(['local:plan:free'])
      // An ended subscription stays ended, whatever arrives after it.
      await deliver(events.updated(active))
      expect(await current(ada)).toBeNull()
    })

    test(fixture.invoices ? 'serves an order\'s invoice to its owner alone' : 'refuses an invoice the provider has no API for', async () => {
      const { ada } = await subscribedAda()
      const invoice = refusal(ada.action(fn<'action'>('billing:getInvoiceUrl'), { orderId: 'order_plan_1' }))
      if (fixture.invoices) {
        expect(await invoice).toBeNull()
        const bob = await asUser(t, { email: 'bob@example.com' })
        expect(await refusal(bob.action(fn<'action'>('billing:getInvoiceUrl'), { orderId: 'order_plan_1' }))).toMatchObject({ code: 'forbidden' })
      }
      else {
        expect(await invoice).toMatchObject({ code: 'unavailable', data: { reason: 'provider_unsupported' } })
      }
    })

    test(fixture.refunds ? 'refunds an order from the admin tier through the provider' : 'refuses an admin\'s refund the provider has no API for', async () => {
      await subscribedAda()
      const admin = await asUser(t, { email: 'admin@example.com', role: 'admin' })
      const refund = refusal(admin.action(fn<'action'>('billing:refundOrder'), { orderId: 'order_plan_1', reason: 'customer_request' }))
      if (fixture.refunds) {
        expect(await refund).toBeNull()
        expect(api.calls.find(call => call.path === 'refunds')?.body).toMatchObject({ payment_id: 'order_plan_1' })
      }
      else {
        expect(await refund).toMatchObject({ code: 'unavailable', data: { reason: 'provider_unsupported' } })
      }
    })

    test('refuses a delivery the provider did not sign, and leaves one for no known entity alone', async () => {
      const ada = await freeAda()
      const { body, headers } = await fixture.delivery(events.pack(ada.workspaceId!, 'order_forged'), 'evt_forged')
      const forged = await t.fetch('/billing/events', { method: 'POST', body: body.replace('order_forged', 'order_forged_2'), headers })
      expect(forged.status).toBeGreaterThanOrEqual(400)
      expect(await credits(ada)).toBe(30)
      expect((await deliver(events.pack('entity_unknown', 'order_stranger'))).status).toBe(200)
      expect(await credits(ada)).toBe(30)
    })
  })
}
