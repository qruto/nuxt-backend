/// <reference types="vite/client" />
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import type { Product } from '@polar-sh/sdk/models/components/product.js'
import type { ProductPrice } from '@polar-sh/sdk/models/components/productprice.js'
import type { Subscription } from '@polar-sh/sdk/models/components/subscription.js'
import { componentsGeneric, defineSchema, httpActionGeneric, httpRouter, makeFunctionReference, type FunctionReference } from 'convex/server'
import type { TestConvex } from 'convex-test'
import { syncBillingCatalog } from '../../src/cli/billing/sync'
import { signDelivery } from '../fixtures/polar-fake/deliver'
import { createModels } from '../fixtures/polar-fake/models'
import { createPolarFake, type PolarFake, routeToFake } from '../fixtures/polar-fake/server'
import { newId, stableId } from '../fixtures/polar-fake/state'
import { toWire } from '../fixtures/polar-fake/wire'
import type { BillingCatalog } from '../../src/convex/catalog'
import { setupBilling } from '../../src/convex/integrations/billing'
import type { BillingCatalogIds } from '../../src/convex/integrations/billing/types/records'
import { setupEmail } from '../../src/convex/integrations/email'
import { asUser, defineBackendTestApp } from '../../src/convex/test'
import { signingSecret } from '../helpers/secrets'

// What a verified billing delivery keeps in the provider component's own
// tables, the ones the price list and the subscription reads come from: a
// product with its fixed, custom, seat-based and usage prices, its
// benefits, and a subscription through its changes, every date as an ISO
// string, and a late, older delivery that changes nothing.

const SITE = 'http://localhost:3000'
const FAKE = 'http://127.0.0.1:4794'
const ENDPOINT = 'https://provider-records.convex.site/billing/events'
const SECRET = signingSecret()

const CATALOG: BillingCatalog = {
  currency: 'usd',
  meters: { credits: { eventName: 'credits', property: 'amount' } },
  plans: { pro: { name: 'Pro', prices: { month: 1200 }, credits: { meter: 'credits', units: 500 } } },
}

const PRO = stableId('product', 'pro')
const GENERATED: BillingCatalogIds = {
  products: { pro: PRO },
  plans: { pro: { month: PRO } },
  meters: { credits: { meterId: stableId('meter', 'credits'), eventName: 'credits', property: 'amount' } },
}

vi.stubEnv('BILLING_ACCESS_TOKEN', 'polar_oat_fake')
vi.stubEnv('BILLING_WEBHOOK_SECRET', SECRET)
vi.stubEnv('SITE_URL', SITE)
vi.stubEnv('AUTH_SECRET', 'provider-records-secret-0123456789abcdefghijkl')

const components = componentsGeneric() as unknown as { polar: { lib: Record<'getProduct' | 'getSubscription', FunctionReference<'query', 'internal'>> } }
const billing = setupBilling(components as never, { email: setupEmail(components as never), catalog: { sandbox: GENERATED } })

const http = httpRouter()
http.route({ path: '/billing/events', method: 'POST', handler: httpActionGeneric((ctx, request) => billing.webhookHandler(ctx as never, request)) })

const testApp = defineBackendTestApp(defineSchema({}), {
  './_generated/api.js': () => Promise.resolve({}),
  './billing.js': () => Promise.resolve(billing.api),
  './http.js': () => Promise.resolve({ default: http }),
})

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

