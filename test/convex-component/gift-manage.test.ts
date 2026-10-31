/// <reference types="vite/client" />
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { componentsGeneric, defineSchema, httpActionGeneric, httpRouter, makeFunctionReference, type FunctionReference } from 'convex/server'
import type { TestConvex } from 'convex-test'
import { syncBillingCatalog } from '../../src/cli/billing/sync'
import { createPolarFake, type PolarFake, routeToFake } from '../fixtures/polar-fake/server'
import { stableId } from '../fixtures/polar-fake/state'
import type { BillingCatalog } from '../../src/convex/catalog'
import type { ComponentApi } from '../../src/convex/components/backend/_generated/component'
import { AUTH_TIME_CLAIM } from '../../src/convex/constants'
import { getBackendError } from '../../src/convex/errors'
import { setupBilling } from '../../src/convex/integrations/billing'
import type { BillingCatalogIds } from '../../src/convex/integrations/billing/types/records'
import { setupEmail } from '../../src/convex/integrations/email'
import { asUser, defineBackendTestApp, seedWorkspace } from '../../src/convex/test'
import { signingSecret } from '../helpers/secrets'

// A gift after it is paid, as an app builds billing from the package's
// sources, on the fake provider: what its purchaser sees and may still do
// (resend the notice within its limits, re-address it, move its date,
// cancel it for a refund that may fail), the sweep that delivers and
// reminds one step at a time, and the provider's deliveries as they really
// come — twice, out of order, refunding part of the purchase, or naming a
// gift they did not buy — and the claim into a workspace the recipient
// manages.

const SITE = 'http://localhost:3000'
const FAKE = 'http://127.0.0.1:4795'
const ENDPOINT = 'https://gift-manage.convex.site/billing/events'
const SECRET = signingSecret()
const DAY = 24 * 60 * 60 * 1000
const HOUR = 60 * 60 * 1000

const CATALOG: BillingCatalog = {
  currency: 'usd',
  meters: { credits: { eventName: 'credits', property: 'amount' } },
  packs: { credits500: { name: '500 credits', price: 2000, credits: { meter: 'credits', units: 500 } } },
}

const PACK = stableId('product', 'credits500')
const GIFT = stableId('product', 'credits500-gift')
const GENERATED: BillingCatalogIds = {
  products: { credits500: PACK },
  packs: ['credits500'],
  gifts: { credits500: GIFT },
  meters: { credits: { meterId: stableId('meter', 'credits'), eventName: 'credits', property: 'amount' } },
}

vi.stubEnv('BILLING_ACCESS_TOKEN', 'polar_oat_fake')
vi.stubEnv('BILLING_WEBHOOK_SECRET', SECRET)
vi.stubEnv('EMAIL_API_KEY', 're_test_key')
vi.stubEnv('SITE_URL', SITE)
vi.stubEnv('AUTH_SECRET', 'gift-manage-secret-0123456789abcdefghijklmnopq')

const components = componentsGeneric() as unknown as { backend: ComponentApi<'backend'> }
const email = setupEmail(components as never)

/** Every gift email billing asked for, and the address a test makes the send fail for. */
const mailed: Array<{ name: string, data: Record<string, unknown>, idempotencyKey?: string }> = []
let failingAddress: string | null = null
const gifts = {
  sendTemplate: (async (ctx, name, data, options) => {
    const fields = data as unknown as Record<string, unknown>
    if (fields.recipientEmail === failingAddress) throw new Error('the email provider is down')
    mailed.push({ name: String(name), data: fields, idempotencyKey: (options as { idempotencyKey?: string } | undefined)?.idempotencyKey })
    return email.sendTemplate(ctx, name, data, options)
  }) as typeof email.sendTemplate,
}

