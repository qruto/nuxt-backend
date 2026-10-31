/// <reference types="vite/client" />
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { PolarCore } from '@polar-sh/sdk/core.js'
import { subscriptionsUpdate } from '@polar-sh/sdk/funcs/subscriptionsUpdate.js'
import { componentsGeneric, defineSchema, makeFunctionReference, type FunctionReference } from 'convex/server'
import type { TestConvex } from 'convex-test'
import { syncBillingCatalog } from '../../src/cli/billing/sync'
import { createPolarFake, type PolarFake, routeToFake } from '../fixtures/polar-fake/server'
import type { BillingCatalog } from '../../src/convex/catalog'
import type { ComponentApi } from '../../src/convex/components/backend/_generated/component'
import { getBackendError } from '../../src/convex/errors'
import { addMonths } from '../../src/convex/integrations/billing/passes'
import { asUser, defineBackendTestApp, seedWorkspace } from '../../src/convex/test'
import { signingSecret } from '../helpers/secrets'

// Plan passes from the package's sources, on the fake provider: the claims a
// pass refuses or survives (a workspace that holds one, two at once, one on
// no subscription, a provider that keeps its own period, a hold that lapsed
// mid-way), how the sweep follows one the provider ended or the workspace
// paid for, who hears that it ends, and the reverse trial's races and
// refusals. The scaffold runs as an app runs it, its `nuxt-backend/billing`
// resolved to src/ (see the mock below), so every line here counts against
// the sources.

const SCAFFOLD = '../fixtures/registration/backend/'
const SITE = 'http://localhost:3000'
const FAKE = 'http://127.0.0.1:4762'
const ENDPOINT = 'https://scaffold.convex.site/billing/events'
const SECRET = signingSecret()
const DAY = 24 * 60 * 60 * 1000

const CATALOG: BillingCatalog = {
  meters: { credits: { eventName: 'credits', property: 'amount' } },
  plans: {
    free: { name: 'Free', prices: { month: 0 }, credits: { meter: 'credits', units: 20 } },
    pro: { name: 'Pro', prices: { month: 1200 }, credits: { meter: 'credits', units: 500 }, features: ['priority'], gift: { months: [1, 3] } },
  },
  packs: { credits500: { name: '500 credits', price: 2000, credits: { meter: 'credits', units: 500 } } },
  features: { priority: { description: 'Priority support' } },
}

/**
 * What the scaffold's billing.ts built: the instances below, and every email
 * they were asked to send, as `sendTemplate` was called.
 */
const built = vi.hoisted(() => ({
  outbox: [] as Array<{ name: string, data: Record<string, unknown>, options?: { senderId?: string, idempotencyKey?: string } }>,
  instances: {} as Record<'billing' | 'trial' | 'noFree', { api: Record<string, unknown> }>,
}))

// The scaffold's `nuxt-backend/billing` (the built package) is the
// sources' here, so every line this suite runs counts against src/. Its
// setupBilling also builds, beside the scaffold's own billing, the same
// catalog with the plan's pass as a reverse trial and one with no free plan
// (what `trial:` and `noFree:` below run on), and an email that records
// what it is asked to send.
vi.mock('nuxt-backend/billing', async () => {
  const source = await import('../../src/convex/integrations/billing')
  // Only `sendTemplate` is what billing calls; the rest of an email instance it never reads.
  const email = {
    sendTemplate: async (_ctx: unknown, name: string, data: Record<string, unknown>, options?: { senderId?: string, idempotencyKey?: string }) => {
      built.outbox.push({ name, data, options })
      return null
    },
  } as unknown as Parameters<typeof source.setupBilling>[1]['email']
  const setupBilling: typeof source.setupBilling = (components, config) => {
    const ids = config.catalog!.sandbox!
    const { free: _free, ...noFree } = ids
    const make = (catalog: typeof ids) => source.setupBilling(components, { ...config, email, catalog: { sandbox: catalog } })
    built.instances = {
      billing: make(ids),
      trial: make({ ...ids, passes: { pro: { ...ids.passes!.pro!, trialDays: 14 } } }),
      noFree: make(noFree),
    }
    return built.instances.billing as ReturnType<typeof source.setupBilling>
  }
  return { ...source, setupBilling }
})

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
        passes: { pro: { pass: product('pro-pass'), months: { 1: product('pro-gift-1'), 3: product('pro-gift-3') } } },
        meters: { credits: { meterId: stableId('meter', 'credits'), eventName: 'credits', property: 'amount' } },
      },
    },
  }
})

