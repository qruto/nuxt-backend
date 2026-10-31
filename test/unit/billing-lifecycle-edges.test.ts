import { Polar } from '@convex-dev/polar'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { checkoutsCreate } from '@polar-sh/sdk/funcs/checkoutsCreate.js'
import { customersGet } from '@polar-sh/sdk/funcs/customersGet.js'
import { customersGetExternal } from '@polar-sh/sdk/funcs/customersGetExternal.js'
import { customersGetStateExternal } from '@polar-sh/sdk/funcs/customersGetStateExternal.js'
import { subscriptionsUpdate } from '@polar-sh/sdk/funcs/subscriptionsUpdate.js'
import { setupBilling, type SetupBillingConfig } from '../../src/convex/integrations/billing'
import { remindsItself } from '../../src/convex/integrations/billing/lifecycle'

// The lifecycle's edges, against a mocked provider and component (as
// billing-lifecycle.test.ts runs it): the save offers the server declines
// to make and the ones it carries out, a withdrawal whose receipt can't go,
// a consent proof that can't be kept, an abandoned checkout known only by
// its customer, and who the soft opt-in leaves out.

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
const recorded: Array<{ type: string, data?: unknown, actor?: unknown, subjectId?: string }> = []
const audit = { recordBackendEvent: vi.fn(async (_ctx: unknown, event: { type: string }) => void recorded.push(event)) }

const catalog = {
  sandbox: {
    products: { 'free': 'prod_free', 'pro': 'prod_pro', 'pro:year': 'prod_pro_year', 'starter': 'prod_starter', 'legacy': 'prod_legacy' },
    plans: { free: { month: 'prod_free' }, pro: { month: 'prod_pro', year: 'prod_pro_year' }, starter: { month: 'prod_starter' }, legacy: { month: 'prod_legacy' } },
    free: 'free',
    retired: ['legacy'],
    discounts: {
      flat5: { id: 'disc_flat', name: 'Five off', amountOff: { usd: 500 }, duration: 'once', productIds: ['prod_pro'] },
    },
  },
}

function make(lifecycle: SetupBillingConfig['lifecycle'], extra: Partial<SetupBillingConfig> = {}) {
  return setupBilling(components, { email, audit, accessToken: 'oat_test', billTo: 'user', trustedOrigins: ['https://app'], lifecycle, catalog, ...extra } as SetupBillingConfig)
}

/** A context whose component answers come from `answers` by reference name. */
function makeCtx(answers: Record<string, unknown> = {}, identity: object | null = signedIn) {
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
    auth: { getUserIdentity: vi.fn(async () => identity) },
  }
}

const invoke = (fn: unknown) => (ctx: unknown, args: unknown) => (fn as (ctx: unknown, args: unknown) => Promise<unknown>)(ctx, args)

const periodEnd = Date.UTC(2027, 1, 1)
const pro = { id: 'sub_1', status: 'active', endedAt: null, productId: 'prod_pro', cancelAtPeriodEnd: false, startedAt: new Date(Date.now() - 90 * DAY).toISOString(), currentPeriodEnd: new Date(periodEnd).toISOString(), amount: 2900, currency: 'usd', recurringInterval: 'month' }

/** The provider's products, priced, with the free plan at nothing; the subscriptions the synced table lists. */
function withSubscriptions(subscriptions: unknown[]) {
  const names: Record<string, string> = { prod_pro: 'Pro', prod_pro_year: 'Pro', prod_starter: 'Starter', prod_free: 'Free', prod_addon: 'Priority add-on' }
  vi.spyOn(Polar.prototype, 'getProduct').mockImplementation(async (_ctx, { productId }) => ({
    id: productId,
    name: names[productId] ?? productId,
    isRecurring: true,
    prices: [{ amountType: 'fixed', isArchived: false, priceAmount: productId === 'prod_free' ? 0 : 1000 }],
  }) as never)
  vi.spyOn(Polar.prototype, 'listAllUserSubscriptions').mockResolvedValue(subscriptions as never)
}

const errorLines = () => vi.mocked(console.error).mock.calls.map(call => String(call[0]))

beforeEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
  sent.length = 0
  recorded.length = 0
  vi.spyOn(console, 'error').mockImplementation(() => {})
  mockSubscriptionsUpdate.mockResolvedValue({ ok: true, value: { id: 'sub_1', status: 'active', currentPeriodEnd: new Date(periodEnd), endsAt: new Date(periodEnd) } } as never)
  vi.mocked(customersGetExternal).mockResolvedValue({ ok: false, error: Object.assign(new Error('Not found'), { statusCode: 404 }) } as never)
  vi.mocked(customersGetStateExternal).mockResolvedValue({ ok: false, error: Object.assign(new Error('Not found'), { statusCode: 404, error: 'ResourceNotFound' }) } as never)
  vi.mocked(customersGet).mockResolvedValue({ ok: true, value: { id: 'cus_1', externalId: 'u1', metadata: {} } } as never)
})