const BLOCKED = 'This address opted out of gifts.'
const catalog = { sandbox: GENERATED }
const billing = setupBilling(components as never, {
  email: gifts,
  catalog,
  canGift: (_ctx, { recipientEmail }) => recipientEmail === 'delivered+blocked@resend.dev' ? { allowed: false, message: BLOCKED } : true,
})
/** The same gifts, read by an app that bills each account on its own. */
const perUser = setupBilling(components as never, { email: gifts, catalog, billTo: 'user' })

const http = httpRouter()
http.route({ path: '/billing/events', method: 'POST', handler: httpActionGeneric((ctx, request) => billing.webhookHandler(ctx as never, request)) })

const testApp = defineBackendTestApp(defineSchema({}), {
  './_generated/api.js': () => Promise.resolve({}),
  './billing.js': () => Promise.resolve(billing.api),
  './perUser.js': () => Promise.resolve({ claimGift: perUser.api.claimGift }),
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
  vi.setSystemTime(new Date('2027-05-03T10:00:00Z'))
  mailed.length = 0
  failingAddress = null
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
  vi.stubEnv('EMAIL_API_KEY', 're_test_key')
})

type Caller = Awaited<ReturnType<typeof asUser>>
type Sent = { id: string, status: string, item: string, recipientEmail: string, deliverAt?: number, deliveredAt?: number } & Record<string, unknown>

const refusal = (promise: Promise<unknown>) => promise.then(() => null, (error: unknown) => getBackendError(error))
const sent = (caller: Pick<Caller, 'query'>) => caller.query(fn<'query'>('billing:getSentGifts'), {}) as Promise<Sent[] | null>
const sweep = (args: Record<string, unknown> = { op: 'sweep' }) => t.action(internalFn('billing:runGiftSweep'), args)
const stored = (giftId: string) => t.query(components.backend.gifts.get, { giftId })
/** The notices a gift sent its recipient so far. */
const notices = (address: string) => mailed.filter(mail => mail.name === 'gift' && mail.data.recipientEmail === address)

/** Pay a checkout on its page, then let its events land. */
async function pay(url: string): Promise<void> {
  await fake.handle(new Request(`${url}/pay`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'origin': FAKE } }))
  await fake.idle()
}

/** The same account on a session signed in `ago` ms ago. */
const signedInAgo = (caller: Caller, ago: number) => t.withIdentity({ subject: caller.userId, issuer: 'https://convex.test', email: caller.email, emailVerified: true, activeOrganizationId: caller.workspaceId, sessionId: caller.sessionId, [AUTH_TIME_CLAIM]: Date.now() - ago })

/** A purchaser who has paid for a pack already, as a gift needs. */
async function purchaser(address = 'ada@example.com') {
  const ada = await asUser(t, { email: address })
  await pay((await ada.action(fn<'action'>('billing:generateCheckoutLink'), { productIds: [PACK], origin: SITE, successUrl: `${SITE}/billing` }) as { url: string }).url)
  return ada
}

/** Open a gift's checkout. */
const giftCheckout = (ada: Caller, recipientEmail: string, extra: Record<string, unknown> = {}) =>
  ada.action(fn<'action'>('billing:giftCheckout'), { pack: 'credits500', recipientEmail, origin: SITE, successUrl: `${SITE}/gifts`, ...extra }) as Promise<{ url: string }>

/** Send a gift and pay for it: the gift as the purchaser's list shows it. */
async function send(ada: Caller, recipientEmail: string, extra: Record<string, unknown> = {}): Promise<Sent> {
  const { url } = await giftCheckout(ada, recipientEmail, extra)
  await pay(url)
  return (await sent(ada))!.find(gift => gift.recipientEmail === recipientEmail && !['refunded', 'claimed'].includes(gift.status))!
}

/** The paid order that bought a gift. */
const purchaseOf = (giftId: string) => Object.values(fake.state.orders).find(order => order.metadata.giftId === giftId && order.productId === GIFT)!

/** Have the provider send a delivery of one of its records now. */
async function fire(type: string, id: string): Promise<void> {
  await fake.handle(new Request(`${FAKE}/_fake/fire`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type, id }) }))
  await fake.idle()
}

