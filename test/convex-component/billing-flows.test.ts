/// <reference types="vite/client" />
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { actionGeneric, componentsGeneric, defineSchema, internalMutationGeneric, internalQueryGeneric, makeFunctionReference, mutationGeneric, queryGeneric, type FunctionReference } from 'convex/server'
import { v } from 'convex/values'
import type { TestConvex } from 'convex-test'
import { PolarCore } from '@polar-sh/sdk/core.js'
import { benefitsCreate } from '@polar-sh/sdk/funcs/benefitsCreate.js'
import { productsUpdateBenefits } from '@polar-sh/sdk/funcs/productsUpdateBenefits.js'
import { syncBillingCatalog } from '../../src/cli/billing/sync'
import { createPolarFake, type PolarFake, routeToFake } from '../fixtures/polar-fake/server'
import type { BillingCatalog } from '../../src/convex/catalog'
import type { ComponentApi } from '../../src/convex/components/backend/_generated/component'
import { getBackendError } from '../../src/convex/errors'
import type { Billing } from '../../src/convex/integrations/billing/types/surface'
import type { createFunctions } from '../../src/convex/integrations/functions'
import { asUser, defineBackendTestApp } from '../../src/convex/test'
import { signingSecret } from '../helpers/secrets'

// The billing flows end to end on the fake provider: the scaffold an app
// gets, with a sandbox access token set, makes every provider call through the
// provider SDK to the fake provider, and the fake provider's signed webhooks reach
// the scaffold's own `/billing/events` route. Nothing is faked between the
// two: checkout to the entitlement cache, credits reserved, ingested and
// settled, a gift bought and claimed, a refund that voids a gift, a plan
// change and a cancellation, a trial ended by the fake provider's clock, and an
// invoice generated asynchronously. Then every state the billing section of
// /settings follows: a trial, a failed payment, a pause, a cancellation set
// for the period's end with its reason, a scheduled plan change undone, the
// checkout's id on the way back, and the native benefits a plan grants.
// And a plan's quotas, counted in the mutation that makes the thing.

const SCAFFOLD = '../fixtures/registration/backend/'
const SITE = 'http://localhost:3000'
const FAKE = 'http://127.0.0.1:4747'
// Where the fake provider posts: routed into the test deployment's http router.
const ENDPOINT = 'https://scaffold.convex.site/billing/events'
const SECRET = signingSecret()

const CATALOG: BillingCatalog = {
  meters: { credits: { eventName: 'credits', property: 'amount' } },
  plans: {
    pro: { name: 'Pro', prices: { month: 2900 }, credits: { meter: 'credits', units: 500 }, features: ['priority'], quotas: { projects: 10, exports: 2 } },
    team: { name: 'Team', prices: { month: 9900 }, features: ['priority', 'sso'], quotas: { projects: 'unlimited', exports: 5 } },
    starter: { name: 'Starter', prices: { month: 900 }, trial: { interval: 'day', count: 7 } },
  },
  packs: { credits500: { name: '500 credits', price: 2000, credits: { meter: 'credits', units: 500 } } },
  features: { priority: { description: 'Priority support' }, sso: { description: 'Single sign-on' } },
  quotas: { projects: { description: 'projects' }, exports: { description: 'exports' } },
}

// What `billing sync` writes as the fake provider's entry: its ids are the same
// on every machine (checked against a real sync in beforeEach).
vi.mock('../fixtures/registration/backend/billing.generated', async () => {
  const { stableId } = await import('../fixtures/polar-fake/state')
  const product = (key: string) => stableId('product', key)
  return {
    catalog: {
      sandbox: {
        products: { pro: product('pro'), team: product('team'), starter: product('starter'), credits500: product('credits500') },
        plans: { pro: { month: product('pro') }, team: { month: product('team') }, starter: { month: product('starter') } },
        packs: ['credits500'],
        gifts: { credits500: product('credits500-gift') },
        meters: { credits: { meterId: stableId('meter', 'credits'), eventName: 'credits', property: 'amount' } },
        quotas: { projects: 'projects', exports: 'exports' },
      },
    },
  }
})

vi.stubEnv('BILLING_ACCESS_TOKEN', 'polar_oat_fake')
// A gift's email to its recipient goes out with a key on the deployment (a test address takes it in test mode).
vi.stubEnv('EMAIL_API_KEY', 're_test_key')
vi.stubEnv('BILLING_WEBHOOK_SECRET', SECRET)
vi.stubEnv('SITE_URL', SITE)
vi.stubEnv('AUTH_SECRET', 'fake-suite-secret-0123456789abcdefghijklmnop')

