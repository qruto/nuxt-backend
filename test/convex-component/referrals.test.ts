/// <reference types="vite/client" />
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { componentsGeneric, defineSchema, makeFunctionReference, type FunctionReference } from 'convex/server'
import type { TestConvex } from 'convex-test'
import { syncBillingCatalog } from '../../src/cli/billing/sync'
import { createPolarFake, type PolarFake, routeToFake } from '../fixtures/polar-fake/server'
import type { BillingCatalog } from '../../src/convex/catalog'
import type { ComponentApi } from '../../src/convex/components/backend/_generated/component'
import { AUTH_TIME_CLAIM } from '../../src/convex/constants'
import { getBackendError } from '../../src/convex/errors'
import type { Billing } from '../../src/convex/integrations/billing/types/surface'
import type { ReferralConsole, ReferralsView } from '../../src/convex/integrations/referrals'
import { asUser, defineBackendTestApp } from '../../src/convex/test'
import { signingSecret } from '../helpers/secrets'

// The referral program end to end on the fake provider: a person's code made on
// first ask, the claim a new account makes, the discount the checkout carries
// for the person referred, the first paid order that starts the hold, the
// refund that voids it, the pack the referrer is granted at no cost once the
// hold ends, the caps, the burst flag an administrator resolves, and the
// account's export and erasure.

const SCAFFOLD = '../fixtures/registration/backend/'
const SITE = 'http://localhost:3000'
const FAKE = 'http://127.0.0.1:4761'
const ENDPOINT = 'https://scaffold.convex.site/billing/events'
const SECRET = signingSecret()
const DAY = 24 * 60 * 60 * 1000

const CATALOG: BillingCatalog = {
  currency: 'usd',
  meters: { credits: { eventName: 'credits', property: 'amount' } },
  plans: {
    free: { name: 'Free', prices: { month: 0 }, credits: { meter: 'credits', units: 20 } },
    pro: { name: 'Pro', prices: { month: 1200 }, credits: { meter: 'credits', units: 500 } },
  },
  packs: { credits500: { name: '500 credits', price: 2000, credits: { meter: 'credits', units: 500 } } },
  discounts: {
    friend: { name: 'A friend\'s welcome', percentOff: 25, duration: 'once', products: { plans: ['pro'] } },
  },
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
        meters: { credits: { meterId: stableId('meter', 'credits'), eventName: 'credits', property: 'amount' } },
        discounts: {
          friend: { id: stableId('discount', 'friend'), name: 'A friend\'s welcome', percentOff: 25, duration: 'once', productIds: [product('pro')] },
        },
      },
    },
  }
})

vi.stubEnv('BILLING_ACCESS_TOKEN', 'polar_oat_fake')
vi.stubEnv('BILLING_WEBHOOK_SECRET', SECRET)
vi.stubEnv('SITE_URL', SITE)
vi.stubEnv('AUTH_SECRET', 'referrals-suite-secret-0123456789abcdefghijklmnop')

const components = componentsGeneric() as unknown as { backend: ComponentApi<'backend'> }

const scaffold = import.meta.glob(['../fixtures/registration/backend/*.ts', '!**/convex.config.ts', '!**/auth.config.ts'])
const testApp = defineBackendTestApp(defineSchema({}), {
  ...scaffold,
  [`${SCAFFOLD}_generated/api.js`]: () => Promise.resolve({}),
  // The app's own backend/referrals.ts.
  [`${SCAFFOLD}referrals.ts`]: async () => {
    // The package as an app imports it: the scaffold's billing and this program share one build.
    const { setupReferrals } = await import('nuxt-backend/billing')
    // The fixture is typed from the built package, whose `Billing` leaves out the @internal members.
    const { billing } = await import('../fixtures/registration/backend/billing') as unknown as { billing: Billing }
    const referrals = setupReferrals(components as never, {
      billing,
      rewards: { referred: { discount: 'friend' }, referrer: { pack: 'credits500' } },
      hold: 14 * DAY,
      caps: { perReferrer: 2 },
    })
    return { ...referrals.api }
  },
})

