import { Polar } from '@convex-dev/polar'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { checkoutsClientUpdate } from '@polar-sh/sdk/funcs/checkoutsClientUpdate.js'
import { checkoutsCreate } from '@polar-sh/sdk/funcs/checkoutsCreate.js'
import { customersCreate } from '@polar-sh/sdk/funcs/customersCreate.js'
import { customersGet } from '@polar-sh/sdk/funcs/customersGet.js'
import { customersGetExternal } from '@polar-sh/sdk/funcs/customersGetExternal.js'
import { customersGetStateExternal } from '@polar-sh/sdk/funcs/customersGetStateExternal.js'
import { customersList } from '@polar-sh/sdk/funcs/customersList.js'
import { customersUpdate } from '@polar-sh/sdk/funcs/customersUpdate.js'
import { customerSessionsCreate } from '@polar-sh/sdk/funcs/customerSessionsCreate.js'
import { discountsCreate } from '@polar-sh/sdk/funcs/discountsCreate.js'
import { discountsDelete } from '@polar-sh/sdk/funcs/discountsDelete.js'
import { discountsList } from '@polar-sh/sdk/funcs/discountsList.js'
import { eventsList } from '@polar-sh/sdk/funcs/eventsList.js'
import { ordersGenerateInvoice } from '@polar-sh/sdk/funcs/ordersGenerateInvoice.js'
import { ordersGet } from '@polar-sh/sdk/funcs/ordersGet.js'
import { ordersInvoice } from '@polar-sh/sdk/funcs/ordersInvoice.js'
import { ordersList } from '@polar-sh/sdk/funcs/ordersList.js'
import { refundsCreate } from '@polar-sh/sdk/funcs/refundsCreate.js'
import { subscriptionsCreate } from '@polar-sh/sdk/funcs/subscriptionsCreate.js'
import { subscriptionsUpdate } from '@polar-sh/sdk/funcs/subscriptionsUpdate.js'
import { type Billing, setupBilling, type SetupBillingConfig } from '../../src/convex/integrations/billing'
import { getBackendError } from '../../src/convex/errors'
import { CANCELLATION_COMMENT_MAX } from '../../src/convex/integrations/billing/subscriptions'

/**
 * The subscription-lifecycle, order and checkout surface: what each call maps
 * onto in the provider SDK, how it degrades without an access token, which
 * rate-limit key it burns, and what a refund does to in-flight credit
 * reservations. Every provider function is faked — nothing here goes near the
 * network, and the deployment's token is expired anyway.
 */

vi.mock('@polar-sh/sdk/funcs/checkoutsClientUpdate.js', () => ({ checkoutsClientUpdate: vi.fn() }))
vi.mock('@polar-sh/sdk/funcs/checkoutsCreate.js', () => ({ checkoutsCreate: vi.fn() }))
vi.mock('@polar-sh/sdk/funcs/customersCreate.js', () => ({ customersCreate: vi.fn() }))
vi.mock('@polar-sh/sdk/funcs/customersGet.js', () => ({ customersGet: vi.fn() }))
vi.mock('@polar-sh/sdk/funcs/customersGetExternal.js', () => ({ customersGetExternal: vi.fn() }))
vi.mock('@polar-sh/sdk/funcs/customersGetStateExternal.js', () => ({ customersGetStateExternal: vi.fn() }))
vi.mock('@polar-sh/sdk/funcs/customersList.js', () => ({ customersList: vi.fn() }))
vi.mock('@polar-sh/sdk/funcs/customersUpdate.js', () => ({ customersUpdate: vi.fn() }))
vi.mock('@polar-sh/sdk/funcs/customerSessionsCreate.js', () => ({ customerSessionsCreate: vi.fn() }))
vi.mock('@polar-sh/sdk/funcs/discountsCreate.js', () => ({ discountsCreate: vi.fn() }))
vi.mock('@polar-sh/sdk/funcs/discountsDelete.js', () => ({ discountsDelete: vi.fn() }))
vi.mock('@polar-sh/sdk/funcs/discountsList.js', () => ({ discountsList: vi.fn() }))
vi.mock('@polar-sh/sdk/funcs/eventsList.js', () => ({ eventsList: vi.fn() }))
vi.mock('@polar-sh/sdk/funcs/ordersGenerateInvoice.js', () => ({ ordersGenerateInvoice: vi.fn() }))
vi.mock('@polar-sh/sdk/funcs/ordersGet.js', () => ({ ordersGet: vi.fn() }))
vi.mock('@polar-sh/sdk/funcs/ordersInvoice.js', () => ({ ordersInvoice: vi.fn() }))
vi.mock('@polar-sh/sdk/funcs/ordersList.js', () => ({ ordersList: vi.fn() }))
vi.mock('@polar-sh/sdk/funcs/refundsCreate.js', () => ({ refundsCreate: vi.fn() }))
vi.mock('@polar-sh/sdk/funcs/subscriptionsCreate.js', () => ({ subscriptionsCreate: vi.fn() }))
vi.mock('@polar-sh/sdk/funcs/subscriptionsUpdate.js', () => ({ subscriptionsUpdate: vi.fn() }))

const mockCheckoutsClientUpdate = vi.mocked(checkoutsClientUpdate)
const mockCheckoutsCreate = vi.mocked(checkoutsCreate)
const mockCustomersCreate = vi.mocked(customersCreate)
const mockCustomersGet = vi.mocked(customersGet)
const mockCustomersGetExternal = vi.mocked(customersGetExternal)
const mockCustomersGetState = vi.mocked(customersGetStateExternal)
const mockCustomersList = vi.mocked(customersList)
const mockCustomersUpdate = vi.mocked(customersUpdate)
const mockCustomerSessionsCreate = vi.mocked(customerSessionsCreate)
const mockDiscountsCreate = vi.mocked(discountsCreate)
const mockDiscountsDelete = vi.mocked(discountsDelete)
const mockDiscountsList = vi.mocked(discountsList)
const mockEventsList = vi.mocked(eventsList)
const mockOrdersGenerateInvoice = vi.mocked(ordersGenerateInvoice)
const mockOrdersGet = vi.mocked(ordersGet)
const mockOrdersInvoice = vi.mocked(ordersInvoice)
const mockOrdersList = vi.mocked(ordersList)
const mockRefundsCreate = vi.mocked(refundsCreate)
const mockSubscriptionsCreate = vi.mocked(subscriptionsCreate)
const mockSubscriptionsUpdate = vi.mocked(subscriptionsUpdate)

const components = {
  polar: { lib: { insertCustomer: 'ref:insertCustomer' } },
  backend: {
    // The auth tables' adapter: the fresh member and role reads.
    adapter: { findOne: 'ref:findOne' },
    billing: {
      getByUser: 'ref:getByUser',
      upsert: 'ref:upsert',
      userByCustomer: 'ref:userByCustomer',
      debit: 'ref:debit',
      settle: 'ref:settle',
      finalize: 'ref:finalize',
      release: 'ref:release',
      credit: 'ref:credit',
      clearPendingSpends: 'ref:clearPendingSpends',
      getBenefitMetadata: 'ref:getBenefitMetadata',
      upsertBenefitMetadata: 'ref:upsertBenefitMetadata',
      entityProfile: 'ref:entityProfile',
      claimTrial: 'ref:claimTrial',
      markTrialUsed: 'ref:markTrialUsed',
      reserveDiscountCode: 'ref:reserveDiscountCode',
      releaseDiscountCode: 'ref:releaseDiscountCode',
      recordSubscriptionChange: 'ref:recordSubscriptionChange',
      subscriptionChanges: 'ref:subscriptionChanges',
    },
    gifts: {
      create: 'ref:gifts.create',
      markPaid: 'ref:gifts.markPaid',
      markNotified: 'ref:gifts.markNotified',
      markClaimed: 'ref:gifts.markClaimed',
      listByEmail: 'ref:gifts.listByEmail',
      get: 'ref:gifts.get',
      resolveRecipient: 'ref:gifts.resolveRecipient',
    },
  },
} as never

/** Nothing here pays a gift, so the email instance only has to be one. */
const email = { sendTemplate: async () => null }

/**
 * Bills the signed-in user with a configured provider token, so the billing
 * entity is whatever {@link makeCtx}'s identity claims say — the same
 * claims-first resolution production uses, with no `resolveEntity` override.
 * The catalog sells two plans, and checkouts may return to `https://app`.
 */
function make(overrides: Partial<SetupBillingConfig> = {}) {
  return setupBilling(components, {
    email,
    accessToken: 'oat_test',
    billTo: 'user',
    products: { a: 'prod_a', b: 'prod_b' },
    trustedOrigins: ['https://app'],
    ...overrides,
  } as SetupBillingConfig)
}

// A session's token, signed in just now (`authTime`), as a sensitive action such as a refund takes it.
const signedIn = { subject: 'u1', email: 'u1@example.com', emailVerified: true, activeOrganizationId: 'org-1', sessionId: 'session-1', authTime: Date.now() }

/**
 * The auth tables as the claims describe them, for the fresh reads: the
 * account holds the role its token names (unless `stored` says it was
 * changed since), and owns the workspace it acts for.
 */
function authTables(claims: Record<string, unknown> | null, stored: { role?: string } = {}) {
  return (ref: unknown, args: unknown): unknown => {
    if (ref !== 'ref:findOne') return undefined
    const model = (args as { model?: string } | undefined)?.model
    if (model === 'user') return claims ? { role: stored.role ?? claims.role ?? 'user', banned: false } : null
    return model === 'member' && claims ? { role: 'owner' } : null
  }
}

function makeCtx(claims: Record<string, unknown> | null = signedIn, stored: { role?: string } = {}) {
  const tables = authTables(claims, stored)
  return {
    // Typed with the ref/args a Convex ctx actually passes: tests below
    // re-implement these to record the reference they were called with, and a
    // zero-arg annotation would make that a type error.
    // Nothing recorded about any subscription's scheduled changes yet.
    runQuery: vi.fn(async (ref?: unknown, args?: unknown): Promise<unknown> => (ref === 'ref:subscriptionChanges' ? [] : tables(ref, args) ?? null)),
    // The owner's one trial is theirs to hold until a test says otherwise, and
    // a discount-code attempt is reserved: the component's answer for a fresh window.
    runMutation: vi.fn(async (ref?: unknown, _args?: unknown): Promise<unknown> => {
      if (ref === 'ref:claimTrial') return true
      if (ref === 'ref:reserveDiscountCode') return { reserved: true, windowStart: 1_000 }
      return null
    }),
    auth: { getUserIdentity: vi.fn(async () => claims) },
  }
}

/** Invoke a registered action's implementation the way convex-test does. */
function invoke(fn: unknown) {
  return (ctx: unknown, args: unknown) =>
    (fn as unknown as (ctx: unknown, args: unknown) => Promise<unknown>)(ctx, args)
}

/** One live subscription on the synced component table. */
const liveSubscription = { id: 'sub_1', status: 'active', endedAt: null, productId: 'prod_a' }

/** The synced products table: the catalog's two plans, and a credit pack. */
const SYNCED_PRODUCTS: Record<string, object> = {
  prod_a: { id: 'prod_a', isRecurring: true, isArchived: false },
  prod_b: { id: 'prod_b', isRecurring: true, isArchived: false },
  prod_pack: { id: 'prod_pack', isRecurring: false, isArchived: false },
}

function withSubscriptions(subscriptions: unknown[] = [liveSubscription]) {
  vi.spyOn(Polar.prototype, 'getProduct').mockImplementation(async (_ctx, { productId }) => (SYNCED_PRODUCTS[productId] ?? null) as never)
  return vi.spyOn(Polar.prototype, 'listAllUserSubscriptions').mockResolvedValue(subscriptions as never)
}

/** What the provider answers for an object it does not have. */
const NOT_FOUND = { ok: false, error: Object.assign(new Error('Not found'), { statusCode: 404, error: 'ResourceNotFound' }) }

beforeEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
  mockSubscriptionsUpdate.mockResolvedValue({ ok: true, value: { id: 'sub_1', status: 'active' } } as never)
  // No customer carries the entity's id yet, and no trial ran on it. A
  // mapped customer is already keyed by its entity's id.
  mockCustomersGetExternal.mockResolvedValue(NOT_FOUND as never)
  mockCustomersGet.mockImplementation((async (_client: unknown, { id }: { id: string }) => ({ ok: true, value: { id, externalId: 'u1', metadata: {} } })) as never)
  vi.spyOn(Polar.prototype, 'listAllUserSubscriptions').mockResolvedValue([] as never)
})

