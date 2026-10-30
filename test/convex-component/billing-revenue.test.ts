/// <reference types="vite/client" />
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { componentsGeneric, defineSchema, makeFunctionReference, type FunctionReference } from 'convex/server'
import { convexTest, type TestConvex } from 'convex-test'
import { syncBillingCatalog } from '../../src/cli/billing/sync'
import { createPolarFake, type PolarFake, routeToFake } from '../fixtures/polar-fake/server'
import type { OrderRecord, SubscriptionRecord } from '../fixtures/polar-fake/state'
import type { BillingCatalog } from '../../src/convex/catalog'
import type { ComponentApi } from '../../src/convex/components/backend/_generated/component'
import { getBackendError } from '../../src/convex/errors'
import type { RevenueReport } from '../../src/convex/integrations/billing/types/revenue'
import schema from '../../src/convex/components/backend/schema'
import { asUser, defineBackendTestApp } from '../../src/convex/test'
import { signingSecret } from '../helpers/secrets'

// The Revenue view's read (analytics): an administrator reads the billing
// provider's own metrics, live over the fake provider, with usage per
// catalog meter and the cancel flow's save offers beside them; anyone
// else is refused, and so is a token without the metrics scope.

const SITE = 'http://localhost:3000'
const FAKE = 'http://127.0.0.1:4753'
const SECRET = signingSecret()
const DAY = 24 * 60 * 60 * 1000
const NOW = Date.parse('2027-03-15T12:00:00Z')

const CATALOG: BillingCatalog = {
  meters: { credits: { eventName: 'credits', property: 'amount' } },
  plans: { pro: { name: 'Pro', prices: { month: 1200 } } },
}

vi.mock('../fixtures/registration/backend/billing.generated', async () => {
  const { stableId } = await import('../fixtures/polar-fake/state')
  return {
    catalog: {
      sandbox: {
        products: { pro: stableId('product', 'pro') },
        plans: { pro: { month: stableId('product', 'pro') } },
        meters: { credits: { meterId: stableId('meter', 'credits'), eventName: 'credits', property: 'amount' } },
      },
    },
  }
})

vi.stubEnv('BILLING_ACCESS_TOKEN', 'polar_oat_fake')
vi.stubEnv('EMAIL_API_KEY', 're_test_key')
vi.stubEnv('BILLING_WEBHOOK_SECRET', SECRET)
vi.stubEnv('SITE_URL', SITE)
vi.stubEnv('AUTH_SECRET', 'revenue-suite-secret-0123456789abcdefghijklmnop')

const scaffold = import.meta.glob(['../fixtures/registration/backend/*.ts', '!**/convex.config.ts', '!**/auth.config.ts'])
const testApp = defineBackendTestApp(defineSchema({}), {
  ...scaffold,
  '../fixtures/registration/backend/_generated/api.js': () => Promise.resolve({}),
})

const getRevenue = makeFunctionReference<'action'>('billing:getRevenue') as FunctionReference<'action', 'public', { since: number, until?: number, interval?: 'day' | 'week' | 'month' }, RevenueReport>
const components = componentsGeneric() as unknown as { backend: ComponentApi<'backend'> }

/** A subscription the fake keeps, with what the metrics read of it. */
function subscription(id: string, fields: Partial<SubscriptionRecord>): SubscriptionRecord {
  return {
    id, customerId: 'cus_1', productId: 'prod_pro', status: 'active', amount: 1200, currency: 'usd', recurringInterval: 'month', recurringIntervalCount: 1,
    currentPeriodStart: NOW - 10 * DAY, currentPeriodEnd: NOW + 20 * DAY, trialStart: null, trialEnd: null, cancelAtPeriodEnd: false, canceledAt: null,
    startedAt: NOW - 10 * DAY, endsAt: null, endedAt: null, pauseAtPeriodEnd: false, pausedAt: null, resumesAt: null, discountId: null, checkoutId: null,
    customerCancellationReason: null, customerCancellationComment: null, pendingUpdate: null, metadata: {}, createdAt: NOW - 10 * DAY, modifiedAt: null,
    ...fields,
  }
}

/** A paid order, as a checkout or a renewal leaves it. */
function order(id: string, createdAt: number, billingReason: OrderRecord['billingReason'] = 'subscription_create'): OrderRecord {
  return {
    id, customerId: 'cus_1', productId: 'prod_pro', subscriptionId: 'sub_1', checkoutId: null, discountId: null, status: 'paid', billingReason,
    subtotalAmount: 1200, discountAmount: 0, refundedAmount: 0, currency: 'usd', label: 'Pro', isInvoiceGenerated: false, invoiceNumber: null,
    metadata: {}, customFieldData: {}, createdAt, modifiedAt: null,
  }
}

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval', 'Date'] })
  for (const level of ['log', 'info', 'warn', 'error'] as const) vi.spyOn(console, level).mockImplementation(() => {})
})