vi.stubEnv('BILLING_ACCESS_TOKEN', 'polar_oat_fake')
vi.stubEnv('EMAIL_API_KEY', 're_test_key')
vi.stubEnv('BILLING_WEBHOOK_SECRET', SECRET)
vi.stubEnv('SITE_URL', SITE)
vi.stubEnv('AUTH_SECRET', 'plan-passes-suite-secret-0123456789abcdefghijklm')

/** The scaffold's billing.ts, loaded: the instances above are built once it is. */
const instances = async () => {
  await import('../fixtures/registration/backend/billing')
  return built.instances
}

const scaffold = import.meta.glob(['../fixtures/registration/backend/*.ts', '!**/convex.config.ts', '!**/auth.config.ts'])
const testApp = defineBackendTestApp(defineSchema({}), {
  ...scaffold,
  [`${SCAFFOLD}_generated/api.js`]: () => Promise.resolve({}),
  [`${SCAFFOLD}trial.ts`]: async () => ({ startFreePlan: (await instances()).trial.api.startFreePlan }),
  [`${SCAFFOLD}noFree.ts`]: async () => ({ claimGift: (await instances()).noFree.api.claimGift }),
})

const fn = <Kind extends 'query' | 'mutation' | 'action'>(path: string) => makeFunctionReference<Kind>(path) as FunctionReference<Kind, 'public'>
const internalFn = (path: string) => makeFunctionReference<'action'>(path) as unknown as FunctionReference<'action', 'internal'>
const components = componentsGeneric() as unknown as { backend: ComponentApi<'backend'> }

let t: TestConvex<ReturnType<typeof defineSchema>>
let fake: PolarFake
let ids: Awaited<ReturnType<typeof syncBillingCatalog>>['ids']
/**
 * Answers one provider request in the fake provider's place, or lets it
 * through with `undefined`: what the fake does not model, a refusal or a
 * call slow enough for something else to happen meanwhile.
 */
let intercept: ((request: Request, body: Record<string, unknown>) => Promise<Response | undefined> | Response | undefined) | null = null

/** A refusal in the provider's validation shape: the SDK reads it as a failed call, and retries nothing. */
const refused = (field: string) => Response.json({ detail: [{ loc: ['body', field], msg: 'refused by the test', type: 'value_error' }] }, { status: 422 })

beforeAll(async () => {
  // The clock too: a pass is followed through months, and the fake provider reads the same clock.
  vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval', 'Date'] })
  for (const level of ['log', 'info', 'warn', 'error'] as const) vi.spyOn(console, level).mockImplementation(() => {})
  // Loaded once, before any function runs: every module of the scaffold then imports this one billing.
  const { billing } = await import('../fixtures/registration/backend/billing') as { billing: unknown }
  expect(billing).toBe(built.instances.billing)
})

afterAll(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

beforeEach(async () => {
  vi.setSystemTime(new Date('2027-01-05T10:00:00Z'))
  built.outbox.length = 0
  t = testApp()
  const app = t
  fake = createPolarFake({
    baseUrl: FAKE,
    fetcher: (url, init) => app.fetch(new URL(url).pathname, { method: 'POST', headers: init.headers, body: init.body as string }),
  })
  const routed = routeToFake(fake, FAKE)
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init)
    if (intercept) {
      const body = request.method === 'GET' ? {} : await request.clone().json().catch(() => ({})) as Record<string, unknown>
      const answer = await intercept(request, body)
      if (answer) return answer
    }
    return routed(request)
  })
  fake.ensureEndpoint(ENDPOINT, SECRET)
  ids = (await syncBillingCatalog(CATALOG, { rootDir: '.', environment: 'sandbox', accessToken: 'polar_oat_fake', dryRun: false, adopt: {} })).ids
  const { catalog } = await import('../fixtures/registration/backend/billing.generated') as { catalog: { sandbox: unknown } }
  expect(ids).toEqual(catalog.sandbox)
  await fake.idle()
})