const scaffold = import.meta.glob(['../fixtures/registration/backend/*.ts', '!**/convex.config.ts', '!**/auth.config.ts'])
const testApp = defineBackendTestApp(defineSchema({}), {
  ...scaffold,
  [`${SCAFFOLD}_generated/api.js`]: () => Promise.resolve({}),
  // A metered feature of the app's own: spends credits through the scaffold's billing.
  [`${SCAFFOLD}metered.ts`]: async () => {
    const { billing } = await import('../fixtures/registration/backend/billing') as { billing: { spendCredits: (ctx: unknown, event: { meter: string, value: number }) => Promise<void> } }
    return { spend: actionGeneric({ args: { value: v.number() }, handler: (ctx, { value }) => billing.spendCredits(ctx, { meter: 'credits', value }) }) }
  },
  // Functions behind a plan's feature, on the withFeature tier the scaffold's functions.ts ships.
  [`${SCAFFOLD}gated.ts`]: async () => {
    // The fixture is typed from the built package, whose `Billing` leaves out the @internal members.
    const { billing } = await import('../fixtures/registration/backend/billing') as unknown as { billing: Billing }
    const { withFeature } = await import('../fixtures/registration/backend/functions') as { withFeature: ReturnType<typeof createFunctions>['withFeature'] }
    return {
      sso: withFeature('sso').query({ args: {}, handler: async ctx => ctx.workspace.id }),
      prioritySupport: withFeature('priority').action({ args: {}, handler: async () => 'ran' }),
      has: queryGeneric({ args: { feature: v.string() }, handler: (ctx, { feature }) => billing.hasFeature(ctx, feature) }),
      require: mutationGeneric({ args: { feature: v.string() }, handler: async (ctx, { feature }) => {
        await billing.requireFeature(ctx, feature)
        return null
      } }),
      // An entity the server chose itself, as a cron or a webhook handler checks one: no caller at all.
      hasFor: internalQueryGeneric({ args: { userId: v.string(), feature: v.string() }, handler: (ctx, { userId, feature }) => billing.hasFeature(ctx, feature, { userId }) }),
      requireFor: internalMutationGeneric({ args: { userId: v.string(), feature: v.string() }, handler: async (ctx, { userId, feature }) => {
        await billing.requireFeature(ctx, feature, { userId })
        return null
      } }),
    }
  },
  // A plan's quotas, counted where an app makes and removes the thing.
  [`${SCAFFOLD}projects.ts`]: async () => {
    // The fixture is typed from the built package, whose `Billing` leaves out the @internal members.
    const { billing } = await import('../fixtures/registration/backend/billing') as unknown as { billing: Billing }
    const vQuota = { quota: v.optional(v.string()), amount: v.optional(v.number()) }
    return {
      create: mutationGeneric({ args: vQuota, handler: (ctx, { quota, amount }) => billing.requireQuota(ctx, quota ?? 'projects', amount) }),
      remove: mutationGeneric({ args: vQuota, handler: (ctx, { quota, amount }) => billing.releaseQuota(ctx, quota ?? 'projects', amount) }),
      // Claimed, then the write after it fails: the claim goes with it.
      createThenFail: mutationGeneric({ args: {}, handler: async (ctx) => {
        await billing.requireQuota(ctx, 'projects')
        throw new Error('the insert failed')
      } }),
      inAction: actionGeneric({ args: {}, handler: ctx => billing.requireQuota(ctx, 'projects') }),
      // A query's context passes the types' structural check, never the runtime one.
      inQuery: queryGeneric({ args: {}, handler: ctx => billing.requireQuota(ctx as never, 'projects') }),
      quota: queryGeneric({ args: { quota: v.string() }, handler: (ctx, { quota }) => billing.getQuota(ctx, quota) }),
      createFor: internalMutationGeneric({ args: { userId: v.string() }, handler: (ctx, { userId }) => billing.requireQuota(ctx, 'projects', 1, { userId }) }),
      forget: internalMutationGeneric({ args: { userId: v.string() }, handler: async (ctx, { userId }) => {
        await billing.forgetEntity(ctx, userId)
        return null
      } }),
    }
  },
  // A plan change the app's server schedules for the period's end: a client may not pick that proration.
  [`${SCAFFOLD}plans.ts`]: async () => {
    const { billing } = await import('../fixtures/registration/backend/billing') as { billing: { updateSubscription: (ctx: unknown, options: { productId: string, proration: 'next_period' }) => Promise<unknown> } }
    return { changeAtPeriodEnd: actionGeneric({ args: { productId: v.string() }, handler: async (ctx, { productId }) => {
      await billing.updateSubscription(ctx, { productId, proration: 'next_period' })
      return null
    } }) }
  },
})

const fn = <Kind extends 'query' | 'mutation' | 'action'>(path: string) => makeFunctionReference<Kind>(path) as FunctionReference<Kind, 'public'>
const components = componentsGeneric() as unknown as { backend: ComponentApi<'backend'> }

let t: TestConvex<ReturnType<typeof defineSchema>>
let fake: PolarFake
let ids: Awaited<ReturnType<typeof syncBillingCatalog>>['ids']

beforeAll(() => {
  // Only the timers: scheduled follow-up work (a gift's email) never runs, and
  // the fake provider's own deliveries still go out on setImmediate.
  vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval'] })
  for (const level of ['log', 'info', 'warn'] as const) vi.spyOn(console, level).mockImplementation(() => {})
})

afterAll(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

beforeEach(async () => {
  t = testApp()
  const app = t
  fake = createPolarFake({
    baseUrl: FAKE,
    fetcher: (url, init) => app.fetch(new URL(url).pathname, { method: 'POST', headers: init.headers, body: init.body as string }),
  })
  vi.stubGlobal('fetch', routeToFake(fake, FAKE))
  // As `nuxt-backend dev` does: the endpoint with the deployment's secret, then the catalog.
  fake.ensureEndpoint(ENDPOINT, SECRET)
  ids = (await syncBillingCatalog(CATALOG, { rootDir: '.', environment: 'sandbox', accessToken: 'polar_oat_fake', dryRun: false, adopt: {} })).ids
  await fake.idle()
})

afterEach(async () => {
  await fake.idle()
  fake.close()
  vi.unstubAllGlobals()
})

/** Pay a checkout on its page, then let its events land. */
async function pay(url: string): Promise<string | null> {
  const response = await fake.handle(new Request(`${url}/pay`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'origin': FAKE } }))
  await fake.idle()
  return response.headers.get('location')
}

type Caller = Awaited<ReturnType<typeof asUser>>