const fn = <Kind extends 'query' | 'mutation' | 'action'>(path: string) => makeFunctionReference<Kind>(path) as FunctionReference<Kind, 'public'>
const internalFn = (path: string) => makeFunctionReference<'action'>(path) as unknown as FunctionReference<'action', 'internal'>

let t: TestConvex<ReturnType<typeof defineSchema>>
let fake: PolarFake
let ids: Awaited<ReturnType<typeof syncBillingCatalog>>['ids']

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
  ids = (await syncBillingCatalog(CATALOG, { rootDir: '.', environment: 'sandbox', accessToken: 'polar_oat_fake', dryRun: false, adopt: {} })).ids
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
const codeOf = async (caller: Caller) => (await caller.mutation(fn<'mutation'>('referrals:getReferralCode'), {}) as { code: string }).code
const claim = (caller: Caller, code: string) => caller.mutation(fn<'mutation'>('referrals:claimReferral'), { code }) as Promise<Claim>
const mine = (caller: Caller) => caller.query(fn<'query'>('referrals:getReferrals'), {}) as Promise<ReferralsView | null>
const sweep = () => t.action(internalFn('referrals:runReferralSweep'), { op: 'sweep' })

/** The fake provider's checkout behind a checkout URL. */
const checkoutAt = (url: string) => Object.values(fake.state.checkouts).find(entry => url.endsWith(entry.id))!

/** Pay a checkout on its page, then let its events land. */
async function pay(url: string): Promise<void> {
  await fake.handle(new Request(`${url}/pay`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'origin': FAKE } }))
  await fake.idle()
}

/** A new account that signs up through a code and claims it. */
async function friendOf(code: string, email: string) {
  const friend = await asUser(t, { email })
  expect(await claim(friend, code)).toEqual({ claimed: true })
  return friend
}

/** The friend's first paid checkout of Pro: the checkout it opened, and the order it paid. */
async function payPro(friend: Caller) {
  const { url } = await friend.action(fn<'action'>('billing:generateCheckoutLink'), { productIds: [ids.products.pro!], origin: SITE, successUrl: `${SITE}/billing` }) as { url: string }
  const checkout = checkoutAt(url)
  await pay(url)
  await fake.idle()
  return { checkout, order: Object.values(fake.state.orders).find(order => order.productId === ids.products.pro && order.id !== undefined && order.checkoutId === checkout.id)! }
}

/** Orders for the credit pack that charged nothing: what a reward leaves at the provider. */
const freePacks = () => Object.values(fake.state.orders).filter(order => order.productId === ids.products.credits500 && order.discountAmount === order.subtotalAmount)

describe('a person\'s code', () => {
  test('is made on the first ask, stays the same, and a stranger previews it by first name and program', async () => {
    const ada = await asUser(t, { email: 'ada@example.com', name: 'Ada Lovelace' })
    const first = await ada.mutation(fn<'mutation'>('referrals:getReferralCode'), {}) as { code: string, sharePages: boolean, program: { referred: unknown, referrer: unknown, holdDays: number } }
    expect(first.code).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/)
    expect(first).toMatchObject({ sharePages: true, program: { holdDays: 14, referred: { kind: 'discount', name: 'A friend\'s welcome', percentOff: 25 }, referrer: { kind: 'pack', name: '500 credits' } } })
    expect(await codeOf(ada)).toBe(first.code)
    // A visitor with no account reads it, a pasted link and a lower-case code included.
    for (const typed of [first.code, first.code.toLowerCase(), `${SITE}/r/${first.code}`]) {
      expect(await t.query(fn<'query'>('referrals:previewReferral'), { code: typed })).toMatchObject({ inviter: 'Ada' })
    }
    expect(await t.query(fn<'query'>('referrals:previewReferral'), { code: 'NOSUCHCD' })).toBeNull()
    // The code is the person's own: a signed-out caller has no referrals.
    expect(await t.query(fn<'query'>('referrals:getReferrals'), {})).toBeNull()
  })

  test('is turned off for share pages by its owner, while the program keeps working', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    const code = await codeOf(ada)
    await ada.mutation(fn<'mutation'>('referrals:setReferralSharing'), { share: false })
    expect(await ada.mutation(fn<'mutation'>('referrals:getReferralCode'), {})).toMatchObject({ code, sharePages: false })
    expect(await claim(await asUser(t, { email: 'bob@example.com' }), code)).toEqual({ claimed: true })
  })
})

