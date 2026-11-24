/// <reference types="vite/client" />
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { componentsGeneric, defineSchema, makeFunctionReference, type FunctionReference } from 'convex/server'
import type { ComponentApi } from '../../src/convex/components/backend/_generated/component'
import type { TestConvex } from 'convex-test'
import type { BillingCatalog } from '../../src/convex/catalog'
import { hmacSha256Hex } from '../../src/convex/integrations/billing/providers/http'
import type { Billing } from '../../src/convex/integrations/billing/types/surface'
import { asUser, defineBackendTestApp } from '../../src/convex/test'
import { getBackendError } from '../../src/convex/errors'

// Billing on Stripe Managed Payments, end to end from the package's
// sources: `BILLING_PROVIDER=stripe` and the catalog definition in
// `setupBilling({ commerce })`, a fake Stripe API behind `fetch`, and its
// webhooks signed as Stripe signs them. The free plan's monthly credits, a
// checkout, the subscription and its invoice filling the plan, the plan's
// credits and features, a pack bought and refunded, a cancellation, and a
// Polar-only feature refusing, all through the scaffold's functions.

const SECRET = 'whsec_commerce_suite'
const SITE = 'http://localhost:3000'

const CATALOG: BillingCatalog = {
  currency: 'usd',
  meters: { credits: {} },
  plans: {
    free: { name: 'Free', prices: { month: 0 }, credits: { meter: 'credits', units: 30 } },
    pro: { name: 'Pro', prices: { month: 1200, year: 12000 }, credits: { meter: 'credits', units: 400 }, features: ['priority_queue'], quotas: { projects: 10 } },
  },
  packs: {
    credits100: { name: '100 credits', price: 500, credits: { meter: 'credits', units: 100 } },
  },
  features: { priority_queue: { description: 'Your strips start drawing first' } },
  quotas: { projects: { description: 'Projects' } },
}

const PRICES = { 'pro': 'price_pro_month', 'pro:year': 'price_pro_year', 'credits100': 'price_pack_100' }

const built = vi.hoisted(() => ({ billing: undefined as Billing | undefined }))

vi.mock('nuxt-backend/billing', async () => {
  const source = await import('../../src/convex/integrations/billing')
  const setupBilling: typeof source.setupBilling = (components, config) => {
    built.billing = source.setupBilling(components, { ...config, catalog: undefined, commerce: { definition: CATALOG, products: { sandbox: PRICES } } })
    return built.billing
  }
  return { ...source, setupBilling }
})

vi.stubEnv('BILLING_PROVIDER', 'stripe')
vi.stubEnv('BILLING_ACCESS_TOKEN', 'sk_test_commerce')
vi.stubEnv('BILLING_WEBHOOK_SECRET', SECRET)
vi.stubEnv('SITE_URL', SITE)
vi.stubEnv('AUTH_SECRET', 'commerce-suite-secret-0123456789abcdefghijkl')

const SCAFFOLD = '../fixtures/registration/backend/'
const scaffold = import.meta.glob(['../fixtures/registration/backend/*.ts', '!**/convex.config.ts', '!**/auth.config.ts'])
const testApp = defineBackendTestApp(defineSchema({}), { ...scaffold, [`${SCAFFOLD}_generated/api.js`]: () => Promise.resolve({}) })

const fn = <Kind extends 'query' | 'mutation' | 'action'>(path: string) => makeFunctionReference<Kind>(path) as FunctionReference<Kind, 'public'>
const components = componentsGeneric() as unknown as { backend: ComponentApi<'backend'> }
const internalFn = (path: string) => makeFunctionReference<'action'>(path) as unknown as FunctionReference<'action', 'internal'>

/** What the fake Stripe API was asked, and the subscriptions it holds. */
interface FakeStripe {
  calls: Array<{ method: string, path: string, body: URLSearchParams }>
  subscriptions: Record<string, Record<string, unknown>>
}

let t: TestConvex<ReturnType<typeof defineSchema>>
let stripe: FakeStripe