/** Ask the provider to refund part of an order, as its dashboard would. */
async function refund(orderId: string, amount: number): Promise<void> {
  await fake.handle(new Request(`${FAKE}/v1/refunds`, { method: 'POST', headers: { 'authorization': 'Bearer polar_oat_fake', 'content-type': 'application/json' }, body: JSON.stringify({ order_id: orderId, reason: 'customer_request', amount }) }))
  await fake.idle()
}

/** Whether the provider sends its deliveries to the deployment. */
const deliveries = (enabled: boolean) => Object.values(fake.state.endpoints).forEach((endpoint) => {
  endpoint.enabled = enabled
})

describe('the purchaser\'s list', () => {
  test('follows each gift through its states, and shows no billing id', async () => {
    const ada = await purchaser()
    const later = await send(ada, 'delivered+later@resend.dev', { deliverAt: Date.now() + 3 * DAY })
    const now = await send(ada, 'delivered+now@resend.dev')
    const claimed = await send(ada, 'delivered+claimed@resend.dev')
    const cancelled = await send(ada, 'delivered+cancelled@resend.dev')
    const recipient = await asUser(t, { email: 'delivered+claimed@resend.dev' })
    await recipient.action(fn<'action'>('billing:claimGift'), { giftId: claimed.id })
    await fake.idle()
    await signedInAgo(ada, 0).action(fn<'action'>('billing:cancelGift'), { giftId: cancelled.id })
    await fake.idle()
    const list = (await sent(ada))!
    expect(Object.fromEntries(list.map(gift => [gift.id, gift.status]))).toEqual({ [later.id]: 'scheduled', [now.id]: 'delivered', [claimed.id]: 'claimed', [cancelled.id]: 'refunded' })
    expect(list.map(gift => gift.id)).toEqual([cancelled.id, claimed.id, now.id, later.id])
    expect(list.find(gift => gift.id === now.id)).toMatchObject({ item: 'credits500', paidAt: expect.any(Number), deliveredAt: expect.any(Number) })
    const text = JSON.stringify(list)
    for (const hidden of ['billingOrderId', 'discountId', 'purchaserEntityId', 'claimedByUserId', purchaseOf(now.id).id, recipient.userId]) expect(text).not.toContain(hidden)
  })

  test('is none for someone signed out, or banned since their token was minted', async () => {
    const ada = await purchaser()
    await send(ada, 'delivered+friend@resend.dev')
    expect(await sent(t)).toBeNull()
    await t.mutation(components.backend.adapter.updateOne, { input: { model: 'user', where: [{ field: '_id', value: ada.userId }], update: { banned: true } } } as never)
    expect(await sent(ada)).toBeNull()
  })
})

