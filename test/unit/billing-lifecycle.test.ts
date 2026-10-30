import { Polar } from '@convex-dev/polar'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { checkoutsCreate } from '@polar-sh/sdk/funcs/checkoutsCreate.js'
import { customersGet } from '@polar-sh/sdk/funcs/customersGet.js'
import { customersGetExternal } from '@polar-sh/sdk/funcs/customersGetExternal.js'
import { customersGetStateExternal } from '@polar-sh/sdk/funcs/customersGetStateExternal.js'
import { subscriptionsUpdate } from '@polar-sh/sdk/funcs/subscriptionsUpdate.js'
import { setupBilling, type SetupBillingConfig } from '../../src/convex/integrations/billing'
import { getBackendError } from '../../src/convex/errors'
import { isIpAddress } from '../../src/convex/integrations/billing/checkout'
import { refuseInvalidLifecycle, remindsItself, trialAddress, WITHDRAWAL_PERIOD_MS } from '../../src/convex/integrations/billing/lifecycle'

vi.mock('@polar-sh/sdk/funcs/checkoutsCreate.js', () => ({ checkoutsCreate: vi.fn() }))
vi.mock('@polar-sh/sdk/funcs/customersGet.js', () => ({ customersGet: vi.fn() }))
vi.mock('@polar-sh/sdk/funcs/customersGetExternal.js', () => ({ customersGetExternal: vi.fn() }))
vi.mock('@polar-sh/sdk/funcs/customersGetStateExternal.js', () => ({ customersGetStateExternal: vi.fn() }))
vi.mock('@polar-sh/sdk/funcs/subscriptionsUpdate.js', () => ({ subscriptionsUpdate: vi.fn() }))

const mockCheckoutsCreate = vi.mocked(checkoutsCreate)
const mockSubscriptionsUpdate = vi.mocked(subscriptionsUpdate)

const ref = (name: string) => `ref:${name}`
const components = {
  polar: { lib: { insertCustomer: ref('insertCustomer') } },
  backend: {
    adapter: { findOne: ref('findOne'), findMany: ref('findMany') },
    billing: Object.fromEntries(['getByUser', 'upsert', 'userByCustomer', 'entityProfile', 'claimTrial', 'markTrialUsed', 'reserveDiscountCode', 'releaseDiscountCode', 'recordSubscriptionChange', 'subscriptionChanges'].map(name => [name, ref(name)])),
    gifts: Object.fromEntries(['create', 'activePass', 'get', 'trialPassTaken', 'startTrialPass', 'registerSweep'].map(name => [name, ref(`gifts.${name}`)])),
    subscriptions: Object.fromEntries(['recordOffer', 'lastOffer', 'takeOffer', 'releaseOffer', 'recordConsent', 'confirmConsent', 'purchasedAt', 'markOnce', 'recordWithdrawal', 'withdrawalOf', 'lifecycleConsole'].map(name => [name, ref(`lifecycle.${name}`)])),
    consents: { latest: ref('consents.latest') },
  },
} as never

const DAY = 24 * 60 * 60 * 1000
const signedIn = { subject: 'u1', email: 'u1@example.com', emailVerified: true, sessionId: 'session-1' }

const sent: Array<{ name: string, data: Record<string, unknown> }> = []
const email = {
  sendTemplate: vi.fn(async (_ctx: unknown, name: string, data: Record<string, unknown>) => {
    sent.push({ name, data })
    return null
  }),
}

function make(lifecycle: SetupBillingConfig['lifecycle'], extra: Partial<SetupBillingConfig> = {}) {
  return setupBilling(components, {
    email,
    accessToken: 'oat_test',
    billTo: 'user',
    trustedOrigins: ['https://app'],
    lifecycle,
    catalog: {
      sandbox: {
        products: { pro: 'prod_pro', starter: 'prod_starter', pack: 'prod_pack' },
        plans: { pro: { month: 'prod_pro' }, starter: { month: 'prod_starter' } },
        discounts: {
          stay30: { id: 'disc_stay', name: 'Stay with us', percentOff: 30, duration: 'repeating', months: 3, productIds: ['prod_pro'] },
          public10: { id: 'disc_public', name: 'Ten off', code: 'TEN', percentOff: 10, duration: 'once', productIds: ['prod_pro'] },
        },
      },
    },
    ...extra,
  } as SetupBillingConfig)
}

