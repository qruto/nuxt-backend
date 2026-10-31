import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Polar } from '@polar-sh/sdk'
import { PolarCore } from '@polar-sh/sdk/core.js'
import { benefitsCreate } from '@polar-sh/sdk/funcs/benefitsCreate.js'
import { webhooksRedeliverWebhookEvent } from '@polar-sh/sdk/funcs/webhooksRedeliverWebhookEvent.js'
import { benefitsGet } from '@polar-sh/sdk/funcs/benefitsGet.js'
import { benefitsList } from '@polar-sh/sdk/funcs/benefitsList.js'
import { checkoutsClientConfirm } from '@polar-sh/sdk/funcs/checkoutsClientConfirm.js'
import { checkoutsClientUpdate } from '@polar-sh/sdk/funcs/checkoutsClientUpdate.js'
import { checkoutsCreate } from '@polar-sh/sdk/funcs/checkoutsCreate.js'
import { customerSessionsCreate } from '@polar-sh/sdk/funcs/customerSessionsCreate.js'
import { customersCreate } from '@polar-sh/sdk/funcs/customersCreate.js'
import { customersGet } from '@polar-sh/sdk/funcs/customersGet.js'
import { customersDelete } from '@polar-sh/sdk/funcs/customersDelete.js'
import { customersDeleteExternal } from '@polar-sh/sdk/funcs/customersDeleteExternal.js'
import { customersGetExternal } from '@polar-sh/sdk/funcs/customersGetExternal.js'
import { customersMembersDeleteExternal } from '@polar-sh/sdk/funcs/customersMembersDeleteExternal.js'
import { customersGetStateExternal } from '@polar-sh/sdk/funcs/customersGetStateExternal.js'
import { customersList } from '@polar-sh/sdk/funcs/customersList.js'
import { customersUpdate } from '@polar-sh/sdk/funcs/customersUpdate.js'
import { discountsCreate } from '@polar-sh/sdk/funcs/discountsCreate.js'
import { discountsDelete } from '@polar-sh/sdk/funcs/discountsDelete.js'
import { discountsGet } from '@polar-sh/sdk/funcs/discountsGet.js'
import { discountsList } from '@polar-sh/sdk/funcs/discountsList.js'
import { discountsUpdate } from '@polar-sh/sdk/funcs/discountsUpdate.js'
import { eventsIngest } from '@polar-sh/sdk/funcs/eventsIngest.js'
import { eventsList } from '@polar-sh/sdk/funcs/eventsList.js'
import { membersListMembers } from '@polar-sh/sdk/funcs/membersListMembers.js'
import { metersQuantities } from '@polar-sh/sdk/funcs/metersQuantities.js'
import { metricsGet } from '@polar-sh/sdk/funcs/metricsGet.js'
import { metricsLimits } from '@polar-sh/sdk/funcs/metricsLimits.js'
import { ordersGenerateInvoice } from '@polar-sh/sdk/funcs/ordersGenerateInvoice.js'
import { ordersGet } from '@polar-sh/sdk/funcs/ordersGet.js'
import { ordersInvoice } from '@polar-sh/sdk/funcs/ordersInvoice.js'
import { ordersList } from '@polar-sh/sdk/funcs/ordersList.js'
import { productsUpdate } from '@polar-sh/sdk/funcs/productsUpdate.js'
import { productsUpdateBenefits } from '@polar-sh/sdk/funcs/productsUpdateBenefits.js'
import { RFCDate } from '@polar-sh/sdk/types/rfcdate.js'
import { refundsCreate } from '@polar-sh/sdk/funcs/refundsCreate.js'
import { subscriptionsCreate } from '@polar-sh/sdk/funcs/subscriptionsCreate.js'
import { subscriptionsGet } from '@polar-sh/sdk/funcs/subscriptionsGet.js'
import { subscriptionsUpdate } from '@polar-sh/sdk/funcs/subscriptionsUpdate.js'
import { readBillingOrganizationState, syncBillingCatalog } from '../../src/cli/billing'
import { applyProviderChanges, planSettingChanges, providerClient, readProviderEndpoint, readProviderOrganization } from '../../src/cli/billing/settings'
import { webhooksResetWebhookEndpointSecret } from '@polar-sh/sdk/funcs/webhooksResetWebhookEndpointSecret.js'
import { createPolarFake, type PolarFake } from '../fixtures/polar-fake/server'
import { newWebhookSecret, stableId } from '../fixtures/polar-fake/state'
import type { BillingCatalog } from '../../src/convex/catalog'
import { parseBillingEvent } from '../../src/convex/integrations/billing/provider-events'
import { verifyWebhookSignature } from '../../src/convex/webhook-signatures'