describe('resending a notice', () => {
  test('is the purchaser\'s alone: someone else\'s gift and one that no longer exists refuse alike', async () => {
    const ada = await purchaser()
    const gift = await send(ada, 'delivered+friend@resend.dev')
    const stranger = await asUser(t, { email: 'linus@example.com' })
    expect(await refusal(stranger.action(fn<'action'>('billing:resendGift'), { giftId: gift.id }))).toMatchObject({ code: 'forbidden', data: { reason: 'not_owner' } })
    // A checkout left unpaid for a day is dropped when the purchaser opens the next one.
    const { url } = await giftCheckout(ada, 'delivered+abandoned@resend.dev')
    const abandoned = String(Object.values(fake.state.checkouts).find(entry => url.endsWith(entry.id))!.metadata.giftId)
    vi.setSystemTime(Date.now() + 2 * DAY)
    await giftCheckout(ada, 'delivered+next@resend.dev')
    expect(await stored(abandoned)).toBeNull()
    expect(await refusal(ada.action(fn<'action'>('billing:resendGift'), { giftId: abandoned }))).toMatchObject({ code: 'forbidden', data: { reason: 'not_owner' } })
  })

  test('an id that is no gift\'s at all refuses like a missing gift, in every action that takes one', async () => {
    const ada = await purchaser()
    await send(ada, 'delivered+friend@resend.dev')
    const giftId = 'no-such-gift'
    const notOwner = { code: 'forbidden', data: { reason: 'not_owner' } }
    expect(await refusal(ada.action(fn<'action'>('billing:resendGift'), { giftId }))).toMatchObject(notOwner)
    expect(await refusal(ada.action(fn<'action'>('billing:changeGiftRecipient'), { giftId, recipientEmail: 'delivered+other@resend.dev' }))).toMatchObject(notOwner)
    expect(await refusal(ada.action(fn<'action'>('billing:rescheduleGift'), { giftId, deliverAt: Date.now() + DAY }))).toMatchObject(notOwner)
    expect(await refusal(signedInAgo(ada, 0).action(fn<'action'>('billing:cancelGift'), { giftId }))).toMatchObject(notOwner)
    const friend = await asUser(t, { email: 'delivered+friend@resend.dev' })
    expect(await refusal(friend.action(fn<'action'>('billing:claimGift'), { giftId }))).toMatchObject({ code: 'forbidden', data: { reason: 'not_recipient' } })
  })

  test('goes at most once an hour and six times in all, each under a key of its own', async () => {
    const ada = await purchaser()
    const gift = await send(ada, 'delivered+friend@resend.dev')
    for (let resend = 0; resend < 5; resend++) {
      vi.setSystemTime(Date.now() + HOUR + 1000)
      await ada.action(fn<'action'>('billing:resendGift'), { giftId: gift.id })
    }
    expect(notices('delivered+friend@resend.dev').map(mail => mail.idempotencyKey)).toEqual([
      `nuxt-backend:gift:${gift.id}`,
      ...[2, 3, 4, 5, 6].map(count => `nuxt-backend:gift:${gift.id}:${count}`),
    ])
    vi.setSystemTime(Date.now() + DAY)
    const refused = await refusal(ada.action(fn<'action'>('billing:resendGift'), { giftId: gift.id }))
    expect(refused).toMatchObject({ code: 'rate_limited', data: { limit: 'giftNotice' } })
    // The limit is the gift's for good: no wait would lift it.
    expect((refused!.data as { retryAfter?: number }).retryAfter).toBeUndefined()
    expect(notices('delivered+friend@resend.dev')).toHaveLength(6)
  })

  test('is refused for a refunded gift, and when the email would not arrive', async () => {
    const ada = await purchaser()
    const kept = await send(ada, 'delivered+kept@resend.dev')
    const cancelled = await send(ada, 'delivered+cancelled@resend.dev')
    await signedInAgo(ada, 0).action(fn<'action'>('billing:cancelGift'), { giftId: cancelled.id })
    expect(await refusal(ada.action(fn<'action'>('billing:resendGift'), { giftId: cancelled.id }))).toMatchObject({ code: 'forbidden', data: { reason: 'gift_refunded' } })
    vi.setSystemTime(Date.now() + 2 * HOUR)
    vi.stubEnv('EMAIL_API_KEY', '')
    expect(await refusal(ada.action(fn<'action'>('billing:resendGift'), { giftId: kept.id }))).toMatchObject({ code: 'unavailable', data: { service: 'email', reason: 'unconfigured' } })
    expect(notices('delivered+kept@resend.dev')).toHaveLength(1)
  })
})

