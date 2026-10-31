/// <reference types="vite/client" />
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { componentsGeneric, defineSchema, makeFunctionReference, type FunctionReference } from 'convex/server'
import type { TestConvex } from 'convex-test'
import { syncBillingCatalog } from '../../src/cli/billing/sync'
import { createPolarFake, type PolarFake, routeToFake } from '../fixtures/polar-fake/server'
import type { BillingCatalog } from '../../src/convex/catalog'
import type { ComponentApi } from '../../src/convex/components/backend/_generated/component'
import { getBackendError } from '../../src/convex/errors'
import { AUTH_TIME_CLAIM } from '../../src/convex/constants'
import { addMonths, returnFrom } from '../../src/convex/integrations/billing/passes'
import { asUser, defineBackendTestApp } from '../../src/convex/test'
import { signingSecret } from '../helpers/secrets'

// Gifts end to end on the fake provider, through the scaffold an app gets: a
// gift dated for later is paid at once and delivered on its date; the
// purchaser resends it, changes its recipient and date, and cancels it for a
// refund; and a plan pass: bought once, claimed by a workspace on the free
// plan, which then holds the plan with no card, is told a week before it
// ends, goes back to the free plan at the end of its last month, or keeps the
// plan by paying for it.

const SCAFFOLD = '../fixtures/registration/backend/'
const SITE = 'http://localhost:3000'
const FAKE = 'http://127.0.0.1:4751'
const ENDPOINT = 'https://scaffold.convex.site/billing/events'
const SECRET = signingSecret()
const DAY = 24 * 60 * 60 * 1000

const CATALOG: BillingCatalog = {
  meters: { credits: { eventName: 'credits', property: 'amount' } },
  plans: {
    free: { name: 'Free', prices: { month: 0 }, credits: { meter: 'credits', units: 20 } },
    pro: { name: 'Pro', prices: { month: 1200 }, credits: { meter: 'credits', units: 500 }, features: ['priority'], gift: { months: [1, 3, 12] } },
  },
  packs: { credits500: { name: '500 credits', price: 2000, credits: { meter: 'credits', units: 500 } } },
  features: { priority: { description: 'Priority support' } },
}

// What `billing sync` writes as the fake provider's entry (checked against the real sync below).
vi.mock('../fixtures/registration/backend/billing.generated', async () => {
  const { stableId } = await import('../fixtures/polar-fake/state')
  const product = (key: string) => stableId('product', key)
  return {
    catalog: {
      sandbox: {
        products: { free: product('free'), pro: product('pro'), credits500: product('credits500') },
        plans: { free: { month: product('free') }, pro: { month: product('pro') } },
        free: 'free',
        packs: ['credits500'],
        gifts: { credits500: product('credits500-gift') },
        passes: { pro: { pass: product('pro-pass'), months: { 1: product('pro-gift-1'), 3: product('pro-gift-3'), 12: product('pro-gift-12') } } },
        meters: { credits: { meterId: stableId('meter', 'credits'), eventName: 'credits', property: 'amount' } },
      },
    },
  }
})

vi.stubEnv('BILLING_ACCESS_TOKEN', 'polar_oat_fake')
vi.stubEnv('EMAIL_API_KEY', 're_test_key')
vi.stubEnv('BILLING_WEBHOOK_SECRET', SECRET)
vi.stubEnv('SITE_URL', SITE)
vi.stubEnv('AUTH_SECRET', 'gift-passes-suite-secret-0123456789abcdefghijklmn')

const scaffold = import.meta.glob(['../fixtures/registration/backend/*.ts', '!**/convex.config.ts', '!**/auth.config.ts'])
const testApp = defineBackendTestApp(defineSchema({}), {
  ...scaffold,
  [`${SCAFFOLD}_generated/api.js`]: () => Promise.resolve({}),
})

const fn = <Kind extends 'query' | 'mutation' | 'action'>(path: string) => makeFunctionReference<Kind>(path) as FunctionReference<Kind, 'public'>
const internalFn = (path: string) => makeFunctionReference<'action'>(path) as unknown as FunctionReference<'action', 'internal'>