/** The fake Stripe API: checkout and portal sessions, subscriptions read and changed, refunds. */
function fakeStripe(): FakeStripe {
  const state: FakeStripe = { calls: [], subscriptions: {} }
  vi.stubGlobal('fetch', async (input: string | URL, init: RequestInit = {}) => {
    const url = new URL(String(input))
    if (url.host !== 'api.stripe.com') throw new Error(`unexpected fetch to ${url.host}`)
    const path = url.pathname.replace('/v1/', '')
    const method = init.method ?? 'GET'
    const body = new URLSearchParams(typeof init.body === 'string' ? init.body : '')
    state.calls.push({ method, path, body })
    const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } })
    if (path === 'checkout/sessions') return json({ id: 'cs_test_1', url: 'https://checkout.stripe.com/c/pay/cs_test_1' })
    if (path === 'billing_portal/sessions') return json({ url: 'https://billing.stripe.com/p/session/test_1' })
    if (path === 'invoice_payments') return json({ data: [] })
    if (path === 'refunds') return json({ id: 're_test_1', payment_intent: body.get('payment_intent'), amount: Number(body.get('amount') ?? 500), currency: 'usd', status: 'succeeded' })
    if (path.startsWith('invoices/')) return json({ id: path.slice('invoices/'.length), hosted_invoice_url: 'https://invoice.stripe.com/i/test_1' })
    if (path.startsWith('payment_intents/')) return json({ id: path.slice('payment_intents/'.length), latest_charge: { receipt_url: 'https://pay.stripe.com/receipts/test_1' } })
    if (path.startsWith('prices/')) return json({ id: path.slice('prices/'.length), unit_amount: 1200, recurring: { interval: path.endsWith('year') ? 'year' : 'month' } })
    const subscription = /^subscriptions\/(.+)$/.exec(path)?.[1]
    if (subscription && state.subscriptions[subscription]) {
      const held = state.subscriptions[subscription]!
      if (method === 'POST' && body.has('cancel_at_period_end')) held.cancel_at_period_end = body.get('cancel_at_period_end') === 'true'
      if (method === 'POST' && body.has('items[0][price]')) held.items = { data: [{ id: 'si_1', price: { id: body.get('items[0][price]') }, current_period_end: Math.floor(Date.now() / 1000) + 365 * 24 * 3600 }] }
      if (method === 'DELETE') held.status = 'canceled'
      return json(held)
    }
    return new Response(JSON.stringify({ error: { code: 'resource_missing' } }), { status: 404 })
  })
  return state
}

/** Deliver one event to `/billing/events`, signed as Stripe signs it. */
async function deliver(type: string, object: Record<string, unknown>, id = `evt_${crypto.randomUUID()}`): Promise<Response> {
  const body = JSON.stringify({ id, type, data: { object } })
  const at = Math.floor(Date.now() / 1000)
  return t.fetch('/billing/events', { method: 'POST', body, headers: { 'stripe-signature': `t=${at},v1=${await hmacSha256Hex(SECRET, `${at}.${body}`)}` } })
}

/** A Stripe subscription for the workspace, as its webhooks and its reads carry it. */
function subscriptionOf(workspaceId: string, fields: Record<string, unknown> = {}): Record<string, unknown> {
  const periodEnd = Math.floor(Date.now() / 1000) + 30 * 24 * 3600
  return {
    id: 'sub_test_1',
    object: 'subscription',
    customer: 'cus_test_1',
    status: 'active',
    cancel_at_period_end: false,
    metadata: { entity_id: workspaceId },
    items: { data: [{ price: { id: 'price_pro_month' }, current_period_end: periodEnd }] },
    ...fields,
  }
}

/** The subscription's paid invoice. */
function invoiceOf(workspaceId: string, id = 'in_test_1'): Record<string, unknown> {
  return {
    id,
    customer: 'cus_test_1',
    amount_paid: 1200,
    currency: 'usd',
    lines: { data: [{ pricing: { price_details: { price: 'price_pro_month' } } }] },
    parent: { subscription_details: { subscription: 'sub_test_1', metadata: { entity_id: workspaceId } } },
  }
}