afterAll(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('getRevenue', () => {
  let t: TestConvex<ReturnType<typeof defineSchema>>
  let fake: PolarFake

  beforeEach(async () => {
    vi.setSystemTime(NOW)
    t = testApp()
    fake = createPolarFake({ baseUrl: FAKE, fetcher: async () => new Response(null, { status: 204 }) })
    vi.stubGlobal('fetch', routeToFake(fake, FAKE))
    await syncBillingCatalog(CATALOG, { rootDir: '.', environment: 'sandbox', accessToken: 'polar_oat_fake', dryRun: false, adopt: {} })
    await fake.idle()
    // The business over the last month: two plans started, one renewed, one cancelled as too expensive and ended.
    Object.assign(fake.state.subscriptions, {
      sub_1: subscription('sub_1', {}),
      sub_2: subscription('sub_2', { status: 'canceled', startedAt: NOW - 20 * DAY, canceledAt: NOW - 5 * DAY, endedAt: NOW - 5 * DAY, customerCancellationReason: 'too_expensive' }),
    })
    Object.assign(fake.state.orders, { ord_1: order('ord_1', NOW - 10 * DAY), ord_2: order('ord_2', NOW - 20 * DAY), ord_3: order('ord_3', NOW - 2 * DAY, 'subscription_cycle') })
    fake.state.events.push(
      { id: 'ev_1', name: 'credits', customerId: 'cus_1', externalCustomerId: null, externalId: 'spend_1', metadata: { amount: 30 }, timestamp: NOW - 3 * DAY },
      { id: 'ev_2', name: 'credits', customerId: 'cus_1', externalCustomerId: null, externalId: 'spend_2', metadata: { amount: 12 }, timestamp: NOW - DAY },
    )
  })

  afterEach(async () => {
    await fake.idle()
    fake.close()
    vi.unstubAllGlobals()
  })

  const refusal = (call: Promise<unknown>) => call.then(() => null, (error: unknown) => getBackendError(error))

  test('answers an administrator with the provider\'s metrics, usage per meter and the save offers', async () => {
    const offered = await t.mutation(components.backend.subscriptions.recordOffer, { entityId: 'org_1', subscriptionId: 'sub_2', reason: 'too_expensive', offer: { kind: 'pause', months: 1, resumesAt: NOW + 30 * DAY }, since: 0 })
    await t.mutation(components.backend.subscriptions.recordOffer, { entityId: 'org_2', subscriptionId: 'sub_3', reason: 'unused', offer: { kind: 'pause', months: 1, resumesAt: NOW + 30 * DAY }, since: 0 })
    await t.mutation(components.backend.subscriptions.takeOffer, { offerId: offered!, entityId: 'org_1' })
    const admin = await asUser(t, { role: 'admin', workspace: false })

    const report = await admin.action(getRevenue, { since: NOW - 29 * DAY })
    expect(report.since).toBe(Date.parse('2027-02-14T00:00:00Z'))
    expect(report.until).toBe(Date.parse('2027-03-16T00:00:00Z'))
    expect(report.interval).toBe('day')
    expect(report.periods).toHaveLength(30)
    expect(report.totals).toMatchObject({ monthlyRecurringRevenue: 1200, annualRecurringRevenue: 14400, revenue: 3600, newSubscriptions: 2, renewedSubscriptions: 1, churnedSubscriptions: 1, canceledSubscriptions: 1, activeSubscriptions: 1 })
    expect(report.cancellations).toEqual({
      reasons: { customer_service: 0, low_quality: 0, missing_features: 0, switched_service: 0, too_complex: 0, too_expensive: 1, unused: 0, other: 0 },
      saveOffers: { made: 2, accepted: 1, truncated: false },
    })
    expect(report.meters).toEqual([expect.objectContaining({ meter: 'credits', total: 42 })])
    expect(report.meters[0]!.periods.map(period => period.quantity).filter(Boolean)).toEqual([30, 12])
    // Per week: the same totals, cut in five.
    const weekly = await admin.action(getRevenue, { since: NOW - 29 * DAY, interval: 'week' })
    expect(weekly.periods).toHaveLength(5)
    expect(weekly.totals.revenue).toBe(3600)
  })

  test('refuses anyone but an administrator in person', async () => {
    const member = await asUser(t, {})
    expect(await refusal(member.action(getRevenue, { since: NOW - DAY }))).toMatchObject({ code: 'forbidden', data: { reason: 'admin_only' } })
    expect(await refusal(t.action(getRevenue, { since: NOW - DAY }))).toMatchObject({ code: 'unauthenticated' })
    const admin = await asUser(t, { role: 'admin', workspace: false })
    const visit = await asUser(t, { impersonatedBy: admin.userId })
    expect(await refusal(visit.action(getRevenue, { since: NOW - DAY }))).toMatchObject({ code: 'forbidden', data: { reason: 'impersonating' } })
  })

  test('refuses a window longer than a year, or one that ends before it starts', async () => {
    const admin = await asUser(t, { role: 'admin', workspace: false })
    expect(await refusal(admin.action(getRevenue, { since: NOW - 400 * DAY }))).toMatchObject({ code: 'invalid_input', data: { field: 'since' } })
    expect(await refusal(admin.action(getRevenue, { since: NOW - DAY, until: NOW - 3 * DAY }))).toMatchObject({ code: 'invalid_input', data: { field: 'until' } })
  })

  test('shows the other metrics when the provider fails on its side for some, and is unavailable when it fails on all', async () => {
    const admin = await asUser(t, { role: 'admin', workspace: false })
    const route = routeToFake(fake, FAKE)
    // The provider's sandbox answers 500 for any read that names these (seen live on a catalog in two currencies).
    const broken = ['monthly_recurring_revenue', 'ltv']
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input))
      if (url.pathname.startsWith('/v1/metrics') && url.searchParams.getAll('metrics').some(slug => broken.includes(slug))) return new Response('Internal Server Error', { status: 500 })
      // The meter's usage read fails on the provider's side as well.
      if (/^\/v1\/meters\/[^/]+\/quantities/.test(url.pathname)) return new Response('Internal Server Error', { status: 500 })
      return route(input, init)
    })
    const report = await admin.action(getRevenue, { since: NOW - 29 * DAY })
    expect(report.totals).toMatchObject({ monthlyRecurringRevenue: null, lifetimeValue: null, annualRecurringRevenue: 14400, revenue: 3600 })
    expect(report.periods).toHaveLength(30)
    expect(report.cancellations.reasons.too_expensive).toBe(1)
    expect(report.meters).toEqual([])
    // Every metric failing is the provider down: refused, not an empty report.
    broken.push(...['annual_recurring_revenue', 'revenue', 'net_revenue', 'active_subscriptions', 'new_subscriptions', 'renewed_subscriptions', 'churned_subscriptions', 'canceled_subscriptions', 'churn_rate', 'checkouts', 'succeeded_checkouts', 'checkouts_conversion', 'costs', 'cost_per_user', 'gross_margin', 'gross_margin_percentage'])
    broken.push(...['customer_service', 'low_quality', 'missing_features', 'switched_service', 'too_complex', 'too_expensive', 'unused', 'other'].map(reason => `canceled_subscriptions_${reason}`))
    expect(await refusal(admin.action(getRevenue, { since: NOW - DAY }))).toMatchObject({ code: 'unavailable', data: { service: 'billing', reason: 'provider_refused' } })
  })

  test('is unavailable when the token lacks metrics:read, or the provider is unreachable', async () => {
    const admin = await asUser(t, { role: 'admin', workspace: false })
    fake.state.deniedScopes = ['metrics:read']
    expect(await refusal(admin.action(getRevenue, { since: NOW - DAY }))).toMatchObject({ code: 'unavailable', data: { service: 'billing', reason: 'provider_refused' } })
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('fetch failed')
    })
    expect(await refusal(admin.action(getRevenue, { since: NOW - DAY }))).toMatchObject({ code: 'unavailable', data: { service: 'billing', reason: 'provider_refused' } })
  })
})