describe('save offers', () => {
  it('makes no downgrade to the plan the subscription is on, to a retired plan or to the free plan: the cancellation goes through', async () => {
    withSubscriptions([pro])
    for (const downgrade of ['pro', 'legacy', 'free', 'gone']) {
      const billing = make({ saveOffers: { missing_features: { downgrade } } })
      const outcome = await invoke(billing.api.cancelSubscription)(makeCtx({ 'lifecycle.recordOffer': 'offer_1' }), { reason: 'missing_features' })
      expect(outcome, downgrade).toEqual({ canceled: true, endsAt: periodEnd })
    }
  })

  it('makes no pause on a plan with no running period to follow', async () => {
    withSubscriptions([{ ...pro, currentPeriodEnd: null }])
    const billing = make({ saveOffers: { unused: { pause: { months: 1 } } } })
    expect(await invoke(billing.api.cancelSubscription)(makeCtx({ 'lifecycle.recordOffer': 'offer_1' }), { reason: 'unused' })).toMatchObject({ canceled: true })
  })

  it('offers a yearly subscriber a cheaper plan the catalog prices only by the month at its monthly price', async () => {
    withSubscriptions([{ ...pro, productId: 'prod_pro_year', recurringInterval: 'year' }])
    const billing = make({ saveOffers: { missing_features: { downgrade: 'starter' } } })
    const ctx = makeCtx({ 'lifecycle.recordOffer': 'offer_1' })
    expect(await invoke(billing.api.cancelSubscription)(ctx, { reason: 'missing_features' })).toEqual({ offer: { id: 'offer_1', reason: 'missing_features', kind: 'downgrade', plan: 'starter', appliesAt: periodEnd } })
    expect(ctx.calls).toContainEqual(['ref:lifecycle.recordOffer', expect.objectContaining({ offer: { kind: 'downgrade', plan: 'starter', productId: 'prod_starter' } })])
  })

  it('shows a flat discount by the amount it takes off, with no percentage or months of its own', async () => {
    withSubscriptions([pro])
    const billing = make({ saveOffers: { too_expensive: { discount: 'flat5' } } })
    const outcome = await invoke(billing.api.cancelSubscription)(makeCtx({ 'lifecycle.recordOffer': 'offer_1' }), { reason: 'too_expensive' })
    expect(outcome).toEqual({ offer: { id: 'offer_1', reason: 'too_expensive', kind: 'discount', discount: 'flat5', name: 'Five off', amountOff: { usd: 500 }, duration: 'once' } })
  })

  it('carries out an accepted downgrade as a plan change at the period\'s end, and records that it was taken', async () => {
    withSubscriptions([pro])
    const billing = make({ saveOffers: { missing_features: { downgrade: 'starter' } } })
    const taken = { id: 'offer_1', entityId: 'u1', subscriptionId: 'sub_1', reason: 'missing_features', offer: { kind: 'downgrade', plan: 'starter', productId: 'prod_starter' }, madeAt: Date.now() }

    await invoke(billing.api.acceptSaveOffer)(makeCtx({ 'lifecycle.takeOffer': taken }), { offerId: 'offer_1' })

    expect(mockSubscriptionsUpdate).toHaveBeenCalledWith(expect.anything(), { id: 'sub_1', subscriptionUpdate: { productId: 'prod_starter', prorationBehavior: 'next_period' } })
    expect(recorded).toContainEqual(expect.objectContaining({ type: 'billing.save_offer_accepted', data: { reason: 'missing_features', offer: 'downgrade' } }))
  })
})

describe('the withdrawal', () => {
  const recent = { ...pro, startedAt: new Date(Date.now() - DAY).toISOString() }

  it('stands when its receipt can\'t be sent: the subscription ends, the withdrawal is kept, and the failure is logged', async () => {
    withSubscriptions([recent])
    email.sendTemplate.mockRejectedValueOnce(new Error('provider down'))
    const ctx = makeCtx({ 'lifecycle.recordWithdrawal': true })

    expect(await invoke(make({ withdrawal: true }).api.withdraw)(ctx, {})).toEqual({ withdrawnAt: expect.any(Number) })

    expect(mockSubscriptionsUpdate).toHaveBeenCalledWith(expect.anything(), { id: 'sub_1', subscriptionUpdate: { revoke: true } })
    expect(ctx.calls.some(([name]) => name === 'ref:lifecycle.recordWithdrawal')).toBe(true)
    expect(errorLines()).toContainEqual(expect.stringContaining('billing.withdrawal_receipt_failed'))
  })

  it('sends no receipt to a caller whose sign-in carries no email', async () => {
    withSubscriptions([recent])
    const { email: _email, ...noEmail } = signedIn
    await invoke(make({ withdrawal: true }).api.withdraw)(makeCtx({ 'lifecycle.recordWithdrawal': true }, noEmail), {})
    expect(mockSubscriptionsUpdate).toHaveBeenCalled()
    expect(sent).toEqual([])
  })

  it('names a product the catalog sells as no plan by its own name, in the period and on the receipt', async () => {
    withSubscriptions([{ ...recent, productId: 'prod_addon' }])
    const billing = make({ withdrawal: true })
    expect(await invoke(billing.api.getWithdrawal)(makeCtx(), {})).toMatchObject({ period: { subscriptionId: 'sub_1', plan: null } })
    await invoke(billing.api.withdraw)(makeCtx({ 'lifecycle.recordWithdrawal': true }), {})
    expect(sent).toEqual([{ name: 'withdrawalReceipt', data: expect.objectContaining({ plan: 'Priority add-on' }) }])
  })

  it('reads the latest open purchase when the entity holds two, in whichever order they are listed', async () => {
    const older = { ...pro, id: 'sub_old', startedAt: new Date(Date.now() - 5 * DAY).toISOString() }
    const newer = { ...pro, id: 'sub_new', productId: 'prod_starter', startedAt: new Date(Date.now() - DAY).toISOString() }
    for (const order of [[older, newer], [newer, older]]) {
      withSubscriptions(order)
      expect(await invoke(make({ withdrawal: true }).api.getWithdrawal)(makeCtx(), {})).toMatchObject({ period: { subscriptionId: 'sub_new', plan: 'starter' } })
    }
  })
})

