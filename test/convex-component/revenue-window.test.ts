/// <reference types="vite/client" />
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { componentsGeneric, defineSchema, makeFunctionReference, type FunctionReference } from 'convex/server'
import type { TestConvex } from 'convex-test'
import { syncBillingCatalog } from '../../src/cli/billing/sync'
import { createPolarFake, type PolarFake, routeToFake } from '../fixtures/polar-fake/server'
import { type OrderRecord, stableId } from '../fixtures/polar-fake/state'
import type { BillingCatalog } from '../../src/convex/catalog'
import { getBackendError } from '../../src/convex/errors'
import { setupBilling } from '../../src/convex/integrations/billing'
import type { BillingCatalogIds } from '../../src/convex/integrations/billing/types/records'
import type { RevenueReport } from '../../src/convex/integrations/billing/types/revenue'
import { setupEmail } from '../../src/convex/integrations/email'
import { asUser, defineBackendTestApp } from '../../src/convex/test'

// The window the Revenue view reads, as an administrator asks for it: whole
// UTC days from `since` to `until`, cut at today and at most a year long,
// read per day, week or month; the provider's answer merged back together
// when it fails on its side for some metrics; and the refusals that are
// final: a meter's usage the provider refuses outright, and a deployment
// with no access token.

const FAKE = 'http://127.0.0.1:4793'
const DAY = 24 * 60 * 60 * 1000
const NOW = Date.parse('2027-03-15T12:00:00Z')
const TODAY = Date.parse('2027-03-15T00:00:00Z')

const CATALOG: BillingCatalog = {
  meters: { credits: { eventName: 'credits', property: 'amount' } },
  plans: { pro: { name: 'Pro', prices: { month: 1200 } } },
}

const GENERATED: BillingCatalogIds = {
  products: { pro: stableId('product', 'pro') },
  plans: { pro: { month: stableId('product', 'pro') } },
  meters: { credits: { meterId: stableId('meter', 'credits'), eventName: 'credits', property: 'amount' } },
}

vi.stubEnv('SITE_URL', 'http://localhost:3000')
vi.stubEnv('AUTH_SECRET', 'revenue-window-secret-0123456789abcdefghijklmn')

const components = componentsGeneric()
const email = setupEmail(components as never)
vi.stubEnv('BILLING_ACCESS_TOKEN', '')
const tokenless = setupBilling(components as never, { email, catalog: { sandbox: GENERATED } })
vi.stubEnv('BILLING_ACCESS_TOKEN', 'polar_oat_fake')
const billing = setupBilling(components as never, { email, catalog: { sandbox: GENERATED } })

const testApp = defineBackendTestApp(defineSchema({}), {
  './_generated/api.js': () => Promise.resolve({}),
  './billing.js': () => Promise.resolve(billing.api),
  './tokenless.js': () => Promise.resolve(tokenless.api),
})

type RevenueArgs = { since: number, until?: number, interval?: 'day' | 'week' | 'month' }
const getRevenue = (module = 'billing') => makeFunctionReference<'action'>(`${module}:getRevenue`) as FunctionReference<'action', 'public', RevenueArgs, RevenueReport>

let t: TestConvex<ReturnType<typeof defineSchema>>
let fake: PolarFake

// The first calls of a cold run compile the whole backend.
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

/** A paid order of the plan, `daysAgo` days before now. */
function order(id: string, daysAgo: number): OrderRecord {
  return {
    id, customerId: 'cus_1', productId: GENERATED.products!.pro!, subscriptionId: null, checkoutId: null, discountId: null, status: 'paid', billingReason: 'purchase',
    subtotalAmount: 1200, discountAmount: 0, refundedAmount: 0, currency: 'usd', label: 'Pro', isInvoiceGenerated: false, invoiceNumber: null,
    metadata: {}, customFieldData: {}, createdAt: NOW - daysAgo * DAY, modifiedAt: null,
  }
}

beforeEach(async () => {
  vi.setSystemTime(NOW)
  t = testApp()
  fake = createPolarFake({ baseUrl: FAKE, fetcher: async () => new Response(null, { status: 204 }) })
  vi.stubGlobal('fetch', routeToFake(fake, FAKE))
  const { ids } = await syncBillingCatalog(CATALOG, { rootDir: '.', environment: 'sandbox', accessToken: 'polar_oat_fake', dryRun: false, adopt: {} })
  expect(ids).toEqual(GENERATED)
  await fake.idle()
  Object.assign(fake.state.orders, { ord_1: order('ord_1', 40), ord_2: order('ord_2', 10), ord_3: order('ord_3', 1) })
  fake.state.events.push({ id: 'ev_1', name: 'credits', customerId: 'cus_1', externalCustomerId: null, externalId: 'spend_1', metadata: { amount: 7 }, timestamp: NOW - 2 * DAY })
})

afterEach(async () => {
  await fake.idle()
  fake.close()
  vi.unstubAllGlobals()
})

const refusal = (call: Promise<unknown>) => call.then(() => null, (error: unknown) => getBackendError(error))
const admin = () => asUser(t, { role: 'admin', workspace: false })