describe('the save offer counts', () => {
  test('count the offers made in the window, and those accepted', async () => {
    const t = convexTest(schema, import.meta.glob('../../src/convex/components/backend/**/*.ts'))
    vi.setSystemTime(NOW)
    const counts = makeFunctionReference<'query'>('subscriptions:offerCounts') as FunctionReference<'query'>
    const offer = { kind: 'pause' as const, months: 1, resumesAt: NOW + 30 * DAY }
    const record = makeFunctionReference<'mutation'>('subscriptions:recordOffer') as FunctionReference<'mutation'>
    const take = makeFunctionReference<'mutation'>('subscriptions:takeOffer') as FunctionReference<'mutation'>
    const id = await t.mutation(record, { entityId: 'org_1', subscriptionId: 'sub_1', reason: 'unused', offer, since: 0 }) as string
    await t.mutation(take, { offerId: id, entityId: 'org_1' })
    vi.setSystemTime(NOW + 2 * DAY)
    await t.mutation(record, { entityId: 'org_2', subscriptionId: 'sub_2', reason: 'other', offer, since: 0 })
    expect(await t.query(counts, { since: NOW - DAY, until: NOW + 3 * DAY })).toEqual({ made: 2, accepted: 1, truncated: false })
    expect(await t.query(counts, { since: NOW + DAY, until: NOW + 3 * DAY })).toEqual({ made: 1, accepted: 0, truncated: false })
  })
})