beforeEach(async () => {
  vi.setSystemTime(new Date('2027-04-01T08:00:00Z'))
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

const stored = {
  product: (id: string) => t.query(components.polar.lib.getProduct, { id }) as Promise<Record<string, unknown> & { prices: Array<Record<string, unknown>> } | null>,
  subscription: (id: string) => t.query(components.polar.lib.getSubscription, { id }) as Promise<Record<string, unknown> | null>,
}

/** A delivery of the provider's, signed with the deployment's secret, of an SDK model: what the provider would send. */
async function deliver(type: string, wire: 'product' | 'subscription', data: Product | Subscription): Promise<number> {
  const id = `msg_${newId().replaceAll('-', '')}`
  const at = new Date()
  const body = JSON.stringify({ type, timestamp: at.toISOString(), data: toWire(wire, data as never) })
  const response = await t.fetch('/billing/events', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'webhook-id': id, 'webhook-timestamp': String(Math.floor(at.getTime() / 1000)), 'webhook-signature': signDelivery(SECRET, id, at, body) },
    body,
  })
  return response.status
}

describe('a product', () => {
  test('is stored as the provider made it and changed it: its price, its benefits, its dates as ISO strings', async () => {
    const product = (await stored.product(PRO))!
    expect(product).toMatchObject({
      id: PRO,
      name: 'Pro',
      isRecurring: true,
      isArchived: false,
      recurringInterval: 'month',
      organizationId: fake.state.organization.id,
      createdAt: new Date(fake.state.products[PRO]!.createdAt).toISOString(),
      medias: [],
    })
    expect(product.prices).toEqual([expect.objectContaining({ amountType: 'fixed', priceAmount: 1200, priceCurrency: 'usd', type: 'recurring', recurringInterval: 'month', productId: PRO, isArchived: false, source: 'catalog' })])
    expect(product.benefits).toEqual([expect.objectContaining({ type: 'meter_credit', properties: expect.objectContaining({ units: 500 }), selectable: true, deletable: true })])
    // Renamed in the provider's dashboard: `product.updated` follows.
    vi.setSystemTime(Date.now() + 60_000)
    Object.assign(fake.state.products[PRO]!, { name: 'Pro (2027)', modifiedAt: Date.now() })
    fake.replayProducts()
    await fake.idle()
    expect(await stored.product(PRO)).toMatchObject({ name: 'Pro (2027)', modifiedAt: new Date(Date.now()).toISOString() })
  })

  test('keeps the fields of a custom and of a seat-based price, and its images', async () => {
    const models = createModels(fake.state, FAKE)
    const base = models.product(fake.state.products[PRO]!)
    const common = { createdAt: new Date(), modifiedAt: null, source: 'catalog' as const, taxBehavior: null, isArchived: false, productId: PRO }
    const prices: ProductPrice[] = [
      { ...common, id: 'price_custom', amountType: 'custom', priceCurrency: 'usd', minimumAmount: 500, maximumAmount: null, presetAmount: 1500 },
      { ...common, id: 'price_seats', amountType: 'seat_based', priceCurrency: 'eur', seatTiers: { tiers: [{ minSeats: 1, maxSeats: 5, pricePerSeat: 1000 }, { minSeats: 6, pricePerSeat: 800 }], minimumSeats: 1, maximumSeats: null } },
    ] as ProductPrice[]
    const image = { id: 'media_1', organizationId: fake.state.organization.id, name: 'cover.png', path: 'org/cover.png', mimeType: 'image/png', size: 2048, storageVersion: null, checksumEtag: null, checksumSha256Base64: null, checksumSha256Hex: null, lastModifiedAt: null, version: null, service: 'product_media' as const, isUploaded: true, createdAt: new Date(), sizeReadable: '2 KB', publicUrl: 'https://cdn.example.com/cover.png' }
    vi.setSystemTime(Date.now() + 60_000)
    expect(await deliver('product.updated', 'product', { ...base, modifiedAt: new Date(), prices, medias: [image] })).toBe(202)
    const [custom, seats] = (await stored.product(PRO))!.prices
    expect(custom).toEqual(expect.objectContaining({ id: 'price_custom', amountType: 'custom', priceCurrency: 'usd', minimumAmount: 500, maximumAmount: null, presetAmount: 1500, type: 'recurring', recurringInterval: 'month' }))
    expect(custom).not.toHaveProperty('priceAmount')
    // Its image, for a pricing page to show.
    expect((await stored.product(PRO))!.medias).toEqual([expect.objectContaining({ id: 'media_1', mimeType: 'image/png', size: 2048, publicUrl: 'https://cdn.example.com/cover.png', createdAt: image.createdAt.toISOString(), lastModifiedAt: null })])
    // The last tier is open-ended: its upper bound is stored as none.
    expect(seats).toEqual(expect.objectContaining({ id: 'price_seats', amountType: 'seat_based', priceCurrency: 'eur', seatTiers: [{ minSeats: 1, maxSeats: 5, pricePerSeat: 1000 }, { minSeats: 6, maxSeats: null, pricePerSeat: 800 }] }))
  })

  test('keeps a usage price, its meter as the id and name the provider component stores', async () => {
    // A plan billed by usage: the provider's meter carries its unit and
    // label too, which the provider component's table refuses.
    vi.setSystemTime(Date.now() + 60_000)
    const usage: BillingCatalog = { ...CATALOG, plans: { ...CATALOG.plans, metered: { name: 'Metered', prices: { month: 500 }, usage: [{ meter: 'credits', unitAmount: '0.5' }] } } }
    const { ids } = await syncBillingCatalog(usage, { rootDir: '.', environment: 'sandbox', accessToken: 'polar_oat_fake', dryRun: false, adopt: {} })
    await fake.idle()
    // Stored, so the delivery succeeded: a refusal fails it, and the provider retries it forever.
    expect(fake.state.deliveries.find(({ type }) => type === 'product.created')).toMatchObject({ status: 202 })
    const meterId = stableId('meter', 'credits')
    const metered = (await stored.product(ids.products.metered!))?.prices.find(({ amountType }) => amountType === 'metered_unit')
    expect(metered).toEqual(expect.objectContaining({ unitAmount: '0.5', meterId, meter: { id: meterId, name: expect.any(String) } }))
  })
})