/** A context whose component answers come from `answers` by reference name. */
function makeCtx(answers: Record<string, unknown> = {}) {
  const calls: Array<[string, unknown]> = []
  const answer = (name: unknown, args: unknown) => {
    calls.push([String(name), args])
    const key = String(name).replace(/^ref:/, '')
    if (key in answers) return typeof answers[key] === 'function' ? (answers[key] as (args: unknown) => unknown)(args) : answers[key]
    if (key === 'findOne') return (args as { model?: string }).model === 'user' ? { role: 'user', banned: false, email: 'u1@example.com' } : null
    if (key === 'subscriptionChanges') return []
    return null
  }
  return {
    calls,
    runQuery: vi.fn(async (name: unknown, args: unknown) => answer(name, args)),
    runMutation: vi.fn(async (name: unknown, args: unknown) => answer(name, args)),
    auth: { getUserIdentity: vi.fn(async () => signedIn) },
  }
}

const invoke = (fn: unknown) => (ctx: unknown, args: unknown) => (fn as (ctx: unknown, args: unknown) => Promise<unknown>)(ctx, args)

const periodEnd = Date.UTC(2027, 1, 1)
const pro = { id: 'sub_1', status: 'active', endedAt: null, productId: 'prod_pro', cancelAtPeriodEnd: false, startedAt: new Date(Date.now() - 90 * DAY).toISOString(), currentPeriodEnd: new Date(periodEnd).toISOString(), amount: 2900, currency: 'usd', recurringInterval: 'month' }

function withSubscriptions(subscriptions: unknown[]) {
  vi.spyOn(Polar.prototype, 'getProduct').mockImplementation(async (_ctx, { productId }) => ({ id: productId, name: productId === 'prod_pro' ? 'Pro' : 'Starter', isRecurring: true, prices: [{ amountType: 'fixed', priceAmount: 1000 }] }) as never)
  vi.spyOn(Polar.prototype, 'listAllUserSubscriptions').mockResolvedValue(subscriptions as never)
}

beforeEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
  sent.length = 0
  mockSubscriptionsUpdate.mockResolvedValue({ ok: true, value: { id: 'sub_1', status: 'active', currentPeriodEnd: new Date(periodEnd), endsAt: new Date(periodEnd) } } as never)
  vi.mocked(customersGetExternal).mockResolvedValue({ ok: false, error: Object.assign(new Error('Not found'), { statusCode: 404 }) } as never)
  vi.mocked(customersGetStateExternal).mockResolvedValue({ ok: false, error: Object.assign(new Error('Not found'), { statusCode: 404, error: 'ResourceNotFound' }) } as never)
  vi.mocked(customersGet).mockResolvedValue({ ok: true, value: { id: 'cus_1', externalId: 'u1', metadata: {} } } as never)
})