describe('subscription lifecycle → SubscriptionUpdate union', () => {
  it('updateSubscription maps productId + proration onto the base arm', async () => {
    const billing = make()
    withSubscriptions()

    await billing.updateSubscription(makeCtx() as never, { productId: 'prod_b', proration: 'prorate' })

    expect(mockSubscriptionsUpdate).toHaveBeenCalledWith(expect.anything(), {
      id: 'sub_1',
      subscriptionUpdate: { productId: 'prod_b', prorationBehavior: 'prorate' },
    })
  })

  it('updateSubscription refuses a call that changes nothing', async () => {
    const billing = make()
    withSubscriptions()

    await expect(billing.updateSubscription(makeCtx() as never, {})).rejects.toThrow(/pass `productId`/)
    expect(mockSubscriptionsUpdate).not.toHaveBeenCalled()
  })

  it('refuses a plan change to the plan the subscription is already on, before the provider', async () => {
    const billing = make()
    withSubscriptions()

    await expect(billing.updateSubscription(makeCtx() as never, { productId: 'prod_a' }))
      .rejects.toMatchObject({ data: { code: 'invalid_input', field: 'productId' } })
    await expect(invoke(billing.api.updateSubscription)(makeCtx(), { productId: 'prod_a' }))
      .rejects.toMatchObject({ data: { code: 'invalid_input', field: 'productId' } })
    expect(mockSubscriptionsUpdate).not.toHaveBeenCalled()

    await invoke(billing.api.updateSubscription)(makeCtx(), { productId: 'prod_b' })
    expect(mockSubscriptionsUpdate).toHaveBeenCalledWith(expect.anything(), {
      id: 'sub_1',
      subscriptionUpdate: { productId: 'prod_b' },
    })
  })

  it('cancelSubscription defaults to the end of the paid period', async () => {
    const billing = make()
    withSubscriptions()

    await billing.cancelSubscription(makeCtx() as never, { reason: 'too_expensive', comment: 'over budget' })

    expect(mockSubscriptionsUpdate).toHaveBeenCalledWith(expect.anything(), {
      id: 'sub_1',
      subscriptionUpdate: {
        cancelAtPeriodEnd: true,
        customerCancellationReason: 'too_expensive',
        customerCancellationComment: 'over budget',
      },
    })
  })

  it('cancelSubscription with atPeriodEnd: false revokes immediately', async () => {
    const billing = make()
    withSubscriptions()

    await billing.cancelSubscription(makeCtx() as never, { atPeriodEnd: false, reason: 'other' })

    expect(mockSubscriptionsUpdate).toHaveBeenCalledWith(expect.anything(), {
      id: 'sub_1',
      subscriptionUpdate: {
        revoke: true,
        customerCancellationReason: 'other',
        customerCancellationComment: undefined,
      },
    })
  })

  it('cancelSubscription sends the comment trimmed, and refuses one longer than the panel allows', async () => {
    const billing = make()
    withSubscriptions()

    await billing.cancelSubscription(makeCtx() as never, { comment: '  over budget  ' })
    expect(mockSubscriptionsUpdate).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({
      subscriptionUpdate: expect.objectContaining({ customerCancellationComment: 'over budget' }),
    }))

    mockSubscriptionsUpdate.mockClear()
    await expect(billing.cancelSubscription(makeCtx() as never, { comment: 'x'.repeat(CANCELLATION_COMMENT_MAX + 1) }))
      .rejects.toMatchObject({ data: { code: 'invalid_input', field: 'comment' } })
    expect(mockSubscriptionsUpdate).not.toHaveBeenCalled()
  })

  it('refuses a second cancellation and an uncancel with nothing to undo before the provider is asked', async () => {
    const billing = make()
    withSubscriptions([{ ...liveSubscription, cancelAtPeriodEnd: true }])
    // The provider takes one cancellation per period: a second is no outage to retry.
    await expect(billing.cancelSubscription(makeCtx() as never, { reason: 'unused' }))
      .rejects.toMatchObject({ data: { code: 'invalid_input', field: 'subscriptionId', reason: 'cancel_scheduled' } })
    // Revoking at once is still possible.
    await billing.cancelSubscription(makeCtx() as never, { atPeriodEnd: false })
    expect(mockSubscriptionsUpdate).toHaveBeenCalledTimes(1)

    mockSubscriptionsUpdate.mockClear()
    withSubscriptions()
    await expect(billing.uncancelSubscription(makeCtx() as never))
      .rejects.toMatchObject({ data: { code: 'invalid_input', field: 'subscriptionId', reason: 'no_cancel_scheduled' } })
    expect(mockSubscriptionsUpdate).not.toHaveBeenCalled()
  })

  it('uncancelSubscription flips the cancel flag back off', async () => {
    const billing = make()
    withSubscriptions([{ ...liveSubscription, cancelAtPeriodEnd: true }])

    await billing.uncancelSubscription(makeCtx() as never)

    expect(mockSubscriptionsUpdate).toHaveBeenCalledWith(expect.anything(), {
      id: 'sub_1',
      subscriptionUpdate: { cancelAtPeriodEnd: false },
    })
  })

  it('pauseSubscription pauses at period end, optionally with an auto-resume date', async () => {
    const billing = make()
    withSubscriptions()
    const resumesAt = new Date('2026-10-01T00:00:00.000Z')

    await billing.pauseSubscription(makeCtx() as never, { resumesAt })

    expect(mockSubscriptionsUpdate).toHaveBeenCalledWith(expect.anything(), {
      id: 'sub_1',
      subscriptionUpdate: { pauseAtPeriodEnd: true, resumesAt },
    })
  })

  it('resumeSubscription resumes immediately', async () => {
    const billing = make()
    withSubscriptions()

    await billing.resumeSubscription(makeCtx() as never)

    expect(mockSubscriptionsUpdate).toHaveBeenCalledWith(expect.anything(), {
      id: 'sub_1',
      subscriptionUpdate: { resume: true },
    })
  })

  it('acts on a paused subscription — pause/resume statuses stay manageable', async () => {
    const billing = make()
    withSubscriptions([{ id: 'sub_paused', status: 'paused', endedAt: null, productId: 'prod_a' }])

    await billing.resumeSubscription(makeCtx() as never)

    expect(mockSubscriptionsUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: 'sub_paused' }),
    )
  })

  it('ignores ended subscriptions when picking the target', async () => {
    const billing = make()
    withSubscriptions([
      { id: 'sub_old', status: 'canceled', endedAt: '2026-01-01T00:00:00Z', productId: 'prod_a' },
      liveSubscription,
    ])

    await billing.cancelSubscription(makeCtx() as never)

    expect(mockSubscriptionsUpdate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: 'sub_1' }))
  })

  it('asks which subscription once an entity holds more than one', async () => {
    const billing = make({ multipleSubscriptions: true })
    withSubscriptions([liveSubscription, { id: 'sub_2', status: 'active', endedAt: null, productId: 'prod_b' }])

    await expect(billing.cancelSubscription(makeCtx() as never)).rejects.toThrow(/pass `subscriptionId`/)

    await billing.cancelSubscription(makeCtx() as never, { subscriptionId: 'sub_2' })
    expect(mockSubscriptionsUpdate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: 'sub_2' }))
  })

  it('refuses a subscriptionId from another billing account', async () => {
    const billing = make()
    withSubscriptions()

    await expect(
      billing.cancelSubscription(makeCtx() as never, { subscriptionId: 'sub_someone_else' }),
    ).rejects.toThrow(/not on this billing account/)
    expect(mockSubscriptionsUpdate).not.toHaveBeenCalled()
  })

  it('says so when there is nothing running to change', async () => {
    const billing = make()
    withSubscriptions([])

    await expect(billing.updateSubscription(makeCtx() as never, { productId: 'prod_b' }))
      .rejects.toThrow(/has none running/)
  })

  it('reports a failed provider update in this package’s own words', async () => {
    const billing = make()
    withSubscriptions()
    const error = Object.assign(new Error('subscription locked'), { name: 'SubscriptionLocked', statusCode: 409, error: 'SubscriptionLocked' })
    mockSubscriptionsUpdate.mockResolvedValue({ ok: false, error } as never)
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})

    // The provider's own message can carry a status line and a response body,
    // and these failures render straight into the UI — so the caller sees a
    // package-shaped message and a summary goes to the server log.
    await expect(billing.resumeSubscription(makeCtx() as never))
      .rejects.toThrow(/\[nuxt-backend\] Billing is temporarily unavailable/)
    expect(logged).toHaveBeenCalledWith(
      expect.stringContaining('failed at the provider'),
      { name: 'SubscriptionLocked', status: 409, code: 'SubscriptionLocked' },
    )
    logged.mockRestore()
  })

  // A refused request comes back with the request echoed in it: the SDK puts
  // the raw response body in the message, and a validation refusal lists each
  // rejected value. Convex keeps logs, so none of that may reach them.
  it('logs which fields the provider refused, never the values it echoed', async () => {
    const billing = make()
    withSubscriptions()
    const detail = [
      { loc: ['body', 'customer_email'], msg: 'value is not a valid email address', type: 'value_error', input: 'ada@example.com' },
      { loc: ['body', 'billing_address', 'line1'], msg: 'Field required', type: 'missing', input: { line2: '1 High St' } },
    ]
    const body = JSON.stringify({ detail })
    const error = Object.assign(new Error(`API error occurred: ${body}`), { name: 'HTTPValidationError', statusCode: 422, body, detail })
    mockSubscriptionsUpdate.mockResolvedValue({ ok: false, error } as never)
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(billing.resumeSubscription(makeCtx() as never)).rejects.toThrow(/temporarily unavailable/)

    expect(logged).toHaveBeenCalledWith(expect.stringContaining('billing.provider_failed'), {
      name: 'HTTPValidationError',
      status: 422,
      refused: ['body.customer_email (value_error)', 'body.billing_address.line1 (missing)'],
    })
    const written = JSON.stringify(logged.mock.calls)
    expect(written).not.toContain('ada@example.com')
    expect(written).not.toContain('High St')
    logged.mockRestore()
  })

  it('keeps the SDK’s fixed phrase for a payload it could not validate, not the value', async () => {
    const billing = make()
    withSubscriptions()
    const error = Object.assign(new Error('Input validation failed: expected an email, got "ada@example"'), {
      name: 'SDKValidationError',
      rawMessage: 'Input validation failed',
      rawValue: { customerEmail: 'ada@example' },
    })
    mockSubscriptionsUpdate.mockResolvedValue({ ok: false, error } as never)
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(billing.resumeSubscription(makeCtx() as never)).rejects.toThrow(/temporarily unavailable/)

    expect(logged).toHaveBeenCalledWith(expect.anything(), { name: 'SDKValidationError', message: 'Input validation failed' })
    expect(JSON.stringify(logged.mock.calls)).not.toContain('ada@example')
    logged.mockRestore()
  })
})

describe('degradation without BILLING_ACCESS_TOKEN', () => {
  /** No `accessToken`, and the env var is unset in the test runner. */
  function unconfigured() {
    return setupBilling(components, { email, billTo: 'user' } as SetupBillingConfig)
  }

  it.each([
    ['updateSubscription', (b: Billing, ctx: unknown) => b.updateSubscription(ctx as never, { productId: 'p' })],
    ['cancelSubscription', (b: Billing, ctx: unknown) => b.cancelSubscription(ctx as never)],
    ['uncancelSubscription', (b: Billing, ctx: unknown) => b.uncancelSubscription(ctx as never)],
    ['pauseSubscription', (b: Billing, ctx: unknown) => b.pauseSubscription(ctx as never)],
    ['resumeSubscription', (b: Billing, ctx: unknown) => b.resumeSubscription(ctx as never)],
    ['refundOrder', (b: Billing, ctx: unknown) => b.refundOrder(ctx as never, { orderId: 'o1', reason: 'other' })],
  ])('%s fails loudly rather than silently doing nothing', async (_name, call) => {
    const billing = unconfigured()
    withSubscriptions()

    // An admin, so refundOrder gets past who is asking to the missing token.
    await expect(call(billing, makeCtx({ ...signedIn, role: 'admin' }))).rejects.toThrow(/BILLING_ACCESS_TOKEN/)
    expect(mockSubscriptionsUpdate).not.toHaveBeenCalled()
    expect(mockRefundsCreate).not.toHaveBeenCalled()
  })

  it('history reads degrade to null instead of throwing', async () => {
    const billing = unconfigured()

    expect(await billing.getOrders(makeCtx() as never)).toBeNull()
    expect(await billing.getInvoiceUrl(makeCtx() as never, 'order_1')).toBeNull()
    expect(await billing.getUsageHistory(makeCtx() as never)).toBeNull()
    expect(mockOrdersList).not.toHaveBeenCalled()
    expect(mockOrdersGet).not.toHaveBeenCalled()
    expect(mockEventsList).not.toHaveBeenCalled()
  })

  it('history reads ask who is calling before they say billing is not configured', async () => {
    const billing = unconfigured()
    for (const read of [() => billing.getOrders(makeCtx(null) as never), () => billing.getInvoiceUrl(makeCtx(null) as never, 'order_1'), () => billing.getUsageHistory(makeCtx(null) as never)]) {
      await expect(read()).rejects.toMatchObject({ data: { code: 'unauthenticated' } })
    }
  })

  it('checkout fails loudly without a token', async () => {
    const billing = unconfigured()

    await expect(
      invoke(billing.api.generateCheckoutLink)(makeCtx(), {
        productIds: ['prod_a'], origin: 'https://app', successUrl: 'https://app/done',
      }),
    ).rejects.toThrow(/BILLING_ACCESS_TOKEN/)
    expect(mockCheckoutsCreate).not.toHaveBeenCalled()
  })

  it('discount management fails loudly without a token', async () => {
    const billing = unconfigured()

    await expect(billing.discounts.create({ name: 'Launch' } as never)).rejects.toThrow(/BILLING_ACCESS_TOKEN/)
    await expect(billing.discounts.list()).rejects.toThrow(/BILLING_ACCESS_TOKEN/)
    await expect(billing.discounts.remove('disc_1')).rejects.toThrow(/BILLING_ACCESS_TOKEN/)
    expect(mockDiscountsCreate).not.toHaveBeenCalled()
    expect(mockDiscountsList).not.toHaveBeenCalled()
    expect(mockDiscountsDelete).not.toHaveBeenCalled()
  })
})

describe('rate limiting', () => {
  function limiter(ok = true) {
    return { limit: vi.fn(async () => ({ ok })) }
  }

  it('burns the billingSync limit keyed by the billing entity', async () => {
    const rateLimiter = limiter()
    const billing = make({ rateLimiter })
    withSubscriptions()
    const ctx = makeCtx()

    await billing.cancelSubscription(ctx as never)

    expect(rateLimiter.limit).toHaveBeenCalledWith(ctx, 'billingSync', { key: 'u1', throws: true })
  })

  it.each([
    ['plan change', (b: Billing, ctx: unknown) => b.updateSubscription(ctx as never, { productId: 'p' })],
    ['order read', (b: Billing, ctx: unknown) => b.getOrders(ctx as never)],
    ['invoice read', (b: Billing, ctx: unknown) => b.getInvoiceUrl(ctx as never, 'order_1')],
  ])('a tripped limit stops the %s before it reaches the provider', async (_name, call) => {
    const rateLimiter = limiter(false)
    const billing = make({ rateLimiter })
    withSubscriptions()

    await expect(call(billing, makeCtx())).rejects.toThrow(/Too many/)
    expect(mockSubscriptionsUpdate).not.toHaveBeenCalled()
    expect(mockOrdersList).not.toHaveBeenCalled()
    expect(mockOrdersGet).not.toHaveBeenCalled()
  })

  it('a structural limiter\'s wait that is no number is dropped, and the call still refuses as rate_limited', async () => {
    const billing = make({ rateLimiter: { limit: vi.fn(async () => ({ ok: false, retryAfter: Number.NaN })) } as never })
    withSubscriptions()

    await expect(billing.cancelSubscription(makeCtx() as never))
      .rejects.toMatchObject({ data: { code: 'rate_limited', limit: 'billingSync' } })
    expect(mockSubscriptionsUpdate).not.toHaveBeenCalled()
  })

  it('checkout is throttled on the same limit', async () => {
    const rateLimiter = limiter(false)
    const billing = make({ rateLimiter })

    await expect(
      invoke(billing.api.generateCheckoutLink)(makeCtx(), {
        productIds: ['prod_a'], origin: 'https://app', successUrl: 'https://app/done',
      }),
    ).rejects.toThrow(/Too many checkouts/)
    expect(mockCheckoutsCreate).not.toHaveBeenCalled()
  })

  it('stays unthrottled with no limiter configured (the zero-config scaffold)', async () => {
    const billing = make()
    withSubscriptions()

    await billing.resumeSubscription(makeCtx() as never)

    expect(mockSubscriptionsUpdate).toHaveBeenCalled()
  })
})