afterEach(async () => {
  intercept = null
  await fake.idle()
  fake.close()
  vi.unstubAllGlobals()
  vi.mocked(console.warn).mockClear()
  vi.mocked(console.error).mockClear()
})

type Caller = Awaited<ReturnType<typeof asUser>>
type Gift = { id: string, status: string, recipientEmail?: string }
type Current = { id: string, productId: string, status: string, free?: true, pass?: { plan: string, endsAt: number, trial?: true } } | null

const refusal = (promise: Promise<unknown>) => promise.then(() => null, (error: unknown) => getBackendError(error))
const sentGifts = async (caller: Caller) => (await caller.query(fn<'query'>('billing:getSentGifts'), {}) as Gift[] | null) ?? []
const received = async (caller: Caller) => (await caller.query(fn<'query'>('billing:getReceivedGifts'), {}) as Gift[] | null) ?? []
const current = (caller: Caller) => caller.query(fn<'query'>('billing:getCurrentSubscription'), {}) as Promise<Current>
const sweep = () => t.action(internalFn('billing:runGiftSweep'), { op: 'sweep' })
const startFree = (entityId: string) => t.action(internalFn('billing:startFreePlan'), { entityId })
const claim = (caller: Caller, giftId: string) => caller.action(fn<'action'>('billing:claimGift'), { giftId, workspaceId: caller.workspaceId })
/** Another claim's hold on a pass gift, into `entityId`, as a claim takes it from the component. */
const reserve = (giftId: string, userId: string, entityId: string) => t.mutation(components.backend.gifts.reservePass, { giftId, userId, entityId, until: Date.now() + 60_000 })

/** The workspace's subscriptions at the provider, as the fake keeps them. */
function subscriptionsOf(entityId: string) {
  const customer = Object.values(fake.state.customers).find(entry => entry.externalId === entityId)
  return Object.values(fake.state.subscriptions).filter(subscription => subscription.customerId === customer?.id)
}

/** What the workspace's trail recorded of its passes, oldest first. */
async function passEvents(caller: Caller) {
  const { page } = await t.query(components.backend.audit.list, { view: { kind: 'workspace', workspaceId: caller.workspaceId!, viewerId: caller.userId }, paginationOpts: { numItems: 100, cursor: null } })
  return page.filter(entry => entry.type.startsWith('gift.pass_')).map(entry => ({ type: entry.type, data: entry.data })).reverse()
}

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

/** A purchaser who has paid for something already, as a gift needs. */
async function purchaser(): Promise<Caller> {
  const ada = await asUser(t, { email: 'ada@example.com' })
  const { url } = await ada.action(fn<'action'>('billing:generateCheckoutLink'), { productIds: [ids.products.credits500!], origin: SITE, successUrl: `${SITE}/billing` })
  await pay(url)
  return ada
}

/** Buy a pass of Pro for `email` and pay for it: the new gift. */
async function sendPass(ada: Caller, email: string, months = 1): Promise<Gift> {
  const before = new Set((await sentGifts(ada)).map(entry => entry.id))
  const { url } = await ada.action(fn<'action'>('billing:giftCheckout'), { plan: 'pro', months, recipientEmail: email, origin: SITE, successUrl: `${SITE}/gifts` })
  await pay(url)
  return (await sentGifts(ada)).find(entry => !before.has(entry.id))!
}

/** A recipient whose workspace is on the free plan. */
async function onFree(email: string): Promise<Caller> {
  const recipient = await asUser(t, { email })
  expect(await startFree(recipient.workspaceId!)).toBe('started')
  await drain()
  return recipient
}