describe('changing the recipient', () => {
  test('refuses an address that is none, the purchaser\'s own in any case, and one the app\'s canGift refuses, in its words', async () => {
    const ada = await purchaser()
    const gift = await send(ada, 'delivered+first@resend.dev')
    const change = (recipientEmail: string) => refusal(ada.action(fn<'action'>('billing:changeGiftRecipient'), { giftId: gift.id, recipientEmail }))
    expect(await change('not-an-address')).toMatchObject({ code: 'invalid_input', data: { field: 'recipientEmail' } })
    expect(await change(' ADA@Example.com ')).toMatchObject({ code: 'forbidden', data: { reason: 'gift_refused' } })
    expect(await change('delivered+blocked@resend.dev')).toMatchObject({ code: 'forbidden', data: { reason: 'gift_refused', message: BLOCKED } })
    expect((await sent(ada))![0]).toMatchObject({ recipientEmail: 'delivered+first@resend.dev' })
  })

  test('leaves the gift as it is for its own address, and tells a new one at once when the gift was delivered', async () => {
    const ada = await purchaser()
    const gift = await send(ada, 'delivered+first@resend.dev')
    await ada.action(fn<'action'>('billing:changeGiftRecipient'), { giftId: gift.id, recipientEmail: 'Delivered+First@Resend.dev' })
    expect(notices('delivered+first@resend.dev')).toHaveLength(1)
    await ada.action(fn<'action'>('billing:changeGiftRecipient'), { giftId: gift.id, recipientEmail: 'delivered+second@resend.dev' })
    expect(notices('delivered+second@resend.dev').map(mail => mail.idempotencyKey)).toEqual([`nuxt-backend:gift:${gift.id}:to1`])
    expect((await sent(ada))![0]).toMatchObject({ recipientEmail: 'delivered+second@resend.dev', status: 'delivered' })
  })

  test('refuses an address that was sent five gifts today', async () => {
    const ada = await purchaser()
    for (let n = 0; n < 5; n++) await send(ada, 'delivered+full@resend.dev')
    const gift = await send(ada, 'delivered+other@resend.dev')
    expect(await refusal(ada.action(fn<'action'>('billing:changeGiftRecipient'), { giftId: gift.id, recipientEmail: 'delivered+full@resend.dev' })))
      .toMatchObject({ code: 'forbidden', data: { reason: 'gift_refused', message: 'This address can\'t receive more gifts today. Try again tomorrow.' } })
  })
})

describe('moving the date', () => {
  test('moves a gift not delivered yet, and delivers it at once for a date that has come', async () => {
    const ada = await purchaser()
    const dated = await send(ada, 'delivered+later@resend.dev', { deliverAt: Date.now() + 5 * DAY })
    const later = Date.now() + 9 * DAY
    await ada.action(fn<'action'>('billing:rescheduleGift'), { giftId: dated.id, deliverAt: later })
    expect((await sent(ada))![0]).toMatchObject({ status: 'scheduled', deliverAt: later })
    // The first date passes with nothing delivered.
    vi.setSystemTime(Date.now() + 6 * DAY)
    await sweep()
    expect((await stored(dated.id))!.deliveredAt).toBeUndefined()
    await ada.action(fn<'action'>('billing:rescheduleGift'), { giftId: dated.id, deliverAt: Date.now() - DAY })
    expect((await sent(ada))![0]).toMatchObject({ status: 'delivered' })
    expect(notices('delivered+later@resend.dev')).toHaveLength(1)
  })

  test('is refused once the gift was delivered or refunded, and past a year ahead', async () => {
    const ada = await purchaser()
    const delivered = await send(ada, 'delivered+now@resend.dev')
    const dated = await send(ada, 'delivered+later@resend.dev', { deliverAt: Date.now() + 5 * DAY })
    const reschedule = (giftId: string, deliverAt: number) => refusal(ada.action(fn<'action'>('billing:rescheduleGift'), { giftId, deliverAt }))
    expect(await reschedule(delivered.id, Date.now() + DAY)).toMatchObject({ code: 'forbidden', data: { reason: 'gift_delivered' } })
    expect(await reschedule(dated.id, Date.now() + 400 * DAY)).toMatchObject({ code: 'invalid_input', data: { field: 'deliverAt' } })
    await signedInAgo(ada, 0).action(fn<'action'>('billing:cancelGift'), { giftId: dated.id })
    expect(await reschedule(dated.id, Date.now() + DAY)).toMatchObject({ code: 'forbidden', data: { reason: 'gift_refunded' } })
  })
})