describe('orders & invoices', () => {
  const providerOrder = {
    id: 'order_1',
    createdAt: new Date('2026-01-02T03:04:05.000Z'),
    modifiedAt: null,
    nextPaymentAttemptAt: undefined,
    status: 'paid',
    paid: true,
    totalAmount: 2400,
    currency: 'usd',
    invoiceNumber: 'INV-1',
    isInvoiceGenerated: true,
    customerId: 'cus_1',
  }

  function withCustomer(billing: Billing, id: string | null = 'cus_1') {
    return vi.spyOn(Polar.prototype, 'getCustomerByUserId')
      .mockResolvedValue(id === null ? null : { id, userId: 'u1' } as never)
  }

  it('reads the entity’s own orders live and JSON-normalizes them', async () => {
    const billing = make()
    withCustomer(billing)
    mockOrdersList.mockResolvedValue({
      ok: true,
      value: { result: { items: [providerOrder], pagination: { totalCount: 1, maxPage: 1 } } },
    } as never)

    const page = await billing.getOrders(makeCtx() as never, { limit: 25 })

    expect(mockOrdersList).toHaveBeenCalledWith(expect.anything(), {
      externalCustomerId: 'u1',
      page: 1,
      limit: 25,
      sorting: ['-created_at'],
    })
    // Dates become ISO strings and `undefined` holes are dropped — Convex
    // cannot serialize either back to the browser.
    expect(page!.items[0]).toStrictEqual({
      id: 'order_1',
      createdAt: '2026-01-02T03:04:05.000Z',
      modifiedAt: null,
      status: 'paid',
      paid: true,
      totalAmount: 2400,
      currency: 'usd',
      invoiceNumber: 'INV-1',
      isInvoiceGenerated: true,
      customerId: 'cus_1',
    })
    expect(page!.nextCursor).toBeUndefined()
  })

  it('clamps the page size to the provider window and hands back a next cursor', async () => {
    const billing = make()
    withCustomer(billing)
    mockOrdersList.mockResolvedValue({
      ok: true,
      value: { result: { items: [], pagination: { totalCount: 500, maxPage: 5 } } },
    } as never)

    const page = await billing.getOrders(makeCtx() as never, { limit: 5000 })

    expect(mockOrdersList).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ limit: 100, page: 1 }))
    expect(page!.nextCursor).toBe('2')
  })

  it('follows a cursor back to the provider’s page number', async () => {
    const billing = make()
    withCustomer(billing)
    mockOrdersList.mockResolvedValue({
      ok: true,
      value: { result: { items: [], pagination: { totalCount: 500, maxPage: 5 } } },
    } as never)

    await billing.getOrders(makeCtx() as never, { cursor: '3' })

    expect(mockOrdersList).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ page: 3 }))
  })

  it('returns an empty page — not null — when nothing was ever charged', async () => {
    const billing = make()
    withCustomer(billing, null)

    expect(await billing.getOrders(makeCtx() as never)).toStrictEqual({
      items: [],
      pagination: { totalCount: 0, maxPage: 0 },
    })
    expect(mockOrdersList).not.toHaveBeenCalled()
  })

  it('getInvoiceUrl returns the provider URL for the entity’s own order', async () => {
    const billing = make()
    withCustomer(billing)
    mockOrdersGet.mockResolvedValue({ ok: true, value: providerOrder } as never)
    mockOrdersInvoice.mockResolvedValue({ ok: true, value: { url: 'https://invoices/1.pdf' } } as never)

    expect(await billing.getInvoiceUrl(makeCtx() as never, 'order_1')).toStrictEqual({ url: 'https://invoices/1.pdf' })
  })

  it('getInvoiceUrl refuses an order belonging to another account', async () => {
    const billing = make()
    withCustomer(billing, 'cus_other')
    mockOrdersGet.mockResolvedValue({ ok: true, value: providerOrder } as never)

    await expect(billing.getInvoiceUrl(makeCtx() as never, 'order_1'))
      .rejects.toMatchObject({ data: { code: 'forbidden', reason: 'not_owner' } })
    expect(mockOrdersInvoice).not.toHaveBeenCalled()
  })

  it('getInvoiceUrl does not let a customer keyed to another entity vouch for its orders', async () => {
    const billing = make()
    withCustomer(billing)
    // The component still maps u1 onto cus_1, but cus_1 is keyed to another
    // entity (shared by the 0.1 email lookup): its orders are not u1's.
    mockCustomersGet.mockResolvedValue({ ok: true, value: { id: 'cus_1', externalId: 'org-0', metadata: {} } } as never)
    mockOrdersGet.mockResolvedValue({ ok: true, value: providerOrder } as never)
    vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(billing.getInvoiceUrl(makeCtx() as never, 'order_1'))
      .rejects.toMatchObject({ data: { code: 'forbidden', reason: 'not_owner' } })
    expect(mockOrdersInvoice).not.toHaveBeenCalled()
  })

  it('getInvoiceUrl still serves an order keyed to the entity when nothing is mapped', async () => {
    const billing = make()
    withCustomer(billing, null)
    mockOrdersGet.mockResolvedValue({ ok: true, value: { ...providerOrder, customerId: 'cus_9', customer: { externalId: 'u1' } } } as never)
    mockOrdersInvoice.mockResolvedValue({ ok: true, value: { url: 'https://invoices/9.pdf' } } as never)

    expect(await billing.getInvoiceUrl(makeCtx() as never, 'order_1')).toStrictEqual({ url: 'https://invoices/9.pdf' })
  })

  it('getInvoiceUrl refuses an order that does not exist exactly like someone else\'s', async () => {
    const billing = make()
    withCustomer(billing)
    const missing = Object.assign(new Error('Not found'), { name: 'ResourceNotFound', statusCode: 404, error: 'ResourceNotFound' })
    mockOrdersGet.mockResolvedValue({ ok: false, error: missing } as never)
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})

    const absent = await billing.getInvoiceUrl(makeCtx() as never, 'order_nope').catch((error: unknown) => error) as { data: unknown, message: string }
    mockOrdersGet.mockResolvedValue({ ok: true, value: providerOrder } as never)
    withCustomer(billing, 'cus_other')
    const foreign = await billing.getInvoiceUrl(makeCtx() as never, 'order_1').catch((error: unknown) => error) as { data: unknown, message: string }

    expect(absent.data).toEqual({ code: 'forbidden', reason: 'not_owner' })
    expect([absent.data, absent.message]).toEqual([foreign.data, foreign.message])
    // Not a provider failure: nothing for an operator to chase.
    expect(logged).not.toHaveBeenCalled()
    expect(mockOrdersInvoice).not.toHaveBeenCalled()
  })

  it('getInvoiceUrl asks for generation and reports “not yet” when no PDF exists', async () => {
    const billing = make()
    withCustomer(billing)
    mockOrdersGet.mockResolvedValue({
      ok: true,
      value: { ...providerOrder, isInvoiceGenerated: false },
    } as never)
    mockOrdersGenerateInvoice.mockResolvedValue({ ok: true, value: {} } as never)

    expect(await billing.getInvoiceUrl(makeCtx() as never, 'order_1')).toBeNull()
    expect(mockOrdersGenerateInvoice).toHaveBeenCalledWith(expect.anything(), { id: 'order_1' })
    expect(mockOrdersInvoice).not.toHaveBeenCalled()
  })
})

describe('refunds', () => {
  const adminCtx = () => makeCtx({ ...signedIn, role: 'admin' })
  const refundable = { ok: true, value: { id: 'order_1', refundableAmount: 2400, customerId: 'cus_1' } }
  const created = {
    ok: true,
    value: {
      id: 'ref_1',
      orderId: 'order_1',
      status: 'succeeded',
      reason: 'customer_request',
      amount: 2400,
      currency: 'usd',
      revokeBenefits: false,
    },
  }

  it('refunds the whole refundable amount by default', async () => {
    const billing = make()
    mockOrdersGet.mockResolvedValue(refundable as never)
    mockRefundsCreate.mockResolvedValue(created as never)

    const refund = await billing.refundOrder(adminCtx() as never, { orderId: 'order_1', reason: 'customer_request' })

    expect(mockRefundsCreate).toHaveBeenCalledWith(expect.anything(), {
      orderId: 'order_1',
      reason: 'customer_request',
      amount: 2400,
      revokeBenefits: undefined,
      metadata: undefined,
    })
    expect(refund).toStrictEqual({
      id: 'ref_1',
      orderId: 'order_1',
      status: 'succeeded',
      reason: 'customer_request',
      amount: 2400,
      currency: 'usd',
      revokeBenefits: false,
    })
  })

  it('warns before refunding a gift purchase its recipient already claimed, and refunds it', async () => {
    const billing = make()
    const warned = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockOrdersGet.mockResolvedValue({ ok: true, value: { ...refundable.value, metadata: { giftId: 'gift-1' } } } as never)
    mockRefundsCreate.mockResolvedValue(created as never)
    const ctx = adminCtx()
    ctx.runQuery.mockImplementation(async (ref?: unknown, args?: unknown) => (ref === 'ref:gifts.get' ? { id: 'gift-1', status: 'claimed' } : authTables({ ...signedIn, role: 'admin' })(ref, args) ?? null))

    await billing.refundOrder(ctx as never, { orderId: 'order_1', reason: 'customer_request' })

    expect(ctx.runQuery).toHaveBeenCalledWith('ref:gifts.get', { giftId: 'gift-1' })
    expect(warned).toHaveBeenCalledWith(expect.stringContaining('billing.gift_refunded_after_claim'))
    expect(mockRefundsCreate).toHaveBeenCalled()
  })

  it('passes an explicit partial amount and the benefit-revocation flag through', async () => {
    const billing = make()
    mockOrdersGet.mockResolvedValue(refundable as never)
    mockRefundsCreate.mockResolvedValue(created as never)

    await billing.refundOrder(adminCtx() as never, {
      orderId: 'order_1', amount: 500, reason: 'duplicate', revokeBenefits: true,
    })

    expect(mockRefundsCreate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ amount: 500, revokeBenefits: true, reason: 'duplicate' }),
    )
  })

  it('refuses an order with nothing left to refund', async () => {
    const billing = make()
    mockOrdersGet.mockResolvedValue({ ok: true, value: { id: 'order_1', refundableAmount: 0 } } as never)

    await expect(billing.refundOrder(adminCtx() as never, { orderId: 'order_1', reason: 'other' }))
      .rejects.toThrow(/nothing left to refund/)
    expect(mockRefundsCreate).not.toHaveBeenCalled()
  })

  it('is admin-tier: a plain signed-in caller is refused', async () => {
    const billing = make()

    await expect(billing.refundOrder(makeCtx() as never, { orderId: 'order_1', reason: 'other' }))
      .rejects.toThrow(/admin-only/)
    expect(mockOrdersGet).not.toHaveBeenCalled()
  })

  it('reads a comma-separated role', async () => {
    const billing = make()
    mockOrdersGet.mockResolvedValue(refundable as never)
    mockRefundsCreate.mockResolvedValue(created as never)

    await billing.refundOrder(
      makeCtx({ ...signedIn, role: 'user,admin' }) as never,
      { orderId: 'order_1', reason: 'other' },
    )

    expect(mockRefundsCreate).toHaveBeenCalled()
  })

  it('reads the role fresh: a demoted admin is refused whatever their token says', async () => {
    const billing = make()
    const demoted = makeCtx({ ...signedIn, role: 'admin' }, { role: 'user' })

    await expect(billing.refundOrder(demoted as never, { orderId: 'order_1', reason: 'other' })).rejects.toThrow(/admin-only/)
    expect(demoted.runQuery).toHaveBeenCalledWith('ref:findOne', { model: 'user', where: [{ field: '_id', value: 'u1' }] })
    expect(mockOrdersGet).not.toHaveBeenCalled()
  })

  it('refuses an admin\'s impersonated session, whatever the gate', async () => {
    const requireAdmin = vi.fn(async () => {})
    for (const billing of [make(), make({ requireAdmin })]) {
      const refusal = await billing.refundOrder(makeCtx({ ...signedIn, role: 'admin', impersonatedBy: 'admin-2' }) as never, { orderId: 'order_1', reason: 'other' })
        .catch((error: unknown) => error)
      expect(getBackendError(refusal)).toMatchObject({ code: 'forbidden', data: { reason: 'impersonating' } })
    }
    expect(requireAdmin).not.toHaveBeenCalled()
    expect(mockOrdersGet).not.toHaveBeenCalled()
  })

  it('takes a sign-in from the last ten minutes, asked of an admin only', async () => {
    const billing = make()
    const stale = { ...signedIn, authTime: Date.now() - 11 * 60_000 }
    const refusal = await billing.refundOrder(makeCtx({ ...stale, role: 'admin' }) as never, { orderId: 'order_1', reason: 'other' }).catch((error: unknown) => error)
    expect(getBackendError(refusal)).toMatchObject({ code: 'reauthentication_required' })
    // Someone who may not refund at all is told so, never asked to sign in again first.
    const plain = await billing.refundOrder(makeCtx(stale) as never, { orderId: 'order_1', reason: 'other' }).catch((error: unknown) => error)
    expect(getBackendError(plain)).toMatchObject({ code: 'forbidden', data: { reason: 'admin_only' } })
    expect(mockOrdersGet).not.toHaveBeenCalled()
  })

  it('honours a custom requireAdmin gate', async () => {
    const requireAdmin = vi.fn(async () => {
      throw new Error('not on the finance team')
    })
    const billing = make({ requireAdmin })

    await expect(billing.refundOrder(adminCtx() as never, { orderId: 'order_1', reason: 'other' }))
      .rejects.toThrow('not on the finance team')
    expect(requireAdmin).toHaveBeenCalled()
  })
})

