/// <reference types="vite/client" />
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { componentsGeneric, defineSchema, httpActionGeneric, httpRouter, makeFunctionReference, mutationGeneric, queryGeneric, type FunctionReference } from 'convex/server'
import { v } from 'convex/values'
import type { TestConvex } from 'convex-test'
import { syncBillingCatalog } from '../../src/cli/billing/sync'
import { createPolarFake, type PolarFake, routeToFake } from '../fixtures/polar-fake/server'
import { stableId } from '../fixtures/polar-fake/state'
import type { BillingCatalog } from '../../src/convex/catalog'
import type { ComponentApi } from '../../src/convex/components/backend/_generated/component'
import { getBackendError } from '../../src/convex/errors'
import { setupBilling, setupReferrals } from '../../src/convex/integrations/billing'
import { addMonths } from '../../src/convex/integrations/billing/passes'
import type { BillingCatalogIds } from '../../src/convex/integrations/billing/types/records'
import { setupEmail } from '../../src/convex/integrations/email'
import type { ReferralConsole, ReferralProgram, ReferralsView } from '../../src/convex/integrations/referrals'
import { asUser, defineBackendTestApp } from '../../src/convex/test'
import { signingSecret } from '../helpers/secrets'

// The referral program's own code, as an app builds it from the package's
// sources: the hold an order starts or does not start (a gift's order, a
// free one, a checkout tagged with the program's own keys, a payment on the
// referrer's workspace), the refunds that void it, and the sweep's grant at
// its end — read live from the provider, resumed after a failure, never
// granted twice, never paid to a referrer who is gone — on the fake
// provider. Programs the catalog can't back, one with no rewards, and one
// beside an app's own entity resolver show what the program does without
// a reward to give.

const SITE = 'http://localhost:3000'
const FAKE = 'http://127.0.0.1:4791'
const ENDPOINT = 'https://referral-rewards.convex.site/billing/events'
const SECRET = signingSecret()
const DAY = 24 * 60 * 60 * 1000
const HOUR = 60 * 60 * 1000

const CATALOG: BillingCatalog = {
  currency: 'usd',
  meters: { credits: { eventName: 'credits', property: 'amount' } },
  plans: { pro: { name: 'Pro', prices: { month: 1200 }, credits: { meter: 'credits', units: 500 } } },
  packs: { credits500: { name: '500 credits', price: 2000, credits: { meter: 'credits', units: 500 } } },
  discounts: {
    friend: { name: 'A friend\'s welcome', percentOff: 25, duration: 'once', products: { plans: ['pro'] } },
    promo: { name: 'Spring promo', percentOff: 10, duration: 'once', code: 'SPRING10', products: { plans: ['pro'] } },
  },
}

const product = (key: string) => stableId('product', key)
/** What `billing sync` writes for the catalog on the fake provider (checked against the real sync in `beforeEach`). */
const GENERATED: BillingCatalogIds = {
  products: { pro: product('pro'), credits500: product('credits500') },
  plans: { pro: { month: product('pro') } },
  packs: ['credits500'],
  gifts: { credits500: product('credits500-gift') },
  meters: { credits: { meterId: stableId('meter', 'credits'), eventName: 'credits', property: 'amount' } },
  discounts: {
    friend: { id: stableId('discount', 'friend'), name: 'A friend\'s welcome', percentOff: 25, duration: 'once', productIds: [product('pro')] },
    promo: { id: stableId('discount', 'promo'), name: 'Spring promo', code: 'SPRING10', percentOff: 10, duration: 'once', productIds: [product('pro')] },
  },
}

vi.stubEnv('BILLING_ACCESS_TOKEN', 'polar_oat_fake')
vi.stubEnv('BILLING_WEBHOOK_SECRET', SECRET)
vi.stubEnv('EMAIL_API_KEY', 're_test_key')
vi.stubEnv('SITE_URL', SITE)
vi.stubEnv('AUTH_SECRET', 'referral-rewards-secret-0123456789abcdefghijkl')