// The drift check: every provider call the package makes — the backend's,
// the CLI's and the billing component's own — made through the provider
// SDK against the fake provider. The SDK parses each answer with its own
// response schemas, so a sandbox shape that drifted from the SDK fails
// here as `ok: false`, and every webhook the fake provider posts must verify and
// parse the way the deployment's `/billing/events` route reads it.

const BASE = 'http://127.0.0.1:4747'
const ENDPOINT = 'http://127.0.0.1:3211/billing/events'
const root = join(import.meta.dirname, '../..')

const catalog: BillingCatalog = {
  meters: { credits: { eventName: 'credits', property: 'amount' } },
  plans: {
    pro: { name: 'Pro', prices: { month: 2900 }, credits: { meter: 'credits', units: 500 }, features: ['priority'], quotas: { projects: 3 } },
    team: { name: 'Team', prices: { month: 9900 }, features: ['priority'] },
  },
  packs: { credits500: { name: '500 credits', price: 2000, credits: { meter: 'credits', units: 500 } } },
  features: { priority: { description: 'Priority support' } },
  quotas: { projects: { description: 'Projects' } },
  customFields: { company: { type: 'text', name: 'Company' } },
}

/** Every source file under `dir` (relative to the repository). */
function sourceFiles(dir: string): string[] {
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`
    if (entry.isDirectory()) return entry.name === '_generated' ? [] : sourceFiles(path)
    return /\.(?:ts|vue)$/.test(entry.name) ? [path] : []
  })
}

/**
 * The provider funcs a source imports for its value, by module name (the
 * path, never the specifier, so aliased and multi-name imports count too):
 * static imports but `import type`, and dynamic `import()`s.
 */
function importedProviderCalls(source: string): string[] {
  return [...source.matchAll(/\bimport\b([^'"]*)['"]@polar-sh\/sdk\/funcs\/(\w+)(?:\.js)?['"]/g)]
    .filter(match => !/^\s*type\b/.test(match[1]!))
    .map(match => match[2]!)
}

/** Every `@polar-sh/sdk/funcs/*` the package (all of src/) and the billing component import: what this suite must call. */
function providerCalls(): string[] {
  const sources = [...sourceFiles('src'), 'node_modules/@convex-dev/polar/dist/client/index.js']
  const names = sources.flatMap(file => importedProviderCalls(readFileSync(join(root, file), 'utf8')))
  return [...new Set(names)].sort()
}

let fake: PolarFake
let deliveries: Array<{ url: string, headers: Headers, body: string }>
const called = new Set<string>()

/** Record a call as made, once its answer parsed. */
function ok<T>(name: string, result: { ok: true, value: T } | { ok: false, error: unknown }): T {
  if (!result.ok) throw new Error(`${name} failed: ${String((result.error as Error)?.message ?? result.error)}`)
  called.add(name)
  return result.value
}

beforeEach(() => {
  const sink: typeof deliveries = []
  deliveries = sink
  fake = createPolarFake({
    baseUrl: BASE,
    fetcher: async (url, init) => {
      sink.push({ url, headers: new Headers(init.headers), body: String(init.body) })
      return new Response('Accepted', { status: 202 })
    },
  })
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => fake.handle(new Request(input, init)))
})

afterEach(async () => {
  await fake.idle()
  fake.close()
  vi.unstubAllGlobals()
})

const core = () => new PolarCore({ accessToken: 'polar_oat_fake', server: 'sandbox' })
const client = () => new Polar({ accessToken: 'polar_oat_fake', server: 'sandbox' })

async function sync() {
  return syncBillingCatalog(catalog, { rootDir: root, environment: 'sandbox', accessToken: 'polar_oat_fake', dryRun: false, adopt: {}, webhookUrl: ENDPOINT })
}

/** Pay a checkout on its page, as a person would. */
async function pay(url: string) {
  const response = await fake.handle(new Request(`${url}/pay`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'origin': BASE } }))
  expect(response.status).toBe(303)
  return response.headers.get('location')
}

describe('the drift check\'s reading of the sources', () => {
  it('counts aliased, multi-line and dynamic imports of a provider func, and never a type-only one', () => {
    const source = [
      'import type { Foo } from \'./types\'',
      'import {\n  ordersGet as getOrder,\n} from \'@polar-sh/sdk/funcs/ordersGet.js\'',
      'import type { eventsIngest } from \'@polar-sh/sdk/funcs/eventsIngest.js\'',
      'const { refundsCreate } = await import(\'@polar-sh/sdk/funcs/refundsCreate.js\')',
    ].join('\n')
    expect(importedProviderCalls(source)).toEqual(['ordersGet', 'refundsCreate'])
  })
})