describe('order.refunded → pending spends', () => {
  function primeRefresh() {
    vi.spyOn(Polar.prototype, 'getCustomerByUserId').mockResolvedValue({ id: 'cus_1', userId: 'u1' } as never)
    mockCustomersGetState.mockResolvedValue({
      ok: true,
      value: { activeSubscriptions: [], grantedBenefits: [], activeMeters: [] },
    } as never)
  }

  it('drops the entity’s reservations before re-reading the provider', async () => {
    const billing = make()
    primeRefresh()
    const ctx = makeCtx()
    const order: string[] = []
    ctx.runMutation.mockImplementation(async (ref: unknown) => {
      order.push(String(ref))
      return null
    })

    await billing.webhookEvents['order.refunded']!(ctx as never, {
      data: { customerId: 'cus_1', customer: { metadata: { userId: 'u1' } } },
    } as never)

    // Reservations first, then the refresh — so the refreshed cache is exactly
    // what the provider now says rather than provider state minus stale holds.
    expect(order).toStrictEqual(['ref:clearPendingSpends', 'ref:upsert'])
  })

  it('skips the clear when the event has no resolvable entity', async () => {
    const billing = make()
    primeRefresh()
    const ctx = makeCtx()

    await billing.webhookEvents['order.refunded']!(ctx as never, { data: {} } as never)

    expect(ctx.runMutation).not.toHaveBeenCalled()
  })
})

describe('discounts', () => {
  it('creates through the discounts object; no top-level alias', async () => {
    const billing = make()
    mockDiscountsCreate.mockResolvedValue({ ok: true, value: { id: 'disc_1', code: 'SAVE10' } } as never)

    expect(await billing.discounts.create({ name: 'Launch' } as never)).toStrictEqual({ id: 'disc_1', code: 'SAVE10' })
    expect('createDiscount' in billing).toBe(false)
  })

  it('lists one page at a time and hands back a next cursor', async () => {
    const billing = make()
    mockDiscountsList.mockResolvedValue({
      ok: true,
      value: { result: { items: [{ id: 'disc_1', code: 'SAVE10' }], pagination: { totalCount: 30, maxPage: 3 } } },
    } as never)

    const page = await billing.discounts.list({ query: 'Launch', limit: 10 })

    expect(mockDiscountsList).toHaveBeenCalledWith(expect.anything(), { query: 'Launch', page: 1, limit: 10 })
    expect(page.nextCursor).toBe('2')
    expect(page.items).toHaveLength(1)
  })

  it('removes a discount by id', async () => {
    const billing = make()
    mockDiscountsDelete.mockResolvedValue({ ok: true, value: undefined } as never)

    await billing.discounts.remove('disc_1')

    expect(mockDiscountsDelete).toHaveBeenCalledWith(expect.anything(), { id: 'disc_1' })
  })

  it('refuses a failed removal as unavailable, without the provider\'s words', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const billing = make()
    mockDiscountsDelete.mockResolvedValue({ ok: false, error: new Error('not found') } as never)

    const refusal = await billing.discounts.remove('disc_x').catch((error: unknown) => error)
    expect(refusal).toMatchObject({ data: { code: 'unavailable', service: 'billing', reason: 'provider_refused' } })
    expect(String(refusal)).not.toContain('not found')
  })
})

describe('checkout customization', () => {
  function primeCheckout(billing: Billing, customerId: string | null = 'cus_1') {
    vi.spyOn(Polar.prototype, 'getCustomerByUserId')
      .mockResolvedValue(customerId === null ? null : { id: customerId, userId: 'u1' } as never)
    mockCheckoutsCreate.mockResolvedValue({ ok: true, value: { url: 'https://checkout/1', clientSecret: 'cs_1' } } as never)
  }

  it('refuses a second plan while the entity holds one, before the provider hears of it', async () => {
    const billing = make({ products: { a: 'prod_a', b: 'prod_b', pack: 'prod_pack' } })
    primeCheckout(billing)
    withSubscriptions([liveSubscription])
    const landing = { origin: 'https://app', successUrl: 'https://app/done' }

    const refused = await invoke(billing.api.generateCheckoutLink)(makeCtx(), { productIds: ['prod_b'], ...landing }).catch((error: unknown) => error)
    expect(getBackendError(refused)).toMatchObject({ code: 'forbidden', data: { reason: 'already_subscribed' }, message: 'This account already has a plan. Switch plans instead of subscribing again.' })
    expect(mockCheckoutsCreate).not.toHaveBeenCalled()

    // A pack is still on sale, and so is a checkout that acts on the plan held.
    await invoke(billing.api.generateCheckoutLink)(makeCtx(), { productIds: ['prod_pack'], ...landing })
    await invoke(billing.api.generateCheckoutLink)(makeCtx(), { productIds: ['prod_b'], subscriptionId: 'sub_1', ...landing })
    expect(mockCheckoutsCreate).toHaveBeenCalledTimes(2)
  })

  it('sells a plan once the held one ended, and any plan with multipleSubscriptions', async () => {
    const landing = { origin: 'https://app', successUrl: 'https://app/done' }
    const ended = make()
    primeCheckout(ended)
    withSubscriptions([{ ...liveSubscription, status: 'canceled', endedAt: '2026-01-01T00:00:00Z' }])
    await invoke(ended.api.generateCheckoutLink)(makeCtx(), { productIds: ['prod_b'], ...landing })

    const multiple = make({ multipleSubscriptions: true })
    withSubscriptions([liveSubscription])
    await invoke(multiple.api.generateCheckoutLink)(makeCtx(), { productIds: ['prod_b'], ...landing })
    expect(mockCheckoutsCreate).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['https://app/done', 'https://app/done?checkout_return={CHECKOUT_ID}'],
    ['https://app/settings?tab=plan', 'https://app/settings?tab=plan&checkout_return={CHECKOUT_ID}'],
    ['https://app/settings?tab=plan#billing', 'https://app/settings?tab=plan&checkout_return={CHECKOUT_ID}#billing'],
    ['https://app/done?', 'https://app/done?checkout_return={CHECKOUT_ID}'],
    // An app's own id, under the name the provider suggests, stays as written beside the package's.
    ['https://app/done?checkout_id={CHECKOUT_ID}', 'https://app/done?checkout_id={CHECKOUT_ID}&checkout_return={CHECKOUT_ID}'],
    ['https://app/done?checkout_id=mine', 'https://app/done?checkout_id=mine&checkout_return={CHECKOUT_ID}'],
    // One that already carries the package's parameter keeps it.
    ['https://app/done?checkout_return={CHECKOUT_ID}', 'https://app/done?checkout_return={CHECKOUT_ID}'],
  ])('sends %s back with the checkout\'s id: %s', async (successUrl, sent) => {
    const billing = make()
    primeCheckout(billing)
    await invoke(billing.api.generateCheckoutLink)(makeCtx(), { productIds: ['prod_a'], origin: 'https://app', successUrl })
    // The braces stay as the provider looks for them: never percent-encoded.
    expect(mockCheckoutsCreate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ successUrl: sent }))
  })

  it('pays in a currency read as the pricing reads it: a price that names none is in the provider\'s default', async () => {
    const billing = make()
    primeCheckout(billing)
    vi.spyOn(Polar.prototype, 'getProduct').mockResolvedValue({ id: 'prod_a', isRecurring: true, isArchived: false, prices: [{ amountType: 'fixed', priceAmount: 900, isArchived: false }] } as never)
    await invoke(billing.api.generateCheckoutLink)(makeCtx(), { productIds: ['prod_a'], origin: 'https://app', successUrl: 'https://app/done', currency: 'USD' })
    expect(mockCheckoutsCreate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ currency: 'usd' }))
    const refused = await invoke(billing.api.generateCheckoutLink)(makeCtx(), { productIds: ['prod_a'], origin: 'https://app', successUrl: 'https://app/done', currency: 'eur' }).catch((error: unknown) => error)
    expect(getBackendError(refused)).toMatchObject({ code: 'invalid_input', data: { field: 'currency' } })
  })

  it('maps prefill, custom fields, locale and billing-address control onto CheckoutCreate', async () => {
    const billing = make()
    primeCheckout(billing)

    const result = await invoke(billing.api.generateCheckoutLink)(makeCtx(), {
      productIds: ['prod_a'],
      origin: 'https://app',
      successUrl: 'https://app/done',
      locale: 'fr',
      requireBillingAddress: true,
      customFields: { referral: 'launch', seats: 3, newsletter: true },
      prefill: {
        name: 'Ada',
        email: 'ada@example.com',
        billingName: 'Ada Ltd',
        billingAddress: { country: 'GB', line1: '1 High St', city: 'London', postalCode: 'E1' },
        taxId: 'GB123',
        business: true,
      },
    })

    expect(result).toStrictEqual({ url: 'https://checkout/1' })
    expect(mockCheckoutsCreate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      products: ['prod_a'],
      // By the entity's id, never by email or a customer id.
      externalCustomerId: 'u1',
      embedOrigin: 'https://app',
      // Back with the checkout's id, which the provider fills in.
      successUrl: 'https://app/done?checkout_return={CHECKOUT_ID}',
      // The payload has a real `locale` field — no query-string patching.
      locale: 'fr',
      requireBillingAddress: true,
      customFieldData: { referral: 'launch', seats: 3, newsletter: true },
      customerName: 'Ada',
      customerEmail: 'ada@example.com',
      customerBillingName: 'Ada Ltd',
      customerBillingAddress: { country: 'GB', line1: '1 High St', city: 'London', postalCode: 'E1' },
      customerTaxId: 'GB123',
      isBusinessCustomer: true,
      allowDiscountCodes: true,
    }))
  })

  it('allows discount codes by default and can turn them off', async () => {
    const billing = make()
    primeCheckout(billing)

    await invoke(billing.api.generateCheckoutLink)(makeCtx(), {
      productIds: ['prod_a'], origin: 'https://app', successUrl: 'https://app/done', allowDiscountCodes: false,
    })

    expect(mockCheckoutsCreate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ allowDiscountCodes: false, discountId: undefined }),
    )
  })

  // A discount by id is the server's to choose: an id names any discount,
  // the 100% one minted for a single claim included. Server code passes it
  // to billing.checkout without the catalog ever being listed.
  it('pre-applies a discount id from server code, without ever listing the catalog', async () => {
    const billing = make()
    primeCheckout(billing)

    await billing.checkout(makeCtx() as never, {
      productIds: ['prod_a'],
      origin: 'https://app',
      successUrl: 'https://app/done',
      discountId: 'disc_explicit',
    })

    expect(mockDiscountsList).not.toHaveBeenCalled()
    expect(mockCheckoutsCreate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ discountId: 'disc_explicit' }),
    )
  })

  it('creates the user\'s customer keyed by its id, and maps it to the billing entity', async () => {
    const billing = make()
    primeCheckout(billing, null)
    mockCustomersList.mockResolvedValue({ ok: true, value: { result: { items: [] } } } as never)
    mockCustomersCreate.mockResolvedValue({ ok: true, value: { id: 'cus_new' } } as never)
    const ctx = makeCtx()

    await invoke(billing.api.generateCheckoutLink)(ctx, {
      productIds: ['prod_a'], origin: 'https://app', successUrl: 'https://app/done',
    })

    expect(mockCustomersGetExternal).toHaveBeenCalledWith(expect.anything(), { externalId: 'u1' })
    // The external id is what every live call and webhook finds it by; the
    // tag keeps the first webhook resolving before any sync has run.
    expect(mockCustomersCreate).toHaveBeenCalledWith(expect.anything(), {
      email: 'u1@example.com',
      externalId: 'u1',
      metadata: { userId: 'u1' },
    })
    expect(ctx.runMutation).toHaveBeenCalledWith('ref:insertCustomer', { id: 'cus_new', userId: 'u1' })
    expect(mockCheckoutsCreate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ externalCustomerId: 'u1' }))
  })

  it('maps a customer that already carries the entity\'s id, without creating one', async () => {
    const billing = make()
    primeCheckout(billing, null)
    mockCustomersGetExternal.mockResolvedValue({ ok: true, value: { id: 'cus_keyed' } } as never)
    const ctx = makeCtx()

    await invoke(billing.api.generateCheckoutLink)(ctx, { productIds: ['prod_a'], origin: 'https://app', successUrl: 'https://app/done' })

    expect(mockCustomersList).not.toHaveBeenCalled()
    expect(mockCustomersCreate).not.toHaveBeenCalled()
    expect(ctx.runMutation).toHaveBeenCalledWith('ref:insertCustomer', { id: 'cus_keyed', userId: 'u1' })
  })

  it('adopts an unkeyed customer of the user\'s email, keying it to the entity', async () => {
    const billing = make()
    primeCheckout(billing, null)
    mockCustomersList.mockResolvedValue({
      ok: true,
      value: { result: { items: [{ id: 'cus_existing', externalId: null, metadata: { source: 'link' } }] } },
    } as never)
    mockCustomersUpdate.mockResolvedValue({ ok: true, value: { id: 'cus_existing' } } as never)
    const ctx = makeCtx()

    await invoke(billing.api.generateCheckoutLink)(ctx, {
      productIds: ['prod_a'], origin: 'https://app', successUrl: 'https://app/done',
    })

    expect(mockCustomersCreate).not.toHaveBeenCalled()
    expect(mockCustomersUpdate).toHaveBeenCalledWith(expect.anything(), {
      id: 'cus_existing',
      customerUpdate: { externalId: 'u1', metadata: { source: 'link', userId: 'u1' } },
    })
    expect(ctx.runMutation).toHaveBeenCalledWith('ref:insertCustomer', { id: 'cus_existing', userId: 'u1' })
  })

  it('reads the winner\'s customer when another first checkout created it a moment earlier', async () => {
    const billing = make()
    primeCheckout(billing, null)
    mockCustomersList.mockResolvedValue({ ok: true, value: { result: { items: [] } } } as never)
    // The provider keeps the external id unique: the second create is refused.
    mockCustomersCreate.mockResolvedValue({ ok: false, error: Object.assign(new Error('taken'), { statusCode: 422 }) } as never)
    mockCustomersGetExternal.mockResolvedValueOnce(NOT_FOUND as never).mockResolvedValueOnce({ ok: true, value: { id: 'cus_won' } } as never)
    const ctx = makeCtx()

    await invoke(billing.api.generateCheckoutLink)(ctx, { productIds: ['prod_a'], origin: 'https://app', successUrl: 'https://app/done' })

    expect(ctx.runMutation).toHaveBeenCalledWith('ref:insertCustomer', { id: 'cus_won', userId: 'u1' })
  })

  it('refuses when the user\'s email already pays for another account', async () => {
    const billing = make()
    primeCheckout(billing, null)
    mockCustomersList.mockResolvedValue({ ok: true, value: { result: { items: [{ id: 'cus_old', externalId: 'u-deleted', metadata: {} }] } } } as never)

    await expect(invoke(billing.api.generateCheckoutLink)(makeCtx(), { productIds: ['prod_a'], origin: 'https://app', successUrl: 'https://app/done' }))
      .rejects.toMatchObject({ data: { code: 'forbidden', reason: 'customer_taken', message: expect.stringContaining('already pays for another account') } })
    expect(mockCustomersCreate).not.toHaveBeenCalled()
    expect(mockCheckoutsCreate).not.toHaveBeenCalled()
  })
})