const components = componentsGeneric() as unknown as { backend: ComponentApi<'backend'> }

let t: TestConvex<ReturnType<typeof defineSchema>>
let fake: PolarFake
let ids: Awaited<ReturnType<typeof syncBillingCatalog>>['ids']

beforeAll(() => {
  // The clock too: a pass is followed through months, and the fake provider reads the same clock.
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
  ids = (await syncBillingCatalog(CATALOG, { rootDir: '.', environment: 'sandbox', accessToken: 'polar_oat_fake', dryRun: false, adopt: {} })).ids
  await fake.idle()
})

afterEach(async () => {
  await fake.idle()
  fake.close()
  vi.unstubAllGlobals()
})

type Caller = Awaited<ReturnType<typeof asUser>>
type Sent = { id: string, status: string, item: string, plan?: string, months?: number, deliverAt?: number, deliveredAt?: number }
type Received = { id: string, status: string, plan?: string, months?: number }
type Current = { id: string, productId: string, status: string, free?: true, pass?: { plan: string, endsAt: number } } | null

const refusal = (promise: Promise<unknown>) => promise.then(() => null, (error: unknown) => getBackendError(error))
const sent = (caller: Caller) => caller.query(fn<'query'>('billing:getSentGifts'), {}) as Promise<Sent[] | null>
const received = (caller: Caller) => caller.query(fn<'query'>('billing:getReceivedGifts'), {}) as Promise<Received[] | null>
const current = (caller: Caller) => caller.query(fn<'query'>('billing:getCurrentSubscription'), {}) as Promise<Current>
const sweep = () => t.action(internalFn('billing:runGiftSweep'), { op: 'sweep' })
const startFree = (entityId: string) => t.action(internalFn('billing:startFreePlan'), { entityId })
const features = async (caller: Caller): Promise<string[]> => {
  const read = await caller.query(fn<'query'>('billing:getFeatures'), {}) as { benefits: Array<{ metadata: { key?: string } }> } | null
  return (read?.benefits ?? []).flatMap(benefit => benefit.metadata.key ?? []).sort()
}
const gift = (item: Record<string, unknown>) => ({ ...item, origin: SITE, successUrl: `${SITE}/gifts` })

/** Pay a checkout on its page, then let its events land. */
async function pay(url: string): Promise<void> {
  await fake.handle(new Request(`${url}/pay`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'origin': FAKE } }))
  await fake.idle()
}

/** Run what the deployment scheduled and let the provider's events land. */
async function drain(): Promise<void> {
  await t.finishAllScheduledFunctions(() => vi.runAllTimers())
  await fake.idle()
}

/** The same account on a session signed in `ago` ms ago. */
const signedInAgo = (caller: Caller, ago: number) => t.withIdentity({ subject: caller.userId, issuer: 'https://convex.test', email: caller.email, emailVerified: true, activeOrganizationId: caller.workspaceId, sessionId: caller.sessionId, [AUTH_TIME_CLAIM]: Date.now() - ago })

/** A purchaser who has paid for something already, as a gift needs. */
async function purchaser() {
  const ada = await asUser(t, { email: 'ada@example.com' })
  const { url } = await ada.action(fn<'action'>('billing:generateCheckoutLink'), { productIds: [ids.products.credits500!], origin: SITE, successUrl: `${SITE}/billing` })
  await pay(url)
  return ada
}

/** Send a gift and pay for it. */
async function send(ada: Caller, item: Record<string, unknown>) {
  const { url } = await ada.action(fn<'action'>('billing:giftCheckout'), gift(item))
  await pay(url)
  const [sentGift] = (await sent(ada))!
  return sentGift!
}

describe('the catalog\'s gift as a pass', () => {
  test('billing sync makes a purchase product per length and one free pass product, outside the products', async () => {
    const { catalog } = await import('../fixtures/registration/backend/billing.generated') as { catalog: { sandbox: unknown } }
    expect(ids).toEqual(catalog.sandbox)
    expect(Object.keys(ids.products)).not.toContain('pro-pass')
    const pass = Object.values(fake.state.products).find(product => product.id === ids.passes!.pro!.pass)!
    expect(pass).toMatchObject({ recurringInterval: 'month', visibility: 'private' })
    // The months at the monthly price.
    const price = (months: number) => Object.values(fake.state.products).find(product => product.id === ids.passes!.pro!.months[String(months)])!.prices[0]
    expect([price(1), price(3), price(12)].map(entry => entry!.priceAmount)).toEqual([1200, 3600, 14_400])
  })
})