describe('cancelling a gift', () => {
  test('is refused to anyone but its purchaser, before a recent sign-in is even asked', async () => {
    const ada = await purchaser()
    const gift = await send(ada, 'delivered+friend@resend.dev')
    const stranger = await asUser(t, { email: 'linus@example.com' })
    expect(await refusal(signedInAgo(stranger, 2 * HOUR).action(fn<'action'>('billing:cancelGift'), { giftId: gift.id }))).toMatchObject({ code: 'forbidden', data: { reason: 'not_owner' } })
  })

  test('leaves the gift as it was when the refund fails, so its recipient can still claim it', async () => {
    const ada = await purchaser()
    const gift = await send(ada, 'delivered+friend@resend.dev')
    const route = routeToFake(fake, FAKE)
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init)
      return request.method === 'POST' && new URL(request.url).pathname.startsWith('/v1/refunds') ? Response.json({ error: 'Unavailable' }, { status: 500 }) : route(request)
    })
    expect(await refusal(signedInAgo(ada, 0).action(fn<'action'>('billing:cancelGift'), { giftId: gift.id }))).toMatchObject({ code: 'unavailable', data: { service: 'billing', reason: 'provider_refused' } })
    vi.stubGlobal('fetch', route)
    expect(Object.values(fake.state.refunds)).toEqual([])
    expect((await sent(ada))![0]).toMatchObject({ status: 'delivered' })
    const recipient = await asUser(t, { email: 'delivered+friend@resend.dev' })
    expect(await recipient.action(fn<'action'>('billing:claimGift'), { giftId: gift.id })).toEqual({ url: null })
    await fake.idle()
    expect((await sent(ada))![0]).toMatchObject({ status: 'claimed' })
  })

  test('refunds what is left of the purchase, ends the gift and deletes its discount', async () => {
    const ada = await purchaser()
    const gift = await send(ada, 'delivered+friend@resend.dev')
    const { discountId } = (await stored(gift.id))!
    const order = purchaseOf(gift.id)
    // Part of it was refunded at the provider already, before the gift was voided by its webhook... once the webhook is lost.
    deliveries(false)
    await refund(order.id, 500)
    deliveries(true)
    expect((await stored(gift.id))!.status).toBe('paid')
    await signedInAgo(ada, 0).action(fn<'action'>('billing:cancelGift'), { giftId: gift.id })
    await fake.idle()
    expect(Object.values(fake.state.refunds).filter(entry => entry.orderId === order.id).map(entry => entry.amount)).toEqual([500, 1500])
    expect((await stored(gift.id))!.status).toBe('refunded')
    expect(fake.state.discounts[discountId!]).toMatchObject({ deleted: true, endsAt: expect.any(Number) })
  })
})