// One provider customer per billing entity. In workspace mode one person's
// email stands behind every workspace they own, and matching customers by it
// mapped a second workspace onto the first one's customer: one set of
// benefits and credits for both. Each workspace is a team customer of its own
// now, keyed by its id, with the owner as its owner member.
describe('one customer per workspace', () => {
  const args = { productIds: ['prod_a'], origin: 'https://app', successUrl: 'https://app/done' }
  const owner = { userId: 'u1', email: 'u1@example.com', name: 'Ada', emailVerified: true }

  function workspaceBilling(profile: Record<string, unknown>) {
    const billing = make({ billTo: 'workspace' })
    vi.spyOn(Polar.prototype, 'getCustomerByUserId').mockResolvedValue(null as never)
    mockCheckoutsCreate.mockResolvedValue({ ok: true, value: { url: 'https://checkout/1' } } as never)
    mockCustomersCreate.mockResolvedValue({ ok: true, value: { id: 'cus_team' } } as never)
    const ctx = makeCtx()
    ctx.runQuery.mockImplementation(async (ref?: unknown, args?: unknown) => ref === 'ref:entityProfile' ? { name: 'Acme', personal: false, owner, ownedEntityIds: ['org-0', 'org-1'], ...profile } : authTables(signedIn)(ref, args) ?? null)
    return { billing, ctx }
  }

  it('gives a second workspace of the same owner a team customer of its own, never matched by email', async () => {
    const { billing, ctx } = workspaceBilling({})
    // The owner's email already pays for their first workspace.
    mockCustomersList.mockResolvedValue({ ok: true, value: { result: { items: [{ id: 'cus_first', externalId: 'org-0', metadata: { userId: 'org-0' } }] } } } as never)

    await invoke(billing.api.generateCheckoutLink)(ctx, args)

    expect(ctx.runQuery).toHaveBeenCalledWith('ref:entityProfile', { entityId: 'org-1' })
    expect(mockCustomersList).not.toHaveBeenCalled()
    expect(mockCustomersCreate).toHaveBeenCalledWith(expect.anything(), {
      type: 'team',
      externalId: 'org-1',
      name: 'Acme',
      owner: { email: 'u1@example.com', name: 'Ada', externalId: 'u1' },
      metadata: { userId: 'org-1' },
    })
    expect(ctx.runMutation).toHaveBeenCalledWith('ref:insertCustomer', { id: 'cus_team', userId: 'org-1' })
    expect(ctx.runMutation).not.toHaveBeenCalledWith('ref:insertCustomer', expect.objectContaining({ id: 'cus_first' }))
    expect(mockCheckoutsCreate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ externalCustomerId: 'org-1' }))
  })

  it('makes the workspace owner the owner member whoever checks out', async () => {
    const { billing, ctx } = workspaceBilling({ owner: { userId: 'u-owner', email: 'owner@example.com', name: 'Owner', emailVerified: true } })

    await invoke(billing.api.generateCheckoutLink)(ctx, args)

    expect(mockCustomersCreate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      owner: { email: 'owner@example.com', name: 'Owner', externalId: 'u-owner' },
    }))
  })

  it('lets a personal workspace adopt its owner\'s unkeyed customer, as a team', async () => {
    const { billing, ctx } = workspaceBilling({ personal: true, ownedEntityIds: ['org-1'] })
    mockCustomersList.mockResolvedValue({ ok: true, value: { result: { items: [{ id: 'cus_old', externalId: null, metadata: {} }] } } } as never)
    mockCustomersUpdate.mockResolvedValue({ ok: true, value: { id: 'cus_old' } } as never)

    await invoke(billing.api.generateCheckoutLink)(ctx, args)

    expect(mockCustomersList).toHaveBeenCalledWith(expect.anything(), { email: 'u1@example.com', limit: 1 })
    expect(mockCustomersUpdate).toHaveBeenCalledWith(expect.anything(), {
      id: 'cus_old',
      customerUpdate: { externalId: 'org-1', metadata: { userId: 'org-1' }, type: 'team', name: 'Acme' },
    })
    expect(mockCustomersCreate).not.toHaveBeenCalled()
    expect(ctx.runMutation).toHaveBeenCalledWith('ref:insertCustomer', { id: 'cus_old', userId: 'org-1' })
  })

  it('never adopts into a personal workspace a customer another entity holds, nor without a verified email', async () => {
    for (const [profile, items] of [
      [{ personal: true }, [{ id: 'cus_first', externalId: 'org-0', metadata: {} }]],
      [{ personal: true }, [{ id: 'cus_tagged', externalId: null, metadata: { userId: 'org-0' } }]],
      [{ personal: true, owner: { ...owner, emailVerified: false } }, [{ id: 'cus_old', externalId: null, metadata: {} }]],
    ] as const) {
      vi.clearAllMocks()
      mockCustomersGetExternal.mockResolvedValue(NOT_FOUND as never)
      const { billing, ctx } = workspaceBilling(profile)
      mockCustomersList.mockResolvedValue({ ok: true, value: { result: { items } } } as never)

      await invoke(billing.api.generateCheckoutLink)(ctx, args)

      expect(mockCustomersUpdate).not.toHaveBeenCalled()
      expect(mockCustomersCreate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ type: 'team', externalId: 'org-1' }))
    }
  })

  it('starts no second trial for an owner who trialed on any workspace they own', async () => {
    const { billing, ctx } = workspaceBilling({})
    vi.spyOn(Polar.prototype, 'listAllUserSubscriptions').mockImplementation(async (_ctx, { userId }) =>
      (userId === 'org-0' ? [{ id: 'sub_old', status: 'canceled', trialStart: '2026-01-01T00:00:00.000Z' }] : []) as never)

    // Neither the product's own trial nor one the server grants.
    await billing.checkout(ctx as never, { ...args, trial: { interval: 'day', count: 14 } })

    const payload = mockCheckoutsCreate.mock.calls[0]![1]
    expect(payload).toMatchObject({ allowTrial: false })
    expect(payload).not.toHaveProperty('trialInterval')
  })

  it('keeps the product\'s trial for an owner who never had one', async () => {
    const { billing, ctx } = workspaceBilling({})

    await invoke(billing.api.generateCheckoutLink)(ctx, args)

    expect(mockCheckoutsCreate.mock.calls[0]![1]).not.toHaveProperty('allowTrial')
  })

  // The trial record is the owner's, kept by their user id: deleting the
  // workspace that trialed, or handing it to someone else, leaves no
  // subscription behind to read, and still no second trial.
  it('starts no second trial when the owner\'s recorded trial outlived the workspace that ran it', async () => {
    const { billing, ctx } = workspaceBilling({ ownedEntityIds: ['org-1'] })
    vi.spyOn(Polar.prototype, 'getProduct').mockResolvedValue({ id: 'prod_a', trialInterval: 'day' } as never)
    ctx.runMutation.mockImplementation(async (ref?: unknown) => (ref === 'ref:claimTrial' ? false : null))

    await invoke(billing.api.generateCheckoutLink)(ctx, args)

    expect(ctx.runMutation).toHaveBeenCalledWith('ref:claimTrial', { ownerUserId: 'u1', entityId: 'org-1', holdMs: 3_600_000 })
    expect(mockCheckoutsCreate.mock.calls[0]![1]).toMatchObject({ allowTrial: false })
  })

  it('holds the owner\'s trial only for a checkout that offers one', async () => {
    const { billing, ctx } = workspaceBilling({})
    vi.spyOn(Polar.prototype, 'getProduct').mockResolvedValue({ id: 'prod_a' } as never)

    await invoke(billing.api.generateCheckoutLink)(ctx, args)
    expect(ctx.runMutation).not.toHaveBeenCalledWith('ref:claimTrial', expect.anything())

    await billing.checkout(ctx as never, { ...args, trial: { interval: 'day', count: 7 } })
    expect(ctx.runMutation).toHaveBeenCalledWith('ref:claimTrial', expect.objectContaining({ ownerUserId: 'u1', entityId: 'org-1' }))
  })
})

// A customer from before 0.2 has no external id, and every live call goes by it.
describe('customers from before 0.2', () => {
  const args = { productIds: ['prod_a'], origin: 'https://app', successUrl: 'https://app/done' }

  it('keys a mapped customer by its entity\'s id on first touch', async () => {
    const billing = make()
    vi.spyOn(Polar.prototype, 'getCustomerByUserId').mockResolvedValue({ id: 'cus_old', userId: 'u1' } as never)
    mockCustomersGet.mockResolvedValue({ ok: true, value: { id: 'cus_old', externalId: null, metadata: { note: 'x' } } } as never)
    mockCustomersUpdate.mockResolvedValue({ ok: true, value: { id: 'cus_old' } } as never)
    mockCheckoutsCreate.mockResolvedValue({ ok: true, value: { url: 'https://checkout/1' } } as never)

    await invoke(billing.api.generateCheckoutLink)(makeCtx(), args)

    expect(mockCustomersUpdate).toHaveBeenCalledWith(expect.anything(), { id: 'cus_old', customerUpdate: { externalId: 'u1', metadata: { note: 'x', userId: 'u1' } } })
    expect(mockCheckoutsCreate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ externalCustomerId: 'u1' }))
  })

  it('refuses an entity mapped onto a customer another entity is keyed to', async () => {
    const billing = make({ billTo: 'workspace' })
    vi.spyOn(Polar.prototype, 'getCustomerByUserId').mockResolvedValue({ id: 'cus_shared', userId: 'org-1' } as never)
    mockCustomersGet.mockResolvedValue({ ok: true, value: { id: 'cus_shared', externalId: 'org-0', metadata: {} } } as never)
    vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(invoke(billing.api.generateCheckoutLink)(makeCtx(), args)).rejects.toMatchObject({ data: { code: 'forbidden', reason: 'customer_taken' } })
    expect(mockCustomersUpdate).not.toHaveBeenCalled()
    expect(mockCheckoutsCreate).not.toHaveBeenCalled()
  })

  it('keys a mapped customer before reading its orders and usage by the entity\'s id', async () => {
    const billing = make()
    vi.spyOn(Polar.prototype, 'getCustomerByUserId').mockResolvedValue({ id: 'cus_old', userId: 'u1' } as never)
    mockCustomersGet.mockResolvedValue({ ok: true, value: { id: 'cus_old', externalId: null, metadata: {} } } as never)
    mockCustomersUpdate.mockResolvedValue({ ok: true, value: { id: 'cus_old' } } as never)
    mockOrdersList.mockResolvedValue({ ok: true, value: { result: { items: [{ id: 'order_old' }], pagination: { totalCount: 1, maxPage: 1 } } } } as never)
    mockEventsList.mockResolvedValue({ ok: true, value: { items: [], pagination: { totalCount: 0, maxPage: 1 } } } as never)

    const orders = await billing.getOrders(makeCtx() as never)
    await billing.getUsageHistory(makeCtx() as never)

    // Keyed before the read, so the 0.1 customer's orders are found by its entity's id.
    expect(mockCustomersUpdate).toHaveBeenCalledWith(expect.anything(), { id: 'cus_old', customerUpdate: { externalId: 'u1', metadata: { userId: 'u1' } } })
    expect(mockCustomersUpdate.mock.invocationCallOrder[0]).toBeLessThan(mockOrdersList.mock.invocationCallOrder[0]!)
    expect(mockOrdersList).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ externalCustomerId: 'u1' }))
    expect(mockEventsList).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ externalCustomerId: 'u1' }))
    expect(orders!.items).toHaveLength(1)
  })

  it('shows no orders or usage for an entity mapped onto another entity\'s customer', async () => {
    const billing = make({ billTo: 'workspace' })
    vi.spyOn(Polar.prototype, 'getCustomerByUserId').mockResolvedValue({ id: 'cus_shared', userId: 'org-1' } as never)
    mockCustomersGet.mockResolvedValue({ ok: true, value: { id: 'cus_shared', externalId: 'org-0', metadata: {} } } as never)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const empty = { items: [], pagination: { totalCount: 0, maxPage: 0 } }

    expect(await billing.getOrders(makeCtx() as never)).toStrictEqual(empty)
    expect(await billing.getUsageHistory(makeCtx() as never)).toStrictEqual(empty)
    expect(mockOrdersList).not.toHaveBeenCalled()
    expect(mockEventsList).not.toHaveBeenCalled()
  })

  it('adopts an earlier customer of the user\'s email only for a verified email', async () => {
    const billing = make()
    vi.spyOn(Polar.prototype, 'getCustomerByUserId').mockResolvedValue(null as never)
    mockCustomersList.mockResolvedValue({ ok: true, value: { result: { items: [{ id: 'cus_existing', externalId: null, metadata: {} }] } } } as never)
    mockCustomersCreate.mockResolvedValue({ ok: true, value: { id: 'cus_new' } } as never)
    mockCheckoutsCreate.mockResolvedValue({ ok: true, value: { url: 'https://checkout/1' } } as never)

    await invoke(billing.api.generateCheckoutLink)(makeCtx({ ...signedIn, emailVerified: false }), args)

    expect(mockCustomersList).not.toHaveBeenCalled()
    expect(mockCustomersUpdate).not.toHaveBeenCalled()
    expect(mockCustomersCreate).toHaveBeenCalled()
  })
})