const components = componentsGeneric() as unknown as { backend: ComponentApi<'backend'> }
const email = setupEmail(components as never)
const catalog = { sandbox: GENERATED }
const billing = setupBilling(components as never, { email, catalog })
/** The app's program: a discount for the friend, a pack for the referrer, one reward a month across the program. */
const referrals = setupReferrals(components as never, {
  billing,
  rewards: { referred: { discount: 'friend' }, referrer: { pack: 'credits500' } },
  hold: 14 * DAY,
  caps: { perMonth: 1 },
})
/** A program whose rewards the catalog can't back: a discount redeemed by code, and a pack it doesn't sell. */
const unbacked = setupReferrals(components as never, { billing, rewards: { referred: { discount: 'promo' }, referrer: { pack: 'nosuchpack' } }, hold: 20.4 * DAY })
/** A program that only attributes sign-ups. */
const attribution = setupReferrals(components as never, { billing })
/** A program that pays the referrer in free months of their plan. */
const months = setupReferrals(components as never, { billing, rewards: { referrer: { months: 1 } }, hold: 14 * DAY })
/** A program beside a billing setup with the app's own entity resolver: it can only attribute sign-ups. */
const ownResolver = setupBilling(components as never, {
  email,
  catalog,
  resolveEntity: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    return identity ? { userId: identity.subject, email: String(identity.email ?? '') } : null
  },
})
const resolved = setupReferrals(components as never, { billing: ownResolver })

/** The badge a share page shows, read from a query (never made there) and from a mutation. */
const badgeRead = queryGeneric({ args: { userId: v.string() }, handler: (ctx, { userId }) => referrals.codeFor(ctx, userId) })
const badgeMade = mutationGeneric({ args: { userId: v.string() }, handler: (ctx, { userId }) => referrals.codeFor(ctx, userId) })

const http = httpRouter()
http.route({ path: '/billing/events', method: 'POST', handler: httpActionGeneric((ctx, request) => billing.webhookHandler(ctx as never, request)) })

const testApp = defineBackendTestApp(defineSchema({}), {
  './_generated/api.js': () => Promise.resolve({}),
  './billing.js': () => Promise.resolve(billing.api),
  './referrals.js': () => Promise.resolve({ ...referrals.api, badgeRead, badgeMade }),
  './unbacked.js': () => Promise.resolve(unbacked.api),
  './attribution.js': () => Promise.resolve(attribution.api),
  './months.js': () => Promise.resolve(months.api),
  './resolved.js': () => Promise.resolve(resolved.api),
  './http.js': () => Promise.resolve({ default: http }),
})

const fn = <Kind extends 'query' | 'mutation' | 'action'>(path: string) => makeFunctionReference<Kind>(path) as FunctionReference<Kind, 'public'>
const internalFn = (path: string) => makeFunctionReference<'action'>(path) as unknown as FunctionReference<'action', 'internal'>

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
  vi.setSystemTime(new Date('2027-01-05T10:00:00Z'))
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
type Claim = { claimed: true } | { claimed: false, reason: string }

const refusal = (promise: Promise<unknown>) => promise.then(() => null, (error: unknown) => getBackendError(error))
const codeOf = async (caller: Caller, program = 'referrals') => (await caller.mutation(fn<'mutation'>(`${program}:getReferralCode`), {}) as { code: string }).code
const claim = (caller: Caller, code: string, program = 'referrals') => caller.mutation(fn<'mutation'>(`${program}:claimReferral`), { code }) as Promise<Claim>
const mine = (caller: Caller) => caller.query(fn<'query'>('referrals:getReferrals'), {}) as Promise<ReferralsView>
const sweep = (program = 'referrals', args: Record<string, unknown> = { op: 'sweep' }) => t.action(internalFn(`${program}:runReferralSweep`), args)
const consoleOf = async (args: Record<string, unknown> = {}) => (await asUser(t, { role: 'admin', workspace: false })).query(fn<'query'>('referrals:getReferralConsole'), args) as Promise<ReferralConsole>

/** Pay a checkout on its page, then let its events land. */
async function pay(url: string): Promise<void> {
  await fake.handle(new Request(`${url}/pay`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'origin': FAKE } }))
  await fake.idle()
}

const link = (caller: Caller, productId: string, extra: Record<string, unknown> = {}) =>
  caller.action(fn<'action'>('billing:generateCheckoutLink'), { productIds: [productId], origin: SITE, successUrl: `${SITE}/billing`, ...extra }) as Promise<{ url: string }>