describe('a gift dated for later', () => {
  test('is paid at once and delivered on its date: out of the recipient\'s sight, then theirs, claimed once it is', async () => {
    const ada = await purchaser()
    const deliverAt = Date.now() + 3 * DAY
    const bought = await send(ada, { pack: 'credits500', recipientEmail: 'delivered+later@resend.dev', message: 'Happy birthday', deliverAt })
    expect(bought).toMatchObject({ status: 'scheduled', item: 'credits500', deliverAt })
    const recipient = await asUser(t, { email: 'delivered+later@resend.dev' })
    expect(await received(recipient)).toEqual([])
    expect(await refusal(recipient.action(fn<'action'>('billing:claimGift'), { giftId: bought.id }))).toMatchObject({ code: 'not_ready', data: { reason: 'not_delivered' } })
    // The sweep does nothing before the date, and delivers it on it.
    await sweep()
    expect((await sent(ada))![0]).toMatchObject({ status: 'scheduled' })
    vi.setSystemTime(deliverAt + 1000)
    await sweep()
    expect((await sent(ada))![0]).toMatchObject({ status: 'delivered', deliveredAt: expect.any(Number) })
    expect((await received(recipient))!.map(entry => entry.status)).toEqual(['paid'])
    expect(await recipient.action(fn<'action'>('billing:claimGift'), { giftId: bought.id })).toEqual({ url: null })
    await fake.idle()
    expect((await sent(ada))![0]).toMatchObject({ status: 'claimed' })
  })

  test('is refused past a year ahead, and a date nearly now is no date', async () => {
    const ada = await purchaser()
    expect(await refusal(ada.action(fn<'action'>('billing:giftCheckout'), gift({ pack: 'credits500', recipientEmail: 'delivered+far@resend.dev', deliverAt: Date.now() + 400 * DAY }))))
      .toMatchObject({ code: 'invalid_input', data: { field: 'deliverAt' } })
    const now = await send(ada, { pack: 'credits500', recipientEmail: 'delivered+now@resend.dev', deliverAt: Date.now() + 1000 })
    expect(now.status).toBe('delivered')
  })

  test('moves with the purchaser: a new date, a mistyped address changed, the notice resent no more than once an hour', async () => {
    const ada = await purchaser()
    const bought = await send(ada, { pack: 'credits500', recipientEmail: 'delivered+typo@resend.dev', deliverAt: Date.now() + 5 * DAY })
    const later = Date.now() + 9 * DAY
    await ada.action(fn<'action'>('billing:rescheduleGift'), { giftId: bought.id, deliverAt: later })
    await ada.action(fn<'action'>('billing:changeGiftRecipient'), { giftId: bought.id, recipientEmail: 'delivered+right@resend.dev' })
    expect((await sent(ada))![0]).toMatchObject({ status: 'scheduled', deliverAt: later, recipientEmail: 'delivered+right@resend.dev' })
    // Not delivered yet: nothing to resend.
    expect(await refusal(ada.action(fn<'action'>('billing:resendGift'), { giftId: bought.id }))).toMatchObject({ code: 'not_ready', data: { reason: 'not_delivered' } })
    // A date now delivers it at once.
    await ada.action(fn<'action'>('billing:rescheduleGift'), { giftId: bought.id, deliverAt: Date.now() })
    expect((await sent(ada))![0]).toMatchObject({ status: 'delivered' })
    expect(await refusal(ada.action(fn<'action'>('billing:resendGift'), { giftId: bought.id }))).toMatchObject({ code: 'rate_limited', data: { limit: 'giftNotice' } })
    vi.setSystemTime(Date.now() + 2 * 60 * 60 * 1000)
    await ada.action(fn<'action'>('billing:resendGift'), { giftId: bought.id })
    // The old address no longer claims it; the new one does.
    const old = await asUser(t, { email: 'delivered+typo@resend.dev' })
    expect(await refusal(old.action(fn<'action'>('billing:claimGift'), { giftId: bought.id }))).toMatchObject({ code: 'forbidden', data: { reason: 'not_recipient' } })
    const right = await asUser(t, { email: 'delivered+right@resend.dev' })
    expect(await right.action(fn<'action'>('billing:claimGift'), { giftId: bought.id })).toEqual({ url: null })
    // A claimed gift can be neither changed nor cancelled.
    expect(await refusal(signedInAgo(ada, 0).action(fn<'action'>('billing:cancelGift'), { giftId: bought.id }))).toMatchObject({ code: 'forbidden', data: { reason: 'gift_claimed' } })
  })

  test('is cancelled for a full refund behind a recent sign-in, and its recipient is refused', async () => {
    const ada = await purchaser()
    const bought = await send(ada, { pack: 'credits500', recipientEmail: 'delivered+cancel@resend.dev' })
    // The same account on a session signed in two hours ago.
    const stale = signedInAgo(ada, 2 * 60 * 60 * 1000)
    expect(await refusal(stale.action(fn<'action'>('billing:cancelGift'), { giftId: bought.id }))).toMatchObject({ code: 'reauthentication_required' })
    await signedInAgo(ada, 0).action(fn<'action'>('billing:cancelGift'), { giftId: bought.id })
    await fake.idle()
    expect((await sent(ada))![0]).toMatchObject({ status: 'refunded' })
    const order = Object.values(fake.state.orders).find(entry => entry.productId === ids.gifts!.credits500)!
    expect(Object.values(fake.state.refunds).some(entry => entry.orderId === order.id && entry.amount === 2000)).toBe(true)
    const recipient = await asUser(t, { email: 'delivered+cancel@resend.dev' })
    expect(await received(recipient)).toEqual([])
    expect(await refusal(recipient.action(fn<'action'>('billing:claimGift'), { giftId: bought.id }))).toMatchObject({ code: 'forbidden', data: { reason: 'gift_refunded' } })
  })

  test('is the recipient\'s once a claim started, and no claim starts while the purchaser cancels it', async () => {
    const ada = await purchaser()
    const bought = await send(ada, { pack: 'credits500', recipientEmail: 'delivered+race@resend.dev' })
    const recipient = await asUser(t, { email: 'delivered+race@resend.dev' })
    // The purchaser's cancellation holds the gift: the recipient's claim opens no checkout meanwhile.
    expect(await t.mutation(components.backend.gifts.beginCancel, { giftId: bought.id, until: Date.now() + 60_000 })).toBe(true)
    expect(await refusal(recipient.action(fn<'action'>('billing:claimGift'), { giftId: bought.id }))).toMatchObject({ code: 'forbidden', data: { reason: 'gift_refunded' } })
    expect(Object.values(fake.state.checkouts).filter(entry => entry.productId === ids.products.credits500 && entry.discountId)).toEqual([])
    await t.mutation(components.backend.gifts.endCancel, { giftId: bought.id })
    // A claim the recipient opened (a hosted checkout, say) makes the gift theirs: it can be neither cancelled nor re-addressed.
    await t.mutation(components.backend.gifts.startClaim, { giftId: bought.id, userId: recipient.userId, entityId: recipient.workspaceId! })
    expect(await refusal(signedInAgo(ada, 0).action(fn<'action'>('billing:cancelGift'), { giftId: bought.id }))).toMatchObject({ code: 'forbidden', data: { reason: 'gift_claimed' } })
    expect(await refusal(ada.action(fn<'action'>('billing:changeGiftRecipient'), { giftId: bought.id, recipientEmail: 'delivered+other@resend.dev' }))).toMatchObject({ code: 'forbidden', data: { reason: 'gift_claimed' } })
    expect(Object.values(fake.state.refunds)).toEqual([])
  })

  test('is limited to five a day for one address', async () => {
    const ada = await purchaser()
    for (let n = 0; n < 5; n++) await send(ada, { pack: 'credits500', recipientEmail: 'delivered+flood@resend.dev' })
    expect(await refusal(ada.action(fn<'action'>('billing:giftCheckout'), gift({ pack: 'credits500', recipientEmail: 'delivered+flood@resend.dev' }))))
      .toMatchObject({ code: 'forbidden', data: { reason: 'gift_refused' } })
  })
})