// The browser chooses which catalog product to buy and nothing else: what is
// sold, where the buyer lands, the trial, a discount by id and the metadata
// keys the package reads back are the server's. Each refusal names its field
// and comes before anything is created at the provider.
describe('server-authoritative checkout', () => {
  const args = { productIds: ['prod_a'], origin: 'https://app', successUrl: 'https://app/done' }

  /**
   * A billing whose entity has no provider customer yet, so a checkout that
   * got past its checks would look one up and create it: the refusals below
   * must come before either.
   */
  function primed(overrides: Partial<SetupBillingConfig> = {}) {
    const billing = make(overrides)
    vi.spyOn(Polar.prototype, 'getCustomerByUserId').mockResolvedValue(null as never)
    mockCustomersList.mockResolvedValue({ ok: true, value: { result: { items: [] } } } as never)
    mockCustomersCreate.mockResolvedValue({ ok: true, value: { id: 'cus_new' } } as never)
    mockCheckoutsCreate.mockResolvedValue({ ok: true, value: { url: 'https://checkout/1', clientSecret: 'cs_1' } } as never)
    return billing
  }

  /** The refusal a checkout with these extra arguments meets, and that the provider never heard of it. */
  async function refusal(extra: Record<string, unknown>, billing = primed(), ctx: ReturnType<typeof makeCtx> = makeCtx()) {
    const error = await invoke(billing.api.generateCheckoutLink)(ctx, { ...args, ...extra }).catch((caught: unknown) => caught)
    expect(mockCustomersList).not.toHaveBeenCalled()
    expect(mockCustomersCreate).not.toHaveBeenCalled()
    expect(mockCheckoutsCreate).not.toHaveBeenCalled()
    return (error as { data?: unknown }).data
  }

  it('sells only the catalog\'s products', async () => {
    expect(await refusal({ productIds: ['prod_a', 'prod_elsewhere'] })).toEqual({ code: 'invalid_input', field: 'productIds' })
    expect(await refusal({ productIds: [] })).toEqual({ code: 'invalid_input', field: 'productIds' })
    // No catalog at all sells nothing yet: the app's to fix, not the buyer's.
    expect(await refusal({}, primed({ products: undefined }))).toMatchObject({ code: 'not_ready', reason: 'no_catalog' })
  })

  it('sends the buyer back only to the site or a trusted origin', async () => {
    expect(await refusal({ successUrl: 'https://attacker.example/landing' })).toEqual({ code: 'invalid_input', field: 'successUrl' })
    expect(await refusal({ origin: 'https://attacker.example' })).toEqual({ code: 'invalid_input', field: 'origin' })
    expect(await refusal({ successUrl: 'javascript:alert(1)' })).toEqual({ code: 'invalid_input', field: 'successUrl' })
    // Same host, another scheme: another origin.
    expect(await refusal({ successUrl: 'http://app/done' })).toEqual({ code: 'invalid_input', field: 'successUrl' })
  })

  it('trusts SITE_URL\'s origin, and local origins only when they are trusted', async () => {
    vi.stubEnv('SITE_URL', 'https://shop.example/path')
    try {
      const billing = primed({ trustedOrigins: [] })
      const local = { origin: 'http://localhost:3001', successUrl: 'http://localhost:3001/done' }
      await invoke(billing.api.generateCheckoutLink)(makeCtx(), { ...args, origin: 'https://shop.example', successUrl: 'https://shop.example/billing?ok=1' })
      expect(mockCheckoutsCreate).toHaveBeenCalledTimes(1)
      vi.clearAllMocks()
      expect(await refusal(local, billing)).toEqual({ code: 'invalid_input', field: 'origin' })
      vi.stubEnv('BACKEND_ENVIRONMENT', 'development')
      await expect(invoke(billing.api.generateCheckoutLink)(makeCtx(), { ...args, ...local })).resolves.toEqual({ url: 'https://checkout/1' })
      // A .localhost name a local HTTPS proxy serves is as local as a loopback port.
      const proxied = { origin: 'https://nuxt-backend.localhost', successUrl: 'https://nuxt-backend.localhost/done' }
      await expect(invoke(billing.api.generateCheckoutLink)(makeCtx(), { ...args, ...proxied })).resolves.toEqual({ url: 'https://checkout/1' })
      vi.clearAllMocks()
      expect(await refusal({ origin: 'https://nuxt-backend.localhost.evil.com', successUrl: 'https://nuxt-backend.localhost.evil.com/done' }, billing)).toEqual({ code: 'invalid_input', field: 'origin' })
    }
    finally {
      vi.unstubAllEnvs()
    }
  })

  it('refuses the metadata keys the package reads back, in any case, and oversized metadata', async () => {
    for (const key of ['userId', 'UserID', 'gift', 'giftId', 'recipientEmail', 'purchaserUserId', 'giftRecipient', 'utm_source']) {
      expect(await refusal({ metadata: { [key]: 'x' } }), key).toEqual({ code: 'invalid_input', field: 'metadata' })
    }
    expect(await refusal({ metadata: { ['k'.repeat(41)]: 'x' } })).toEqual({ code: 'invalid_input', field: 'metadata' })
    expect(await refusal({ metadata: { note: 'x'.repeat(501) } })).toEqual({ code: 'invalid_input', field: 'metadata' })
    expect(await refusal({ metadata: Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`k${i}`, 'v'])) }))
      .toEqual({ code: 'invalid_input', field: 'metadata' })
  })

  it('refuses a trial or a discount id from the client, naming the field', async () => {
    expect(await refusal({ trialInterval: 'year', trialIntervalCount: 5 })).toEqual({ code: 'invalid_input', field: 'trialInterval' })
    expect(await refusal({ trialIntervalCount: 3 })).toEqual({ code: 'invalid_input', field: 'trialIntervalCount' })
    expect(await refusal({ discountId: 'disc_full' })).toEqual({ code: 'invalid_input', field: 'discountId' })
  })

  it('refuses another entity\'s subscription to upgrade', async () => {
    withSubscriptions()
    expect(await refusal({ subscriptionId: 'sub_someone_else' })).toEqual({ code: 'forbidden', reason: 'not_owner' })

    const billing = primed()
    withSubscriptions()
    await invoke(billing.api.generateCheckoutLink)(makeCtx(), { ...args, subscriptionId: 'sub_1' })
    expect(mockCheckoutsCreate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ subscriptionId: 'sub_1' }))
  })

  it('keeps the app\'s own metadata and flattens campaign attribution into utm_* keys', async () => {
    const billing = primed()

    await invoke(billing.api.generateCheckoutLink)(makeCtx(), {
      ...args,
      metadata: { plan_page: 'pricing' },
      utm: { source: '  newsletter ', medium: '', campaign: 'c'.repeat(150), content: 'hero' },
    })

    expect(mockCheckoutsCreate.mock.calls[0]![1].metadata).toStrictEqual({
      plan_page: 'pricing',
      // Who opened it, for an abandoned checkout's lifecycle email.
      openedBy: 'u1',
      utm_source: 'newsletter',
      utm_campaign: 'c'.repeat(100),
      utm_content: 'hero',
    })
    // No trial fields at all: the product's own trial applies.
    expect(mockCheckoutsCreate.mock.calls[0]![1]).not.toHaveProperty('allowTrial')
  })

  it('applies a discount code on the created session, through its client secret', async () => {
    const billing = primed()
    mockCheckoutsClientUpdate.mockResolvedValue({ ok: true, value: {} } as never)

    const result = await invoke(billing.api.generateCheckoutLink)(makeCtx(), { ...args, allowDiscountCodes: false, discountCode: ' LAUNCH20 ' })

    expect(result).toEqual({ url: 'https://checkout/1' })
    // A code applied up front needs codes allowed.
    expect(mockCheckoutsCreate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ allowDiscountCodes: true }))
    expect(mockCheckoutsClientUpdate).toHaveBeenCalledWith(expect.anything(), { clientSecret: 'cs_1', checkoutUpdatePublic: { discountCode: 'LAUNCH20' } })
  })

  it('refuses a code the provider refuses as invalid_input, and a failure as unavailable', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const billing = primed()
    mockCheckoutsClientUpdate.mockResolvedValueOnce({ ok: false, error: Object.assign(new Error('Body: {"detail":"LAUNCH20"}'), { statusCode: 422 }) } as never)
    await expect(invoke(billing.api.generateCheckoutLink)(makeCtx(), { ...args, discountCode: 'LAUNCH20' }))
      .rejects.toMatchObject({ data: { code: 'invalid_input', field: 'discountCode' } })

    mockCheckoutsClientUpdate.mockResolvedValueOnce({ ok: false, error: Object.assign(new Error('down'), { statusCode: 503 }) } as never)
    await expect(invoke(billing.api.generateCheckoutLink)(makeCtx(), { ...args, discountCode: 'LAUNCH20' }))
      .rejects.toMatchObject({ data: { code: 'unavailable', reason: 'provider_refused' } })

    vi.clearAllMocks()
    expect(await refusal({ discountCode: 'X'.repeat(65) }, billing)).toEqual({ code: 'invalid_input', field: 'discountCode' })
  })

  it('lets server code grant a trial of at most 30 days, or remove the product\'s own', async () => {
    const billing = primed()
    const checkout = (trial: unknown) => billing.checkout(makeCtx() as never, { ...args, trial: trial as never })

    await checkout({ interval: 'day', count: 30 })
    expect(mockCheckoutsCreate).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ allowTrial: true, trialInterval: 'day', trialIntervalCount: 30 }))
    await checkout({ interval: 'week', count: 4 })
    expect(mockCheckoutsCreate).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ trialInterval: 'week', trialIntervalCount: 4 }))
    await checkout(false)
    expect(mockCheckoutsCreate).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ allowTrial: false }))

    vi.clearAllMocks()
    // A month is a calendar month at the provider, up to 31 days: no months.
    for (const trial of [{ interval: 'day', count: 31 }, { interval: 'week', count: 5 }, { interval: 'month' }, { interval: 'year' }, { interval: 'day', count: 0 }, { interval: 'day', count: 1.5 }, null, 'day']) {
      await expect(checkout(trial), JSON.stringify(trial)).rejects.toMatchObject({ data: { code: 'invalid_input', field: 'trial' } })
    }
    expect(mockCheckoutsCreate).not.toHaveBeenCalled()
  })

  it('holds server checkouts to the catalog and the site too', async () => {
    const billing = primed()
    await expect(billing.checkout(makeCtx() as never, { ...args, productIds: ['prod_elsewhere'] }))
      .rejects.toMatchObject({ data: { code: 'invalid_input', field: 'productIds' } })
    await expect(billing.checkout(makeCtx() as never, { ...args, successUrl: 'https://attacker.example' }))
      .rejects.toMatchObject({ data: { code: 'invalid_input', field: 'successUrl' } })
  })

  it('switches plans only to a catalog product, before the provider is asked', async () => {
    const billing = make()
    withSubscriptions()

    await expect(invoke(billing.api.updateSubscription)(makeCtx(), { productId: 'prod_elsewhere' }))
      .rejects.toMatchObject({ data: { code: 'invalid_input', field: 'productId' } })
    expect(mockSubscriptionsUpdate).not.toHaveBeenCalled()
  })

  it('opens the portal with a return URL only on the site', async () => {
    const billing = make()
    vi.spyOn(Polar.prototype, 'getCustomerByUserId').mockResolvedValue({ id: 'cus_1', userId: 'u1' } as never)
    mockCustomerSessionsCreate.mockResolvedValue({ ok: true, value: { customerPortalUrl: 'https://portal/1' } } as never)

    await expect(invoke(billing.api.generateCustomerPortalUrl)(makeCtx(), { returnUrl: 'https://attacker.example/back' }))
      .rejects.toMatchObject({ data: { code: 'invalid_input', field: 'returnUrl' } })
    expect(mockCustomerSessionsCreate).not.toHaveBeenCalled()

    // The same call back to the site opens the portal.
    await expect(invoke(billing.api.generateCustomerPortalUrl)(makeCtx(), { returnUrl: 'https://app/settings' })).resolves.toEqual({ url: 'https://portal/1' })
    expect(mockCustomerSessionsCreate).toHaveBeenCalledWith(expect.anything(), { customerId: 'cus_1', returnUrl: 'https://app/settings' })
  })

  it('refuses a signed-out caller as unauthenticated before what it sent', async () => {
    expect(await refusal({ trialInterval: 'day', discountId: 'disc_full' }, primed(), makeCtx(null))).toMatchObject({ code: 'unauthenticated' })
  })

  it('refuses metadata values that are no strings, from server code too', async () => {
    const billing = primed()
    await expect(billing.checkout(makeCtx() as never, { ...args, metadata: { seats: 3 } as never }))
      .rejects.toMatchObject({ data: { code: 'invalid_input', field: 'metadata' } })
    expect(mockCheckoutsCreate).not.toHaveBeenCalled()
  })

  // The provider answers "valid or not" for every code a checkout applies:
  // unlimited, that is a way to test codes one after another.
  it('counts each refused discount code against the entity, with or without an app limiter', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const billing = primed()
    const ctx = makeCtx()
    mockCheckoutsClientUpdate.mockResolvedValue({ ok: false, error: Object.assign(new Error('refused'), { statusCode: 422 }) } as never)

    await expect(invoke(billing.api.generateCheckoutLink)(ctx, { ...args, discountCode: 'GUESS1' }))
      .rejects.toMatchObject({ data: { code: 'invalid_input', field: 'discountCode' } })

    expect(ctx.runMutation).toHaveBeenCalledWith('ref:reserveDiscountCode', { userId: 'u1', max: 10, windowMs: 3_600_000 })
    // Reserved before the provider heard of the checkout, and kept: the provider refused the code.
    expect(ctx.runMutation.mock.invocationCallOrder[0]!).toBeLessThan(mockCheckoutsCreate.mock.invocationCallOrder[0]!)
    expect(ctx.runMutation).not.toHaveBeenCalledWith('ref:releaseDiscountCode', expect.anything())
  })

  it('gives the attempt back when the provider accepts the code', async () => {
    const billing = primed()
    const ctx = makeCtx()
    mockCheckoutsClientUpdate.mockResolvedValue({ ok: true, value: {} } as never)

    await expect(invoke(billing.api.generateCheckoutLink)(ctx, { ...args, discountCode: 'LAUNCH20' })).resolves.toEqual({ url: 'https://checkout/1' })
    expect(ctx.runMutation).toHaveBeenCalledWith('ref:releaseDiscountCode', { userId: 'u1', windowStart: 1_000 })
  })

  it('gives the attempt back when the checkout fails before the code is tried, or the provider is down', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const billing = primed()
    mockCheckoutsCreate.mockResolvedValueOnce({ ok: false, error: Object.assign(new Error('down'), { statusCode: 503 }) } as never)
    const failedCreate = makeCtx()
    await expect(invoke(billing.api.generateCheckoutLink)(failedCreate, { ...args, discountCode: 'LAUNCH20' }))
      .rejects.toMatchObject({ data: { code: 'unavailable', reason: 'provider_refused' } })
    expect(mockCheckoutsClientUpdate).not.toHaveBeenCalled()
    expect(failedCreate.runMutation).toHaveBeenCalledWith('ref:releaseDiscountCode', { userId: 'u1', windowStart: 1_000 })

    mockCheckoutsClientUpdate.mockResolvedValueOnce({ ok: false, error: Object.assign(new Error('down'), { statusCode: 503 }) } as never)
    const failedApply = makeCtx()
    await expect(invoke(billing.api.generateCheckoutLink)(failedApply, { ...args, discountCode: 'LAUNCH20' }))
      .rejects.toMatchObject({ data: { code: 'unavailable' } })
    expect(failedApply.runMutation).toHaveBeenCalledWith('ref:releaseDiscountCode', { userId: 'u1', windowStart: 1_000 })
  })

  it('refuses a discount code while the entity waits out its refused codes, before any checkout', async () => {
    const ctx = makeCtx()
    ctx.runMutation.mockImplementation(async ref => (ref === 'ref:reserveDiscountCode' ? { reserved: false, retryAfter: 1_200_000 } : null))

    expect(await refusal({ discountCode: 'GUESS11' }, primed(), ctx)).toEqual({ code: 'rate_limited', limit: 'discountCode', retryAfter: 1_200_000 })
    expect(mockCheckoutsClientUpdate).not.toHaveBeenCalled()
    // Without a code, the same entity checks out.
    await expect(invoke(primed().api.generateCheckoutLink)(ctx, args)).resolves.toEqual({ url: 'https://checkout/1' })
  })

  it('switches plans only to a recurring plan, never a credit pack', async () => {
    const billing = make({ products: { a: 'prod_a', b: 'prod_b', pack: 'prod_pack' } })
    withSubscriptions()

    await expect(invoke(billing.api.updateSubscription)(makeCtx(), { productId: 'prod_pack' }))
      .rejects.toMatchObject({ data: { code: 'invalid_input', field: 'productId' } })
    expect(mockSubscriptionsUpdate).not.toHaveBeenCalled()
  })

  it('warns at setup about a trusted origin without its scheme', () => {
    const warned = vi.spyOn(console, 'warn').mockImplementation(() => {})
    make({ trustedOrigins: ['https://app', 'shop.example'] })
    expect(warned).toHaveBeenCalledTimes(1)
    expect(String(warned.mock.calls[0]![0])).toContain('billing.trusted_origin_invalid')
  })
})

