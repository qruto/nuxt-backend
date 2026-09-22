import { beforeEach, describe, expect, it, vi } from 'vitest'
import { checkoutsCreate } from '@polar-sh/sdk/funcs/checkoutsCreate.js'
import { customersCreate } from '@polar-sh/sdk/funcs/customersCreate.js'
import { customersGetState } from '@polar-sh/sdk/funcs/customersGetState.js'
import { customersList } from '@polar-sh/sdk/funcs/customersList.js'
import { discountsCreate } from '@polar-sh/sdk/funcs/discountsCreate.js'
import { discountsDelete } from '@polar-sh/sdk/funcs/discountsDelete.js'
import { discountsList } from '@polar-sh/sdk/funcs/discountsList.js'
import { eventsList } from '@polar-sh/sdk/funcs/eventsList.js'
import { ordersGenerateInvoice } from '@polar-sh/sdk/funcs/ordersGenerateInvoice.js'
import { ordersGet } from '@polar-sh/sdk/funcs/ordersGet.js'
import { ordersInvoice } from '@polar-sh/sdk/funcs/ordersInvoice.js'
import { ordersList } from '@polar-sh/sdk/funcs/ordersList.js'
import { refundsCreate } from '@polar-sh/sdk/funcs/refundsCreate.js'
import { subscriptionsUpdate } from '@polar-sh/sdk/funcs/subscriptionsUpdate.js'
import { type Billing, setupBilling, type SetupBillingConfig } from '../../src/convex/integrations/billing'

/**
 * The subscription-lifecycle, order and checkout surface: what each call maps
 * onto in the provider SDK, how it degrades without an access token, which
 * rate-limit key it burns, and what a refund does to in-flight credit
 * reservations. Every provider function is faked — nothing here goes near the
 * network, and the deployment's token is expired anyway.
 */

vi.mock('@polar-sh/sdk/funcs/checkoutsCreate.js', () => ({ checkoutsCreate: vi.fn() }))
vi.mock('@polar-sh/sdk/funcs/customersCreate.js', () => ({ customersCreate: vi.fn() }))
vi.mock('@polar-sh/sdk/funcs/customersGetState.js', () => ({ customersGetState: vi.fn() }))
vi.mock('@polar-sh/sdk/funcs/customersList.js', () => ({ customersList: vi.fn() }))
vi.mock('@polar-sh/sdk/funcs/discountsCreate.js', () => ({ discountsCreate: vi.fn() }))
vi.mock('@polar-sh/sdk/funcs/discountsDelete.js', () => ({ discountsDelete: vi.fn() }))
vi.mock('@polar-sh/sdk/funcs/discountsList.js', () => ({ discountsList: vi.fn() }))
vi.mock('@polar-sh/sdk/funcs/eventsList.js', () => ({ eventsList: vi.fn() }))
vi.mock('@polar-sh/sdk/funcs/ordersGenerateInvoice.js', () => ({ ordersGenerateInvoice: vi.fn() }))
vi.mock('@polar-sh/sdk/funcs/ordersGet.js', () => ({ ordersGet: vi.fn() }))
vi.mock('@polar-sh/sdk/funcs/ordersInvoice.js', () => ({ ordersInvoice: vi.fn() }))
vi.mock('@polar-sh/sdk/funcs/ordersList.js', () => ({ ordersList: vi.fn() }))
vi.mock('@polar-sh/sdk/funcs/refundsCreate.js', () => ({ refundsCreate: vi.fn() }))
vi.mock('@polar-sh/sdk/funcs/subscriptionsUpdate.js', () => ({ subscriptionsUpdate: vi.fn() }))

const mockCheckoutsCreate = vi.mocked(checkoutsCreate)
const mockCustomersCreate = vi.mocked(customersCreate)
const mockCustomersGetState = vi.mocked(customersGetState)
const mockCustomersList = vi.mocked(customersList)
const mockDiscountsCreate = vi.mocked(discountsCreate)
const mockDiscountsDelete = vi.mocked(discountsDelete)
const mockDiscountsList = vi.mocked(discountsList)
const mockEventsList = vi.mocked(eventsList)
const mockOrdersGenerateInvoice = vi.mocked(ordersGenerateInvoice)
const mockOrdersGet = vi.mocked(ordersGet)
const mockOrdersInvoice = vi.mocked(ordersInvoice)
const mockOrdersList = vi.mocked(ordersList)
const mockRefundsCreate = vi.mocked(refundsCreate)
const mockSubscriptionsUpdate = vi.mocked(subscriptionsUpdate)