describe('claiming', () => {
  test('records a referral for a new account; the first claimed wins; the person\'s own and invalid codes are ignored', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    const grace = await asUser(t, { email: 'grace@example.com' })
    const code = await codeOf(ada)
    expect(await claim(ada, code)).toEqual({ claimed: false, reason: 'own_code' })
    expect(await claim(grace, 'NOSUCHCD')).toEqual({ claimed: false, reason: 'invalid' })
    expect(await claim(grace, 'not a code')).toEqual({ claimed: false, reason: 'invalid' })
    expect(await claim(grace, code)).toEqual({ claimed: true })
    expect(await mine(ada)).toMatchObject({ claimed: 1, held: 0, rewarded: 0 })
    const other = await asUser(t, { email: 'linus@example.com' })
    expect(await claim(grace, await codeOf(other))).toEqual({ claimed: false, reason: 'already_claimed' })
    expect(await mine(other)).toMatchObject({ claimed: 0 })
    // The referrer reads a state and a time, never who the friend is.
    expect(JSON.stringify(await mine(ada))).not.toContain('grace')
  })

  test('refuses the same mailbox once plus tags and dots are taken out, and an account past its first day', async () => {
    const ada = await asUser(t, { email: 'ada.byron@example.com' })
    const code = await codeOf(ada)
    expect(await claim(await asUser(t, { email: 'adabyron+friends@example.com' }), code)).toEqual({ claimed: false, reason: 'self_referral' })
    const old = await asUser(t, { email: 'old@example.com' })
    vi.setSystemTime(Date.now() + 2 * DAY)
    expect(await claim(old, code)).toEqual({ claimed: false, reason: 'too_late' })
  })

  test('runs on its own only after a sign-in that just happened: a link opened by someone signed in earlier claims nothing', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    const code = await codeOf(ada)
    const earlier = await asUser(t, { email: 'grace@example.com', signedInAt: Date.now() - 2 * 60 * 60 * 1000 })
    expect(await refusal(earlier.mutation(fn<'mutation'>('referrals:claimReferral'), { code, fromSignIn: true }))).toMatchObject({ code: 'reauthentication_required' })
    expect(await mine(ada)).toMatchObject({ claimed: 0 })
    // The button is the person's own choice, whenever they signed in.
    expect(await earlier.mutation(fn<'mutation'>('referrals:claimReferral'), { code })).toEqual({ claimed: true })
    const fresh = await asUser(t, { email: 'linus@example.com' })
    expect(await fresh.mutation(fn<'mutation'>('referrals:claimReferral'), { code, fromSignIn: true })).toEqual({ claimed: true })
  })

  test('is on the referrer\'s activity as the app\'s, never naming who signed up', async () => {
    const ada = await asUser(t, { email: 'ada@example.com', name: 'Ada Lovelace' })
    await friendOf(await codeOf(ada), 'grace@example.com')
    const read = await t.query(components.backend.audit.list, { view: { kind: 'workspace', workspaceId: ada.workspaceId!, viewerId: ada.userId }, paginationOpts: { cursor: null, numItems: 20 } }) as { page: Array<{ type: string, actor: { kind: string, id: string | null } }> }
    const claimed = read.page.find(entry => entry.type === 'referral.claimed')
    expect(claimed?.actor).toMatchObject({ kind: 'app', id: null })
    expect(JSON.stringify(read.page)).not.toContain('grace')
  })

  test('is refused to a signed-out caller and to an administrator acting as the account', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    const code = await codeOf(ada)
    expect(await refusal(t.mutation(fn<'mutation'>('referrals:claimReferral'), { code }))).toMatchObject({ code: 'unauthenticated' })
    const admin = await asUser(t, { email: 'root@example.com', role: 'admin' })
    const visiting = await asUser(t, { email: 'grace@example.com', impersonatedBy: admin.userId })
    expect(await refusal(visiting.mutation(fn<'mutation'>('referrals:claimReferral'), { code }))).toMatchObject({ code: 'forbidden', data: { reason: 'impersonating' } })
  })
})