describe('the cancel flow\'s save offers', () => {
  const offers = { saveOffers: { too_expensive: { discount: 'stay30' }, unused: { pause: { months: 2 as const } }, missing_features: { downgrade: 'starter' } } }

  it('answers the offer for the reason instead of cancelling, and asks the provider nothing', async () => {
    const billing = make(offers)
    withSubscriptions([pro])
    const ctx = makeCtx({ 'lifecycle.recordOffer': 'offer_1' })

    const outcome = await invoke(billing.api.cancelSubscription)(ctx, { reason: 'too_expensive' })

    expect(outcome).toEqual({ offer: { id: 'offer_1', reason: 'too_expensive', kind: 'discount', discount: 'stay30', name: 'Stay with us', percentOff: 30, duration: 'repeating', months: 3 } })
    expect(mockSubscriptionsUpdate).not.toHaveBeenCalled()
    expect(ctx.calls).toContainEqual(['ref:lifecycle.recordOffer', { entityId: 'u1', subscriptionId: 'sub_1', reason: 'too_expensive', offer: { kind: 'discount', discount: 'stay30' }, since: expect.any(Number) }])
  })

  it('makes a pause end with the period and a downgrade apply at its end', async () => {
    const billing = make(offers)
    withSubscriptions([pro])
    const pause = await invoke(billing.api.cancelSubscription)(makeCtx({ 'lifecycle.recordOffer': 'o' }), { reason: 'unused' }) as { offer: { kind: string, resumesAt: number } }
    expect(pause.offer).toMatchObject({ kind: 'pause', months: 2, plan: 'pro', resumesAt: Date.UTC(2027, 3, 1) })
    const downgrade = await invoke(billing.api.cancelSubscription)(makeCtx({ 'lifecycle.recordOffer': 'o' }), { reason: 'missing_features' })
    expect(downgrade).toMatchObject({ offer: { kind: 'downgrade', plan: 'starter', appliesAt: periodEnd } })
  })

  it('cancels in one step with offer: false, for a reason without an offer, and where an offer is barred', async () => {
    const billing = make(offers)
    const cancels = async (subscription: object, args: object, answers: Record<string, unknown> = {}) => {
      mockSubscriptionsUpdate.mockClear()
      withSubscriptions([subscription])
      const outcome = await invoke(billing.api.cancelSubscription)(makeCtx(answers), args)
      expect(outcome).toEqual({ canceled: true, endsAt: periodEnd })
      expect(mockSubscriptionsUpdate).toHaveBeenCalledWith(expect.anything(), { id: 'sub_1', subscriptionUpdate: expect.objectContaining({ cancelAtPeriodEnd: true }) })
    }
    await cancels(pro, { reason: 'too_expensive', offer: false })
    await cancels(pro, { reason: 'other' })
    // One save offer per customer in 12 months, also when another cancellation made it a moment ago.
    await cancels(pro, { reason: 'too_expensive' }, { 'lifecycle.lastOffer': Date.now() - DAY })
    await cancels(pro, { reason: 'too_expensive' }, { 'lifecycle.recordOffer': null })
    // None on a trial or a past-due plan.
    await cancels({ ...pro, status: 'trialing' }, { reason: 'too_expensive' })
    await cancels({ ...pro, status: 'past_due' }, { reason: 'too_expensive' })
  })

  it('makes no offer inside the withdrawal period while the withdrawal button is on', async () => {
    const billing = make({ ...offers, withdrawal: true })
    withSubscriptions([{ ...pro, startedAt: new Date(Date.now() - DAY).toISOString() }])
    expect(await invoke(billing.api.cancelSubscription)(makeCtx(), { reason: 'too_expensive' })).toMatchObject({ canceled: true })
  })

  it('makes no offer of a discount that does not apply to the plan, or that has a code', async () => {
    const billing = make({ saveOffers: { too_expensive: { discount: 'public10' }, unused: { discount: 'gone' } } })
    withSubscriptions([pro])
    expect(await invoke(billing.api.cancelSubscription)(makeCtx(), { reason: 'too_expensive' })).toMatchObject({ canceled: true })
    expect(await invoke(billing.api.cancelSubscription)(makeCtx(), { reason: 'unused' })).toMatchObject({ canceled: true })
  })

  it('applies an accepted pause through the lifecycle operation, and refuses an offer it did not make', async () => {
    const billing = make(offers)
    withSubscriptions([pro])
    const resumesAt = Date.UTC(2027, 3, 1)
    const ctx = makeCtx({ 'lifecycle.takeOffer': { id: 'offer_1', entityId: 'u1', subscriptionId: 'sub_1', reason: 'unused', offer: { kind: 'pause', months: 2, resumesAt }, madeAt: Date.now() } })

    await invoke(billing.api.acceptSaveOffer)(ctx, { offerId: 'offer_1' })

    expect(mockSubscriptionsUpdate).toHaveBeenCalledWith(expect.anything(), { id: 'sub_1', subscriptionUpdate: { pauseAtPeriodEnd: true, resumesAt: new Date(resumesAt) } })
    const refused = await invoke(billing.api.acceptSaveOffer)(makeCtx(), { offerId: 'nope' }).catch((error: unknown) => error)
    expect(getBackendError(refused)).toMatchObject({ code: 'invalid_input', data: { field: 'offer' } })
  })

  it('gives an offer back when the provider refuses it', async () => {
    const billing = make(offers)
    withSubscriptions([pro])
    mockSubscriptionsUpdate.mockResolvedValue({ ok: false, error: Object.assign(new Error('nope'), { statusCode: 500 }) } as never)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const ctx = makeCtx({ 'lifecycle.takeOffer': { id: 'offer_1', entityId: 'u1', subscriptionId: 'sub_1', reason: 'too_expensive', offer: { kind: 'discount', discount: 'stay30' }, madeAt: Date.now() } })

    await expect(invoke(billing.api.acceptSaveOffer)(ctx, { offerId: 'offer_1' })).rejects.toBeDefined()
    expect(ctx.calls).toContainEqual(['ref:lifecycle.releaseOffer', { offerId: 'offer_1' }])
  })

  it('refuses a lifecycle the provider could not keep, as setupBilling runs', () => {
    expect(() => refuseInvalidLifecycle({ saveOffers: { bored: { pause: { months: 2 } } } as never })).toThrow('none of the provider\'s cancellation reasons')
    expect(() => refuseInvalidLifecycle({ saveOffers: { unused: { pause: { months: 6 } } } as never })).toThrow('a pause lasts 1 to 3 months')
  })
})