describe('beside the free plan', () => {
  const landing = { origin: 'https://app', successUrl: 'https://app/done' }
  /** The catalog as `billing sync` writes it: a free plan, two paid plans and a recurring add-on. */
  const catalog = {
    sandbox: {
      products: { free: 'prod_free', a: 'prod_a', b: 'prod_b', addon: 'prod_addon' },
      plans: { free: { month: 'prod_free' }, a: { month: 'prod_a' }, b: { month: 'prod_b' } },
      free: 'free',
      meters: {},
    },
  }
  const freeSubscription = { id: 'sub_free', status: 'active', endedAt: null, productId: 'prod_free' }
  const products: Record<string, object> = {
    ...SYNCED_PRODUCTS,
    prod_free: { id: 'prod_free', isRecurring: true, isArchived: false, prices: [{ amountType: 'free', isArchived: false }] },
    prod_addon: { id: 'prod_addon', isRecurring: true, isArchived: false },
  }

  function onPlans(subscriptions: unknown[]) {
    vi.spyOn(Polar.prototype, 'getProduct').mockImplementation(async (_ctx, { productId }) => (products[productId] ?? null) as never)
    vi.spyOn(Polar.prototype, 'listAllUserSubscriptions').mockResolvedValue(subscriptions as never)
    vi.spyOn(Polar.prototype, 'getCustomerByUserId').mockResolvedValue({ id: 'cus_1', userId: 'u1' } as never)
    mockCheckoutsCreate.mockResolvedValue({ ok: true, value: { url: 'https://checkout/1', clientSecret: 'cs_1' } } as never)
  }
  const checkout = (billing: Billing, productId: string) => invoke(billing.api.generateCheckoutLink)(makeCtx(), { productIds: [productId], ...landing })
  const sentSubscription = () => (mockCheckoutsCreate.mock.calls.at(-1)![1] as { subscriptionId?: string }).subscriptionId

  it('upgrades the free subscription in place with a plan\'s checkout', async () => {
    const billing = make({ products: undefined, catalog } as never)
    onPlans([freeSubscription])
    await checkout(billing, 'prod_b')
    expect(sentSubscription()).toBe('sub_free')
  })

  it('refuses a plan while a paid one is held beside the free plan, which it never upgrades into a second', async () => {
    const billing = make({ products: undefined, catalog } as never)
    // The free plan started late: a checkout opened before it was paid after it.
    onPlans([freeSubscription, liveSubscription])
    const refused = await checkout(billing, 'prod_b').catch((error: unknown) => error)
    expect(getBackendError(refused)).toMatchObject({ code: 'forbidden', data: { reason: 'already_subscribed' } })
    expect(mockCheckoutsCreate).not.toHaveBeenCalled()
  })

  it('with multipleSubscriptions, lets an add-on sit beside the free plan and a plan replace it', async () => {
    const billing = make({ products: undefined, catalog, multipleSubscriptions: true } as never)
    onPlans([freeSubscription])
    await checkout(billing, 'prod_addon')
    expect(sentSubscription()).toBeUndefined()
    await checkout(billing, 'prod_a')
    expect(sentSubscription()).toBe('sub_free')
  })

  describe('an account\'s start, with billTo: \'user\'', () => {
    /** An account's row, read by the start in place of a signed-in caller's claims. */
    function startCtx(user: { email: string, emailVerified: boolean } | null) {
      return {
        runQuery: vi.fn(async (ref?: unknown, args?: unknown): Promise<unknown> => (ref === 'ref:findOne' && (args as { model?: string }).model === 'user' ? user : null)),
        runMutation: vi.fn(async () => null),
        auth: { getUserIdentity: vi.fn(async () => null) },
      }
    }
    const start = (billing: Billing, ctx: unknown) => invoke(billing.api.startFreePlan)(ctx, { entityId: 'u1' })

    beforeEach(() => {
      vi.spyOn(Polar.prototype, 'getCustomerByUserId').mockResolvedValue(null as never)
      mockCustomersGetState.mockResolvedValue({ ok: true, value: { activeSubscriptions: [] } } as never)
      mockSubscriptionsCreate.mockResolvedValue({ ok: true, value: { id: 'sub_free' } } as never)
      mockCustomersUpdate.mockImplementation((async (_client: unknown, { id }: { id: string }) => ({ ok: true, value: { id } })) as never)
    })

    it('adopts the earlier customer of the account\'s proven email, as its own checkout would', async () => {
      const billing = make({ products: undefined, catalog } as never)
      mockCustomersList.mockResolvedValue({ ok: true, value: { result: { items: [{ id: 'cus_earlier', externalId: null, metadata: {} }] } } } as never)
      expect(await start(billing, startCtx({ email: 'Ada@Example.com', emailVerified: true }))).toBe('started')
      expect(mockCustomersUpdate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: 'cus_earlier', customerUpdate: expect.objectContaining({ externalId: 'u1' }) }))
      expect(mockCustomersCreate).not.toHaveBeenCalled()
      expect(mockSubscriptionsCreate).toHaveBeenCalledWith(expect.anything(), { productId: 'prod_free', externalCustomerId: 'u1' })
    })

    it('leaves the account off the plan, logged and not retried, when another account\'s customer holds its email', async () => {
      const billing = make({ products: undefined, catalog } as never)
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      mockCustomersList.mockResolvedValue({ ok: true, value: { result: { items: [{ id: 'cus_other', externalId: 'u2', metadata: {} }] } } } as never)
      expect(await start(billing, startCtx({ email: 'ada@example.com', emailVerified: true }))).toBe('customer_taken')
      expect(mockSubscriptionsCreate).not.toHaveBeenCalled()
      expect(warn.mock.calls.map(([line]) => String(line))).toContainEqual(expect.stringContaining('billing.free_plan_customer_taken'))
    })

    it('starts nothing for a kind billing does not bill', async () => {
      const billing = make({ products: undefined, catalog } as never)
      expect(await invoke(billing.api.startFreePlan)(startCtx(null), { entityId: 'org_1', kind: 'workspace' })).toBe('not_billed')
      expect(mockCustomersList).not.toHaveBeenCalled()
    })
  })
})

describe('multipleSubscriptions', () => {
  const first = { id: 'sub_1', status: 'active', endedAt: null, productId: 'prod_a' }
  const second = { id: 'sub_2', status: 'trialing', endedAt: null, productId: 'prod_addon' }

  function readCurrent(billing: Billing, subscriptions: unknown[]) {
    vi.spyOn(Polar.prototype, 'listAllUserSubscriptions').mockResolvedValue(subscriptions as never)
    return invoke(billing.api.getCurrentSubscription)(makeCtx(), {})
  }

  it('keeps the single-subscription read by default', async () => {
    const billing = make()
    const single = vi.spyOn(Polar.prototype, 'getCurrentSubscription')
      .mockResolvedValue({ id: 'sub_1', productId: 'prod_a' } as never)

    const result = await invoke(billing.api.getCurrentSubscription)(makeCtx(), {})

    expect(single).toHaveBeenCalled()
    expect(result).toStrictEqual({ id: 'sub_1', productId: 'prod_a', pendingChange: null, resumesAt: null })
  })

  it('leads with the array and keeps the primary fields readable', async () => {
    const billing = make({ multipleSubscriptions: true })

    const result = await readCurrent(billing, [first, second]) as Record<string, unknown>

    // Each row is joined to its product exactly as the single-subscription
    // read does, so both branches hand the UI the same shape.
    expect(result.subscriptions).toStrictEqual([
      { ...first, pendingChange: null, resumesAt: null, productKey: 'a', product: null },
      { ...second, pendingChange: null, resumesAt: null, productKey: undefined, product: null },
    ])
    // Single-plan consumers keep reading `.productId` / `.status` unchanged.
    expect(result.productId).toBe('prod_a')
    expect(result.status).toBe('active')
  })

  it('counts a paused subscription as live — pause events are not confirmed here', async () => {
    const billing = make({ multipleSubscriptions: true })

    const result = await readCurrent(billing, [
      { id: 'sub_p', status: 'paused', endedAt: null, productId: 'prod_a' },
    ]) as Record<string, unknown>

    expect((result.subscriptions as unknown[])).toHaveLength(1)
  })

  it('still returns null — the free plan — when nothing is live', async () => {
    const billing = make({ multipleSubscriptions: true })

    expect(await readCurrent(billing, [
      { id: 'sub_old', status: 'canceled', endedAt: '2026-01-01T00:00:00Z', productId: 'prod_a' },
    ])).toBeNull()
    expect(await readCurrent(billing, [])).toBeNull()
  })

  it('excludes a trial the synced table has not caught up on yet', async () => {
    const billing = make({ multipleSubscriptions: true })

    // `listAllUserSubscriptions` is a raw read of the webhook-synced table, so
    // it lags the trial-end transition — the single-subscription read drops
    // these, and both branches have to agree on what "subscribed" means.
    expect(await readCurrent(billing, [
      { id: 'sub_t', status: 'trialing', endedAt: null, productId: 'prod_a', trialEnd: '2020-01-01T00:00:00.000Z' },
    ])).toBeNull()

    const live = await readCurrent(billing, [
      { id: 'sub_t', status: 'trialing', endedAt: null, productId: 'prod_a', trialEnd: '2099-01-01T00:00:00.000Z' },
    ]) as Record<string, unknown>
    expect(live.id).toBe('sub_t')
  })

  it('joins the configured product key onto every live row', async () => {
    const billing = make({ multipleSubscriptions: true, products: { pro: 'prod_a' } })
    vi.spyOn(Polar.prototype, 'getProduct').mockResolvedValue({ id: 'prod_a', name: 'Pro' } as never)

    const result = await readCurrent(billing, [first]) as Record<string, unknown>

    expect(result.productKey).toBe('pro')
    expect(result.product).toStrictEqual({ id: 'prod_a', name: 'Pro' })
  })

  it('returns null for a claimless caller either way', async () => {
    const billing = make({ multipleSubscriptions: true })
    vi.spyOn(Polar.prototype, 'listAllUserSubscriptions').mockResolvedValue([] as never)

    expect(await invoke(billing.api.getCurrentSubscription)(makeCtx(null), {})).toBeNull()
  })
})