/** The order a paid checkout left at the provider. */
const orderOf = (url: string) => Object.values(fake.state.orders).find(order => url.endsWith(order.checkoutId ?? '-'))!

/** A friend who signs up through a code and claims it. */
async function friendOf(code: string, address: string, program = 'referrals') {
  const friend = await asUser(t, { email: address })
  expect(await claim(friend, code, program)).toEqual({ claimed: true })
  return friend
}

/** The friend's first paid checkout of Pro, and the order it left. */
async function payPro(friend: Caller) {
  const { url } = await link(friend, product('pro'))
  await pay(url)
  return orderOf(url)
}

/** Packs the provider granted at no cost: what a referral's reward leaves. */
const freePacks = () => Object.values(fake.state.orders).filter(order => order.productId === product('credits500') && order.subtotalAmount > 0 && order.discountAmount === order.subtotalAmount)

/** Ask the provider to refund part of an order, as its dashboard would. */
async function refund(orderId: string, amount: number): Promise<void> {
  await fake.handle(new Request(`${FAKE}/v1/refunds`, {
    method: 'POST',
    headers: { 'authorization': 'Bearer polar_oat_fake', 'content-type': 'application/json' },
    body: JSON.stringify({ order_id: orderId, reason: 'customer_request', amount }),
  }))
  await fake.idle()
}

/** Route the provider SDK's calls to the fake, but answer `status` for the ones `matches` picks. */
function failing(matches: (method: string, path: string) => boolean, status = 500): void {
  const route = routeToFake(fake, FAKE)
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init)
    return matches(request.method, new URL(request.url).pathname.replace(/\/+$/, '')) ? Response.json({ error: 'Unavailable' }, { status }) : route(request)
  })
}

describe('the hold', () => {
  test('starts on the friend\'s first real purchase: a gift they claim (free) or buy (a gift\'s order) starts nothing', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    const code = await codeOf(ada)
    // The friend paid for a pack before following the link, the same day: no referral yet, nothing to hold.
    const friend = await asUser(t, { email: 'delivered+friend@resend.dev' })
    await pay((await link(friend, product('credits500'))).url)
    expect(await claim(friend, code)).toEqual({ claimed: true })
    // A gift from someone else, claimed at no cost.
    const giver = await asUser(t, { email: 'giver@example.com' })
    await pay((await link(giver, product('credits500'))).url)
    await pay((await giver.action(fn<'action'>('billing:giftCheckout'), { pack: 'credits500', recipientEmail: 'delivered+friend@resend.dev', origin: SITE, successUrl: SITE }) as { url: string }).url)
    const [received] = await friend.query(fn<'query'>('billing:getReceivedGifts'), {}) as Array<{ id: string }>
    expect(await friend.action(fn<'action'>('billing:claimGift'), { giftId: received!.id })).toEqual({ url: null })
    await fake.idle()
    // A gift the friend buys for another: paid, but a gift's order.
    await pay((await friend.action(fn<'action'>('billing:giftCheckout'), { pack: 'credits500', recipientEmail: 'delivered+other@resend.dev', origin: SITE, successUrl: SITE }) as { url: string }).url)
    expect(await mine(ada)).toMatchObject({ claimed: 1, held: 0 })
    // Their own plan is the purchase that counts.
    await payPro(friend)
    expect(await mine(ada)).toMatchObject({ claimed: 0, held: 1 })
  })

  test('is never skipped by a checkout the client tags with the program\'s own keys: such a checkout is refused', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    const friend = await friendOf(await codeOf(ada), 'grace@example.com')
    for (const metadata of [{ referralId: 'ref_1' }, { ReferralId: 'ref_1' }, { giftId: 'gift_1' }, { phase: 'reward' }]) {
      expect(await refusal(link(friend, product('pro'), { metadata }))).toMatchObject({ code: 'invalid_input', data: { field: 'metadata' } })
    }
    expect(Object.values(fake.state.checkouts).filter(checkout => checkout.productId === product('pro'))).toEqual([])
    // Metadata of the app's own still goes through, and the payment holds the referral.
    const { url } = await link(friend, product('pro'), { metadata: { campaign: 'spring' } })
    await pay(url)
    expect(orderOf(url).metadata).toMatchObject({ campaign: 'spring' })
    expect(await mine(ada)).toMatchObject({ claimed: 0, held: 1 })
  })

  test('is the same customer paying when the friend pays on a workspace the referrer belongs to: the referral is voided', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    const friend = await friendOf(await codeOf(ada), 'grace@example.com')
    await t.mutation(components.backend.adapter.create, { input: { model: 'member', data: { organizationId: friend.workspaceId!, userId: ada.userId, role: 'member', createdAt: Date.now() } } } as never)
    await payPro(friend)
    expect(await mine(ada)).toMatchObject({ claimed: 0, held: 0, rewarded: 0 })
    expect((await consoleOf({ referrerId: ada.userId })).history).toEqual([expect.objectContaining({ state: 'voided', voidedFor: 'self_referral' })])
  })
})