describe('a plan pass', () => {
  async function passFor(ada: Caller, email: string, months = 3) {
    return await send(ada, { plan: 'pro', months, recipientEmail: email })
  }

  test('is refused for a length the plan does not offer, a plan that is not giftable, and months on a pack', async () => {
    const ada = await purchaser()
    const attempt = (item: Record<string, unknown>) => refusal(ada.action(fn<'action'>('billing:giftCheckout'), gift({ recipientEmail: 'delivered+x@resend.dev', ...item })))
    expect(await attempt({ plan: 'pro', months: 2 })).toMatchObject({ code: 'invalid_input', data: { field: 'months' } })
    expect(await attempt({ plan: 'free', months: 1 })).toMatchObject({ code: 'invalid_input', data: { field: 'plan' } })
    expect(await attempt({ plan: 'pro' })).toMatchObject({ code: 'invalid_input', data: { field: 'months' } })
    expect(await attempt({ pack: 'credits500', months: 3 })).toMatchObject({ code: 'invalid_input', data: { field: 'months' } })
  })

  test('is bought once, claimed by a workspace on the free plan, and holds the plan until its end, with no card', async () => {
    const ada = await purchaser()
    const bought = await passFor(ada, 'delivered+pass@resend.dev')
    expect(bought).toMatchObject({ status: 'delivered', item: 'pro', plan: 'pro', months: 3 })
    const recipient = await asUser(t, { email: 'delivered+pass@resend.dev' })
    await startFree(recipient.workspaceId!)
    await drain()
    expect(await features(recipient)).not.toContain('priority')
    expect((await received(recipient))![0]).toMatchObject({ plan: 'pro', months: 3, status: 'paid' })
    const claimedAt = Date.now()
    await recipient.action(fn<'action'>('billing:claimGift'), { giftId: bought.id, workspaceId: recipient.workspaceId })
    await fake.idle()
    const row = await current(recipient)
    expect(row).toMatchObject({ productId: ids.passes!.pro!.pass, status: 'active' })
    expect(row?.free).toBeUndefined()
    // Gifted until three months from the claim, with the plan's features and monthly credits.
    expect(row?.pass).toMatchObject({ plan: 'pro' })
    expect(Math.abs(row!.pass!.endsAt - addMonths(claimedAt, 3))).toBeLessThan(5000)
    expect(await features(recipient)).toContain('priority')
    const subscription = Object.values(fake.state.subscriptions).find(entry => entry.productId === ids.passes!.pro!.pass)!
    // Its first month runs from the claim, so every cycle and the end fall on the same day.
    expect(Math.abs(subscription.currentPeriodEnd - addMonths(claimedAt, 1))).toBeLessThan(5000)
    // The gift is claimed, and no order or card was involved.
    expect((await sent(ada))![0]).toMatchObject({ status: 'claimed' })
    expect(Object.values(fake.state.orders).filter(order => order.productId === ids.passes!.pro!.pass)).toEqual([])
  })

  test('is refused to a workspace on a paid plan, or already on a pass', async () => {
    const ada = await purchaser()
    const bought = await passFor(ada, 'delivered+paid@resend.dev')
    const recipient = await asUser(t, { email: 'delivered+paid@resend.dev' })
    await startFree(recipient.workspaceId!)
    await drain()
    const { url } = await recipient.action(fn<'action'>('billing:generateCheckoutLink'), { productIds: [ids.products.pro!], origin: SITE, successUrl: `${SITE}/billing` })
    await pay(url)
    expect(await refusal(recipient.action(fn<'action'>('billing:claimGift'), { giftId: bought.id }))).toMatchObject({ code: 'forbidden', data: { reason: 'already_subscribed' } })
    expect((await received(recipient))![0]).toMatchObject({ status: 'paid' })
  })

  test('is held by the claim on its way: a second claim or a cancellation is refused, and nothing is switched', async () => {
    const ada = await purchaser()
    const bought = await passFor(ada, 'delivered+held@resend.dev')
    const recipient = await asUser(t, { email: 'delivered+held@resend.dev' })
    await startFree(recipient.workspaceId!)
    await drain()
    // A claim into another workspace holds the gift right now.
    const elsewhere = { giftId: bought.id, userId: recipient.userId, entityId: 'org-elsewhere', until: Date.now() + 60_000 }
    expect(await t.mutation(components.backend.gifts.reservePass, elsewhere)).toBe('reserved')
    expect(await refusal(recipient.action(fn<'action'>('billing:claimGift'), { giftId: bought.id }))).toMatchObject({ code: 'forbidden', data: { reason: 'gift_claimed' } })
    expect(await refusal(signedInAgo(ada, 0).action(fn<'action'>('billing:cancelGift'), { giftId: bought.id }))).toMatchObject({ code: 'forbidden', data: { reason: 'gift_claimed' } })
    expect(await current(recipient)).toMatchObject({ productId: ids.products.free, free: true })
    expect(Object.values(fake.state.refunds)).toEqual([])
    // That claim did not finish and let go: this one goes through.
    await t.mutation(components.backend.gifts.releasePass, elsewhere)
    await recipient.action(fn<'action'>('billing:claimGift'), { giftId: bought.id })
    await fake.idle()
    expect(await current(recipient)).toMatchObject({ productId: ids.passes!.pro!.pass })
  })

  test('books its return only in its last billing cycle, however short that cycle is', async () => {
    // Claimed in mid-February for three months: its last cycle, from mid-April to mid-May, is 30 days long.
    vi.setSystemTime(new Date('2027-02-15T12:00:00Z'))
    const ada = await purchaser()
    const bought = await passFor(ada, 'delivered+cycle@resend.dev', 3)
    const recipient = await asUser(t, { email: 'delivered+cycle@resend.dev' })
    await startFree(recipient.workspaceId!)
    await drain()
    const claimedAt = Date.now()
    await recipient.action(fn<'action'>('billing:claimGift'), { giftId: bought.id })
    await fake.idle()
    const subscription = Object.values(fake.state.subscriptions).find(entry => entry.productId === ids.passes!.pro!.pass)!
    /** The provider turns the pass's billing cycle over at `at`. */
    const renew = async (at: number) => {
      vi.setSystemTime(at)
      fake.state.subscriptions[subscription.id]!.currentPeriodEnd = Date.now()
      await fake.handle(new Request(`${FAKE}/_fake/clock`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'origin': FAKE }, body: `action=renew&subscription=${subscription.id}` }))
      await fake.idle()
    }
    await renew(addMonths(claimedAt, 1))
    // A day before the last cycle, 30 days before the end: a return booked now would apply a month early.
    vi.setSystemTime(addMonths(claimedAt, 2) - DAY)
    await sweep()
    await fake.idle()
    expect(fake.state.subscriptions[subscription.id]!.pendingUpdate).toBeNull()
    await renew(addMonths(claimedAt, 2))
    vi.setSystemTime(addMonths(claimedAt, 2) + 2 * 60 * 60 * 1000)
    await sweep()
    await fake.idle()
    expect(fake.state.subscriptions[subscription.id]!.pendingUpdate).toMatchObject({ productId: ids.products.free })
    // A pass whose first cycle is its last books it at once; a longer reverse trial, once its last cycle began.
    const start = Date.UTC(2027, 0, 5)
    expect(returnFrom(start, addMonths(start, 1))).toBe(start)
    expect(returnFrom(start, start + 45 * DAY)).toBe(addMonths(start, 1) + 60 * 60 * 1000)
  })

  test('is followed to its end: told a week before, back on the free plan when its last month ends', async () => {
    const ada = await purchaser()
    const bought = await passFor(ada, 'delivered+end@resend.dev', 1)
    const recipient = await asUser(t, { email: 'delivered+end@resend.dev' })
    await startFree(recipient.workspaceId!)
    await drain()
    const claimedAt = Date.now()
    await recipient.action(fn<'action'>('billing:claimGift'), { giftId: bought.id })
    await fake.idle()
    const endsAt = (await current(recipient))!.pass!.endsAt
    expect(Math.abs(endsAt - addMonths(claimedAt, 1))).toBeLessThan(5000)
    // A one-month pass is in its last month at once: the return is scheduled for the period's end.
    await sweep()
    await fake.idle()
    const subscription = Object.values(fake.state.subscriptions).find(entry => entry.productId === ids.passes!.pro!.pass)!
    expect(subscription.pendingUpdate).toMatchObject({ productId: ids.products.free })
    // A week before the end, its billing managers are told once.
    vi.setSystemTime(endsAt - 6 * DAY)
    await sweep()
    const [pass] = await t.query(components.backend.gifts.listByPurchaser, { purchaserUserId: ada.userId })
    expect(pass).toMatchObject({ plan: 'pro', passNoticedAt: expect.any(Number), passReturnScheduledAt: expect.any(Number) })
    await sweep()
    // The period turns over: the pass returns to the free plan, and the sweep finds it over.
    vi.setSystemTime(endsAt + 1000)
    fake.state.subscriptions[subscription.id]!.currentPeriodEnd = Date.now()
    await fake.handle(new Request(`${FAKE}/_fake/clock`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'origin': FAKE }, body: `action=renew&subscription=${subscription.id}` }))
    await fake.idle()
    await sweep()
    await fake.idle()
    const after = await current(recipient)
    expect(after).toMatchObject({ productId: ids.products.free, free: true })
    expect(after?.pass).toBeUndefined()
    expect(await features(recipient)).not.toContain('priority')
  })

  test('is forced back to the free plan at its end when the scheduled return was missed', async () => {
    const ada = await purchaser()
    const bought = await passFor(ada, 'delivered+missed@resend.dev', 1)
    const recipient = await asUser(t, { email: 'delivered+missed@resend.dev' })
    await startFree(recipient.workspaceId!)
    await drain()
    await recipient.action(fn<'action'>('billing:claimGift'), { giftId: bought.id })
    await fake.idle()
    const endsAt = (await current(recipient))!.pass!.endsAt
    vi.setSystemTime(endsAt + 1000)
    await sweep()
    await fake.idle()
    expect(await current(recipient)).toMatchObject({ productId: ids.products.free, free: true })
  })

  test('is kept by paying for the plan: an ordinary checkout moves the pass in place, and the scheduled return is cleared', async () => {
    const ada = await purchaser()
    const bought = await passFor(ada, 'delivered+keep@resend.dev', 1)
    const recipient = await asUser(t, { email: 'delivered+keep@resend.dev' })
    await startFree(recipient.workspaceId!)
    await drain()
    await recipient.action(fn<'action'>('billing:claimGift'), { giftId: bought.id })
    await fake.idle()
    await sweep()
    await fake.idle()
    const pass = Object.values(fake.state.subscriptions).find(entry => entry.productId === ids.passes!.pro!.pass)!
    expect(pass.pendingUpdate).not.toBeNull()
    const { url } = await recipient.action(fn<'action'>('billing:generateCheckoutLink'), { productIds: [ids.products.pro!], origin: SITE, successUrl: `${SITE}/billing` })
    await pay(url)
    await fake.idle()
    // The same subscription, now the paid plan, with nothing scheduled to undo it.
    expect(Object.values(fake.state.subscriptions).filter(entry => entry.endedAt === null)).toHaveLength(1)
    const kept = fake.state.subscriptions[pass.id]!
    expect(kept.productId).toBe(ids.products.pro)
    expect(kept.pendingUpdate).toBeNull()
    const row = await current(recipient)
    expect(row).toMatchObject({ productId: ids.products.pro })
    expect(row?.pass).toBeUndefined()
    vi.setSystemTime(Date.now() + 40 * DAY)
    await sweep()
    expect(fake.state.subscriptions[pass.id]!.productId).toBe(ids.products.pro)
  })
})