describe('the sweep', () => {
  test('goes on past a step that fails, and the next sweep delivers it', async () => {
    const ada = await purchaser()
    const at = Date.now() + 2 * DAY
    const broken = await send(ada, 'delivered+broken@resend.dev', { deliverAt: at })
    const fine = await send(ada, 'delivered+fine@resend.dev', { deliverAt: at })
    vi.setSystemTime(at + 1000)
    failingAddress = 'delivered+broken@resend.dev'
    vi.mocked(console.error).mockClear()
    await sweep()
    expect((await stored(fine.id))!.deliveredAt).toEqual(expect.any(Number))
    expect((await stored(broken.id))!.deliveredAt).toBeUndefined()
    expect(vi.mocked(console.error).mock.calls.some(call => String(call[0]).includes('billing.gift_sweep_task_failed'))).toBe(true)
    failingAddress = null
    await sweep()
    expect((await stored(broken.id))!.deliveredAt).toEqual(expect.any(Number))
    expect(notices('delivered+broken@resend.dev')).toHaveLength(1)
  })

  test('sends the one reminder of a gift still unclaimed a week after it arrived', async () => {
    const ada = await purchaser()
    const gift = await send(ada, 'delivered+slow@resend.dev')
    vi.setSystemTime(Date.now() + 6 * DAY)
    await sweep()
    expect(notices('delivered+slow@resend.dev')).toHaveLength(1)
    vi.setSystemTime(Date.now() + 2 * DAY)
    await sweep()
    await sweep()
    expect(notices('delivered+slow@resend.dev').map(mail => mail.data.reminder ?? false)).toEqual([false, true])
    expect(await stored(gift.id)).toMatchObject({ remindedAt: expect.any(Number), noticeCount: 2 })
  })

  test('spends the reminder even when its email can\'t go out: one reminder, not one per sweep', async () => {
    const ada = await purchaser()
    const gift = await send(ada, 'delivered+slow@resend.dev')
    vi.setSystemTime(Date.now() + 8 * DAY)
    vi.stubEnv('EMAIL_API_KEY', '')
    await sweep()
    expect(await stored(gift.id)).toMatchObject({ remindedAt: expect.any(Number) })
    vi.stubEnv('EMAIL_API_KEY', 're_test_key')
    await sweep()
    expect(notices('delivered+slow@resend.dev')).toHaveLength(1)
  })

  test('delivers one gift by its id once its date has come, and not before', async () => {
    const ada = await purchaser()
    const gift = await send(ada, 'delivered+later@resend.dev', { deliverAt: Date.now() + 2 * DAY })
    await sweep({ giftId: gift.id })
    expect((await stored(gift.id))!.deliveredAt).toBeUndefined()
    vi.setSystemTime(Date.now() + 2 * DAY + 1000)
    await sweep({ giftId: gift.id })
    expect((await stored(gift.id))!.deliveredAt).toEqual(expect.any(Number))
    expect(notices('delivered+later@resend.dev')).toHaveLength(1)
  })
})

describe('the provider\'s deliveries', () => {
  test('a payment delivered twice tells the recipient once and mints one discount', async () => {
    const ada = await purchaser()
    const gift = await send(ada, 'delivered+friend@resend.dev')
    await fire('order.paid', purchaseOf(gift.id).id)
    await fire('order.paid', purchaseOf(gift.id).id)
    expect(notices('delivered+friend@resend.dev')).toHaveLength(1)
    expect(Object.values(fake.state.discounts).filter(discount => discount.metadata.giftId === gift.id)).toHaveLength(1)
  })

  test('a paid order that names a gift it did not buy leaves the gift pending; its own purchase delivers it', async () => {
    const ada = await purchaser()
    const { url } = await giftCheckout(ada, 'delivered+friend@resend.dev')
    const checkout = Object.values(fake.state.checkouts).find(entry => url.endsWith(entry.id))!
    const giftId = String(checkout.metadata.giftId)
    // Another of the purchaser's orders, its metadata made to name the gift: another product.
    const other = Object.values(fake.state.orders).find(order => order.productId === PACK)!
    other.metadata = { ...other.metadata, giftId }
    await fire('order.paid', other.id)
    expect((await stored(giftId))!.status).toBe('pending')
    expect(notices('delivered+friend@resend.dev')).toEqual([])
    await pay(url)
    expect((await stored(giftId))!.status).toBe('paid')
    expect(notices('delivered+friend@resend.dev')).toHaveLength(1)
  })

  test('a refund that arrives before the payment voids the gift, which is never delivered', async () => {
    const ada = await purchaser()
    const { url } = await giftCheckout(ada, 'delivered+friend@resend.dev')
    deliveries(false)
    await pay(url)
    const giftId = String(Object.values(fake.state.checkouts).find(entry => url.endsWith(entry.id))!.metadata.giftId)
    const order = purchaseOf(giftId)
    await refund(order.id, 2000)
    deliveries(true)
    await fire('order.refunded', order.id)
    await fire('order.paid', order.id)
    expect((await stored(giftId))!.status).toBe('refunded')
    expect(notices('delivered+friend@resend.dev')).toEqual([])
    expect(Object.values(fake.state.discounts).filter(discount => discount.metadata.giftId === giftId)).toEqual([])
  })

  test('a refund of part of the purchase before the claim voids the gift and its discount; after the claim the gift stays the recipient\'s', async () => {
    const ada = await purchaser()
    const voided = await send(ada, 'delivered+voided@resend.dev')
    const { discountId } = (await stored(voided.id))!
    await refund(purchaseOf(voided.id).id, 500)
    expect((await stored(voided.id))!.status).toBe('refunded')
    expect(fake.state.discounts[discountId!]!.deleted).toBe(true)
    const late = await asUser(t, { email: 'delivered+voided@resend.dev' })
    expect(await refusal(late.action(fn<'action'>('billing:claimGift'), { giftId: voided.id }))).toMatchObject({ code: 'forbidden', data: { reason: 'gift_refunded' } })

    const kept = await send(ada, 'delivered+kept@resend.dev')
    const recipient = await asUser(t, { email: 'delivered+kept@resend.dev' })
    await recipient.action(fn<'action'>('billing:claimGift'), { giftId: kept.id })
    await fake.idle()
    await refund(purchaseOf(kept.id).id, 2000)
    expect((await stored(kept.id))!.status).toBe('claimed')
  })
})