describe('a refund', () => {
  test('of any part of the order during the hold voids the referral; one after the reward takes nothing back', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    const code = await codeOf(ada)
    const grace = await friendOf(code, 'grace@example.com')
    const graceOrder = await payPro(grace)
    // A dollar of the $9 the friend paid.
    await refund(graceOrder.id, 100)
    expect(await mine(ada)).toMatchObject({ held: 0, rewarded: 0 })
    expect((await consoleOf({ referrerId: ada.userId })).history).toEqual([expect.objectContaining({ state: 'voided', voidedFor: 'refunded' })])

    const linus = await friendOf(code, 'linus@example.com')
    const linusOrder = await payPro(linus)
    vi.setSystemTime(Date.now() + 15 * DAY)
    await sweep()
    await fake.idle()
    expect(await mine(ada)).toMatchObject({ rewarded: 1 })
    await refund(linusOrder.id, 900)
    expect(await mine(ada)).toMatchObject({ rewarded: 1 })
    expect(freePacks()).toHaveLength(1)
  })

  test('the provider shows at the end of the hold voids the referral, though its webhook never came', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    const order = await payPro(await friendOf(await codeOf(ada), 'grace@example.com'))
    Object.assign(fake.state.orders[order.id]!, { status: 'partially_refunded', refundedAmount: 100 })
    vi.setSystemTime(Date.now() + 15 * DAY)
    await sweep()
    await fake.idle()
    expect(await mine(ada)).toMatchObject({ held: 0, rewarded: 0 })
    expect(freePacks()).toEqual([])
    expect((await consoleOf({ referrerId: ada.userId })).history).toEqual([expect.objectContaining({ state: 'voided', voidedFor: 'refunded' })])
  })

  test('is what an order the provider no longer has reads as: the referral is voided', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    const order = await payPro(await friendOf(await codeOf(ada), 'grace@example.com'))
    Reflect.deleteProperty(fake.state.orders, order.id)
    vi.setSystemTime(Date.now() + 15 * DAY)
    await sweep()
    expect((await consoleOf({ referrerId: ada.userId })).history).toEqual([expect.objectContaining({ state: 'voided', voidedFor: 'refunded' })])
  })
})