describe('claiming a plan pass', { timeout: 30_000 }, () => {
  test('is refused to a workspace that holds a pass already, which keeps the one it has', async () => {
    const ada = await purchaser()
    const first = await sendPass(ada, 'delivered+twice@resend.dev', 3)
    const second = await sendPass(ada, 'delivered+twice@resend.dev', 1)
    const recipient = await onFree('delivered+twice@resend.dev')
    await claim(recipient, first.id)
    await fake.idle()
    const before = await current(recipient)

    expect(await refusal(claim(recipient, second.id))).toMatchObject({ code: 'forbidden', data: { reason: 'already_subscribed' } })

    expect(await current(recipient)).toEqual(before)
    expect((await received(recipient)).find(entry => entry.id === second.id)).toMatchObject({ status: 'paid' })
    expect(subscriptionsOf(recipient.workspaceId!).map(subscription => subscription.productId)).toEqual([ids.passes!.pro!.pass])
  })

  test('twice into one workspace at once, takes one gift: the other is refused, still the recipient\'s to claim elsewhere', async () => {
    const ada = await purchaser()
    const gifts = [await sendPass(ada, 'delivered+race@resend.dev'), await sendPass(ada, 'delivered+race@resend.dev')]
    const recipient = await onFree('delivered+race@resend.dev')

    const outcomes = await Promise.all(gifts.map(gift => refusal(claim(recipient, gift.id))))
    await fake.idle()

    expect(outcomes.filter(outcome => outcome === null)).toHaveLength(1)
    expect(outcomes.filter(outcome => outcome !== null)).toEqual([expect.objectContaining({ code: 'forbidden', data: { reason: 'already_subscribed' } })])
    expect((await received(recipient)).map(entry => entry.status).sort()).toEqual(['claimed', 'paid'])
    // One subscription, switched once: no pass the package does not follow.
    expect(subscriptionsOf(recipient.workspaceId!).map(subscription => subscription.productId)).toEqual([ids.passes!.pro!.pass])
  })

  test('gives a workspace that holds no subscription at all the pass as a new one', async () => {
    const ada = await purchaser()
    const gift = await sendPass(ada, 'delivered+none@resend.dev', 3)
    const recipient = await asUser(t, { email: 'delivered+none@resend.dev' })
    expect(subscriptionsOf(recipient.workspaceId!)).toEqual([])
    const claimedAt = Date.now()

    await claim(recipient, gift.id)
    await fake.idle()

    const [pass] = subscriptionsOf(recipient.workspaceId!)
    expect(pass).toMatchObject({ productId: ids.passes!.pro!.pass, status: 'active' })
    expect(Math.abs(pass!.currentPeriodEnd - addMonths(claimedAt, 1))).toBeLessThan(5000)
    expect(await current(recipient)).toMatchObject({ id: pass!.id, pass: { plan: 'pro' } })
  })

  test('goes through when the provider will not move the billing period, and the sweep still ends it on its end date', async () => {
    const ada = await purchaser()
    const gift = await sendPass(ada, 'delivered+unaligned@resend.dev', 1)
    const recipient = await onFree('delivered+unaligned@resend.dev')
    intercept = (request, body) => request.method === 'PATCH' && 'current_billing_period_end' in body ? refused('current_billing_period_end') : undefined
    const claimedAt = Date.now()

    await claim(recipient, gift.id)
    await fake.idle()

    expect(vi.mocked(console.warn).mock.calls.flat().join('\n')).toContain('billing.pass_period_unaligned')
    const row = (await current(recipient))!
    expect(row.pass).toMatchObject({ plan: 'pro' })
    expect(Math.abs(row.pass!.endsAt - addMonths(claimedAt, 1))).toBeLessThan(5000)
    intercept = null
    vi.setSystemTime(row.pass!.endsAt + 1000)
    await sweep()
    await fake.idle()
    expect(await current(recipient)).toMatchObject({ productId: ids.products.free, free: true })
    expect(await passEvents(recipient)).toEqual([
      { type: 'gift.pass_started', data: { plan: 'pro', months: 1, endsAt: row.pass!.endsAt } },
      { type: 'gift.pass_ended', data: { plan: 'pro', outcome: 'returned' } },
    ])
  })

  test('kept on a billing period that ends before it does, still runs to its own end date', async () => {
    const ada = await purchaser()
    const gift = await sendPass(ada, 'delivered+midcycle@resend.dev', 1)
    const recipient = await onFree('delivered+midcycle@resend.dev')
    // Ten days into the free plan's cycle, which the provider will not move: it ends three weeks on, the pass in a month.
    vi.setSystemTime(Date.now() + 10 * DAY)
    intercept = (request, body) => request.method === 'PATCH' && 'current_billing_period_end' in body ? refused('current_billing_period_end') : undefined
    await claim(recipient, gift.id)
    await fake.idle()
    intercept = null
    const { endsAt } = (await current(recipient))!.pass!
    const [subscription] = subscriptionsOf(recipient.workspaceId!)
    const periodEnd = subscription!.currentPeriodEnd
    expect(endsAt - periodEnd).toBeGreaterThan(9 * DAY)

    // Its one month is its last: no return is booked for a period that ends first, which would end the pass early.
    await sweep()
    await fake.idle()
    expect(fake.state.subscriptions[subscription!.id]!.pendingUpdate).toBeNull()
    // The period turns over, and the pass runs on.
    vi.setSystemTime(periodEnd + 1000)
    await fake.handle(new Request(`${FAKE}/_fake/clock`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'origin': FAKE }, body: `action=renew&subscription=${subscription!.id}` }))
    await fake.idle()
    await sweep()
    await fake.idle()
    expect(await current(recipient)).toMatchObject({ productId: ids.passes!.pro!.pass, pass: { plan: 'pro', endsAt } })
    // Its end date: the sweep switches it back to the free plan.
    vi.setSystemTime(endsAt + 1000)
    await sweep()
    await fake.idle()
    expect(await current(recipient)).toMatchObject({ productId: ids.products.free, free: true })
    expect(await passEvents(recipient)).toEqual([
      { type: 'gift.pass_started', data: { plan: 'pro', months: 1, endsAt } },
      { type: 'gift.pass_ended', data: { plan: 'pro', outcome: 'returned' } },
    ])
  })

  /** Let the claim's switch through, but only after its hold lapsed and a claim into another workspace took the gift. */
  const takeOverAtSwitch = (giftId: string, recipient: Caller) => async (request: Request, body: Record<string, unknown>) => {
    if (request.method !== 'PATCH' || body.product_id !== ids.passes!.pro!.pass) return undefined
    vi.setSystemTime(Date.now() + 6 * 60 * 1000)
    expect(await reserve(giftId, recipient.userId, await seedWorkspace(t))).toBe('reserved')
    return undefined
  }

  test('whose hold lapsed and another claim took, switches its workspace back to the free plan and is refused', async () => {
    const ada = await purchaser()
    const gift = await sendPass(ada, 'delivered+lapsed@resend.dev', 3)
    const recipient = await onFree('delivered+lapsed@resend.dev')
    const free = (await current(recipient))!
    intercept = takeOverAtSwitch(gift.id, recipient)

    expect(await refusal(claim(recipient, gift.id))).toMatchObject({ code: 'forbidden', data: { reason: 'gift_claimed' } })
    await fake.idle()

    // The subscription the claim switched is the free plan's again, at the provider and as the app reads it.
    expect(subscriptionsOf(recipient.workspaceId!)).toEqual([expect.objectContaining({ id: free.id, productId: ids.products.free, status: 'active' })])
    expect(await current(recipient)).toMatchObject({ id: free.id, free: true })
    expect((await received(recipient)).find(entry => entry.id === gift.id)).toMatchObject({ status: 'paid' })
    expect(await passEvents(recipient)).toEqual([])
  })

  test('whose hold lapsed and another claim took, leaves that claim its hold', async () => {
    const ada = await purchaser()
    const gift = await sendPass(ada, 'delivered+overtaken@resend.dev', 3)
    const recipient = await onFree('delivered+overtaken@resend.dev')
    intercept = takeOverAtSwitch(gift.id, recipient)

    expect(await refusal(claim(recipient, gift.id))).toMatchObject({ code: 'forbidden', data: { reason: 'gift_claimed' } })
    await fake.idle()
    intercept = null

    // The claim that took the gift still holds it, so a third one waits for it.
    const held = (await t.query(components.backend.gifts.get, { giftId: gift.id }))!
    expect(held).toMatchObject({ status: 'paid', claimingUserId: recipient.userId, claimingEntityId: expect.any(String) })
    expect(held.claimingEntityId).not.toBe(recipient.workspaceId)
    expect(await reserve(gift.id, recipient.userId, await seedWorkspace(t))).toBe('busy')
  })

  test('that can\'t switch back is logged for a hand fix, and still refused', async () => {
    const ada = await purchaser()
    const gift = await sendPass(ada, 'delivered+stuck@resend.dev', 3)
    const recipient = await onFree('delivered+stuck@resend.dev')
    const takeOver = takeOverAtSwitch(gift.id, recipient)
    intercept = async (request, body) => {
      if (request.method === 'PATCH' && body.product_id === ids.products.free) return refused('product_id')
      return takeOver(request, body)
    }

    expect(await refusal(claim(recipient, gift.id))).toMatchObject({ code: 'forbidden', data: { reason: 'gift_claimed' } })

    expect(vi.mocked(console.error).mock.calls.flat().join('\n')).toContain('billing.pass_claim_unrecorded')
    expect(subscriptionsOf(recipient.workspaceId!).map(subscription => subscription.productId)).toEqual([ids.passes!.pro!.pass])
  })

  test('is refused by a billing setup whose catalog has no free plan for the pass to return to, before anything switches', async () => {
    const ada = await purchaser()
    const gift = await sendPass(ada, 'delivered+nofree@resend.dev', 3)
    const recipient = await onFree('delivered+nofree@resend.dev')

    expect(await refusal(recipient.action(fn<'action'>('noFree:claimGift'), { giftId: gift.id })))
      .toMatchObject({ code: 'not_ready', data: { reason: 'no_catalog' } })

    expect(await current(recipient)).toMatchObject({ productId: ids.products.free, free: true })
    expect((await received(recipient)).find(entry => entry.id === gift.id)).toMatchObject({ status: 'paid' })
  })
})