describe('the renewal consent proof', () => {
  it('is never what fails a checkout: a proof that can\'t be kept is logged, and the checkout opens', async () => {
    withSubscriptions([])
    vi.spyOn(Polar.prototype, 'getCustomerByUserId').mockResolvedValue({ id: 'cus_1', userId: 'u1' } as never)
    mockCheckoutsCreate.mockResolvedValue({ ok: true, value: { id: 'co_1', url: 'https://checkout/1', amount: 2900, currency: 'usd', productId: 'prod_pro', product: { recurringInterval: 'month' } } } as never)
    const ctx = makeCtx({ 'lifecycle.recordConsent': () => {
      throw new Error('component down')
    } })

    const opened = await invoke(make({}).api.generateCheckoutLink)(ctx, { productIds: ['prod_pro'], origin: 'https://app', successUrl: 'https://app/done' })

    expect(opened).toMatchObject({ url: 'https://checkout/1' })
    expect(errorLines()).toContainEqual(expect.stringContaining('billing.consent_unrecorded'))
  })
})

describe('the lifecycle webhooks', () => {
  const run = async (billing: ReturnType<typeof make>, type: string, data: object, answers: Record<string, unknown> = {}) => {
    const ctx = makeCtx(answers)
    await (billing.webhookEvents as Record<string, (ctx: unknown, event: unknown) => Promise<void>>)[type]!(ctx, { type, data })
    return ctx
  }

  it('finds an abandoned checkout\'s entity by its customer when the checkout names no external id', async () => {
    const billing = make({ abandonedCheckout: true })
    const ctx = await run(billing, 'checkout.expired', { id: 'co_1', customerId: 'cus_1', amount: 2900 }, { 'userByCustomer': 'u1', 'lifecycle.markOnce': true })
    expect(ctx.calls).toContainEqual(['ref:userByCustomer', { customerId: 'cus_1' }])
    // No product on the checkout, no one who opened it: the event says so rather than guessing.
    expect(recorded).toEqual([expect.objectContaining({ type: 'billing.checkout_abandoned', actor: null, subjectId: 'u1', data: { productId: 'unknown' } })])
  })

  it('records nothing of an abandoned checkout no entity is known for, nor of a free one', async () => {
    const billing = make({ abandonedCheckout: true })
    const unknown = await run(billing, 'checkout.expired', { id: 'co_2', customerId: 'cus_unknown', amount: 2900 }, { 'lifecycle.markOnce': true })
    const free = await run(billing, 'checkout.expired', { id: 'co_3', externalCustomerId: 'u1', amount: 0 }, { 'lifecycle.markOnce': true })
    for (const ctx of [unknown, free]) expect(ctx.calls.some(([name]) => name === 'ref:lifecycle.markOnce')).toBe(false)
    expect(recorded).toEqual([])
  })

  it('joins nobody to the soft opt-in\'s topics whose account has no email to write to', async () => {
    const softOptIn = vi.fn(async () => {})
    const billing = make({}, { email: { ...email, preferences: { topics: { news: { name: 'News', description: 'News.', subscribedByDefault: false, softOptIn: true } }, softOptIn } } as never })
    const order = { id: 'order_1', checkoutId: 'co_1', billingReason: 'purchase', totalAmount: 2900, customerId: 'cus_1', metadata: { openedBy: 'u1', emailOptOut: 'false' } }
    await run(billing, 'order.paid', order, { 'lifecycle.markOnce': true, 'findOne': { role: 'user', banned: false } })
    expect(softOptIn).not.toHaveBeenCalled()
  })
})

describe('the lifecycle\'s rules', () => {
  it('leaves to the provider\'s own reminder a cycle it can\'t name', () => {
    expect(remindsItself('quarter')).toBe(true)
    expect(remindsItself(null)).toBe(true)
  })
})