describe('scheduled changes: a plan change and a resume date', () => {
  const appliesAt = new Date('2099-02-01T00:00:00.000Z')
  const resumesAt = new Date('2099-03-01T00:00:00.000Z')
  const modifiedAt = new Date('2099-01-15T00:00:00.000Z')

  it('keeps what the update response says, so a scheduled change reads back before its webhook', async () => {
    const billing = make()
    withSubscriptions()
    mockSubscriptionsUpdate.mockResolvedValueOnce({
      ok: true,
      value: { id: 'sub_1', status: 'active', createdAt: new Date('2099-01-01T00:00:00.000Z'), modifiedAt, resumesAt: null, pendingUpdate: { id: 'pu_1', productId: 'prod_b', appliesAt, seats: null } },
    } as never)
    const ctx = makeCtx()

    await billing.updateSubscription(ctx as never, { productId: 'prod_b' })

    expect(ctx.runMutation).toHaveBeenCalledWith('ref:recordSubscriptionChange', {
      subscriptionId: 'sub_1',
      userId: 'u1',
      pendingChange: { productId: 'prod_b', appliesAt: appliesAt.getTime() },
      resumesAt: null,
      modifiedAt: modifiedAt.getTime(),
    })
  })

  it('keeps the resume date of a pause, and no plan change for an update that changes no product', async () => {
    const billing = make()
    withSubscriptions()
    mockSubscriptionsUpdate.mockResolvedValueOnce({
      ok: true,
      value: { id: 'sub_1', status: 'active', createdAt: modifiedAt, modifiedAt: null, resumesAt, pendingUpdate: { id: 'pu_1', productId: null, appliesAt, seats: 3 } },
    } as never)
    const ctx = makeCtx()

    await billing.pauseSubscription(ctx as never, { resumesAt })

    expect(ctx.runMutation).toHaveBeenCalledWith('ref:recordSubscriptionChange', {
      subscriptionId: 'sub_1',
      userId: 'u1',
      pendingChange: null,
      resumesAt: resumesAt.getTime(),
      // No modification yet: the creation time orders it.
      modifiedAt: modifiedAt.getTime(),
    })
  })

  it('joins the recorded change onto both subscription reads, as ISO strings', async () => {
    const billing = make()
    withSubscriptions([liveSubscription, { id: 'sub_old', status: 'canceled', endedAt: '2026-01-01T00:00:00Z', productId: 'prod_a' }])
    vi.spyOn(Polar.prototype, 'getCurrentSubscription').mockResolvedValue(liveSubscription as never)
    const ctx = makeCtx()
    ctx.runQuery.mockImplementation(async (ref?: unknown, args?: unknown) => (ref === 'ref:subscriptionChanges'
      ? [{ subscriptionId: 'sub_1', pendingChange: { productId: 'prod_b', appliesAt: appliesAt.getTime() }, resumesAt: resumesAt.getTime(), modifiedAt: modifiedAt.getTime() }]
      : authTables(signedIn)(ref, args) ?? null))

    const current = await invoke(billing.api.getCurrentSubscription)(ctx, {})
    const all = await invoke(billing.api.listAllSubscriptions)(ctx, {}) as Array<Record<string, unknown>>

    const joined = { pendingChange: { productId: 'prod_b', appliesAt: appliesAt.toISOString() }, resumesAt: resumesAt.toISOString() }
    expect(current).toStrictEqual({ ...liveSubscription, ...joined })
    // By the ids the read holds, never a capped scan of the entity's rows.
    expect(ctx.runQuery).toHaveBeenCalledWith('ref:subscriptionChanges', { subscriptionIds: ['sub_1'] })
    expect(ctx.runQuery).toHaveBeenCalledWith('ref:subscriptionChanges', { subscriptionIds: ['sub_1', 'sub_old'] })
    expect(all[0]).toStrictEqual({ ...liveSubscription, ...joined })
    // A subscription nothing was recorded for reads as nothing scheduled.
    expect(all[1]).toMatchObject({ id: 'sub_old', pendingChange: null, resumesAt: null })
  })

  it('drops a record the subscription moved on from, or whose date has passed', async () => {
    const billing = make()
    const synced = { ...liveSubscription, modifiedAt: '2099-01-20T00:00:00.000Z' }
    vi.spyOn(Polar.prototype, 'getCurrentSubscription').mockResolvedValue(synced as never)
    const read = async (change: Record<string, unknown>) => {
      const ctx = makeCtx()
      ctx.runQuery.mockImplementation(async (ref?: unknown, args?: unknown) => (ref === 'ref:subscriptionChanges' ? [{ subscriptionId: 'sub_1', ...change }] : authTables(signedIn)(ref, args) ?? null))
      return await invoke(billing.api.getCurrentSubscription)(ctx, {}) as Record<string, unknown>
    }
    const scheduled = { pendingChange: { productId: 'prod_b', appliesAt: appliesAt.getTime() }, resumesAt: resumesAt.getTime() }

    // Recorded before the synced row's last change: the subscription moved on.
    expect(await read({ ...scheduled, modifiedAt: modifiedAt.getTime() })).toMatchObject({ pendingChange: null, resumesAt: null })
    // Recorded at the row's own time: current.
    expect(await read({ ...scheduled, modifiedAt: Date.parse(synced.modifiedAt) })).toMatchObject({ pendingChange: { productId: 'prod_b' } })
    // A change whose date has passed has applied; a resume date that passed, resumed.
    const past = Date.parse('2020-01-01T00:00:00.000Z')
    expect(await read({ pendingChange: { productId: 'prod_b', appliesAt: past }, resumesAt: past, modifiedAt: Date.parse(synced.modifiedAt) }))
      .toMatchObject({ pendingChange: null, resumesAt: null })
  })

  it('orders a state by its pending update too, so a stale delivery with the same subscription time loses', async () => {
    const billing = make()
    withSubscriptions()
    const subscriptionTime = new Date('2099-01-10T00:00:00.000Z')
    const scheduledAt = new Date('2099-01-12T00:00:00.000Z')
    // The fresh state: the provider scheduled a change without moving the subscription's own time.
    mockSubscriptionsUpdate.mockResolvedValueOnce({
      ok: true,
      value: { id: 'sub_1', status: 'active', createdAt: subscriptionTime, modifiedAt: subscriptionTime, resumesAt: null, pendingUpdate: { id: 'pu_1', productId: 'prod_b', appliesAt, seats: null, createdAt: scheduledAt, modifiedAt: null } },
    } as never)
    // The stale state: the same subscription time, no change yet.
    mockSubscriptionsUpdate.mockResolvedValueOnce({
      ok: true,
      value: { id: 'sub_1', status: 'active', createdAt: subscriptionTime, modifiedAt: subscriptionTime, resumesAt: null, pendingUpdate: null },
    } as never)
    const ctx = makeCtx()

    await billing.updateSubscription(ctx as never, { productId: 'prod_b' })
    await billing.updateSubscription(ctx as never, { productId: 'prod_b' })

    const keys = ctx.runMutation.mock.calls.filter(([ref]) => ref === 'ref:recordSubscriptionChange').map(([, args]) => (args as { modifiedAt: number }).modifiedAt)
    expect(keys).toEqual([scheduledAt.getTime(), subscriptionTime.getTime()])
    // The component keeps the larger key (test/convex-component/billing.test.ts), so the stale one loses.
    expect(keys[1]!).toBeLessThan(keys[0]!)
  })

  it('never fails an applied change when its record cannot be written, and logs it', async () => {
    const billing = make()
    withSubscriptions()
    mockSubscriptionsUpdate.mockResolvedValueOnce({
      ok: true,
      value: { id: 'sub_1', status: 'active', createdAt: modifiedAt, modifiedAt, resumesAt: null, pendingUpdate: { id: 'pu_1', productId: 'prod_b', appliesAt, seats: null } },
    } as never)
    const warned = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const ctx = makeCtx()
    const failure = new Error('write conflict')
    ctx.runMutation.mockImplementation(async (ref?: unknown) => {
      if (ref === 'ref:recordSubscriptionChange') throw failure
      return ref === 'ref:claimTrial' ? true : null
    })

    await expect(billing.updateSubscription(ctx as never, { productId: 'prod_b' })).resolves.toMatchObject({ id: 'sub_1' })
    expect(warned).toHaveBeenCalledWith(expect.stringContaining('[nuxt-backend] billing.subscription_change_unrecorded:'), failure)
  })
})

describe('usage history', () => {
  const providerEvent = {
    id: 'evt_1',
    timestamp: new Date('2026-02-03T04:05:06.000Z'),
    name: 'credits',
    source: 'user',
    customerId: 'cus_1',
    parentId: undefined,
    metadata: { amount: 4 },
  }

  function metered(overrides: Partial<SetupBillingConfig> = {}) {
    return make({ credits: { credits: { meterId: 'm_sum', property: 'amount' } }, ...overrides })
  }

  it('reads the entity’s own events, scoped to the named meter', async () => {
    const billing = metered()
    vi.spyOn(Polar.prototype, 'getCustomerByUserId').mockResolvedValue({ id: 'cus_1', userId: 'u1' } as never)
    mockEventsList.mockResolvedValue({
      ok: true,
      value: { items: [providerEvent], pagination: { totalCount: 1, maxPage: 1 } },
    } as never)

    const page = await billing.getUsageHistory(makeCtx() as never, { meter: 'credits', limit: 25 })

    expect(mockEventsList).toHaveBeenCalledWith(expect.anything(), {
      externalCustomerId: 'u1',
      meterId: 'm_sum',
      startTimestamp: undefined,
      endTimestamp: undefined,
      page: 1,
      limit: 25,
      sorting: ['-timestamp'],
    })
    // Dates become ISO strings, `undefined` holes are dropped, and the meter's
    // value property is resolved into `units`.
    expect(page!.items[0]).toStrictEqual({
      id: 'evt_1',
      timestamp: '2026-02-03T04:05:06.000Z',
      name: 'credits',
      source: 'user',
      customerId: 'cus_1',
      metadata: { amount: 4 },
      units: 4,
    })
  })

  it('counts one unit per event on a count meter, and says nothing without a meter', async () => {
    const counted = make({ credits: { calls: { meterId: 'm_count' } } })
    vi.spyOn(Polar.prototype, 'getCustomerByUserId').mockResolvedValue({ id: 'cus_1', userId: 'u1' } as never)
    mockEventsList.mockResolvedValue({
      ok: true,
      value: { items: [{ ...providerEvent, metadata: {} }], pagination: { totalCount: 1, maxPage: 1 } },
    } as never)

    const counting = await counted.getUsageHistory(makeCtx() as never, { meter: 'calls' })
    expect(counting!.items[0]!.units).toBe(1)

    const unfiltered = await counted.getUsageHistory(makeCtx() as never)
    expect(mockEventsList).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ meterId: undefined }))
    expect(unfiltered!.items[0]!.units).toBeUndefined()
  })

  it('is an empty page — not null — for an entity the provider has never billed', async () => {
    const billing = metered()
    vi.spyOn(Polar.prototype, 'getCustomerByUserId').mockResolvedValue(null as never)

    expect(await billing.getUsageHistory(makeCtx() as never)).toStrictEqual({
      items: [],
      pagination: { totalCount: 0, maxPage: 0 },
    })
    expect(mockEventsList).not.toHaveBeenCalled()
  })

  it('hands back a next cursor while more pages exist', async () => {
    const billing = metered()
    vi.spyOn(Polar.prototype, 'getCustomerByUserId').mockResolvedValue({ id: 'cus_1', userId: 'u1' } as never)
    mockEventsList.mockResolvedValue({
      ok: true,
      value: { items: [providerEvent], pagination: { totalCount: 30, maxPage: 3 } },
    } as never)

    const page = await billing.getUsageHistory(makeCtx() as never, { page: 2 })

    expect(page!.nextCursor).toBe('3')
  })
})

describe('registered actions', () => {
  it('every lifecycle/order function is registered for the client', () => {
    for (const name of [
      'updateSubscription', 'cancelSubscription', 'uncancelSubscription',
      'pauseSubscription', 'resumeSubscription', 'getOrders', 'getInvoiceUrl', 'refundOrder',
    ] as const) {
      expect(make().api[name], name).toBeDefined()
    }
  })

  it('pauseSubscription takes epoch milliseconds on the wire', async () => {
    const billing = make()
    withSubscriptions()

    await invoke(billing.api.pauseSubscription)(makeCtx(), { resumesAt: Date.UTC(2026, 9, 1) })

    expect(mockSubscriptionsUpdate).toHaveBeenCalledWith(expect.anything(), {
      id: 'sub_1',
      subscriptionUpdate: { pauseAtPeriodEnd: true, resumesAt: new Date(Date.UTC(2026, 9, 1)) },
    })
  })

  // The provider's own api() also has a product list and one-subscription
  // change and cancel actions. The package's lifecycle functions cover both,
  // so billing.api keeps only the provider's price list.
  it('billing.api keeps only the provider\'s price list of its own actions', () => {
    expect(Object.keys(make().api).sort()).toEqual([
      'acceptSaveOffer', 'cancelGift', 'cancelPendingChange', 'cancelSubscription', 'changeGiftRecipient', 'claimGift', 'generateCheckoutLink', 'generateCustomerPortalUrl', 'getBillingAccess',
      'getBillingConsole', 'getConfiguredProducts', 'getCredits', 'getCurrentSubscription', 'getFeatures', 'getInvoiceUrl', 'getOrders', 'getPricing',
      'getReceivedGifts', 'getRevenue', 'getSentGifts', 'getUsageHistory', 'getWithdrawal', 'giftCheckout', 'listAllSubscriptions', 'pauseSubscription',
      'refundOrder', 'rescheduleGift', 'resendGift', 'resumeSubscription', 'runGiftSweep', 'startFreePlan', 'syncEntitlements', 'syncProducts', 'uncancelSubscription', 'updateSubscription', 'withdraw',
    ])
  })

  it('the lifecycle actions resolve nothing from the client but the target id', async () => {
    const billing = make()
    withSubscriptions()

    // No userId argument exists — the entity always comes from the caller's
    // own identity, so a client cannot cancel someone else's plan.
    expect(await invoke(billing.api.cancelSubscription)(makeCtx(), { atPeriodEnd: true })).toEqual({ canceled: true, endsAt: null })
    expect(mockSubscriptionsUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: 'sub_1' }),
    )
  })
})