describe('the withdrawal button', () => {
  it('reads the latest purchase with the end of its 14 days, without reading the clock, and nothing with the button off', async () => {
    const started = Date.now() - 2 * DAY
    withSubscriptions([{ ...pro, startedAt: new Date(started).toISOString() }])
    const on = make({ withdrawal: true })
    expect(await invoke(on.api.getWithdrawal)(makeCtx(), {})).toEqual({ period: { subscriptionId: 'sub_1', plan: 'pro', startedAt: started, endsAt: started + WITHDRAWAL_PERIOD_MS } })
    expect(await invoke(make({}).api.getWithdrawal)(makeCtx(), {})).toEqual({ period: null })
    // A period that ended is answered with its end, which the button compares with the clock: the query's answer never goes stale.
    const old = Date.now() - 20 * DAY
    withSubscriptions([{ ...pro, startedAt: new Date(old).toISOString() }])
    expect(await invoke(on.api.getWithdrawal)(makeCtx(), {})).toEqual({ period: expect.objectContaining({ startedAt: old, endsAt: old + WITHDRAWAL_PERIOD_MS }) })
  })

  it('runs the 14 days from the purchase: a plan bought from the free plan counts from its checkout, not the free plan\'s start', async () => {
    const bought = Date.now() - 2 * DAY
    // The free plan began 90 days ago; the upgrade in place kept its start.
    withSubscriptions([pro])
    const billing = make({ withdrawal: true })
    const answers = { 'lifecycle.purchasedAt': bought, 'lifecycle.recordWithdrawal': true }
    expect(await invoke(billing.api.getWithdrawal)(makeCtx(answers), {})).toEqual({ period: { subscriptionId: 'sub_1', plan: 'pro', startedAt: bought, endsAt: bought + WITHDRAWAL_PERIOD_MS } })
    await invoke(billing.api.withdraw)(makeCtx(answers), {})
    expect(mockSubscriptionsUpdate).toHaveBeenCalledWith(expect.anything(), { id: 'sub_1', subscriptionUpdate: { revoke: true } })
  })

  it('ends the subscription at once, records the withdrawal and sends the receipt', async () => {
    withSubscriptions([{ ...pro, startedAt: new Date(Date.now() - DAY).toISOString() }])
    const billing = make({ withdrawal: true })
    const ctx = makeCtx({ 'lifecycle.recordWithdrawal': true })

    const { withdrawnAt } = await invoke(billing.api.withdraw)(ctx, {}) as { withdrawnAt: number }

    expect(mockSubscriptionsUpdate).toHaveBeenCalledWith(expect.anything(), { id: 'sub_1', subscriptionUpdate: { revoke: true } })
    expect(ctx.calls).toContainEqual(['ref:lifecycle.recordWithdrawal', { entityId: 'u1', subscriptionId: 'sub_1', userId: 'u1', productId: 'prod_pro', at: withdrawnAt }])
    expect(sent).toEqual([{ name: 'withdrawalReceipt', data: { email: 'u1@example.com', plan: 'Pro', withdrawnAt } }])
  })

  it('refuses a withdrawal outside the period, or already made', async () => {
    withSubscriptions([{ ...pro, startedAt: new Date(Date.now() - 20 * DAY).toISOString() }])
    const billing = make({ withdrawal: true })
    const refused = await invoke(billing.api.withdraw)(makeCtx(), {}).catch((error: unknown) => error)
    expect(getBackendError(refused)).toMatchObject({ code: 'invalid_input', data: { reason: 'withdrawal_closed' } })
    withSubscriptions([{ ...pro, startedAt: new Date(Date.now() - DAY).toISOString() }])
    const again = await invoke(billing.api.withdraw)(makeCtx({ 'lifecycle.withdrawalOf': { at: 1, userId: 'u1' } }), {}).catch((error: unknown) => error)
    expect(getBackendError(again)).toMatchObject({ code: 'invalid_input', data: { reason: 'withdrawal_closed' } })
    expect(mockSubscriptionsUpdate).not.toHaveBeenCalled()
  })
})