describe('the first paid order', () => {
  test('carries the program\'s discount, locked on; its payment starts the hold; the friend gets nothing more', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    const grace = await friendOf(await codeOf(ada), 'grace@example.com')
    const { checkout, order } = await payPro(grace)
    // Applied by id, with no code box for a typed one to replace it.
    expect(checkout).toMatchObject({ discountId: ids.discounts!.friend!.id, allowDiscountCodes: false })
    expect(order).toMatchObject({ discountId: ids.discounts!.friend!.id, subtotalAmount: 1200, discountAmount: 300 })
    expect(await mine(ada)).toMatchObject({ claimed: 0, held: 1, rewarded: 0 })
    // Nothing is granted before the hold ends.
    await sweep()
    expect(freePacks()).toEqual([])
    expect(await mine(ada)).toMatchObject({ held: 1 })
  })

  test('is the friend\'s alone: another person\'s checkout and a code typed by a client carry no referral discount', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    await friendOf(await codeOf(ada), 'grace@example.com')
    const stranger = await asUser(t, { email: 'linus@example.com' })
    const { checkout } = await payPro(stranger)
    expect(checkout.discountId ?? null).toBeNull()
    expect(await refusal(stranger.action(fn<'action'>('billing:generateCheckoutLink'), { productIds: [ids.products.pro!], origin: SITE, successUrl: `${SITE}/billing`, discountId: ids.discounts!.friend!.id }))).toMatchObject({ code: 'invalid_input', data: { field: 'discountId' } })
  })

  test('is refunded during the hold: the referral is voided and the referrer gets nothing', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    const grace = await friendOf(await codeOf(ada), 'grace@example.com')
    const { order } = await payPro(grace)
    await fake.handle(new Request(`${FAKE}/v1/refunds`, {
      method: 'POST',
      headers: { 'authorization': 'Bearer polar_oat_fake', 'content-type': 'application/json' },
      body: JSON.stringify({ order_id: order.id, reason: 'customer_request', amount: order.subtotalAmount - order.discountAmount }),
    }))
    await fake.idle()
    expect(await mine(ada)).toMatchObject({ claimed: 0, held: 0, rewarded: 0 })
    vi.setSystemTime(Date.now() + 15 * DAY)
    await sweep()
    expect(freePacks()).toEqual([])
    expect(await mine(ada)).toMatchObject({ rewarded: 0 })
  })
})

describe('the reward', () => {
  test('is a pack claimed at no cost once the hold ends, and only once however often the sweep runs', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    const grace = await friendOf(await codeOf(ada), 'grace@example.com')
    await payPro(grace)
    vi.setSystemTime(Date.now() + 15 * DAY)
    await sweep()
    await fake.idle()
    await sweep()
    await fake.idle()
    expect(await mine(ada)).toMatchObject({ held: 0, rewarded: 1 })
    const packs = freePacks()
    expect(packs).toHaveLength(1)
    // On the referrer's own billing customer, redeeming a single-use, code-free discount minted for the referral.
    const customer = fake.state.customers[packs[0]!.customerId]!
    expect(customer.externalId).toBe(ada.workspaceId)
    const discount = Object.values(fake.state.discounts).find(entry => entry.id === packs[0]!.discountId)
    expect(discount).toMatchObject({ maxRedemptions: 1, code: null })
  })

  test('is not granted for an order refunded after the sweep last looked, and not before the hold ends', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    const grace = await friendOf(await codeOf(ada), 'grace@example.com')
    await payPro(grace)
    vi.setSystemTime(Date.now() + 13 * DAY)
    await sweep()
    expect(freePacks()).toEqual([])
    expect(await mine(ada)).toMatchObject({ held: 1 })
  })

  test('stops at the cap of rewards per referrer: the referral is recorded and counted, with no reward', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    const code = await codeOf(ada)
    for (const name of ['one', 'two', 'three']) {
      const friend = await friendOf(code, `${name}@example.com`)
      await payPro(friend)
    }
    vi.setSystemTime(Date.now() + 15 * DAY)
    await sweep()
    await fake.idle()
    expect(freePacks()).toHaveLength(2)
    expect(await mine(ada)).toMatchObject({ claimed: 1, held: 0, rewarded: 2 })
  })
})