type Caller = Awaited<ReturnType<typeof asUser>>
const credits = async (caller: Caller) => ((await caller.query(fn<'query'>('billing:getCredits'), {})) as { meters: Array<{ name?: string, balance: number }> } | null)?.meters.find(meter => meter.name === 'credits')?.balance
const features = (caller: Caller) => caller.query(fn<'query'>('billing:getFeatures'), {}) as Promise<{ plans: string[], benefits: Array<{ metadata?: Record<string, unknown> }>, quotas: Record<string, { limit: number | 'unlimited' }> } | null>
const current = (caller: Caller) => caller.query(fn<'query'>('billing:getCurrentSubscription'), {}) as Promise<{ id: string, productId: string, status: string, cancelAtPeriodEnd: boolean } | null>

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
  stripe = fakeStripe()
  await t.action(internalFn('billing:syncProducts'), {})
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('billing on Stripe Managed Payments (BILLING_PROVIDER=stripe)', { timeout: 30_000 }, () => {
  test('prices the catalog from its definition, with the provider ids the app named', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    const pricing = await ada.query(fn<'query'>('billing:getPricing'), {}) as { plans: Array<{ key: string, prices: Record<string, { productId?: string }>, features: string[] }>, packs: Array<{ key: string, productId: string }> }
    const pro = pricing.plans.find(plan => plan.key === 'pro')
    expect(pro?.prices.month?.productId).toBe('price_pro_month')
    expect(pro?.prices.year?.productId).toBe('price_pro_year')
    expect(pro?.features).toContain('Your strips start drawing first')
    expect(pricing.packs.map(pack => pack.productId)).toEqual(['price_pack_100'])
  })

  test('starts the free plan as the app\'s own: no subscription, its month of credits granted once', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    expect(await t.action(internalFn('billing:startFreePlan'), { entityId: ada.workspaceId! })).toBe('started')
    expect(await t.action(internalFn('billing:startFreePlan'), { entityId: ada.workspaceId! })).toBe('subscribed')
    expect(await current(ada)).toBeNull()
    expect(await credits(ada)).toBe(30)
    expect((await features(ada))?.plans).toEqual(['local:plan:free'])
    // Nothing was asked of Stripe.
    expect(stripe.calls).toEqual([])
  })

  test('opens a Stripe checkout for one catalog product, the entity in its metadata, and refuses what is Polar\'s', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    const { url } = await ada.action(fn<'action'>('billing:generateCheckoutLink'), { productIds: ['price_pro_month'], origin: SITE, successUrl: `${SITE}/billing` }) as { url: string }
    expect(url).toBe('https://checkout.stripe.com/c/pay/cs_test_1')
    const session = stripe.calls.find(call => call.path === 'checkout/sessions')!.body
    expect(session.get('mode')).toBe('subscription')
    expect(session.get('line_items[0][price]')).toBe('price_pro_month')
    expect(session.get('metadata[entity_id]')).toBe(ada.workspaceId)
    expect(session.get('success_url')).toMatch(/^http:\/\/localhost:3000\/billing\?checkout_return=[\da-f-]{36}$/)
    await expect(ada.action(fn<'action'>('billing:generateCheckoutLink'), { productIds: ['local:plan:free'], origin: SITE, successUrl: `${SITE}/billing` })).rejects.toThrow(/names the free plan/)
    await expect(ada.action(fn<'action'>('billing:giftCheckout'), { pack: 'credits100', recipientEmail: 'bob@example.com', origin: SITE, successUrl: `${SITE}/billing` })).rejects.toThrow(/Polar's for now/)
  })

  test('fills the plan from the subscription and its invoice: features, quotas and the plan\'s credits, the free month lapsing', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    await t.action(internalFn('billing:startFreePlan'), { entityId: ada.workspaceId! })
    const subscription = subscriptionOf(ada.workspaceId!)
    stripe.subscriptions.sub_test_1 = subscription
    expect((await deliver('customer.subscription.created', subscription)).status).toBe(200)
    expect((await deliver('invoice.paid', invoiceOf(ada.workspaceId!))).status).toBe(200)

    expect(await current(ada)).toMatchObject({ id: 'sub_test_1', productId: 'price_pro_month', status: 'active' })
    const granted = await features(ada)
    expect(granted?.plans).toEqual(['price_pro_month'])
    expect(granted?.benefits.map(benefit => benefit.metadata?.key)).toContain('priority_queue')
    expect(granted?.quotas.projects?.limit).toBe(10)
    // The free month's 30 lapsed as the plan's 400 landed.
    expect(await credits(ada)).toBe(400)

    // A redelivered invoice (a new event id, the same invoice) grants nothing more.
    await deliver('invoice.paid', invoiceOf(ada.workspaceId!))
    expect(await credits(ada)).toBe(400)

    const orders = await ada.action(fn<'action'>('billing:getOrders'), {}) as { items: Array<{ id: string, totalAmount: number }> }
    expect(orders.items).toMatchObject([{ id: 'in_test_1', totalAmount: 1200 }])
    const portal = await ada.action(fn<'action'>('billing:generateCustomerPortalUrl'), {}) as { url: string }
    expect(portal.url).toBe('https://billing.stripe.com/p/session/test_1')
    expect(stripe.calls.find(call => call.path === 'billing_portal/sessions')!.body.get('customer')).toBe('cus_test_1')
  })

  test('grants a pack\'s credits on its paid session, and takes them back on its whole refund', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    await t.action(internalFn('billing:startFreePlan'), { entityId: ada.workspaceId! })
    const session = { id: 'cs_pack', mode: 'payment', payment_status: 'paid', payment_intent: 'pi_pack', customer: 'cus_test_1', amount_total: 500, currency: 'usd', metadata: { entity_id: ada.workspaceId, product_id: 'price_pack_100' } }
    await deliver('checkout.session.completed', session)
    expect(await credits(ada)).toBe(130)
    await deliver('refund.created', { id: 're_pack', payment_intent: 'pi_pack', amount: 500, currency: 'usd', status: 'succeeded' })
    expect(await credits(ada)).toBe(30)
    // Its redelivery takes nothing more.
    await deliver('refund.created', { id: 're_pack', payment_intent: 'pi_pack', amount: 500, currency: 'usd', status: 'succeeded' })
    expect(await credits(ada)).toBe(30)
  })

  test('cancels at the period\'s end through Stripe, and returns to the free plan when the subscription ends', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    const subscription = subscriptionOf(ada.workspaceId!)
    stripe.subscriptions.sub_test_1 = subscription
    await deliver('customer.subscription.created', subscription)
    const canceled = await ada.action(fn<'action'>('billing:cancelSubscription'), { offer: false }) as { canceled: true, endsAt: number | null }
    expect(canceled.canceled).toBe(true)
    expect(canceled.endsAt).toBeGreaterThan(Date.now())
    expect(stripe.calls.find(call => call.method === 'POST' && call.path === 'subscriptions/sub_test_1')!.body.get('cancel_at_period_end')).toBe('true')

    await deliver('customer.subscription.deleted', { ...subscription, status: 'canceled' })
    expect(await current(ada)).toBeNull()
    expect((await features(ada))?.plans).toEqual(['local:plan:free'])
    // An ended subscription stays ended, whatever arrives after it.
    await deliver('customer.subscription.updated', subscription)
    expect(await current(ada)).toBeNull()
  })

  test('refuses a delivery Stripe did not sign', async () => {
    const forged = await t.fetch('/billing/events', { method: 'POST', body: '{"id":"evt_forged","type":"invoice.paid"}', headers: { 'stripe-signature': 't=1,v1=00' } })
    expect(forged.status).toBe(403)
  })
})