describe('the checkout', () => {
  const landing = { origin: 'https://app', successUrl: 'https://app/done' }

  it('forwards the visitor\'s IP, names who opened it, and keeps the renewal consent shown', async () => {
    withSubscriptions([])
    vi.spyOn(Polar.prototype, 'getCustomerByUserId').mockResolvedValue({ id: 'cus_1', userId: 'u1' } as never)
    mockCheckoutsCreate.mockResolvedValue({ ok: true, value: { id: 'co_1', url: 'https://checkout/1', amount: 2900, currency: 'eur', productId: 'prod_pro', product: { recurringInterval: 'month', recurringIntervalCount: 1 } } } as never)
    const billing = make({})
    const ctx = makeCtx({ 'consents.latest': { kind: 'terms', version: '2026-10-01', granted: true, at: 1 } })

    await invoke(billing.api.generateCheckoutLink)(ctx, { productIds: ['prod_pro'], customerIpAddress: '203.0.113.7', ...landing })

    expect(mockCheckoutsCreate.mock.calls[0]![1]).toMatchObject({ customerIpAddress: '203.0.113.7', metadata: { openedBy: 'u1' } })
    expect(ctx.calls).toContainEqual(['ref:lifecycle.recordConsent', { checkoutId: 'co_1', entityId: 'u1', userId: 'u1', productId: 'prod_pro', amount: 2900, currency: 'eur', interval: 'month', intervalCount: 1, termsVersion: '2026-10-01' }])
  })

  it('refuses an address that is no IP, before the provider hears of it', async () => {
    withSubscriptions([])
    const refused = await invoke(make({}).api.generateCheckoutLink)(makeCtx(), { productIds: ['prod_pro'], customerIpAddress: 'localhost; drop', ...landing }).catch((error: unknown) => error)
    expect(getBackendError(refused)).toMatchObject({ code: 'invalid_input', data: { field: 'customerIpAddress' } })
    expect(mockCheckoutsCreate).not.toHaveBeenCalled()
    expect(['203.0.113.7', '2001:db8::1', '::ffff:192.0.2.1'].every(isIpAddress)).toBe(true)
    expect(['256.1.1.1', 'example.com', '1::2::3'].some(isIpAddress)).toBe(false)
  })
})