describe('abuse checks', () => {
  test('a burst on one code flags the referrals; their rewards wait for an administrator, who releases or voids them', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    const code = await codeOf(ada)
    const friends: Caller[] = []
    for (const name of ['a', 'b', 'c', 'd', 'e']) friends.push(await friendOf(code, `${name}@example.com`))
    await payPro(friends[4]!)
    vi.setSystemTime(Date.now() + 15 * DAY)
    await sweep()
    await fake.idle()
    // The fifth claim in the hour was flagged: held, not rewarded.
    expect(await mine(ada)).toMatchObject({ held: 1, rewarded: 0 })
    const admin = await asUser(t, { email: 'root@example.com', role: 'admin' })
    const view = await admin.query(fn<'query'>('referrals:getReferralConsole'), {}) as ReferralConsole
    expect(view.totals).toMatchObject({ claimed: 4, held: 1, flagged: 1 })
    expect(view.flagged[0]).toMatchObject({ flags: ['burst'], state: 'held' })
    // Anyone else sees no console, and cannot resolve a flag.
    expect(await ada.query(fn<'query'>('referrals:getReferralConsole'), {})).toBeNull()
    const stale = t.withIdentity({ subject: admin.userId, issuer: 'https://convex.test', email: admin.email, emailVerified: true, sessionId: admin.sessionId, [AUTH_TIME_CLAIM]: Date.now() - 2 * 60 * 60 * 1000 })
    expect(await refusal(stale.mutation(fn<'mutation'>('referrals:resolveReferral'), { id: view.flagged[0]!.id, resolution: 'release' }))).toMatchObject({ code: 'reauthentication_required' })
    const fresh = t.withIdentity({ subject: admin.userId, issuer: 'https://convex.test', email: admin.email, emailVerified: true, sessionId: admin.sessionId, [AUTH_TIME_CLAIM]: Date.now() })
    expect(await fresh.mutation(fn<'mutation'>('referrals:resolveReferral'), { id: view.flagged[0]!.id, resolution: 'release' })).toEqual({ resolved: true })
    await sweep()
    await fake.idle()
    expect(await mine(ada)).toMatchObject({ held: 0, rewarded: 1 })
    expect(freePacks()).toHaveLength(1)
  })
})

describe('the account\'s data', () => {
  test('the export carries the code, the referral that brought the account and the referrals it brought, never the other person', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    const code = await codeOf(ada)
    const grace = await friendOf(code, 'grace@example.com')
    const data = await t.query(components.backend.account.exportData, { userId: ada.userId }) as { referralCode: { code: string }, referrals: Array<Record<string, unknown>>, referredBy: unknown, accessTickets: unknown[] }
    expect(data.referralCode).toMatchObject({ code })
    expect(data.referrals).toHaveLength(1)
    expect(data.referredBy).toBeNull()
    expect(JSON.stringify(data.referrals)).not.toContain(grace.userId)
    const graceData = await t.query(components.backend.account.exportData, { userId: grace.userId }) as { referredBy: { code: string, state: string } | null }
    expect(graceData.referredBy).toMatchObject({ code, state: 'claimed' })
  })

  test('an erasure removes the code and the referrals of the account, and the slots they held', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    const code = await codeOf(ada)
    await payPro(await friendOf(code, 'grace@example.com'))
    vi.setSystemTime(Date.now() + 15 * DAY)
    await sweep()
    await fake.idle()
    expect(await mine(ada)).toMatchObject({ rewarded: 1 })
    await t.mutation(components.backend.account.forget, { userId: ada.userId })
    await t.finishAllScheduledFunctions(() => vi.runAllTimers())
    expect(await t.query(components.backend.referrals.peekCode, { userId: ada.userId })).toBeNull()
    expect(await t.query(fn<'query'>('referrals:previewReferral'), { code })).toBeNull()
    // The friend's own side goes with it: nothing is left to claim.
    const grace = await asUser(t, { email: 'linus@example.com' })
    expect(await claim(grace, code)).toEqual({ claimed: false, reason: 'invalid' })
  })
})