/** The feature keys the caller's plan grants, as `useFeatures` reads them. */
async function features(caller: Caller): Promise<string[]> {
  const read = await caller.query(fn<'query'>('billing:getFeatures'), {}) as { benefits: Array<{ metadata: { key?: string } }> } | null
  return (read?.benefits ?? []).flatMap(benefit => benefit.metadata.key ?? []).sort()
}

/** The caller's credit balance, as `useCredits` reads it. */
async function balance(caller: Caller): Promise<number | undefined> {
  return (await caller.query(fn<'query'>('billing:getCredits'), {}) as { meters: Array<{ balance: number }> } | null)?.meters[0]?.balance
}

const checkout = (productId: string) => ({ productIds: [productId], origin: SITE, successUrl: `${SITE}/billing?checkout_id={CHECKOUT_ID}` })

async function subscribed(productId = ids.products.pro!) {
  const ada = await asUser(t, { email: 'ada@example.com' })
  const { url } = await ada.action(fn<'action'>('billing:generateCheckoutLink'), checkout(productId))
  expect(url).toMatch(`${FAKE}/checkout/`)
  expect(await pay(url)).toMatch(`${SITE}/billing?checkout_id=`)
  return ada
}

describe('billing on the fake provider, end to end', () => {
  test('a catalog synced to the fake provider is the generated `sandbox` entry, and its products reach the deployment as webhooks', async () => {
    const { catalog } = await import('../fixtures/registration/backend/billing.generated') as { catalog: { sandbox: unknown } }
    expect(ids).toEqual(catalog.sandbox)
    const products = await t.query(fn<'query'>('billing:getConfiguredProducts'), {}) as Record<string, { name: string } | undefined>
    expect(products.pro?.name).toBe('Pro')
    expect(products.credits500?.name).toBe('500 credits')
    // The product sync reads the provider's sandbox, which here is the fake provider: every product comes back.
    await t.action(makeFunctionReference<'action'>('billing:syncProducts'), {})
    const synced = await t.query(fn<'query'>('billing:getConfiguredProducts'), {}) as Record<string, { name: string } | undefined>
    expect(synced.pro?.name).toBe('Pro')
    expect(synced.credits500?.name).toBe('500 credits')
  })

  test('a paid checkout fills the entitlement cache: the plan, its features and its credits', async () => {
    const ada = await subscribed()
    const subscription = await ada.query(fn<'query'>('billing:getCurrentSubscription'), {}) as { productId: string, status: string }
    expect(subscription).toMatchObject({ productId: ids.products.pro, status: 'active' })
    // The plan's feature, and its credits' own benefit key.
    expect(await features(ada)).toEqual(['priority', 'pro-credits', 'pro-quotas'])
    expect(await balance(ada)).toBe(500)
  })

  test('credits are reserved, ingested and settled: the cache and the fake provider agree', async () => {
    const ada = await subscribed()
    await ada.action(fn<'action'>('metered:spend'), { value: 7 })
    expect(await balance(ada)).toBe(493)
    const meter = Object.values(fake.state.customerMeters)[0]!
    expect(fake.state.events).toEqual([expect.objectContaining({ name: 'credits', metadata: expect.objectContaining({ amount: 7 }) })])
    // A refresh reads the provider's truth back: the same balance.
    await ada.action(fn<'action'>('billing:syncEntitlements'), {})
    expect(await balance(ada)).toBe(493)
    expect(meter.credited).toBe(500)
    // More than the balance is refused before anything reaches the provider.
    const refused = await ada.action(fn<'action'>('metered:spend'), { value: 1000 }).catch((error: unknown) => getBackendError(error))
    expect(refused).toMatchObject({ code: 'insufficient_credits' })
  })

  test('a gift is bought, paid and claimed: the recipient holds the credits through a $0 checkout the server confirms', async () => {
    const ada = await subscribed()
    const { url } = await ada.action(fn<'action'>('billing:giftCheckout'), { pack: 'credits500', recipientEmail: 'delivered+gift@resend.dev', origin: SITE, successUrl: `${SITE}/gifts` })
    await pay(url)
    const recipient = await asUser(t, { email: 'delivered+gift@resend.dev' })
    const [gift] = await recipient.query(fn<'query'>('billing:getReceivedGifts'), {}) as Array<{ id: string, status: string }>
    expect(gift).toMatchObject({ status: 'paid' })
    expect(await recipient.action(fn<'action'>('billing:claimGift'), { giftId: gift!.id })).toEqual({ url: null })
    await fake.idle()
    expect((await recipient.query(fn<'query'>('billing:getReceivedGifts'), {}) as Array<{ status: string }>)[0]?.status).toBe('claimed')
    expect(await balance(recipient)).toBe(500)
    // The single-use discount is spent: the provider counted its one redemption.
    expect(Object.values(fake.state.discounts)).toEqual([expect.objectContaining({ basisPoints: 10_000, redemptionsCount: 1 })])
  })

  test('a refund before the claim voids the gift: its discount ends, and the recipient is refused', async () => {
    const ada = await subscribed()
    const { url } = await ada.action(fn<'action'>('billing:giftCheckout'), { pack: 'credits500', recipientEmail: 'delivered+refund@resend.dev', origin: SITE, successUrl: `${SITE}/gifts` })
    await pay(url)
    const giftOrder = Object.values(fake.state.orders).find(order => order.productId === ids.gifts!.credits500)!
    const admin = await asUser(t, { email: 'admin@example.com', role: 'admin' })
    await admin.action(fn<'action'>('billing:refundOrder'), { orderId: giftOrder.id, reason: 'customer_request' })
    await fake.idle()
    expect(Object.values(fake.state.discounts)).toEqual([expect.objectContaining({ deleted: true })])
    const recipient = await asUser(t, { email: 'delivered+refund@resend.dev' })
    const [gift] = await recipient.query(fn<'query'>('billing:getReceivedGifts'), {}) as Array<{ id: string }>
    // A refunded gift no longer shows as one to receive.
    expect(gift).toBeUndefined()
    const refused = await recipient.action(fn<'action'>('billing:claimGift'), { giftId: String(giftOrder.metadata.giftId) }).catch((error: unknown) => getBackendError(error))
    expect(refused).toMatchObject({ code: 'forbidden', data: { reason: 'gift_refunded' } })
  })

  test('a plan change and a cancellation reach the cache through the subscription webhooks', async () => {
    const ada = await subscribed()
    await ada.action(fn<'action'>('billing:updateSubscription'), { productId: ids.products.team })
    await fake.idle()
    expect(await ada.query(fn<'query'>('billing:getCurrentSubscription'), {})).toMatchObject({ productId: ids.products.team })
    expect(await features(ada)).toEqual(['priority', 'sso', 'team-quotas'])
    await ada.action(fn<'action'>('billing:cancelSubscription'), {})
    await fake.idle()
    expect(await ada.query(fn<'query'>('billing:getCurrentSubscription'), {})).toMatchObject({ cancelAtPeriodEnd: true })
    await ada.action(fn<'action'>('billing:uncancelSubscription'), {})
    await ada.action(fn<'action'>('billing:cancelSubscription'), { atPeriodEnd: false })
    await fake.idle()
    expect(await features(ada)).toEqual([])
  })

  test('a trial ends on the fake provider\'s clock: the subscription turns active and its first period is charged', async () => {
    const ada = await subscribed(ids.products.starter!)
    expect(await ada.query(fn<'query'>('billing:getCurrentSubscription'), {})).toMatchObject({ status: 'trialing' })
    const response = await fake.handle(new Request(`${FAKE}/_fake/clock`, { method: 'POST', body: JSON.stringify({ action: 'end-trial' }) }))
    expect(await response.json()).toEqual({ changed: 1 })
    await fake.idle()
    expect(await ada.query(fn<'query'>('billing:getCurrentSubscription'), {})).toMatchObject({ status: 'active' })
    expect(Object.values(fake.state.orders).map(order => [order.billingReason, order.subtotalAmount])).toEqual(expect.arrayContaining([['subscription_create', 0], ['subscription_cycle', 900]]))
  })

  test('the portal opens on the fake provider, and an invoice is there the second time it is asked for', async () => {
    const ada = await subscribed()
    const { url } = await ada.action(fn<'action'>('billing:generateCustomerPortalUrl'), { returnUrl: `${SITE}/billing` }) as { url: string }
    expect(url).toMatch(`${FAKE}/portal/`)
    const { items } = await ada.action(fn<'action'>('billing:getOrders'), {}) as { items: Array<{ id: string }> }
    expect(await ada.action(fn<'action'>('billing:getInvoiceUrl'), { orderId: items[0]!.id })).toBeNull()
    expect(await ada.action(fn<'action'>('billing:getInvoiceUrl'), { orderId: items[0]!.id })).toEqual({ url: `${FAKE}/invoices/${items[0]!.id}` })
  })
})