describe('the grant', () => {
  test('waits an hour when the provider can\'t be read at the end of the hold, then goes through', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    const order = await payPro(await friendOf(await codeOf(ada), 'grace@example.com'))
    vi.setSystemTime(Date.now() + 15 * DAY)
    failing((method, path) => method === 'GET' && path === `/v1/orders/${order.id}`)
    await sweep()
    expect(await mine(ada)).toMatchObject({ held: 1, rewarded: 0 })
    vi.stubGlobal('fetch', routeToFake(fake, FAKE))
    // Taken up again an hour later, not at the next run.
    await sweep()
    expect(await mine(ada)).toMatchObject({ held: 1 })
    vi.setSystemTime(Date.now() + HOUR + 1000)
    await sweep()
    await fake.idle()
    expect(await mine(ada)).toMatchObject({ held: 0, rewarded: 1 })
    expect(freePacks()).toHaveLength(1)
  })

  test('that stopped after its discount was minted resumes with that discount: one discount, one pack', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    await payPro(await friendOf(await codeOf(ada), 'grace@example.com'))
    vi.setSystemTime(Date.now() + 15 * DAY)
    failing((method, path) => method === 'POST' && path === '/v1/checkouts')
    await sweep()
    expect(await mine(ada)).toMatchObject({ held: 1 })
    expect(Object.values(fake.state.discounts).filter(discount => discount.metadata.referralId)).toHaveLength(1)
    vi.stubGlobal('fetch', routeToFake(fake, FAKE))
    vi.setSystemTime(Date.now() + HOUR + 1000)
    await sweep()
    await fake.idle()
    expect(await mine(ada)).toMatchObject({ held: 0, rewarded: 1 })
    const discounts = Object.values(fake.state.discounts).filter(discount => discount.metadata.referralId)
    expect(discounts).toHaveLength(1)
    expect(freePacks()).toEqual([expect.objectContaining({ discountId: discounts[0]!.id })])
  })

  test('whose discount an earlier try redeemed counts as granted: never a second pack', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    await payPro(await friendOf(await codeOf(ada), 'grace@example.com'))
    vi.setSystemTime(Date.now() + 15 * DAY)
    // The confirm fails on the way back: the free checkout stays open...
    failing((method, path) => method === 'POST' && /^\/v1\/checkouts\/client\/[^/]+\/confirm$/.test(path))
    await sweep()
    expect(await mine(ada)).toMatchObject({ held: 1 })
    vi.stubGlobal('fetch', routeToFake(fake, FAKE))
    // ...and completes after all, redeeming the single-use discount.
    const open = Object.values(fake.state.checkouts).find(checkout => checkout.productId === product('credits500') && checkout.metadata.referralId)!
    await pay(`${FAKE}/checkout/${open.id}`)
    expect(freePacks()).toHaveLength(1)
    vi.setSystemTime(Date.now() + HOUR + 1000)
    await sweep()
    await fake.idle()
    expect(await mine(ada)).toMatchObject({ held: 0, rewarded: 1 })
    expect(freePacks()).toHaveLength(1)
  })

  test('is not paid to a referrer banned before the hold ends: the referral is voided, and its slot goes to the next one', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    const bob = await asUser(t, { email: 'bob@example.com' })
    await payPro(await friendOf(await codeOf(ada), 'grace@example.com'))
    await payPro(await friendOf(await codeOf(bob), 'linus@example.com'))
    await t.mutation(components.backend.adapter.updateOne, { input: { model: 'user', where: [{ field: '_id', value: ada.userId }], update: { banned: true } } } as never)
    vi.setSystemTime(Date.now() + 15 * DAY)
    await sweep()
    await fake.idle()
    // One reward a month: Ada's slot, taken and given back, is Bob's.
    expect(await mine(ada)).toMatchObject({ held: 0, rewarded: 0 })
    expect(await mine(bob)).toMatchObject({ held: 0, rewarded: 1 })
    expect((await consoleOf({ referrerId: ada.userId })).history).toEqual([expect.objectContaining({ state: 'voided', voidedFor: 'account_erased' })])
    expect(freePacks()).toHaveLength(1)
  })

  test('is never confirmed when its checkout would charge the referrer anything', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    await payPro(await friendOf(await codeOf(ada), 'grace@example.com'))
    vi.setSystemTime(Date.now() + 15 * DAY)
    // A first try mints the discount and stops; the discount then takes only half off.
    failing((method, path) => method === 'POST' && path === '/v1/checkouts')
    await sweep()
    vi.stubGlobal('fetch', routeToFake(fake, FAKE))
    const discount = Object.values(fake.state.discounts).find(entry => entry.metadata.referralId)!
    discount.basisPoints = 5000
    vi.mocked(console.error).mockClear()
    vi.setSystemTime(Date.now() + HOUR + 1000)
    await sweep()
    await fake.idle()
    expect(vi.mocked(console.error).mock.calls.some(call => String(call[0]).includes('referrals.reward_failed'))).toBe(true)
    expect(Object.values(fake.state.checkouts).filter(checkout => checkout.metadata.referralId).map(checkout => checkout.status)).toEqual(['open'])
    expect(Object.values(fake.state.orders).filter(order => order.metadata.referralId)).toEqual([])
    expect(await mine(ada)).toMatchObject({ held: 1, rewarded: 0 })
  })

  test('of free months moves a paying referrer\'s next renewal later by the months, once however often the sweep runs', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    await payPro(ada)
    const subscription = Object.values(fake.state.subscriptions).find(entry => fake.state.customers[entry.customerId]!.externalId === ada.workspaceId)!
    const renewal = subscription.currentPeriodEnd
    await payPro(await friendOf(await codeOf(ada, 'months'), 'grace@example.com', 'months'))
    vi.setSystemTime(Date.now() + 15 * DAY)
    await sweep('months')
    await fake.idle()
    await sweep('months')
    await fake.idle()
    expect(subscription.currentPeriodEnd).toBe(addMonths(renewal, 1))
    expect(await mine(ada)).toMatchObject({ held: 0, rewarded: 1 })
  })

  test('is made for one referral when the sweep is asked for it, and for no other', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    const bob = await asUser(t, { email: 'bob@example.com' })
    await payPro(await friendOf(await codeOf(ada), 'grace@example.com'))
    await payPro(await friendOf(await codeOf(bob), 'linus@example.com'))
    vi.setSystemTime(Date.now() + 15 * DAY)
    const [bobs] = (await mine(bob)).referrals
    await sweep('referrals', { referralId: bobs!.id })
    await fake.idle()
    expect(await mine(bob)).toMatchObject({ rewarded: 1 })
    expect(await mine(ada)).toMatchObject({ held: 1, rewarded: 0 })
  })
})