describe('the lifecycle webhooks', () => {
  const run = async (billing: ReturnType<typeof make>, type: string, data: object, answers: Record<string, unknown> = {}) => {
    const ctx = makeCtx(answers)
    await (billing.webhookEvents as Record<string, (ctx: unknown, event: unknown) => Promise<void>>)[type]!(ctx, { type, data })
    return ctx
  }

  it('records an expired checkout once, with who opened it, only when abandonedCheckout is on', async () => {
    const on = make({ abandonedCheckout: true })
    const ctx = await run(on, 'checkout.expired', { id: 'co_1', externalCustomerId: 'u1', productId: 'prod_pro', amount: 2900, metadata: { openedBy: 'u9' } }, { 'lifecycle.markOnce': true })
    expect(ctx.calls).toContainEqual(['ref:lifecycle.markOnce', { key: 'checkout:co_1' }])
    const off = await run(make({}), 'checkout.expired', { id: 'co_1', externalCustomerId: 'u1', productId: 'prod_pro', amount: 2900 })
    expect(off.calls.some(([name]) => name.includes('markOnce'))).toBe(false)
  })

  it('confirms the consent proof as the subscription its checkout started arrives', async () => {
    const created = new Date(Date.UTC(2026, 9, 27))
    const ctx = await run(make({}), 'subscription.created', { id: 'sub_1', checkoutId: 'co_1', createdAt: created, customerId: 'cus_1', productId: 'prod_pro' })
    expect(ctx.calls).toContainEqual(['ref:lifecycle.confirmConsent', { checkoutId: 'co_1', subscriptionId: 'sub_1', at: created.getTime() }])
  })

  it('confirms it too when the checkout upgraded the free plan\'s subscription in place, which no subscription.created announces', async () => {
    const upgraded = new Date(Date.UTC(2026, 9, 28))
    const ctx = await run(make({}), 'subscription.updated', { id: 'sub_free', checkoutId: 'co_2', createdAt: new Date(Date.UTC(2026, 2, 1)), modifiedAt: upgraded, customerId: 'cus_1', productId: 'prod_pro' })
    expect(ctx.calls).toContainEqual(['ref:lifecycle.confirmConsent', { checkoutId: 'co_2', subscriptionId: 'sub_free', at: upgraded.getTime() }])
    const paid = await run(make({}), 'order.paid', { id: 'order_1', checkoutId: 'co_3', subscriptionId: 'sub_free', createdAt: upgraded, customerId: 'cus_1' })
    expect(paid.calls).toContainEqual(['ref:lifecycle.confirmConsent', { checkoutId: 'co_3', subscriptionId: 'sub_free', at: upgraded.getTime() }])
  })

  it('links the renewal reminder to the settings page where nuxt.config moved it', async () => {
    vi.stubEnv('SITE_URL', 'https://app.example.com')
    withSubscriptions([])
    const billing = make({ renewalReminders: true }, { paths: { settings: '/account/billing' } })
    const year = { ...pro, customer: { externalId: 'u1' }, startedAt: new Date(Date.now() - 340 * DAY), currentPeriodEnd: new Date(periodEnd) }
    await run(billing, 'subscription.updated', year, { 'lifecycle.markOnce': true })
    expect(sent).toEqual([expect.objectContaining({ name: 'renewalReminder', data: expect.objectContaining({ manageUrl: 'https://app.example.com/account/billing' }) })])
    sent.length = 0
  })

  it('sends the yearly renewal reminder on a monthly plan past eleven months, once', async () => {
    vi.stubEnv('SITE_URL', 'https://app.example.com')
    withSubscriptions([])
    const billing = make({ renewalReminders: true })
    const year = { ...pro, customer: { externalId: 'u1' }, startedAt: new Date(Date.now() - 340 * DAY), currentPeriodEnd: new Date(periodEnd) }
    await run(billing, 'subscription.updated', year, { 'lifecycle.markOnce': true })
    expect(sent).toEqual([{ name: 'renewalReminder', data: { email: 'u1@example.com', plan: 'Pro', amount: 2900, currency: 'usd', interval: 'month', intervalCount: 1, renewsAt: periodEnd, manageUrl: 'https://app.example.com/settings' } }])
    sent.length = 0
    // Marked this year already, too young, bought a month ago on a free plan's old subscription, or a cycle the provider reminds about itself.
    await run(billing, 'subscription.updated', year, { 'lifecycle.markOnce': false })
    await run(billing, 'subscription.updated', { ...year, startedAt: new Date(Date.now() - 30 * DAY) }, { 'lifecycle.markOnce': true })
    await run(billing, 'subscription.updated', year, { 'lifecycle.markOnce': true, 'lifecycle.purchasedAt': Date.now() - 30 * DAY })
    await run(billing, 'subscription.updated', { ...year, recurringInterval: 'year' }, { 'lifecycle.markOnce': true })
    expect(sent).toEqual([])
    vi.unstubAllEnvs()
  })
})