describe('the orders, the lifecycle and the refusals on Stripe', { timeout: 30_000 }, () => {
  const refusal = (promise: Promise<unknown>) => promise.then(() => null, (error: unknown) => getBackendError(error))
  /** Ada with a paid pack order on file, its credits granted. */
  const withPack = async (orderId = 'pi_pack') => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    await t.action(internalFn('billing:startFreePlan'), { entityId: ada.workspaceId! })
    await deliver('checkout.session.completed', { id: `cs_${orderId}`, mode: 'payment', payment_status: 'paid', payment_intent: orderId, customer: 'cus_test_1', amount_total: 500, currency: 'usd', metadata: { entity_id: ada.workspaceId, product_id: 'price_pack_100' } })
    return ada
  }

  test('lists the orders a page at a time, newest first, and links each one\'s receipt for its owner alone', async () => {
    const ada = await withPack('pi_one')
    await deliver('checkout.session.completed', { id: 'cs_two', mode: 'payment', payment_status: 'paid', payment_intent: 'pi_two', customer: 'cus_test_1', amount_total: 500, currency: 'usd', metadata: { entity_id: ada.workspaceId, product_id: 'price_pack_100' } })
    const first = await ada.action(fn<'action'>('billing:getOrders'), { limit: 1 }) as { items: Array<{ id: string }>, nextCursor?: string }
    expect(first.items).toHaveLength(1)
    expect(first.nextCursor).toBeTypeOf('string')
    const second = await ada.action(fn<'action'>('billing:getOrders'), { limit: 1, cursor: first.nextCursor }) as { items: Array<{ id: string }> }
    expect([...first.items, ...second.items].map(order => order.id).sort()).toEqual(['pi_one', 'pi_two'])
    expect(await ada.action(fn<'action'>('billing:getInvoiceUrl'), { orderId: 'pi_one' })).toEqual({ url: 'https://pay.stripe.com/receipts/test_1' })
    const bob = await asUser(t, { email: 'bob@example.com' })
    expect(await refusal(bob.action(fn<'action'>('billing:getInvoiceUrl'), { orderId: 'pi_one' }))).toMatchObject({ code: 'forbidden', data: { reason: 'not_owner' } })
  })

  test('refunds an order from the admin tier through Stripe, once its delivery counts it nothing is left to refund', async () => {
    await withPack()
    const admin = await asUser(t, { email: 'admin@example.com', role: 'admin' })
    const refund = await admin.action(fn<'action'>('billing:refundOrder'), { orderId: 'pi_pack', reason: 'customer_request' }) as { id: string, amount: number, orderId: string }
    expect(refund).toMatchObject({ id: 're_test_1', orderId: 'pi_pack', amount: 500 })
    const asked = stripe.calls.find(call => call.path === 'refunds')!
    expect(asked.body.get('payment_intent')).toBe('pi_pack')
    await deliver('refund.created', { id: 're_test_1', payment_intent: 'pi_pack', amount: 500, currency: 'usd', status: 'succeeded' })
    expect(await refusal(admin.action(fn<'action'>('billing:refundOrder'), { orderId: 'pi_pack', reason: 'customer_request' }))).toMatchObject({ code: 'invalid_input', data: { field: 'amount' } })
    expect(await refusal(admin.action(fn<'action'>('billing:refundOrder'), { orderId: 'pi_none', reason: 'customer_request' }))).toMatchObject({ code: 'invalid_input', data: { field: 'orderId' } })
  })

  test('takes a pack\'s credits back when its charge is disputed, and leaves a delivery for no known entity alone', async () => {
    const ada = await withPack()
    expect(await credits(ada)).toBe(130)
    expect((await deliver('charge.dispute.created', { id: 'dp_1', payment_intent: 'pi_pack', amount: 500 })).status).toBe(200)
    expect(await credits(ada)).toBe(30)
    const stranger = { id: 'cs_stranger', mode: 'payment', payment_status: 'paid', payment_intent: 'pi_stranger', customer: 'cus_unknown', amount_total: 500, currency: 'usd', metadata: { product_id: 'price_pack_100' } }
    expect((await deliver('checkout.session.completed', stranger)).status).toBe(200)
    expect(await refusal(ada.action(fn<'action'>('billing:getInvoiceUrl'), { orderId: 'pi_stranger' }))).toMatchObject({ code: 'forbidden' })
  })

  test('moves the plan to its yearly price, takes a cancellation back, and ends it now', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    const subscription = subscriptionOf(ada.workspaceId!, { items: { data: [{ id: 'si_1', price: { id: 'price_pro_month' }, current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 3600 }] } })
    stripe.subscriptions.sub_test_1 = subscription
    await deliver('customer.subscription.created', subscription)
    await ada.action(fn<'action'>('billing:updateSubscription'), { productId: 'price_pro_year', proration: 'invoice' })
    const change = stripe.calls.find(call => call.method === 'POST' && call.body.has('items[0][price]'))!
    expect(change.body.get('items[0][price]')).toBe('price_pro_year')
    expect(change.body.get('proration_behavior')).toBe('always_invoice')
    await deliver('customer.subscription.updated', stripe.subscriptions.sub_test_1!)
    expect(await current(ada)).toMatchObject({ productId: 'price_pro_year' })
    await ada.action(fn<'action'>('billing:cancelSubscription'), { offer: false })
    await deliver('customer.subscription.updated', stripe.subscriptions.sub_test_1!)
    await ada.action(fn<'action'>('billing:uncancelSubscription'), {})
    expect(stripe.calls.filter(call => call.body.get('cancel_at_period_end') === 'false').length).toBeGreaterThan(0)
    await ada.action(fn<'action'>('billing:cancelSubscription'), { offer: false, atPeriodEnd: false })
    expect(stripe.calls.some(call => call.method === 'DELETE')).toBe(true)
  })

  test('refuses what Stripe or adapter mode has no call for: a pause, usage history, a discount, two products or one outside the catalog', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    const subscription = subscriptionOf(ada.workspaceId!)
    stripe.subscriptions.sub_test_1 = subscription
    await deliver('customer.subscription.created', subscription)
    expect(await refusal(ada.action(fn<'action'>('billing:pauseSubscription'), {}))).toMatchObject({ code: 'unavailable', data: { reason: 'provider_unsupported' } })
    expect(await refusal(ada.action(fn<'action'>('billing:getUsageHistory'), {}))).toMatchObject({ code: 'unavailable', data: { reason: 'provider_unsupported' } })
    const checkout = (args: Record<string, unknown>) => refusal(ada.action(fn<'action'>('billing:generateCheckoutLink'), { origin: SITE, successUrl: `${SITE}/billing`, ...args }))
    // The catalog's discounts are Polar's: none is known here, so none is redeemed.
    expect(await checkout({ productIds: ['price_pack_100'], discount: 'launch' })).toMatchObject({ code: 'invalid_input', data: { field: 'discount' } })
    expect(await checkout({ productIds: ['price_pack_100', 'price_pro_year'] })).toMatchObject({ code: 'invalid_input', data: { field: 'productIds' } })
    expect(await checkout({ productIds: ['price_unknown'] })).toMatchObject({ code: 'invalid_input' })
  })
})