/** Route the provider SDK's calls to the fake, but refuse with `status` the ones `matches` picks. */
function failing(matches: (url: URL) => boolean, status: number): void {
  const route = routeToFake(fake, FAKE)
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init)
    return matches(new URL(request.url)) ? Response.json({ error: 'Refused', detail: 'refused' }, { status }) : route(request)
  })
}

describe('the window', () => {
  test('is whole UTC days from since\'s day, cut at today however far ahead until is', async () => {
    const report = await (await admin()).action(getRevenue(), { since: NOW - 9.75 * DAY, until: NOW + 5 * DAY })
    expect(report.since).toBe(TODAY - 10 * DAY)
    expect(report.until).toBe(TODAY + DAY)
    expect(report.periods).toHaveLength(11)
    expect(report.periods[0]!.at).toBe(TODAY - 10 * DAY)
    expect(report.totals.revenue).toBe(2400)
    expect(report.meters).toEqual([expect.objectContaining({ meter: 'credits', total: 7 })])
  })

  test('covers a year at the most: 366 days are read, 367 refused', async () => {
    const caller = await admin()
    const year = await caller.action(getRevenue(), { since: NOW - 365 * DAY })
    expect(year.periods).toHaveLength(366)
    expect(year.totals.revenue).toBe(3600)
    expect(await refusal(caller.action(getRevenue(), { since: NOW - 366 * DAY }))).toMatchObject({ code: 'invalid_input', data: { field: 'since', reason: 'too_long' } })
  })

  test('is refused when it is no time, or starts after today', async () => {
    const caller = await admin()
    expect(await refusal(caller.action(getRevenue(), { since: Number.NaN }))).toMatchObject({ code: 'invalid_input', data: { field: 'since' } })
    expect(await refusal(caller.action(getRevenue(), { since: NOW - DAY, until: Number.POSITIVE_INFINITY }))).toMatchObject({ code: 'invalid_input', data: { field: 'until' } })
    expect(await refusal(caller.action(getRevenue(), { since: NOW + 2 * DAY }))).toMatchObject({ code: 'invalid_input', data: { field: 'until' } })
  })

  test('is read per calendar month when asked', async () => {
    const report = await (await admin()).action(getRevenue(), { since: Date.parse('2027-01-20T00:00:00Z'), interval: 'month' })
    expect(report.interval).toBe('month')
    expect(report.periods.map(period => new Date(period.at).toISOString().slice(0, 7))).toEqual(['2027-01', '2027-02', '2027-03'])
    expect(report.periods.map(period => period.revenue)).toEqual([0, 1200, 2400])
  })
})

describe('the provider\'s answer', () => {
  test('failing on its side for some metrics comes back merged, one period per day with every other metric', async () => {
    failing(url => url.pathname.startsWith('/v1/metrics') && url.searchParams.getAll('metrics').includes('net_revenue'), 502)
    const report = await (await admin()).action(getRevenue(), { since: NOW - 6 * DAY })
    const days = report.periods.map(period => period.at)
    expect(days).toEqual(Array.from({ length: 7 }, (_, index) => TODAY - (6 - index) * DAY))
    for (const period of report.periods) {
      expect(period.netRevenue).toBeNull()
      // Read in different halves of the split, put back on one day.
      expect(typeof period.revenue).toBe('number')
      expect(typeof period.grossMarginPercentage).toBe('number')
    }
    expect(report.totals).toMatchObject({ revenue: 1200, netRevenue: null })
  })

  test('counts no cancellation for a reason the provider fails on', async () => {
    failing(url => url.pathname.startsWith('/v1/metrics') && url.searchParams.getAll('metrics').some(slug => slug.startsWith('canceled_subscriptions_')), 503)
    const report = await (await admin()).action(getRevenue(), { since: NOW - 6 * DAY })
    expect(report.cancellations.reasons).toEqual({ customer_service: 0, low_quality: 0, missing_features: 0, switched_service: 0, too_complex: 0, too_expensive: 0, unused: 0, other: 0 })
    expect(report.totals.revenue).toBe(1200)
  })

  test('refusing a meter\'s usage outright, not on its side, refuses the whole read', async () => {
    failing(url => /^\/v1\/meters\/[^/]+\/quantities/.test(url.pathname), 403)
    expect(await refusal((await admin()).action(getRevenue(), { since: NOW - DAY }))).toMatchObject({ code: 'unavailable', data: { service: 'billing', reason: 'provider_refused' } })
  })

  test('refusing the metrics outright is final: no half is read again', async () => {
    const asked: string[] = []
    const route = routeToFake(fake, FAKE)
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init)
      const url = new URL(request.url)
      if (!url.pathname.startsWith('/v1/metrics')) return route(request)
      asked.push(url.search)
      return Response.json({ detail: [{ loc: ['query', 'metrics'], msg: 'refused', type: 'value_error' }] }, { status: 422 })
    })
    expect(await refusal((await admin()).action(getRevenue(), { since: NOW - DAY }))).toMatchObject({ code: 'unavailable', data: { service: 'billing', reason: 'provider_refused' } })
    expect(asked).toHaveLength(1)
  })
})

test('a deployment without an access token reads nothing, even for an administrator', async () => {
  expect(await refusal((await admin()).action(getRevenue('tokenless'), { since: NOW - DAY }))).toMatchObject({ code: 'unavailable', data: { service: 'billing', reason: 'not_configured' } })
})