/** Move the fake provider's clock for every subscription due: a renewal, a trial's end, a failed payment. */
async function clock(action: 'renew' | 'end-trial' | 'fail-payment'): Promise<void> {
  await fake.handle(new Request(`${FAKE}/_fake/clock`, { method: 'POST', body: JSON.stringify({ action }) }))
  await fake.idle()
}

/** The caller's current subscription, as `useBilling` reads it. */
const current = (caller: Caller) => caller.query(fn<'query'>('billing:getCurrentSubscription'), {}) as Promise<Record<string, unknown> | null>

describe('the billing section\'s states, on the fake provider', () => {
  test('a checkout comes back with its id, whatever success URL the caller sent', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    const { url } = await ada.action(fn<'action'>('billing:generateCheckoutLink'), { productIds: [ids.products.pro!], origin: SITE, successUrl: `${SITE}/settings#plan` })
    const checkoutId = url.split('/').at(-1)
    expect(await pay(url)).toBe(`${SITE}/settings?checkout_return=${checkoutId}#plan`)
  })

  test('an app\'s own checkout_id comes back filled in beside the package\'s', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    const { url } = await ada.action(fn<'action'>('billing:generateCheckoutLink'), { productIds: [ids.products.pro!], origin: SITE, successUrl: `${SITE}/thanks?checkout_id={CHECKOUT_ID}` })
    const checkoutId = url.split('/').at(-1)
    expect(await pay(url)).toBe(`${SITE}/thanks?checkout_id=${checkoutId}&checkout_return=${checkoutId}`)
  })

  test('a trial reads as trialing until its end, and a failed payment as past due until a renewal pays', async () => {
    const ada = await subscribed(ids.products.starter!)
    expect(await current(ada)).toMatchObject({ status: 'trialing', trialEnd: expect.any(String) })
    await clock('end-trial')
    await clock('fail-payment')
    // Past due is still the plan: the section asks for a new payment method, not a new plan.
    expect(await current(ada)).toMatchObject({ status: 'past_due', productId: ids.products.starter })
    await clock('renew')
    expect(await current(ada)).toMatchObject({ status: 'active' })
  })

  test('a cancellation carries the provider\'s own reason, once, and keeping the plan clears it', async () => {
    const ada = await subscribed()
    await ada.action(fn<'action'>('billing:cancelSubscription'), { reason: 'too_expensive', comment: 'Over budget this quarter' })
    await fake.idle()
    expect(await current(ada)).toMatchObject({ cancelAtPeriodEnd: true, customerCancellationReason: 'too_expensive', customerCancellationComment: 'Over budget this quarter' })
    // The provider takes one cancellation: a second, with another reason, is refused, and says so
    // rather than as an outage to retry.
    const again = await ada.action(fn<'action'>('billing:cancelSubscription'), { reason: 'unused' }).catch((error: unknown) => getBackendError(error))
    expect(again).toMatchObject({ code: 'invalid_input', data: { field: 'subscriptionId', reason: 'cancel_scheduled' } })
    await ada.action(fn<'action'>('billing:uncancelSubscription'), {})
    await fake.idle()
    expect(await current(ada)).toMatchObject({ cancelAtPeriodEnd: false, customerCancellationReason: null })
    // Nothing left to undo.
    const none = await ada.action(fn<'action'>('billing:uncancelSubscription'), {}).catch((error: unknown) => getBackendError(error))
    expect(none).toMatchObject({ code: 'invalid_input', data: { field: 'subscriptionId', reason: 'no_cancel_scheduled' } })
  })

  test('a plan change scheduled for the period\'s end reads back, and cancelling it keeps the plan', async () => {
    const ada = await subscribed()
    await ada.action(fn<'action'>('plans:changeAtPeriodEnd'), { productId: ids.products.team! })
    await fake.idle()
    expect((await current(ada))?.pendingChange).toMatchObject({ productId: ids.products.team })
    await ada.action(fn<'action'>('billing:cancelPendingChange'), {})
    await fake.idle()
    expect(await current(ada)).toMatchObject({ productId: ids.products.pro, pendingChange: null })
    // Nothing left to cancel: refused before the provider is asked.
    const none = await ada.action(fn<'action'>('billing:cancelPendingChange'), {}).catch((error: unknown) => getBackendError(error))
    expect(none).toMatchObject({ code: 'invalid_input', data: { field: 'subscriptionId', reason: 'no_change_scheduled' } })
    // The period ends on the plan it had.
    await clock('renew')
    expect(await current(ada)).toMatchObject({ productId: ids.products.pro })
  })

  test('a pause takes effect when the period ends, and resuming starts a new, charged period', async () => {
    const ada = await subscribed()
    await ada.action(fn<'action'>('billing:pauseSubscription'), {})
    await clock('renew')
    expect(await current(ada)).toMatchObject({ status: 'paused' })
    const charges = Object.keys(fake.state.orders).length
    await ada.action(fn<'action'>('billing:resumeSubscription'), {})
    await fake.idle()
    expect(await current(ada)).toMatchObject({ status: 'active' })
    expect(Object.keys(fake.state.orders)).toHaveLength(charges + 1)
  })

  test('the native benefits a plan grants read back in neutral words, by name, with what each grant holds', async () => {
    const polar = new PolarCore({ accessToken: 'polar_oat_fake', server: 'sandbox' })
    const created = await Promise.all([
      benefitsCreate(polar, { type: 'license_keys', description: 'Desktop license', properties: { prefix: 'APP' } }),
      benefitsCreate(polar, { type: 'downloadables', description: 'Templates', properties: { files: ['file_1', 'file_2'] } }),
      benefitsCreate(polar, { type: 'discord', description: 'Community', properties: { guildToken: 'guild-token', roleId: 'role_1', kickMember: false } }),
      benefitsCreate(polar, { type: 'github_repository', description: 'Source access', properties: { repositoryOwner: 'acme', repositoryName: 'app', permission: 'pull' } }),
    ])
    const native = created.map(result => (result.ok ? result.value.id : ''))
    const pro = ids.products.pro!
    await productsUpdateBenefits(polar, { id: pro, productBenefitsUpdate: { benefits: [...fake.state.products[pro]!.benefitIds, ...native] } })
    await fake.idle()
    const ada = await subscribed()
    const { benefits } = await ada.query(fn<'query'>('billing:getFeatures'), {}) as { benefits: Array<Record<string, unknown>> }
    const byKind = Object.fromEntries(benefits.map(benefit => [benefit.kind, benefit]))
    expect(Object.keys(byKind).sort()).toEqual(['community', 'credits', 'download', 'feature', 'license_key', 'repository'])
    // The provider's own type stays beside the neutral kind.
    expect(byKind.license_key).toMatchObject({ type: 'license_keys', name: 'Desktop license', licenseKey: expect.stringMatching(/^\*{4}-[0-9A-F]{6}$/), grantedAt: expect.any(Number) })
    expect(byKind.download).toMatchObject({ name: 'Templates', files: 2 })
    expect(byKind.repository).toMatchObject({ name: 'Source access', repository: 'acme/app' })
    expect(byKind.community).toMatchObject({ name: 'Community' })
    // The plan's feature, and the feature-flag benefit carrying its quotas.
    expect(benefits.filter(benefit => benefit.kind === 'feature').map(benefit => benefit.name).sort()).toEqual(['Priority support', 'Pro limits'])
    // Nothing of a grant's account or server ids reaches the app.
    expect(JSON.stringify(benefits)).not.toMatch(/guild|role_1|accountId/)
  })
})