describe('the credit grant ledger of adapter mode', () => {
  const ledger = components.backend.commerce
  const balance = async (userId: string) => (await t.query(components.backend.billing.getByUser, { userId }))?.meters.find(meter => meter.meterId === 'credits')?.balance
  const spend = async (userId: string, amount: number, externalId: string) => {
    expect((await t.mutation(components.backend.billing.debit, { userId, meterId: 'credits', amount, externalId })).ok).toBe(true)
    await t.mutation(components.backend.billing.settle, { userId, externalId })
  }
  const grant = (userId: string, externalId: string, amount: number, source: 'plan' | 'pack', rollover = source === 'pack') =>
    t.mutation(ledger.grantCredits, { userId, meterId: 'credits', amount, externalId, source, rollover })

  test('lapses what is left of a plan\'s month as the next lands, what was spent taken from it first', async () => {
    await grant('w1', 'm1', 100, 'plan')
    await spend('w1', 30, 's1')
    await grant('w1', 'm2', 100, 'plan')
    expect(await balance('w1')).toBe(100)
    // A redelivered grant grants nothing.
    expect(await grant('w1', 'm2', 100, 'plan')).toEqual({ granted: false, balance: 100 })
  })

  test('keeps another plan\'s grant of the same month on a shared meter, and lapses both at the next', async () => {
    const month = ['basic:m1', 'pro:m1']
    const cycleGrant = (externalId: string, keep: string[]) =>
      t.mutation(ledger.grantCredits, { userId: 'w6', meterId: 'credits', amount: 100, externalId, source: 'plan', rollover: false, keep })
    await grant('w6', 'free:m1', 30, 'plan')
    // The second plan's month first, as a retry after a run that stopped would: the free month lapses, neither plan's does.
    await cycleGrant('pro:m1', month)
    await cycleGrant('basic:m1', month)
    expect(await balance('w6')).toBe(200)
    expect(await cycleGrant('pro:m1', month)).toEqual({ granted: false, balance: 200 })
    // A spend comes out of the two months once.
    await spend('w6', 50, 'w6-s1')
    // The next month lapses all that is left of both of this one's.
    const next = ['basic:m2', 'pro:m2']
    await cycleGrant('basic:m2', next)
    await cycleGrant('pro:m2', next)
    expect(await balance('w6')).toBe(200)
  })

  test('keeps a pack\'s credits through a plan\'s new month, and takes them back on a refund once', async () => {
    await grant('w2', 'm1', 100, 'plan')
    await grant('w2', 'p1', 50, 'pack')
    await spend('w2', 120, 's1')
    // The plan's hundred went first; the thirty left are the pack's, and stay.
    await grant('w2', 'm2', 100, 'plan')
    expect(await balance('w2')).toBe(130)
    // A refund takes back what the balance still holds of the pack, once.
    expect(await t.mutation(ledger.revokeGrant, { userId: 'w2', externalId: 'p1' })).toBe(50)
    expect(await t.mutation(ledger.revokeGrant, { userId: 'w2', externalId: 'p1' })).toBe(0)
    expect(await balance('w2')).toBe(80)
  })

  test('takes back what an open reservation holds of a revoked grant, so releasing it restores nothing', async () => {
    await grant('w5', 'p1', 50, 'pack')
    expect((await t.mutation(components.backend.billing.debit, { userId: 'w5', meterId: 'credits', amount: 50, externalId: 'held' })).ok).toBe(true)
    expect(await balance('w5')).toBe(0)
    expect(await t.mutation(ledger.revokeGrant, { userId: 'w5', externalId: 'p1' })).toBe(50)
    await t.mutation(components.backend.billing.release, { userId: 'w5', externalId: 'held' })
    expect(await balance('w5')).toBe(0)
  })

  test('keeps a plan grant that rolls over, and forgets the entity\'s records on erasure', async () => {
    await grant('w3', 'm1', 100, 'plan', true)
    await grant('w3', 'm2', 100, 'plan', true)
    expect(await balance('w3')).toBe(200)
    await t.mutation(ledger.recordOrder, { orderId: 'o1', provider: 'dodo', entityId: 'w3', amount: 500, currency: 'usd' })
    await t.mutation(ledger.linkCustomer, { entityId: 'w3', provider: 'dodo', customerId: 'cus_1' })
    await t.mutation(ledger.forgetEntity, { entityId: 'w3' })
    expect(await t.query(ledger.getOrder, { orderId: 'o1' })).toBeNull()
    expect(await t.query(ledger.customerOf, { entityId: 'w3', provider: 'dodo' })).toBeNull()
    expect(await t.query(ledger.hasGrant, { externalId: 'm1' })).toBe(false)
  })

  test('counts each refund of an order once, a partial one keeping the order part paid', async () => {
    await t.mutation(ledger.recordOrder, { orderId: 'o2', provider: 'stripe', entityId: 'w4', amount: 1000, currency: 'usd' })
    expect(await t.mutation(ledger.recordOrder, { orderId: 'o2', provider: 'stripe', entityId: 'w4', amount: 1000, currency: 'usd' })).toBe(false)
    expect((await t.mutation(ledger.refundOrder, { orderId: 'o2', refundId: 'r1', amount: 400 }))?.order).toMatchObject({ status: 'partially_refunded', refundedAmount: 400 })
    expect((await t.mutation(ledger.refundOrder, { orderId: 'o2', refundId: 'r1', amount: 400 }))?.counted).toBe(false)
    expect((await t.mutation(ledger.refundOrder, { orderId: 'o2', refundId: 'r2' }))?.order).toMatchObject({ status: 'refunded', refundedAmount: 1000 })
    expect(await t.mutation(ledger.refundOrder, { orderId: 'none', refundId: 'r3' })).toBeNull()
    expect(await t.mutation(ledger.disputeOrder, { orderId: 'o2' })).toMatchObject({ status: 'disputed' })
    expect(await t.mutation(ledger.disputeOrder, { orderId: 'none' })).toBeNull()
  })
})