describe('a subscription', () => {
  test('is stored through its changes, and a late delivery of an older version changes nothing', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    const { url } = await ada.action(makeFunctionReference<'action'>('billing:generateCheckoutLink'), { productIds: [PRO], origin: SITE, successUrl: `${SITE}/billing` }) as { url: string }
    await fake.handle(new Request(`${url}/pay`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'origin': FAKE } }))
    await fake.idle()
    const record = Object.values(fake.state.subscriptions)[0]!
    const first = (await stored.subscription(record.id))!
    expect(first).toMatchObject({
      id: record.id,
      customerId: record.customerId,
      productId: PRO,
      status: 'active',
      amount: 1200,
      currency: 'usd',
      recurringInterval: 'month',
      cancelAtPeriodEnd: false,
      currentPeriodStart: new Date(record.currentPeriodStart).toISOString(),
      currentPeriodEnd: new Date(record.currentPeriodEnd).toISOString(),
      startedAt: new Date(record.startedAt).toISOString(),
      endedAt: null,
      canceledAt: null,
      trialStart: null,
      seats: null,
    })
    const before = createModels(fake.state, FAKE).subscription(record)
    // Cancelled at the period's end in the provider's portal.
    vi.setSystemTime(Date.now() + 60_000)
    await fake.handle(new Request(`${FAKE}/v1/subscriptions/${record.id}`, { method: 'PATCH', headers: { 'authorization': 'Bearer polar_oat_fake', 'content-type': 'application/json' }, body: JSON.stringify({ cancel_at_period_end: true, customer_cancellation_reason: 'too_expensive' }) }))
    await fake.idle()
    const cancelled = { cancelAtPeriodEnd: true, canceledAt: new Date(Date.now()).toISOString(), customerCancellationReason: 'too_expensive' }
    expect(await stored.subscription(record.id)).toMatchObject(cancelled)
    // The version from before the cancellation, redelivered late.
    expect(await deliver('subscription.updated', 'subscription', before)).toBe(202)
    expect(await stored.subscription(record.id)).toMatchObject(cancelled)
  })
})