describe('feature gates on the server, on the fake provider', () => {
  const refusal = (promise: Promise<unknown>) => promise.then(() => null, (error: unknown) => getBackendError(error))

  test('a workspace on no plan is refused feature_required, with the plans on sale that include the feature, in pricing order', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    expect(await ada.query(fn<'query'>('gated:has'), { feature: 'priority' })).toBe(false)
    expect(await refusal(ada.mutation(fn<'mutation'>('gated:require'), { feature: 'priority' })))
      .toMatchObject({ code: 'feature_required', data: { feature: 'priority', plans: ['pro', 'team'] } })
    expect(await refusal(ada.query(fn<'query'>('gated:sso'), {}))).toMatchObject({ code: 'feature_required', data: { feature: 'sso', plans: ['team'] } })
    // A key no plan on sale grants names none.
    expect(await refusal(ada.mutation(fn<'mutation'>('gated:require'), { feature: 'audit' }))).toMatchObject({ code: 'feature_required', data: { plans: [] } })
  })

  test('a paid plan unlocks its features and no other, for every member, and a plan change moves the gate', async () => {
    const ada = await subscribed()
    expect(await ada.query(fn<'query'>('gated:has'), { feature: 'priority' })).toBe(true)
    expect(await ada.action(fn<'action'>('gated:prioritySupport'), {})).toBe('ran')
    expect(await refusal(ada.query(fn<'query'>('gated:sso'), {}))).toMatchObject({ code: 'feature_required', data: { plans: ['team'] } })
    // The keys useFeatures() matches in the browser are the keys the server matches.
    expect(await features(ada)).toEqual(['priority', 'pro-credits', 'pro-quotas'])
    // One name per benefit: not another metadata value (every managed benefit carries managedBy), nor its id.
    expect(await ada.query(fn<'query'>('gated:has'), { feature: 'nuxt-backend' })).toBe(false)
    const priorityId = Object.values(fake.state.benefits).find(benefit => benefit.metadata.key === 'priority')!.id
    expect(await ada.query(fn<'query'>('gated:has'), { feature: priorityId })).toBe(false)
    // A member of the workspace shares its plan.
    const grace = await asUser(t, { email: 'grace@example.com', workspace: ada.workspaceId })
    expect(await grace.action(fn<'action'>('gated:prioritySupport'), {})).toBe('ran')

    await ada.action(fn<'action'>('billing:updateSubscription'), { productId: ids.products.team })
    await fake.idle()
    expect(await ada.query(fn<'query'>('gated:sso'), {})).toBe(ada.workspaceId)
  })

  test('reads the entitlement cache, never the provider, on a pass and on a refusal', async () => {
    const ada = await subscribed()
    const delegate = globalThis.fetch
    const calls = vi.fn(delegate)
    vi.stubGlobal('fetch', calls)
    expect(await ada.action(fn<'action'>('gated:prioritySupport'), {})).toBe('ran')
    expect(await refusal(ada.mutation(fn<'mutation'>('gated:require'), { feature: 'sso' }))).toMatchObject({ code: 'feature_required' })
    expect(calls).not.toHaveBeenCalled()
  })

  test('refuses who may not act at all for that, never as feature_required', async () => {
    expect(await t.query(fn<'query'>('gated:has'), { feature: 'priority' })).toBe(false)
    expect(await refusal(t.query(fn<'query'>('gated:sso'), {}))).toMatchObject({ code: 'unauthenticated' })
    const loner = await asUser(t, { email: 'loner@example.com', workspace: false })
    expect(await refusal(loner.mutation(fn<'mutation'>('gated:require'), { feature: 'priority' }))).toMatchObject({ code: 'no_workspace' })
  })

  test('a member removed from a paid workspace, whose token still names it, is refused as no member, never offered an upgrade', async () => {
    const ada = await subscribed()
    const grace = await asUser(t, { email: 'grace@example.com', workspace: ada.workspaceId })
    expect(await grace.query(fn<'query'>('gated:has'), { feature: 'priority' })).toBe(true)
    await t.mutation(components.backend.adapter.deleteOne, {
      input: { model: 'member', where: [{ field: 'userId', value: grace.userId }, { field: 'organizationId', value: ada.workspaceId! }] },
    } as never)
    expect(await grace.query(fn<'query'>('gated:has'), { feature: 'priority' })).toBe(false)
    for (const call of [
      grace.mutation(fn<'mutation'>('gated:require'), { feature: 'priority' }),
      grace.action(fn<'action'>('gated:prioritySupport'), {}),
      grace.query(fn<'query'>('gated:sso'), {}),
    ]) {
      expect(await refusal(call)).toMatchObject({ code: 'forbidden', data: { reason: 'not_member' } })
    }
  })

  test('with { userId }, checks the entity the server chose, whoever calls: a paid workspace has its features, another is refused with the plans', async () => {
    const ada = await subscribed()
    const bob = await asUser(t, { email: 'bob@example.com' })
    // No identity at all: the entity is the server's choice, not the caller's.
    expect(await t.query(fn<'query'>('gated:hasFor'), { userId: ada.workspaceId!, feature: 'priority' })).toBe(true)
    expect(await t.query(fn<'query'>('gated:hasFor'), { userId: ada.workspaceId!, feature: 'sso' })).toBe(false)
    expect(await t.query(fn<'query'>('gated:hasFor'), { userId: bob.workspaceId!, feature: 'priority' })).toBe(false)
    // A caller of its own changes nothing: bob, on no plan, asks about ada's workspace.
    expect(await bob.query(fn<'query'>('gated:hasFor'), { userId: ada.workspaceId!, feature: 'priority' })).toBe(true)
    expect(await t.mutation(fn<'mutation'>('gated:requireFor'), { userId: ada.workspaceId!, feature: 'priority' })).toBeNull()
    expect(await refusal(t.mutation(fn<'mutation'>('gated:requireFor'), { userId: bob.workspaceId!, feature: 'priority' })))
      .toMatchObject({ code: 'feature_required', data: { feature: 'priority', plans: ['pro', 'team'] } })
  })

  test('an empty feature is none: no for hasFeature, invalid_input for requireFeature', async () => {
    const ada = await subscribed()
    expect(await ada.query(fn<'query'>('gated:has'), { feature: '' })).toBe(false)
    expect(await refusal(ada.mutation(fn<'mutation'>('gated:require'), { feature: '' }))).toMatchObject({ code: 'invalid_input', data: { field: 'feature' } })
  })
})