describe('the fake provider through the provider SDK', () => {
  it('answers every provider call the package makes in shapes the SDK parses', async () => {
    const polar = core()
    // The CLI's catalog sync and doctor read, through their own clients.
    const synced = await sync()
    expect(synced.ids.products.pro).toBe(stableId('product', 'pro'))
    expect(synced.ids.meters.credits?.meterId).toBe(stableId('meter', 'credits'))
    expect(synced.ids.gifts?.credits500).toBe(stableId('product', 'credits500-gift'))
    expect(synced.webhook).toMatchObject({ created: true, secret: expect.stringMatching(/^whsec_/) })
    expect((await sync()).log.filter(entry => entry.action === 'created')).toEqual([])
    // A plan's quotas changed: the sync pushes them to the benefit carrying them.
    const raised = await syncBillingCatalog({ ...catalog, plans: { ...catalog.plans, pro: { ...catalog.plans!.pro!, quotas: { projects: 4 } } } }, { rootDir: root, environment: 'sandbox', accessToken: 'polar_oat_fake', dryRun: false, adopt: {} })
    expect(raised.log).toContainEqual(expect.objectContaining({ action: 'updated', kind: 'benefit', key: 'pro-quotas' }))
    called.add('benefitsUpdate')
    const organization = await readBillingOrganizationState({ accessToken: 'polar_oat_fake', environment: 'sandbox' })
    expect(organization).toMatchObject({ memberModel: true, membersReadable: true, preventTrialAbuse: true })
    for (const name of ['metersList', 'metersCreate', 'benefitsList', 'benefitsCreate', 'productsList', 'productsCreate', 'productsUpdateBenefits', 'customFieldsList', 'customFieldsCreate', 'organizationsListOrganizations', 'webhooksListWebhookEndpoints', 'webhooksCreateWebhookEndpoint', 'membersListMembers']) called.add(name)
    // doctor --fix at the provider: the settings turned on, the endpoint back on with every event, then env rotate's reset.
    const fixing = providerClient('polar_oat_fake', 'sandbox')
    const settings = (await readProviderOrganization(fixing))!
    const endpoint = (await readProviderEndpoint(fixing, ENDPOINT))!
    await applyProviderChanges(fixing, { organization: settings, endpoint: { ...endpoint, enabled: false, events: [] } }, [
      ...planSettingChanges({ plans: { pro: { name: 'Pro', price: { month: 900 }, trial: { days: 7 } } } } as never, { ...settings, subscriptionSettings: { ...settings.subscriptionSettings, preventTrialAbuse: false } }),
      { key: 'webhook-enabled', finding: 'billing-webhook-enabled', description: '' },
      { key: 'webhook-events', finding: 'billing-webhook-events', description: '' },
    ])
    expect((await readProviderOrganization(fixing))!.customerEmailSettings).toMatchObject({ subscriptionPastDue: true, subscriptionTrialConversionReminder: true })
    const reset = ok('webhooksResetWebhookEndpointSecret', await webhooksResetWebhookEndpointSecret(fixing, { id: endpoint.id }))
    expect(reset.secret).not.toBe(synced.webhook!.secret)
    for (const name of ['organizationsUpdate', 'webhooksUpdateWebhookEndpoint']) called.add(name)
    const pack = synced.ids.products.credits500!
    ok('productsUpdate', await productsUpdate(client(), { id: synced.ids.gifts!.credits500!, productUpdate: { prices: [{ amountType: 'fixed', priceAmount: 2000 }] } }))

    // Customers: a team keyed by its entity, its owner a member, a portal session for the owner.
    const team = ok('customersCreate', await customersCreate(polar, { type: 'team', externalId: 'org_1', name: 'Acme', owner: { email: 'ada@example.com', name: 'Ada', externalId: 'user_1' }, metadata: { userId: 'org_1' } }))
    expect((await customersCreate(polar, { type: 'team', externalId: 'org_1', name: 'Again' })).ok).toBe(false)
    expect(ok('customersGetExternal', await customersGetExternal(polar, { externalId: 'org_1' })).id).toBe(team.id)
    expect((await customersGetExternal(polar, { externalId: 'nobody' })).ok).toBe(false)
    ok('customersGet', await customersGet(polar, { id: team.id }))
    ok('customersCreate', await customersCreate(polar, { email: 'solo@example.com', metadata: {} }))
    expect(ok('customersList', await customersList(polar, { email: 'SOLO@example.com', limit: 1 })).result.items).toHaveLength(1)
    ok('customersUpdate', await customersUpdate(polar, { id: team.id, customerUpdate: { metadata: { userId: 'org_1', tier: 'gold' } } }))
    const [owner] = ok('membersListMembers', await membersListMembers(polar, { customerId: team.id, limit: 100 })).result.items
    expect(owner).toMatchObject({ role: 'owner', externalId: 'user_1' })
    const session = ok('customerSessionsCreate', await customerSessionsCreate(polar, { customerId: team.id, memberId: owner!.id, returnUrl: 'http://localhost:3000/settings' }))
    expect(session.customerPortalUrl).toMatch(`${BASE}/portal/`)

    // A paid checkout: the subscription, its credits and features, and the events the deployment reads.
    const checkout = ok('checkoutsCreate', await checkoutsCreate(polar, { products: [synced.ids.products.pro!], externalCustomerId: 'org_1', successUrl: 'http://localhost:3000/billing?checkout_id={CHECKOUT_ID}', allowDiscountCodes: true, metadata: { utm_source: 'news' } }))
    expect(checkout.url).toBe(`${BASE}/checkout/${checkout.id}`)
    expect(await pay(checkout.url)).toBe(`http://localhost:3000/billing?checkout_id=${checkout.id}`)
    const state = ok('customersGetStateExternal', await customersGetStateExternal(polar, { externalId: 'org_1' }))
    expect(state.activeSubscriptions.map(entry => entry.productId)).toEqual([synced.ids.products.pro])
    expect(state.activeMeters).toMatchObject([{ meterId: synced.ids.meters.credits!.meterId, creditedUnits: 500, consumedUnits: 0, balance: 500 }])
    // The plan's feature and the benefit carrying its quotas are both feature flags.
    expect(state.grantedBenefits.map(grant => grant.benefitType).sort()).toEqual(['feature_flag', 'feature_flag', 'meter_credit'])
    const flags = state.grantedBenefits.filter(grant => grant.benefitType === 'feature_flag')
    const keys = await Promise.all(flags.map(async grant => ok('benefitsGet', await benefitsGet(polar, { id: grant.benefitId })).metadata.key))
    expect(keys.sort()).toEqual(['priority', 'pro-quotas'])

    // Usage: ingested once per external id, counted against the meter.
    const usage = { name: 'credits', externalCustomerId: 'org_1', metadata: { amount: 3 }, externalId: 'spend-1' }
    expect(ok('eventsIngest', await eventsIngest(polar, { events: [usage] }))).toEqual({ inserted: 1, duplicates: 0 })
    expect(ok('eventsIngest', await eventsIngest(polar, { events: [usage] }))).toEqual({ inserted: 0, duplicates: 1 })
    expect(ok('customersGetStateExternal', await customersGetStateExternal(polar, { externalId: 'org_1' })).activeMeters[0]).toMatchObject({ consumedUnits: 3, balance: 497 })
    const events = ok('eventsList', await eventsList(polar, { externalCustomerId: 'org_1', meterId: synced.ids.meters.credits!.meterId, page: 1, limit: 10, sorting: ['-timestamp'] }))
    expect(events.items).toHaveLength(1)
    // The admin console's Revenue view: the meter's quantities, and the metrics over a window.
    const today = new Date().toISOString().slice(0, 10)
    const quantities = ok('metersQuantities', await metersQuantities(polar, { id: synced.ids.meters.credits!.meterId, startTimestamp: new Date(Date.now() - 86_400_000), endTimestamp: new Date(Date.now() + 1000), interval: 'day' }))
    expect(quantities.total).toBe(3)
    const metrics = ok('metricsGet', await metricsGet(polar, { startDate: new RFCDate(today), endDate: new RFCDate(today), interval: 'day', metrics: ['monthly_recurring_revenue', 'checkouts'] }))
    expect(metrics.periods).toHaveLength(1)
    expect(metrics.totals.monthlyRecurringRevenue).toBeGreaterThan(0)
    expect(ok('metricsLimits', await metricsLimits(polar)).minDate).toBeInstanceOf(RFCDate)

    // A discount code applied on the checkout through its client secret; an unknown one refused.
    ok('discountsCreate', await discountsCreate(polar, { type: 'percentage', basisPoints: 1000, duration: 'once', name: 'Launch', code: 'SAVE10' }))
    const packCheckout = ok('checkoutsCreate', await checkoutsCreate(polar, { products: [pack], externalCustomerId: 'org_1', allowDiscountCodes: true }))
    const applied = ok('checkoutsClientUpdate', await checkoutsClientUpdate(polar, { clientSecret: packCheckout.clientSecret, checkoutUpdatePublic: { discountCode: 'save10' } }))
    expect(applied.totalAmount).toBe(1800)
    const unknown = await checkoutsClientUpdate(polar, { clientSecret: packCheckout.clientSecret, checkoutUpdatePublic: { discountCode: 'NOPE' } })
    expect(unknown.ok ? 0 : (unknown.error as { statusCode?: number }).statusCode).toBe(422)

    // A code-free, single-use 100% discount: a $0 checkout the server confirms, then used up.
    const gift = ok('discountsCreate', await discountsCreate(polar, { type: 'percentage', basisPoints: 10_000, duration: 'once', maxRedemptions: 1, products: [pack], name: 'gift-1', metadata: { giftId: 'gift-1' } }))
    const claim = ok('checkoutsCreate', await checkoutsCreate(polar, { products: [pack], externalCustomerId: 'org_1', discountId: gift.id, allowDiscountCodes: false, metadata: { giftId: 'gift-1', phase: 'claim' } }))
    expect(claim.totalAmount).toBe(0)
    expect(ok('checkoutsClientConfirm', await checkoutsClientConfirm(polar, { clientSecret: claim.clientSecret, checkoutConfirmStripe: {} })).status).toBe('confirmed')
    expect(ok('discountsGet', await discountsGet(polar, { id: gift.id })).redemptionsCount).toBe(1)
    expect((await checkoutsCreate(polar, { products: [pack], externalCustomerId: 'org_1', discountId: gift.id })).ok).toBe(false)
    expect((await checkoutsClientConfirm(polar, { clientSecret: packCheckout.clientSecret, checkoutConfirmStripe: {} })).ok).toBe(false)
    expect(ok('discountsList', await discountsList(polar, { query: 'gift-1', limit: 10 })).result.items.map(entry => entry.id)).toEqual([gift.id])
    ok('discountsUpdate', await discountsUpdate(polar, { id: gift.id, discountUpdate: { endsAt: new Date() } }))
    expect(ok('discountsDelete', await discountsDelete(polar, { id: gift.id }))).toBeUndefined()
    expect((await discountsGet(polar, { id: gift.id })).ok).toBe(false)

    // Orders and their invoice: asked for once, then there.
    const orders = ok('ordersList', await ordersList(polar, { externalCustomerId: ['org_1'], limit: 10, sorting: ['-created_at'] })).result.items
    expect(orders.map(order => order.billingReason).sort()).toEqual(['purchase', 'subscription_create'])
    const claimOrder = orders.find(order => order.metadata.phase === 'claim')!
    expect(claimOrder).toMatchObject({ netAmount: 0, discountId: gift.id, customer: { externalId: 'org_1' } })
    const order = orders.find(entry => entry.billingReason === 'subscription_create')!
    expect(ok('ordersGet', await ordersGet(polar, { id: order.id })).isInvoiceGenerated).toBe(false)
    expect((await ordersInvoice(polar, { id: order.id })).ok).toBe(false)
    ok('ordersGenerateInvoice', await ordersGenerateInvoice(polar, { id: order.id }))
    expect(ok('ordersInvoice', await ordersInvoice(polar, { id: order.id })).url).toBe(`${BASE}/invoices/${order.id}`)

    // A refund that revokes what the claim granted.
    const refund = ok('refundsCreate', await refundsCreate(polar, { orderId: order.id, reason: 'customer_request', amount: 1000, revokeBenefits: false }))
    expect(refund).toMatchObject({ amount: 1000, status: 'succeeded' })
    expect(ok('ordersGet', await ordersGet(polar, { id: order.id }))).toMatchObject({ status: 'partially_refunded', refundableAmount: 1900 })
    // As the provider does: a subscription's order refunds money, never its benefits.
    const revoking = await refundsCreate(polar, { orderId: order.id, reason: 'customer_request', amount: 100, revokeBenefits: true })
    expect(revoking.ok).toBe(false)
    expect(fake.state.orders[order.id]).toMatchObject({ refundedAmount: 1000 })

    // The subscription lifecycle: a plan change, a cancellation undone, a revocation.
    const subscriptionId = state.activeSubscriptions[0]!.id
    expect(ok('subscriptionsUpdate', await subscriptionsUpdate(polar, { id: subscriptionId, subscriptionUpdate: { productId: synced.ids.products.team! } })).productId).toBe(synced.ids.products.team)
    expect(ok('subscriptionsUpdate', await subscriptionsUpdate(polar, { id: subscriptionId, subscriptionUpdate: { cancelAtPeriodEnd: true, customerCancellationReason: 'too_expensive' } }))).toMatchObject({ cancelAtPeriodEnd: true, customerCancellationReason: 'too_expensive' })
    expect(ok('subscriptionsUpdate', await subscriptionsUpdate(polar, { id: subscriptionId, subscriptionUpdate: { cancelAtPeriodEnd: false } })).cancelAtPeriodEnd).toBe(false)
    expect(ok('subscriptionsUpdate', await subscriptionsUpdate(polar, { id: subscriptionId, subscriptionUpdate: { revoke: true } })).status).toBe('canceled')
    expect((await subscriptionsUpdate(polar, { id: subscriptionId, subscriptionUpdate: { cancelAtPeriodEnd: true } })).ok).toBe(false)

    // The free plan, subscribed to without a checkout, and a pack priced in a second currency.
    const widened = await syncBillingCatalog({
      ...catalog,
      plans: { ...catalog.plans, free: { name: 'Free', prices: { month: 0 }, credits: { meter: 'credits', units: 10 } } },
      packs: { credits500: { ...catalog.packs!.credits500!, price: { usd: 2000, eur: 1800 } } },
    }, { rootDir: root, environment: 'sandbox', accessToken: 'polar_oat_fake', dryRun: false, adopt: {} })
    expect(widened.ids).toMatchObject({ free: 'free', currency: 'usd' })
    expect(widened.log).toContainEqual(expect.objectContaining({ action: 'updated', key: 'credits500', note: 'adds its price in eur' }))
    const free = widened.ids.plans!.free!.month!
    ok('customersCreate', await customersCreate(polar, { type: 'team', externalId: 'org_2', name: 'Free', owner: { email: 'grace@example.com', name: 'Grace', externalId: 'user_2' }, metadata: { userId: 'org_2' } }))
    // Never a paid product, and once per customer: the second is refused.
    expect((await subscriptionsCreate(polar, { productId: synced.ids.products.pro!, externalCustomerId: 'org_2' })).ok).toBe(false)
    const freeSubscription = ok('subscriptionsCreate', await subscriptionsCreate(polar, { productId: free, externalCustomerId: 'org_2' }))
    expect(freeSubscription).toMatchObject({ status: 'active', amount: 0, productId: free })
    // A subscription read by id, as a plan pass is followed; one the provider does not know is not found.
    expect(ok('subscriptionsGet', await subscriptionsGet(polar, { id: freeSubscription.id })).productId).toBe(free)
    expect((await subscriptionsGet(polar, { id: 'sub_unknown' })).ok).toBe(false)
    expect((await subscriptionsCreate(polar, { productId: free, externalCustomerId: 'org_2' })).ok).toBe(false)
    expect(ok('customersGetStateExternal', await customersGetStateExternal(polar, { externalId: 'org_2' })).activeMeters[0]).toMatchObject({ creditedUnits: 10 })
    // A checkout in the second currency pays its price there, and upgrades the free plan in place.
    const euros = ok('checkoutsCreate', await checkoutsCreate(polar, { products: [pack], externalCustomerId: 'org_2', currency: 'eur' }))
    expect(euros).toMatchObject({ totalAmount: 1800, currency: 'eur' })
    expect((await checkoutsCreate(polar, { products: [synced.ids.products.pro!], externalCustomerId: 'org_2', currency: 'gbp' })).ok).toBe(false)
    const upgrade = ok('checkoutsCreate', await checkoutsCreate(polar, { products: [synced.ids.products.pro!], externalCustomerId: 'org_2', subscriptionId: freeSubscription.id }))
    await pay(upgrade.url)
    expect(fake.state.subscriptions[freeSubscription.id]).toMatchObject({ productId: synced.ids.products.pro, amount: 2900, status: 'active' })
    // Only a free subscription is upgraded through a checkout.
    expect((await checkoutsCreate(polar, { products: [synced.ids.products.team!], externalCustomerId: 'org_2', subscriptionId: freeSubscription.id })).ok).toBe(false)

    // An account's erasure: its member leaves a team that stays, and the
    // customer of a workspace that goes with it is deleted and anonymized,
    // its plan revoked with the deletion already on it, then reads as gone.
    ok('customersMembersDeleteExternal', await customersMembersDeleteExternal(polar, { externalId: 'org_1', memberExternalId: 'user_1' }))
    expect(ok('membersListMembers', await membersListMembers(polar, { customerId: team.id, limit: 100 })).result.items).toEqual([])
    expect((await customersMembersDeleteExternal(polar, { externalId: 'org_1', memberExternalId: 'user_1' })).ok).toBe(false)
    deliveries.length = 0
    ok('customersDeleteExternal', await customersDeleteExternal(polar, { externalId: 'org_2', anonymize: true }))
    expect(fake.state.subscriptions[freeSubscription.id]).toMatchObject({ status: 'canceled' })
    expect((await customersGetExternal(polar, { externalId: 'org_2' })).ok).toBe(false)
    expect((await customersDeleteExternal(polar, { externalId: 'org_2', anonymize: true })).ok).toBe(false)
    await fake.idle()
    const revoked = deliveries.map(delivery => JSON.parse(delivery.body) as { type: string, data: { customer?: { deleted_at?: string | null, name?: string | null } } }).find(event => event.type === 'subscription.revoked')
    expect(revoked?.data.customer).toMatchObject({ deleted_at: expect.any(String), name: null })

    // A replay: the provider sends the same event again, under the same id, signed afresh.
    const first = deliveries.at(-1)!
    deliveries.length = 0
    ok('webhooksRedeliverWebhookEvent', await webhooksRedeliverWebhookEvent(polar, { id: first.headers.get('webhook-id')! }))
    await fake.idle()
    expect(deliveries.map(delivery => [delivery.headers.get('webhook-id'), delivery.body])).toEqual([[first.headers.get('webhook-id'), first.body]])
    expect((await webhooksRedeliverWebhookEvent(polar, { id: 'msg_never_sent' })).ok).toBe(false)

    // A customer no external id keys (an earlier release's) is deleted by its own id.
    const unkeyed = ok('customersCreate', await customersCreate(polar, { email: 'legacy@example.com', name: 'Legacy' }))
    ok('customersDelete', await customersDelete(polar, { id: unkeyed.id, anonymize: true }))
    expect(fake.state.customers[unkeyed.id]).toMatchObject({ name: null, deletedAt: expect.any(Number) })
    expect((await customersDelete(polar, { id: unkeyed.id })).ok).toBe(false)

    // Every provider call the package and the billing component import was made, and parsed.
    expect([...called].sort()).toEqual(providerCalls())
    expect(providerCalls().length).toBeGreaterThanOrEqual(35)
  })

  it('posts every event signed for the endpoint, in the shape the deployment\'s webhook route verifies and parses', async () => {
    // As `nuxt-backend dev` does: the deployment's endpoint first, with its own secret.
    const secret = newWebhookSecret()
    fake.ensureEndpoint(ENDPOINT, secret)
    const synced = await sync()
    expect(synced.webhook).toMatchObject({ created: false, secret })
    const polar = core()
    await customersCreate(polar, { email: 'ada@example.com', externalId: 'user_1' })
    const checkout = ok('checkoutsCreate', await checkoutsCreate(polar, { products: [synced.ids.products.pro!], externalCustomerId: 'user_1' }))
    await pay(checkout.url)
    await fake.idle()
    const types = deliveries.map((delivery) => {
      expect(delivery.url).toBe(ENDPOINT)
      // What `/billing/events` does: the one verifier checks the Standard
      // Webhooks signature, then the SDK's payload schemas parse the event.
      expect(verifyWebhookSignature([secret], delivery.body, delivery.headers, { legacyKey: true })).toBe(true)
      return parseBillingEvent(delivery.body).type
    })
    expect(types).toEqual(expect.arrayContaining(['product.created', 'product.updated', 'benefit.created', 'customer.created', 'checkout.created', 'checkout.updated', 'order.created', 'subscription.created', 'benefit_grant.created', 'order.paid', 'subscription.active', 'customer.state_changed']))
    // The provider's own order: the subscription before the payment, the state change last.
    expect(types.indexOf('subscription.created')).toBeLessThan(types.indexOf('order.paid'))
    expect(types.at(-1)).toBe('customer.state_changed')
  })

  it('grants the provider\'s native benefits, with what each grant holds in customer state and its webhooks', async () => {
    const secret = newWebhookSecret()
    fake.ensureEndpoint(ENDPOINT, secret)
    const synced = await sync()
    const polar = core()
    const native = [
      ok('benefitsCreate', await benefitsCreate(polar, { type: 'license_keys', description: 'Desktop license', properties: { prefix: 'APP' } })),
      ok('benefitsCreate', await benefitsCreate(polar, { type: 'downloadables', description: 'Templates', properties: { files: ['file_1', 'file_2'] } })),
      ok('benefitsCreate', await benefitsCreate(polar, { type: 'discord', description: 'Community', properties: { guildToken: 'guild-token', roleId: 'role_1', kickMember: false } })),
      ok('benefitsCreate', await benefitsCreate(polar, { type: 'github_repository', description: 'Source access', properties: { repositoryOwner: 'acme', repositoryName: 'app', permission: 'pull' } })),
    ]
    // A list by id, as a read of a few benefits makes it.
    expect(ok('benefitsList', await benefitsList(polar, { id: native.map(benefit => benefit.id) })).result.items).toHaveLength(4)
    const pro = synced.ids.products.pro!
    ok('productsUpdateBenefits', await productsUpdateBenefits(polar, { id: pro, productBenefitsUpdate: { benefits: [...fake.state.products[pro]!.benefitIds, ...native.map(benefit => benefit.id)] } }))
    await customersCreate(polar, { email: 'ada@example.com', externalId: 'user_1' })
    await pay(ok('checkoutsCreate', await checkoutsCreate(polar, { products: [pro], externalCustomerId: 'user_1' })).url)
    await fake.idle()
    const grants = ok('customersGetStateExternal', await customersGetStateExternal(polar, { externalId: 'user_1' })).grantedBenefits
    const held = (type: string) => grants.find(grant => grant.benefitType === type)!.properties as Record<string, unknown>
    // A license key shows masked, as the provider displays it; the whole key stays at the provider.
    expect(held('license_keys')).toMatchObject({ licenseKeyId: expect.any(String), displayKey: expect.stringMatching(/^\*{4}-[0-9A-F]{6}$/) })
    expect(held('downloadables')).toEqual({ files: ['file_1', 'file_2'] })
    expect(held('discord')).toMatchObject({ roleId: 'role_1' })
    expect(held('github_repository')).toEqual({ repositoryOwner: 'acme', repositoryName: 'app', permission: 'pull' })
    // Each grant's webhook verifies and parses as the deployment reads it.
    const granted = deliveries
      .map((delivery) => {
        expect(verifyWebhookSignature([secret], delivery.body, delivery.headers, { legacyKey: true })).toBe(true)
        return parseBillingEvent(delivery.body)
      })
      .filter(event => event.type === 'benefit_grant.created')
      .map(event => (event.data as { benefit: { type: string } }).benefit.type)
    expect(granted).toEqual(expect.arrayContaining(['license_keys', 'downloadables', 'discord', 'github_repository']))
  })

  it('keeps the provider\'s subscription rules: one cancellation, a change cleared only when scheduled, a failed payment and a pause', async () => {
    const synced = await sync()
    const polar = core()
    await customersCreate(polar, { email: 'ada@example.com', externalId: 'user_1' })
    await pay(ok('checkoutsCreate', await checkoutsCreate(polar, { products: [synced.ids.products.pro!], externalCustomerId: 'user_1' })).url)
    const [subscription] = Object.values(fake.state.subscriptions)
    const id = subscription!.id
    const update = (subscriptionUpdate: Parameters<typeof subscriptionsUpdate>[1]['subscriptionUpdate']) => subscriptionsUpdate(polar, { id, subscriptionUpdate })
    const refusal = (result: Awaited<ReturnType<typeof subscriptionsUpdate>>) => (result.ok ? null : result.error as { statusCode?: number, error?: string })
    const clock = async (action: string) => (await (await fake.handle(new Request(`${BASE}/_fake/clock`, { method: 'POST', body: JSON.stringify({ action }) }))).json()) as { changed: number }

    // Uncanceled only once set to cancel; canceled once, its reason with it.
    // The provider answers 409, which the installed SDK does not name for this call: a failure all the same.
    expect((await update({ cancelAtPeriodEnd: false })).ok).toBe(false)
    expect(ok('subscriptionsUpdate', await update({ cancelAtPeriodEnd: true, customerCancellationReason: 'unused', customerCancellationComment: 'Busy month' }))).toMatchObject({ customerCancellationReason: 'unused', customerCancellationComment: 'Busy month' })
    expect(refusal(await update({ cancelAtPeriodEnd: true, customerCancellationReason: 'too_expensive' }))).toMatchObject({ statusCode: 403, error: 'AlreadyCanceledSubscription' })
    expect(ok('subscriptionsUpdate', await update({ cancelAtPeriodEnd: false }))).toMatchObject({ cancelAtPeriodEnd: false, customerCancellationReason: null })

    // A scheduled change clears; with none scheduled the provider refuses.
    expect(refusal(await update({ pendingUpdate: null }))).toMatchObject({ statusCode: 422 })
    expect(ok('subscriptionsUpdate', await update({ productId: synced.ids.products.team!, prorationBehavior: 'next_period' })).pendingUpdate).toMatchObject({ productId: synced.ids.products.team })
    expect(ok('subscriptionsUpdate', await update({ pendingUpdate: null })).pendingUpdate).toBeNull()

    // A failed payment leaves it past due until the next renewal pays.
    expect(await clock('fail-payment')).toEqual({ changed: 1 })
    expect(fake.state.subscriptions[id]!.status).toBe('past_due')
    expect(await clock('renew')).toEqual({ changed: 1 })
    expect(fake.state.subscriptions[id]!.status).toBe('active')

    // Paused at the period's end, then resumed on a new, charged period.
    ok('subscriptionsUpdate', await update({ pauseAtPeriodEnd: true }))
    await clock('renew')
    expect(fake.state.subscriptions[id]!.status).toBe('paused')
    const charged = Object.keys(fake.state.orders).length
    expect(ok('subscriptionsUpdate', await update({ resume: true })).status).toBe('active')
    expect(Object.keys(fake.state.orders)).toHaveLength(charged + 1)
  })

  it('answers an id it does not know as the provider does, and a path it does not serve by name', async () => {
    const polar = core()
    const missing = await ordersGet(polar, { id: 'no-such-order' })
    expect(missing.ok).toBe(false)
    expect((missing as { error: { statusCode?: number, error?: string } }).error).toMatchObject({ statusCode: 404, error: 'ResourceNotFound' })
    const unknown = await fake.handle(new Request(`${BASE}/v1/payouts/`, { headers: { authorization: 'Bearer x' } }))
    expect(unknown.status).toBe(404)
    expect(await unknown.json()).toMatchObject({ detail: 'The fake provider does not implement GET /v1/payouts.' })
  })
})