describe('a program without a reward to give', () => {
  test('shows no offer the catalog can\'t back, records the claim, and holds the reward a day at a time until it can', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    const view = await ada.mutation(fn<'mutation'>('unbacked:getReferralCode'), {}) as { code: string, program: ReferralProgram }
    expect(view.program).toEqual({ referred: null, referrer: null, holdDays: 20, caps: { perReferrer: null, perMonth: null } })
    expect(await t.query(fn<'query'>('unbacked:previewReferral'), { code: view.code })).toMatchObject({ program: { referred: null, referrer: null } })
    const friend = await friendOf(view.code, 'grace@example.com', 'unbacked')
    // The promotion's code is never put on the friend's checkout.
    const { url } = await link(friend, product('pro'))
    await pay(url)
    expect(orderOf(url)).toMatchObject({ discountId: null, discountAmount: 0, subtotalAmount: 1200 })
    expect(await mine(ada)).toMatchObject({ held: 1 })
    vi.setSystemTime(Date.now() + 21 * DAY)
    await sweep('unbacked')
    expect(await mine(ada)).toMatchObject({ held: 1, rewarded: 0 })
    expect(freePacks()).toEqual([])
    // Not taken up again within the day.
    vi.setSystemTime(Date.now() + 12 * HOUR)
    await sweep('unbacked')
    expect(await mine(ada)).toMatchObject({ held: 1 })
  })

  test('that only attributes sign-ups closes the referral at the end of the hold, rewarding nobody', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    const view = await ada.mutation(fn<'mutation'>('attribution:getReferralCode'), {}) as { code: string, program: ReferralProgram }
    expect(view.program).toEqual({ referred: null, referrer: null, holdDays: 30, caps: { perReferrer: null, perMonth: null } })
    await payPro(await friendOf(view.code, 'grace@example.com', 'attribution'))
    vi.setSystemTime(Date.now() + 31 * DAY)
    await sweep('attribution')
    await fake.idle()
    expect(await mine(ada)).toMatchObject({ claimed: 1, held: 0, rewarded: 0 })
    expect(freePacks()).toEqual([])
  })

  test('beside an app\'s own entity resolver refuses a referrer\'s reward at setup, which would have no entity of theirs to go to, and still attributes sign-ups', async () => {
    for (const referrer of [{ pack: 'credits500' }, { months: 1 }]) {
      expect(() => setupReferrals(components as never, { billing: ownResolver, rewards: { referrer } })).toThrow(/setupReferrals: rewards\.referrer .*`resolveEntity`/)
    }
    const ada = await asUser(t, { email: 'ada@example.com' })
    const friend = await friendOf(await codeOf(ada, 'resolved'), 'grace@example.com', 'resolved')
    await payPro(friend)
    expect(await mine(ada)).toMatchObject({ held: 1 })
    vi.mocked(console.error).mockClear()
    vi.setSystemTime(Date.now() + 31 * DAY)
    await sweep('resolved')
    // Closed at the end of the hold, rewarding nobody: no sweep step fails on it, hour after hour.
    expect(await mine(ada)).toMatchObject({ claimed: 1, held: 0, rewarded: 0 })
    expect(freePacks()).toEqual([])
    expect(vi.mocked(console.error).mock.calls.flat().map(String).join('\n')).not.toContain('referrals.sweep_task_failed')
  })
})