describe('plan quotas, on the fake provider', () => {
  const refusal = (promise: Promise<unknown>) => promise.then(() => null, (error: unknown) => getBackendError(error))
  const quotas = async (caller: Caller) => (await caller.query(fn<'query'>('billing:getFeatures'), {}) as { quotas: Record<string, unknown> } | null)?.quotas
  /** The projects quota as every read answers it: named as the catalog's description says. */
  const projects = (limit: number | 'unlimited', used: number) => ({ limit, used, description: 'projects' })
  const exports = (limit: number, used: number) => ({ limit, used, description: 'exports' })

  test('a workspace on no plan holds none of any quota: every declared one reads 0, and a claim is refused with the plans that allow one', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    expect(await quotas(ada)).toEqual({ projects: projects(0, 0), exports: exports(0, 0) })
    expect(await refusal(ada.mutation(fn<'mutation'>('projects:create'), {})))
      .toMatchObject({ code: 'quota_exceeded', data: { quota: 'projects', limit: 0, used: 0, amount: 1, plans: ['pro', 'team'] } })
    expect(await ada.query(fn<'query'>('projects:quota'), { quota: 'projects' })).toEqual(projects(0, 0))
  })

  test('a plan\'s limit counts each claim in the creating mutation, refuses the one past it with the plans that allow more, and a release makes room again', async () => {
    const ada = await subscribed()
    expect(await ada.mutation(fn<'mutation'>('projects:create'), { amount: 9 })).toEqual(projects(10, 9))
    expect(await ada.mutation(fn<'mutation'>('projects:create'), {})).toEqual(projects(10, 10))
    expect(await refusal(ada.mutation(fn<'mutation'>('projects:create'), {})))
      .toMatchObject({ code: 'quota_exceeded', data: { quota: 'projects', limit: 10, used: 10, amount: 1, plans: ['team'] } })
    expect(await quotas(ada)).toEqual({ projects: projects(10, 10), exports: exports(2, 0) })
    // A member shares the workspace's count.
    const grace = await asUser(t, { email: 'grace@example.com', workspace: ada.workspaceId })
    expect(await grace.mutation(fn<'mutation'>('projects:remove'), { amount: 3 })).toEqual(projects(10, 7))
    expect(await grace.mutation(fn<'mutation'>('projects:create'), { amount: 3 })).toEqual(projects(10, 10))
    // A release never goes below nothing, so it never opens room the plan did not give.
    expect(await ada.mutation(fn<'mutation'>('projects:remove'), { amount: 50 })).toEqual(projects(10, 0))
    expect(await ada.mutation(fn<'mutation'>('projects:create'), { amount: 10 })).toEqual(projects(10, 10))
  })

  test('a refused claim counts nothing, and neither does one whose mutation fails after it', async () => {
    const ada = await subscribed()
    await refusal(ada.mutation(fn<'mutation'>('projects:create'), { amount: 11 }))
    await refusal(ada.mutation(fn<'mutation'>('projects:createThenFail'), {}))
    expect(await ada.query(fn<'query'>('projects:quota'), { quota: 'projects' })).toEqual(projects(10, 0))
  })

  test('a plan change moves the limit, and unlimited allows any number, only where the catalog says so', async () => {
    const ada = await subscribed()
    await ada.mutation(fn<'mutation'>('projects:create'), { amount: 10 })
    await ada.action(fn<'action'>('billing:updateSubscription'), { productId: ids.products.team })
    await fake.idle()
    expect(await ada.mutation(fn<'mutation'>('projects:create'), { amount: 500 })).toEqual(projects('unlimited', 510))
    // Its other quota is still a number.
    expect(await refusal(ada.mutation(fn<'mutation'>('projects:create'), { quota: 'exports', amount: 6 }))).toMatchObject({ code: 'quota_exceeded', data: { limit: 5, plans: [] } })
    // Back down below what is held: nothing more fits until enough is released.
    await ada.action(fn<'action'>('billing:updateSubscription'), { productId: ids.products.pro })
    await fake.idle()
    expect(await quotas(ada)).toMatchObject({ projects: { limit: 10, used: 510 } })
    expect(await refusal(ada.mutation(fn<'mutation'>('projects:create'), {}))).toMatchObject({ code: 'quota_exceeded', data: { limit: 10, used: 510, plans: ['team'] } })
  })

  test('a limit billing sync changes reaches every subscriber at once, through the provider\'s own event', async () => {
    const ada = await subscribed()
    await ada.mutation(fn<'mutation'>('projects:create'), { amount: 10 })
    await syncBillingCatalog({ ...CATALOG, plans: { ...CATALOG.plans, pro: { ...CATALOG.plans!.pro!, quotas: { projects: 25, exports: 2 } } } }, { rootDir: '.', environment: 'sandbox', accessToken: 'polar_oat_fake', dryRun: false, adopt: {} })
    await fake.idle()
    expect(await ada.mutation(fn<'mutation'>('projects:create'), {})).toEqual(projects(25, 11))
  })

  test('reads the entitlement cache and the counter, never the provider, on a claim and on a refusal', async () => {
    const ada = await subscribed()
    const calls = vi.fn(globalThis.fetch)
    vi.stubGlobal('fetch', calls)
    await ada.mutation(fn<'mutation'>('projects:create'), { amount: 10 })
    expect(await refusal(ada.mutation(fn<'mutation'>('projects:create'), {}))).toMatchObject({ code: 'quota_exceeded' })
    expect(calls).not.toHaveBeenCalled()
  })

  test('refuses an action, a quota that counts people and an amount that is no whole number, and a caller who may not act, as they are', async () => {
    const ada = await subscribed()
    await expect(ada.action(fn<'action'>('projects:inAction'), {})).rejects.toThrow(/in the mutation that makes or removes the thing/)
    await expect(ada.query(fn<'query'>('projects:inQuery'), {})).rejects.toThrow(/not in an action or a query/)
    await expect(ada.mutation(fn<'mutation'>('projects:create'), { quota: 'members' })).rejects.toThrow(/counts people/)
    await expect(ada.query(fn<'query'>('projects:quota'), { quota: 'seats' })).rejects.toThrow(/never priced per seat/)
    for (const amount of [0, -1, 1.5]) {
      expect(await refusal(ada.mutation(fn<'mutation'>('projects:create'), { amount }))).toMatchObject({ code: 'invalid_input', data: { field: 'amount' } })
    }
    expect(await refusal(ada.mutation(fn<'mutation'>('projects:create'), { quota: '' }))).toMatchObject({ code: 'invalid_input', data: { field: 'quota' } })
    expect(await refusal(t.mutation(fn<'mutation'>('projects:create'), {}))).toMatchObject({ code: 'unauthenticated' })
    expect(await t.query(fn<'query'>('projects:quota'), { quota: 'projects' })).toEqual(projects(0, 0))
  })

  test('with { userId }, counts the entity the server chose, and forgetting an entity clears its counts', async () => {
    const ada = await subscribed()
    expect(await t.mutation(fn<'mutation'>('projects:createFor'), { userId: ada.workspaceId! })).toEqual(projects(10, 1))
    expect(await ada.query(fn<'query'>('projects:quota'), { quota: 'projects' })).toEqual(projects(10, 1))
    await t.mutation(fn<'mutation'>('projects:forget'), { userId: ada.workspaceId! })
    await ada.action(fn<'action'>('billing:syncEntitlements'), {})
    expect(await ada.query(fn<'query'>('projects:quota'), { quota: 'projects' })).toEqual(projects(10, 0))
  })

  test('forgetting an entity clears every count it made, one for a quota no grant or catalog names any more included', async () => {
    const ada = await subscribed()
    const sync = (pro: Record<string, number | 'unlimited'>) => syncBillingCatalog(
      { ...CATALOG, quotas: { ...CATALOG.quotas, sites: { description: 'sites' } }, plans: { ...CATALOG.plans, pro: { ...CATALOG.plans!.pro!, quotas: pro } } },
      { rootDir: '.', environment: 'sandbox', accessToken: 'polar_oat_fake', dryRun: false, adopt: {} },
    )
    // A quota the deployment's map never heard of, granted by the plan for a while.
    await sync({ projects: 10, exports: 2, sites: 3 })
    await fake.idle()
    expect(await ada.mutation(fn<'mutation'>('projects:create'), { quota: 'sites', amount: 2 })).toEqual({ limit: 3, used: 2 })
    // Dropped again: no grant names it, and getFeatures no longer reports it.
    await sync({ projects: 10, exports: 2 })
    await fake.idle()
    expect(await quotas(ada)).not.toHaveProperty('sites')
    await t.mutation(fn<'mutation'>('projects:forget'), { userId: ada.workspaceId! })
    // Granted once more, it starts from nothing: the count went with the entity.
    await sync({ projects: 10, exports: 2, sites: 3 })
    await fake.idle()
    await ada.action(fn<'action'>('billing:syncEntitlements'), {})
    expect(await ada.query(fn<'query'>('projects:quota'), { quota: 'sites' })).toEqual({ limit: 3, used: 0 })
  })

  test('what storage keeps under a quota key is the same number every read shows, beside the claims the app counts itself', async () => {
    const ada = await subscribed()
    expect(await ada.mutation(fn<'mutation'>('projects:create'), { amount: 2 })).toEqual(projects(10, 2))
    // Storage registers its file count under the catalog's key with each file it keeps; its holder is the billing entity.
    const keep = () => t.mutation(components.backend.storage.store, {
      bytes: new ArrayBuffer(8),
      contentType: 'image/png',
      owner: { userId: ada.userId!, workspaceId: ada.workspaceId! },
      holder: ada.workspaceId!,
      limits: {},
      counters: { files: 'projects' },
    })
    await keep()
    await keep()
    await keep()
    expect(await quotas(ada)).toEqual({ projects: projects(10, 5), exports: exports(2, 0) })
    expect(await ada.query(fn<'query'>('projects:quota'), { quota: 'projects' })).toEqual(projects(10, 5))
    // A claim of the app's own fits what is left, and a release gives back only its own.
    expect(await ada.mutation(fn<'mutation'>('projects:create'), { amount: 5 })).toEqual(projects(10, 10))
    expect(await refusal(ada.mutation(fn<'mutation'>('projects:create'), {})))
      .toMatchObject({ code: 'quota_exceeded', data: { quota: 'projects', limit: 10, used: 10, amount: 1, plans: ['team'] } })
    expect(await ada.mutation(fn<'mutation'>('projects:remove'), { amount: 50 })).toEqual(projects(10, 3))
  })

  test('getPricing lists each plan\'s quotas, and keeps the benefit carrying them out of its features', async () => {
    const { plans } = await t.query(fn<'query'>('billing:getPricing'), {}) as { plans: Array<{ key: string, quotas: unknown, features: string[] }> }
    expect(plans.map(plan => [plan.key, plan.quotas, plan.features])).toEqual([
      ['pro', { projects: 10, exports: 2 }, ['Priority support']],
      ['team', { projects: 'unlimited', exports: 5 }, ['Priority support', 'Single sign-on']],
      ['starter', {}, []],
    ])
  })
})