const components = {
  polar: { lib: { insertCustomer: 'ref:insertCustomer' } },
  backend: {
    billing: {
      getByUser: 'ref:getByUser',
      upsert: 'ref:upsert',
      userByCustomer: 'ref:userByCustomer',
      debit: 'ref:debit',
      settle: 'ref:settle',
      release: 'ref:release',
      credit: 'ref:credit',
      clearPendingSpends: 'ref:clearPendingSpends',
      getBenefitMetadata: 'ref:getBenefitMetadata',
      upsertBenefitMetadata: 'ref:upsertBenefitMetadata',
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

/**
 * Bills the signed-in user with a configured provider token, so the billing
 * entity is whatever {@link makeCtx}'s identity claims say — the same
 * claims-first resolution production uses, with no `getUserInfo` override.
 */
function make(overrides: Partial<SetupBillingConfig> = {}) {
  return setupBilling(components, {
    accessToken: 'oat_test',
    billTo: 'user',
    ...overrides,
  } as SetupBillingConfig)
}

const signedIn = { subject: 'u1', email: 'u1@example.com', activeOrganizationId: 'org-1' }

function makeCtx(claims: Record<string, unknown> | null = signedIn) {
  return {
    // Typed with the ref/args a Convex ctx actually passes: tests below
    // re-implement these to record the reference they were called with, and a
    // zero-arg annotation would make that a type error.
    runQuery: vi.fn(async (_ref?: unknown, _args?: unknown): Promise<unknown> => null),
    runMutation: vi.fn(async (_ref?: unknown, _args?: unknown): Promise<unknown> => null),
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

function withSubscriptions(billing: Billing, subscriptions: unknown[] = [liveSubscription]) {
  return vi.spyOn(billing.provider, 'listAllUserSubscriptions').mockResolvedValue(subscriptions as never)
}

beforeEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
  mockSubscriptionsUpdate.mockResolvedValue({ ok: true, value: { id: 'sub_1', status: 'active' } } as never)
})

describe('subscription lifecycle → SubscriptionUpdate union', () => {
  it('updateSubscription maps productId + proration onto the base arm', async () => {
    const billing = make()
    withSubscriptions(billing)

    await billing.updateSubscription(makeCtx() as never, { productId: 'prod_b', proration: 'prorate' })

    expect(mockSubscriptionsUpdate).toHaveBeenCalledWith(expect.anything(), {
      id: 'sub_1',
      subscriptionUpdate: { productId: 'prod_b', prorationBehavior: 'prorate' },
    })
  })

  it('updateSubscription refuses a call that changes nothing', async () => {
    const billing = make()
    withSubscriptions(billing)

    await expect(billing.updateSubscription(makeCtx() as never, {})).rejects.toThrow(/pass `productId`/)
    expect(mockSubscriptionsUpdate).not.toHaveBeenCalled()
  })

  it('cancelSubscription defaults to the end of the paid period', async () => {
    const billing = make()
    withSubscriptions(billing)

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
    withSubscriptions(billing)

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

  it('uncancelSubscription flips the cancel flag back off', async () => {
    const billing = make()
    withSubscriptions(billing)

    await billing.uncancelSubscription(makeCtx() as never)

    expect(mockSubscriptionsUpdate).toHaveBeenCalledWith(expect.anything(), {
      id: 'sub_1',
      subscriptionUpdate: { cancelAtPeriodEnd: false },
    })
  })

  it('pauseSubscription pauses at period end, optionally with an auto-resume date', async () => {
    const billing = make()
    withSubscriptions(billing)
    const resumesAt = new Date('2026-10-01T00:00:00.000Z')

    await billing.pauseSubscription(makeCtx() as never, { resumesAt })

    expect(mockSubscriptionsUpdate).toHaveBeenCalledWith(expect.anything(), {
      id: 'sub_1',
      subscriptionUpdate: { pauseAtPeriodEnd: true, resumesAt },
    })
  })

  it('resumeSubscription resumes immediately', async () => {
    const billing = make()
    withSubscriptions(billing)

    await billing.resumeSubscription(makeCtx() as never)

    expect(mockSubscriptionsUpdate).toHaveBeenCalledWith(expect.anything(), {
      id: 'sub_1',
      subscriptionUpdate: { resume: true },
    })
  })

  it('acts on a paused subscription — pause/resume statuses stay manageable', async () => {
    const billing = make()
    withSubscriptions(billing, [{ id: 'sub_paused', status: 'paused', endedAt: null, productId: 'prod_a' }])

    await billing.resumeSubscription(makeCtx() as never)

    expect(mockSubscriptionsUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: 'sub_paused' }),
    )
  })

  it('ignores ended subscriptions when picking the target', async () => {
    const billing = make()
    withSubscriptions(billing, [
      { id: 'sub_old', status: 'canceled', endedAt: '2026-01-01T00:00:00Z', productId: 'prod_a' },
      liveSubscription,
    ])

    await billing.uncancelSubscription(makeCtx() as never)

    expect(mockSubscriptionsUpdate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: 'sub_1' }))
  })

  it('asks which subscription once an entity holds more than one', async () => {
    const billing = make({ multipleSubscriptions: true })
    withSubscriptions(billing, [liveSubscription, { id: 'sub_2', status: 'active', endedAt: null, productId: 'prod_b' }])

    await expect(billing.cancelSubscription(makeCtx() as never)).rejects.toThrow(/pass `subscriptionId`/)

    await billing.cancelSubscription(makeCtx() as never, { subscriptionId: 'sub_2' })
    expect(mockSubscriptionsUpdate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: 'sub_2' }))
  })

  it('refuses a subscriptionId from another billing account', async () => {
    const billing = make()
    withSubscriptions(billing)

    await expect(
      billing.cancelSubscription(makeCtx() as never, { subscriptionId: 'sub_someone_else' }),
    ).rejects.toThrow(/not on this billing account/)
    expect(mockSubscriptionsUpdate).not.toHaveBeenCalled()
  })

  it('says so when there is nothing running to change', async () => {
    const billing = make()
    withSubscriptions(billing, [])

    await expect(billing.updateSubscription(makeCtx() as never, { productId: 'prod_b' }))
      .rejects.toThrow(/has none running/)
  })

  it('reports a failed provider update in this package’s own words', async () => {
    const billing = make()
    withSubscriptions(billing)
    const error = new Error('subscription locked')
    mockSubscriptionsUpdate.mockResolvedValue({ ok: false, error } as never)
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})

    // The provider's own message can carry a status line and a response body,
    // and these failures render straight into the UI — so the caller sees a
    // package-shaped message and the detail goes to the server log.
    await expect(billing.resumeSubscription(makeCtx() as never))
      .rejects.toThrow(/\[nuxt-backend\] Billing is temporarily unavailable/)
    expect(logged).toHaveBeenCalledWith(expect.stringContaining('failed at the provider'), error)
    logged.mockRestore()
  })
})