describe('following a pass', { timeout: 30_000 }, () => {
  test('is over at the next sweep once the provider ended its subscription, and the workspace is back on the free plan', async () => {
    const ada = await purchaser()
    const gift = await sendPass(ada, 'delivered+revoked@resend.dev', 3)
    const recipient = await onFree('delivered+revoked@resend.dev')
    await claim(recipient, gift.id)
    await fake.idle()
    const pass = (await current(recipient))!

    // Revoked at the provider, by hand in its dashboard, say.
    const ended = await subscriptionsUpdate(new PolarCore({ accessToken: 'polar_oat_fake', server: 'sandbox' }), { id: pass.id, subscriptionUpdate: { revoke: true } })
    expect(ended.ok).toBe(true)
    await fake.idle()
    await drain()
    vi.setSystemTime(addMonths(Date.now(), 2) + 2 * 60 * 60 * 1000)
    await sweep()
    await fake.idle()

    expect(await passEvents(recipient)).toEqual([
      expect.objectContaining({ type: 'gift.pass_started' }),
      { type: 'gift.pass_ended', data: { plan: 'pro', outcome: 'returned' } },
    ])
    const back = await current(recipient)
    expect(back).toMatchObject({ productId: ids.products.free, free: true })
    expect(back?.pass).toBeUndefined()
    // Nothing is booked on the revoked one, and nothing is switched on the new one.
    expect(fake.state.subscriptions[pass.id]).toMatchObject({ status: 'canceled', productId: ids.passes!.pro!.pass, pendingUpdate: null })
  })

  test('kept by paying for the plan is over at once, recorded as kept', async () => {
    const ada = await purchaser()
    const gift = await sendPass(ada, 'delivered+kept@resend.dev', 1)
    const recipient = await onFree('delivered+kept@resend.dev')
    await claim(recipient, gift.id)
    await fake.idle()

    const { url } = await recipient.action(fn<'action'>('billing:generateCheckoutLink'), { productIds: [ids.products.pro!], origin: SITE, successUrl: `${SITE}/billing` })
    await pay(url)

    expect((await passEvents(recipient)).at(-1)).toEqual({ type: 'gift.pass_ended', data: { plan: 'pro', outcome: 'kept' } })
    const row = await current(recipient)
    expect(row).toMatchObject({ productId: ids.products.pro })
    expect(row?.pass).toBeUndefined()
  })

  test('tells the workspace\'s billing managers a week before it ends, each once, and no member who can\'t manage billing', async () => {
    const ada = await purchaser()
    const gift = await sendPass(ada, 'delivered+notice@resend.dev', 1)
    const recipient = await onFree('delivered+notice@resend.dev')
    await asUser(t, { email: 'delivered+admin@resend.dev', workspace: recipient.workspaceId, workspaceRole: 'admin' })
    await asUser(t, { email: 'delivered+member@resend.dev', workspace: recipient.workspaceId, workspaceRole: 'member' })
    const banned = await asUser(t, { email: 'delivered+banned@resend.dev', workspace: recipient.workspaceId, workspaceRole: 'admin' })
    await t.mutation(components.backend.adapter.updateOne, { input: { model: 'user', where: [{ field: '_id', value: banned.userId }], update: { banned: true } } } as never)
    await claim(recipient, gift.id)
    await fake.idle()
    const endsAt = (await current(recipient))!.pass!.endsAt

    vi.setSystemTime(endsAt - 6 * DAY)
    await sweep()
    await sweep()

    const notices = built.outbox.filter(entry => entry.name === 'giftPassEnding')
    expect(notices.map(entry => entry.data.email).sort()).toEqual(['delivered+admin@resend.dev', 'delivered+notice@resend.dev'])
    expect(notices[0]!.data).toMatchObject({ plan: 'Pro', endsAt, keepUrl: `${SITE}/settings`, workspace: expect.any(String) })
    expect(notices[0]!.data).not.toHaveProperty('trial')
    expect(new Set(notices.map(entry => entry.options?.idempotencyKey)).size).toBe(2)
    expect((await passEvents(recipient)).map(entry => entry.type)).toEqual(['gift.pass_started', 'gift.pass_ending'])
  })

  test('without a site to link to, sends no notice but still marks it, so none goes out late', async () => {
    const ada = await purchaser()
    const gift = await sendPass(ada, 'delivered+nosite@resend.dev', 1)
    const recipient = await onFree('delivered+nosite@resend.dev')
    await claim(recipient, gift.id)
    await fake.idle()
    const endsAt = (await current(recipient))!.pass!.endsAt

    vi.stubEnv('SITE_URL', '')
    try {
      vi.setSystemTime(endsAt - 6 * DAY)
      await sweep()
    }
    finally {
      vi.stubEnv('SITE_URL', SITE)
    }
    await sweep()

    expect(built.outbox.filter(entry => entry.name === 'giftPassEnding')).toEqual([])
    expect((await passEvents(recipient)).map(entry => entry.type)).toEqual(['gift.pass_started', 'gift.pass_ending'])
  })
})