describe('the soft opt-in at checkout', () => {
  const landing = { origin: 'https://app', successUrl: 'https://app/done' }
  const joined: Array<Record<string, unknown>> = []
  const preferences = {
    topics: { news: { name: 'News', description: 'What is new.', subscribedByDefault: false, softOptIn: true } },
    softOptIn: vi.fn(async (_ctx: unknown, customer: Record<string, unknown>) => {
      joined.push(customer)
    }),
  }
  const withTopics = () => make({}, { email: { ...email, preferences } as never })
  const paid = (metadata: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({ id: 'order_1', checkoutId: 'co_1', billingReason: 'subscription_create', totalAmount: 2900, customerId: 'cus_1', metadata, ...extra })
  const run = async (billing: ReturnType<typeof make>, data: object, answers: Record<string, unknown> = {}) => {
    const ctx = makeCtx(answers)
    await (billing.webhookEvents as Record<string, (ctx: unknown, event: unknown) => Promise<void>>)['order.paid']!(ctx, { type: 'order.paid', data })
    return ctx
  }

  beforeEach(() => {
    joined.length = 0
  })

  it('tells the page to show the box while a topic takes it', async () => {
    const access = (billing: ReturnType<typeof make>) => invoke(billing.api.getBillingAccess)(makeCtx(), {}) as Promise<{ softOptIn: boolean }>
    expect(await access(withTopics())).toMatchObject({ softOptIn: true })
    expect(await access(make({}))).toMatchObject({ softOptIn: false })
  })

  it('carries the box in the checkout\'s metadata, only where it showed, and a client may not write the key', async () => {
    withSubscriptions([])
    vi.spyOn(Polar.prototype, 'getCustomerByUserId').mockResolvedValue({ id: 'cus_1', userId: 'u1' } as never)
    mockCheckoutsCreate.mockResolvedValue({ ok: true, value: { id: 'co_1', url: 'https://checkout/1', amount: 2900, currency: 'eur', productId: 'prod_pro' } } as never)
    await invoke(withTopics().api.generateCheckoutLink)(makeCtx(), { productIds: ['prod_pro'], emailOptOut: true, ...landing })
    expect(mockCheckoutsCreate.mock.calls[0]![1]).toMatchObject({ metadata: { openedBy: 'u1', emailOptOut: 'true' } })
    await invoke(withTopics().api.generateCheckoutLink)(makeCtx(), { productIds: ['prod_pro'], ...landing })
    expect((mockCheckoutsCreate.mock.calls[1]![1] as { metadata: Record<string, string> }).metadata).not.toHaveProperty('emailOptOut')
    const forged = await invoke(withTopics().api.generateCheckoutLink)(makeCtx(), { productIds: ['prod_pro'], metadata: { emailOptOut: 'false' }, ...landing }).catch((error: unknown) => error)
    expect(getBackendError(forged)).toMatchObject({ code: 'invalid_input' })
  })

  it('joins the person who opened a paid checkout to the topics, once per checkout, with the checkout', async () => {
    const ctx = await run(withTopics(), paid({ openedBy: 'u1', emailOptOut: 'false' }), { 'lifecycle.markOnce': true })
    expect(ctx.calls).toContainEqual(['ref:lifecycle.markOnce', { key: 'soft-opt-in:co_1' }])
    expect(joined).toEqual([{ email: 'u1@example.com', userId: 'u1', objected: false, checkoutId: 'co_1' }])
    // A redelivery, or the same checkout's next order, joins nothing again.
    await run(withTopics(), paid({ openedBy: 'u1', emailOptOut: 'false' }), { 'lifecycle.markOnce': false })
    expect(joined).toHaveLength(1)
  })

  it('joins nobody who objected, saw no box, renews, or paid nothing', async () => {
    const answers = { 'lifecycle.markOnce': true }
    await run(withTopics(), paid({ openedBy: 'u1', emailOptOut: 'true' }), answers)
    await run(withTopics(), paid({ openedBy: 'u1' }), answers)
    await run(withTopics(), paid({ openedBy: 'u1', emailOptOut: 'false' }, { billingReason: 'subscription_cycle' }), answers)
    await run(withTopics(), paid({ openedBy: 'u1', emailOptOut: 'false' }, { totalAmount: 0 }), answers)
    await run(make({}), paid({ openedBy: 'u1', emailOptOut: 'false' }), answers)
    expect(joined).toEqual([])
  })
})

describe('the Billing tab', () => {
  it('reads the lifecycle\'s records for an administrator, each product named, and nothing for anyone else', async () => {
    withSubscriptions([])
    const rows = {
      saveOffers: [{ id: 'off_1', entityId: 'org_1', subscriptionId: 'sub_1', reason: 'too_expensive', offer: { kind: 'pause', months: 2, resumesAt: 1 }, madeAt: 10 }],
      withdrawals: [{ entityId: 'org_1', subscriptionId: 'sub_2', userId: 'u2', productId: 'prod_pro', at: 20 }],
      consents: [{ entityId: 'org_1', subscriptionId: 'sub_1', productId: 'prod_starter', amount: 900, currency: 'eur', interval: 'month', intervalCount: 1, userId: 'u1', consentedAt: 30 }],
    }
    const admin = makeCtx({ 'lifecycle.lifecycleConsole': rows, 'findOne': { role: 'admin', banned: false, email: 'root@example.com' } })
    const read = await invoke(make({}).api.getBillingConsole)(admin, { entityId: ' org_1 ' })
    expect(admin.calls).toContainEqual(['ref:lifecycle.lifecycleConsole', { entityId: 'org_1' }])
    expect(read).toEqual({
      saveOffers: [{ id: 'off_1', entityId: 'org_1', subscriptionId: 'sub_1', reason: 'too_expensive', kind: 'pause', months: 2, plan: null, discount: null, madeAt: 10, acceptedAt: null }],
      withdrawals: [{ entityId: 'org_1', subscriptionId: 'sub_2', userId: 'u2', plan: 'Pro', at: 20 }],
      consents: [{ entityId: 'org_1', subscriptionId: 'sub_1', userId: 'u1', plan: 'Starter', amount: 900, currency: 'eur', interval: 'month', intervalCount: 1, termsVersion: null, consentedAt: 30 }],
    })
    const member = makeCtx({ 'lifecycle.lifecycleConsole': rows })
    expect(await invoke(make({}).api.getBillingConsole)(member, {})).toBeNull()
    expect(member.calls.some(([name]) => name.includes('lifecycleConsole'))).toBe(false)
  })
})

describe('the lifecycle\'s rules', () => {
  it('leaves to the provider every cycle of six months or more', () => {
    expect(remindsItself('month')).toBe(false)
    expect(remindsItself('month', 6)).toBe(true)
    expect(remindsItself('week', 24)).toBe(false)
    expect(remindsItself('day', 180)).toBe(true)
    expect(remindsItself('year')).toBe(true)
  })

  it('counts a reverse trial by the address with plus tags and dots taken out', () => {
    expect(trialAddress(' A.na+trial@Example.com ')).toBe('ana@example.com')
    expect(trialAddress('ana@example.com')).toBe('ana@example.com')
  })
})