describe('the console and a share page\'s badge', () => {
  test('an administrator reads one referrer\'s referrals, with the program they were made under', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    const bob = await asUser(t, { email: 'bob@example.com' })
    await friendOf(await codeOf(ada), 'grace@example.com')
    await friendOf(await codeOf(bob), 'linus@example.com')
    const view = await consoleOf({ referrerId: bob.userId })
    expect(view.history.map(row => row.referrerId)).toEqual([bob.userId])
    expect(view.program).toEqual({
      referred: { kind: 'discount', name: 'A friend\'s welcome', percentOff: 25 },
      referrer: { kind: 'pack', name: '500 credits' },
      holdDays: 14,
      caps: { perReferrer: null, perMonth: 1 },
    })
    // Without a referrer, the program's totals and its top referrers, and no one's history.
    const whole = await consoleOf()
    expect(whole.history).toEqual([])
    expect(whole.totals).toMatchObject({ claimed: 2, held: 0 })
    expect(whole.top.map(row => row.referrerId).sort()).toEqual([ada.userId, bob.userId].sort())
  })

  test('an administrator voids a flagged referral in person; anyone else reads no console and resolves nothing', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    const code = await codeOf(ada)
    // A claim on a code five others claimed within the hour is flagged.
    for (const name of ['a', 'b', 'c', 'd', 'e', 'f']) await friendOf(code, `${name}@example.com`)
    const admin = await asUser(t, { email: 'root@example.com', role: 'admin', workspace: false })
    const [flagged] = (await admin.query(fn<'query'>('referrals:getReferralConsole'), {}) as ReferralConsole).flagged
    expect(flagged).toMatchObject({ flags: ['burst'], state: 'claimed' })
    expect(await ada.query(fn<'query'>('referrals:getReferralConsole'), {})).toBeNull()
    expect(await refusal(ada.mutation(fn<'mutation'>('referrals:resolveReferral'), { id: flagged!.id, resolution: 'void' }))).toMatchObject({ code: 'forbidden', data: { reason: 'admin_only' } })
    expect(await admin.mutation(fn<'mutation'>('referrals:resolveReferral'), { id: flagged!.id, resolution: 'void' })).toEqual({ resolved: true })
    expect(await admin.mutation(fn<'mutation'>('referrals:resolveReferral'), { id: flagged!.id, resolution: 'release' })).toEqual({ resolved: false })
    const view = await admin.query(fn<'query'>('referrals:getReferralConsole'), { referrerId: ada.userId }) as ReferralConsole
    expect(view.flagged).toEqual([])
    expect(view.history.find(row => row.id === flagged!.id)).toMatchObject({ state: 'voided', voidedFor: 'administrator' })
    expect(view.totals).toMatchObject({ claimed: 5, voided: 1, flagged: 0 })
  })

  test('the badge carries the person\'s code: made from a mutation, only read from a query, and none once sharing is off', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    expect(await t.query(fn<'query'>('referrals:badgeRead'), { userId: ada.userId })).toBeNull()
    const code = await t.mutation(fn<'mutation'>('referrals:badgeMade'), { userId: ada.userId })
    expect(code).toBe(await codeOf(ada))
    expect(await t.query(fn<'query'>('referrals:badgeRead'), { userId: ada.userId })).toBe(code)
    await ada.mutation(fn<'mutation'>('referrals:setReferralSharing'), { share: false })
    expect(await t.query(fn<'query'>('referrals:badgeRead'), { userId: ada.userId })).toBeNull()
    expect(await t.mutation(fn<'mutation'>('referrals:badgeMade'), { userId: ada.userId })).toBeNull()
  })
})