describe('degradation without BILLING_ACCESS_TOKEN', () => {
  /** No `accessToken`, and the env var is unset in the test runner. */
  function unconfigured() {
    return setupBilling(components, { billTo: 'user' } as SetupBillingConfig)
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
    withSubscriptions(billing)

    await expect(call(billing, makeCtx())).rejects.toThrow(/BILLING_ACCESS_TOKEN/)
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
    withSubscriptions(billing)
    const ctx = makeCtx()

    await billing.cancelSubscription(ctx as never)

    expect(rateLimiter.limit).toHaveBeenCalledWith(ctx, 'billingSync', { key: 'u1' })
  })

  it.each([
    ['plan change', (b: Billing, ctx: unknown) => b.updateSubscription(ctx as never, { productId: 'p' })],
    ['order read', (b: Billing, ctx: unknown) => b.getOrders(ctx as never)],
    ['invoice read', (b: Billing, ctx: unknown) => b.getInvoiceUrl(ctx as never, 'order_1')],
  ])('a tripped limit stops the %s before it reaches the provider', async (_name, call) => {
    const rateLimiter = limiter(false)
    const billing = make({ rateLimiter })
    withSubscriptions(billing)

    await expect(call(billing, makeCtx())).rejects.toThrow(/Too many/)
    expect(mockSubscriptionsUpdate).not.toHaveBeenCalled()
    expect(mockOrdersList).not.toHaveBeenCalled()
    expect(mockOrdersGet).not.toHaveBeenCalled()
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
    withSubscriptions(billing)

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
    return vi.spyOn(billing.provider, 'getCustomerByUserId')
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
      customerId: 'cus_1',
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
      .rejects.toThrow(/different billing account/)
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

  it('reads a comma-separated role claim', async () => {
    const billing = make()
    mockOrdersGet.mockResolvedValue(refundable as never)
    mockRefundsCreate.mockResolvedValue(created as never)

    await billing.refundOrder(
      makeCtx({ ...signedIn, role: 'user,admin' }) as never,
      { orderId: 'order_1', reason: 'other' },
    )

    expect(mockRefundsCreate).toHaveBeenCalled()
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
  function primeRefresh(billing: Billing) {
    vi.spyOn(billing.provider, 'getCustomerByUserId').mockResolvedValue({ id: 'cus_1', userId: 'u1' } as never)
    mockCustomersGetState.mockResolvedValue({
      ok: true,
      value: { activeSubscriptions: [], grantedBenefits: [], activeMeters: [] },
    } as never)
  }

  it('drops the entity’s reservations before re-reading the provider', async () => {
    const billing = make()
    primeRefresh(billing)
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
    primeRefresh(billing)
    const ctx = makeCtx()

    await billing.webhookEvents['order.refunded']!(ctx as never, { data: {} } as never)

    expect(ctx.runMutation).not.toHaveBeenCalled()
  })

  it('still refreshes when the component has no clearPendingSpends yet', async () => {
    const older = {
      ...(components as unknown as Record<string, unknown>),
      backend: {
        ...((components as unknown as { backend: Record<string, unknown> }).backend),
        billing: Object.fromEntries(
          Object.entries((components as unknown as { backend: { billing: Record<string, unknown> } }).backend.billing)
            .filter(([key]) => key !== 'clearPendingSpends'),
        ),
      },
    }
    const billing = setupBilling(older as never, {
      accessToken: 'oat_test',
      billTo: 'user',
    } as SetupBillingConfig)
    primeRefresh(billing)
    const ctx = makeCtx()

    await billing.webhookEvents['order.refunded']!(ctx as never, {
      data: { customerId: 'cus_1', customer: { metadata: { userId: 'u1' } } },
    } as never)

    expect(ctx.runMutation).toHaveBeenCalledWith('ref:upsert', expect.objectContaining({ userId: 'u1' }))
    expect(ctx.runMutation).not.toHaveBeenCalledWith('ref:clearPendingSpends', expect.anything())
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

  it('propagates a failed removal', async () => {
    const billing = make()
    mockDiscountsDelete.mockResolvedValue({ ok: false, error: new Error('not found') } as never)

    await expect(billing.discounts.remove('disc_x')).rejects.toThrow('not found')
  })
})

describe('checkout customization', () => {
  function primeCheckout(billing: Billing, customerId: string | null = 'cus_1') {
    vi.spyOn(billing.provider, 'getCustomerByUserId')
      .mockResolvedValue(customerId === null ? null : { id: customerId, userId: 'u1' } as never)
    mockCheckoutsCreate.mockResolvedValue({ ok: true, value: { url: 'https://checkout/1' } } as never)
  }

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
      customerId: 'cus_1',
      embedOrigin: 'https://app',
      successUrl: 'https://app/done',
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

  // A customer-facing *code* is never resolved here: the provider's API has no
  // code lookup (its discount list filters by name), so doing it would mean
  // scanning the whole catalog on a public, client-callable action. Codes are
  // typed into the provider's own checkout; only an id is pre-applied.
  it('pre-applies a discount id without ever listing the catalog', async () => {
    const billing = make()
    primeCheckout(billing)

    await invoke(billing.api.generateCheckoutLink)(makeCtx(), {
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

  it('creates the provider customer once and maps it to the billing entity', async () => {
    const billing = make()
    primeCheckout(billing, null)
    mockCustomersList.mockResolvedValue({ ok: true, value: { result: { items: [] } } } as never)
    mockCustomersCreate.mockResolvedValue({ ok: true, value: { id: 'cus_new' } } as never)
    const ctx = makeCtx()

    await invoke(billing.api.generateCheckoutLink)(ctx, {
      productIds: ['prod_a'], origin: 'https://app', successUrl: 'https://app/done',
    })

    // The `userId` metadata is what lets the very first webhook resolve its
    // entity before any sync has run.
    expect(mockCustomersCreate).toHaveBeenCalledWith(expect.anything(), {
      email: 'u1@example.com',
      metadata: { userId: 'u1' },
    })
    expect(ctx.runMutation).toHaveBeenCalledWith('ref:insertCustomer', { id: 'cus_new', userId: 'u1' })
  })

  it('reuses an existing provider customer found by email', async () => {
    const billing = make()
    primeCheckout(billing, null)
    mockCustomersList.mockResolvedValue({ ok: true, value: { result: { items: [{ id: 'cus_existing' }] } } } as never)
    const ctx = makeCtx()

    await invoke(billing.api.generateCheckoutLink)(ctx, {
      productIds: ['prod_a'], origin: 'https://app', successUrl: 'https://app/done',
    })

    expect(mockCustomersCreate).not.toHaveBeenCalled()
    expect(ctx.runMutation).toHaveBeenCalledWith('ref:insertCustomer', { id: 'cus_existing', userId: 'u1' })
    expect(mockCheckoutsCreate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ customerId: 'cus_existing' }),
    )
  })
})

describe('multipleSubscriptions', () => {
  const first = { id: 'sub_1', status: 'active', endedAt: null, productId: 'prod_a' }
  const second = { id: 'sub_2', status: 'trialing', endedAt: null, productId: 'prod_addon' }

  function readCurrent(billing: Billing, subscriptions: unknown[]) {
    vi.spyOn(billing.provider, 'listAllUserSubscriptions').mockResolvedValue(subscriptions as never)
    return invoke(billing.functions.getCurrentSubscription)(makeCtx(), {})
  }

  it('keeps the single-subscription read by default', async () => {
    const billing = make()
    const single = vi.spyOn(billing.provider, 'getCurrentSubscription')
      .mockResolvedValue({ id: 'sub_1', productId: 'prod_a' } as never)

    const result = await invoke(billing.functions.getCurrentSubscription)(makeCtx(), {})

    expect(single).toHaveBeenCalled()
    expect(result).toStrictEqual({ id: 'sub_1', productId: 'prod_a' })
  })

  it('leads with the array and keeps the primary fields readable', async () => {
    const billing = make({ multipleSubscriptions: true })

    const result = await readCurrent(billing, [first, second]) as Record<string, unknown>

    // Each row is joined to its product exactly as the single-subscription
    // read does, so both branches hand the UI the same shape.
    expect(result.subscriptions).toStrictEqual([
      { ...first, productKey: undefined, product: null },
      { ...second, productKey: undefined, product: null },
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
    vi.spyOn(billing.provider, 'getProduct').mockResolvedValue({ id: 'prod_a', name: 'Pro' } as never)

    const result = await readCurrent(billing, [first]) as Record<string, unknown>

    expect(result.productKey).toBe('pro')
    expect(result.product).toStrictEqual({ id: 'prod_a', name: 'Pro' })
  })

  it('returns null for a claimless caller either way', async () => {
    const billing = make({ multipleSubscriptions: true })
    vi.spyOn(billing.provider, 'listAllUserSubscriptions').mockResolvedValue([] as never)

    expect(await invoke(billing.functions.getCurrentSubscription)(makeCtx(null), {})).toBeNull()
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
    vi.spyOn(billing.provider, 'getCustomerByUserId').mockResolvedValue({ id: 'cus_1', userId: 'u1' } as never)
    mockEventsList.mockResolvedValue({
      ok: true,
      value: { items: [providerEvent], pagination: { totalCount: 1, maxPage: 1 } },
    } as never)

    const page = await billing.getUsageHistory(makeCtx() as never, { meter: 'credits', limit: 25 })

    expect(mockEventsList).toHaveBeenCalledWith(expect.anything(), {
      customerId: 'cus_1',
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
    vi.spyOn(counted.provider, 'getCustomerByUserId').mockResolvedValue({ id: 'cus_1', userId: 'u1' } as never)
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
    vi.spyOn(billing.provider, 'getCustomerByUserId').mockResolvedValue(null as never)

    expect(await billing.getUsageHistory(makeCtx() as never)).toStrictEqual({
      items: [],
      pagination: { totalCount: 0, maxPage: 0 },
    })
    expect(mockEventsList).not.toHaveBeenCalled()
  })

  it('hands back a next cursor while more pages exist', async () => {
    const billing = metered()
    vi.spyOn(billing.provider, 'getCustomerByUserId').mockResolvedValue({ id: 'cus_1', userId: 'u1' } as never)
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
      expect(make().functions[name], name).toBeDefined()
    }
  })

  it('pauseSubscription takes epoch milliseconds on the wire', async () => {
    const billing = make()
    withSubscriptions(billing)

    await invoke(billing.functions.pauseSubscription)(makeCtx(), { resumesAt: Date.UTC(2026, 9, 1) })

    expect(mockSubscriptionsUpdate).toHaveBeenCalledWith(expect.anything(), {
      id: 'sub_1',
      subscriptionUpdate: { pauseAtPeriodEnd: true, resumesAt: new Date(Date.UTC(2026, 9, 1)) },
    })
  })

  it('the lifecycle actions resolve nothing from the client but the target id', async () => {
    const billing = make()
    withSubscriptions(billing)

    // No userId argument exists — the entity always comes from the caller's
    // own identity, so a client cannot cancel someone else's plan.
    expect(await invoke(billing.functions.cancelSubscription)(makeCtx(), { atPeriodEnd: true })).toBeNull()
    expect(mockSubscriptionsUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: 'sub_1' }),
    )
  })
})