describe('claiming into a workspace', () => {
  test('lands on a workspace the recipient manages, and is refused for one they only belong to or are no member of', async () => {
    const ada = await purchaser()
    const gift = await send(ada, 'delivered+rita@resend.dev')
    const rita = await asUser(t, { email: 'delivered+rita@resend.dev' })
    const managed = await seedWorkspace(t, { name: 'Managed' })
    const joined = await seedWorkspace(t, { name: 'Joined' })
    const elsewhere = await seedWorkspace(t, { name: 'Elsewhere' })
    for (const [organizationId, role] of [[managed, 'admin'], [joined, 'member']] as const) {
      await t.mutation(components.backend.adapter.create, { input: { model: 'member', data: { organizationId, userId: rita.userId, role, createdAt: Date.now() } } } as never)
    }
    const claim = (workspaceId: string) => rita.action(fn<'action'>('billing:claimGift'), { giftId: gift.id, workspaceId })
    expect(await refusal(claim(joined))).toMatchObject({ code: 'forbidden', data: { reason: 'not_billing_manager' } })
    expect(await refusal(claim(elsewhere))).toMatchObject({ code: 'forbidden', data: { reason: 'not_member' } })
    // With billTo: user there is no workspace to name.
    expect(await refusal(rita.action(fn<'action'>('perUser:claimGift'), { giftId: gift.id, workspaceId: managed }))).toMatchObject({ code: 'invalid_input', data: { field: 'workspaceId' } })
    expect(await claim(managed)).toEqual({ url: null })
    await fake.idle()
    const claimOrder = Object.values(fake.state.orders).find(order => order.metadata.giftId === gift.id && order.productId === PACK)!
    expect(fake.state.customers[claimOrder.customerId]!.externalId).toBe(managed)
    expect(await stored(gift.id)).toMatchObject({ status: 'claimed', claimedEntityId: managed })
    // Claimed once: claiming again opens no second checkout.
    const checkouts = Object.keys(fake.state.checkouts).length
    expect(await claim(managed)).toEqual({ url: null })
    expect(Object.keys(fake.state.checkouts)).toHaveLength(checkouts)
  })

  test('a banned recipient sees no gifts, whatever their token says', async () => {
    const ada = await purchaser()
    await send(ada, 'delivered+rita@resend.dev')
    const rita = await asUser(t, { email: 'delivered+rita@resend.dev' })
    expect(await rita.query(fn<'query'>('billing:getReceivedGifts'), {})).toHaveLength(1)
    await t.mutation(components.backend.adapter.updateOne, { input: { model: 'user', where: [{ field: '_id', value: rita.userId }], update: { banned: true } } } as never)
    expect(await rita.query(fn<'query'>('billing:getReceivedGifts'), {})).toBeNull()
  })
})