describe('the reverse trial', { timeout: 30_000 }, () => {
  const startTrial = (entityId: string) => t.action(internalFn('trial:startFreePlan'), { entityId })

  test('starts once when two workspaces of one address start at the same time: the other is back on the free plan', async () => {
    const owner = await asUser(t, { email: 'delivered+trial@resend.dev' })
    const second = await seedWorkspace(t)
    await t.mutation(components.backend.adapter.create, { input: { model: 'member', data: { organizationId: second, userId: owner.userId, role: 'owner', createdAt: Date.now() } } } as never)
    const workspaces = [owner.workspaceId!, second]
    // Both switch before either records its trial: the race the record settles.
    let first: (() => void) | null = null
    intercept = async (request, body) => {
      if (request.method !== 'PATCH' || body.product_id !== ids.passes!.pro!.pass) return undefined
      if (first) first()
      else await new Promise<void>((resolve) => {
        first = resolve
      })
      return undefined
    }

    expect(await Promise.all(workspaces.map(startTrial))).toEqual(['started', 'started'])
    await drain()

    const products = workspaces.map(workspace => subscriptionsOf(workspace).map(subscription => subscription.productId))
    expect(products.flat().sort()).toEqual([ids.passes!.pro!.pass, ids.products.free].sort())
    const trials = (await t.query(components.backend.gifts.listByPurchaser, { purchaserUserId: '' })).filter(entry => entry.reverseTrial)
    expect(trials).toHaveLength(1)
  })

  test('leaves a new workspace on the free plan when the provider refuses the switch, and says so', async () => {
    const owner = await asUser(t, { email: 'delivered+refused@resend.dev' })
    intercept = (request, body) => request.method === 'PATCH' && body.product_id === ids.passes!.pro!.pass ? refused('product_id') : undefined

    expect(await startTrial(owner.workspaceId!)).toBe('started')
    await drain()

    expect(vi.mocked(console.error).mock.calls.flat().join('\n')).toContain('billing.reverse_trial_failed')
    expect(await current(owner)).toMatchObject({ productId: ids.products.free, free: true })
    expect((await t.query(components.backend.gifts.listByPurchaser, { purchaserUserId: '' })).filter(entry => entry.reverseTrial)).toEqual([])
  })
})
