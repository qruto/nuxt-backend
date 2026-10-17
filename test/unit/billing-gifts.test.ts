import { Polar } from '@convex-dev/polar'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { checkoutsClientConfirm } from '@polar-sh/sdk/funcs/checkoutsClientConfirm.js'
import { checkoutsCreate } from '@polar-sh/sdk/funcs/checkoutsCreate.js'
import { customersCreate } from '@polar-sh/sdk/funcs/customersCreate.js'
import { customersGet } from '@polar-sh/sdk/funcs/customersGet.js'
import { customersGetExternal } from '@polar-sh/sdk/funcs/customersGetExternal.js'
import { customersGetStateExternal } from '@polar-sh/sdk/funcs/customersGetStateExternal.js'
import { customersList } from '@polar-sh/sdk/funcs/customersList.js'
import { customersUpdate } from '@polar-sh/sdk/funcs/customersUpdate.js'
import { discountsCreate } from '@polar-sh/sdk/funcs/discountsCreate.js'
import { discountsDelete } from '@polar-sh/sdk/funcs/discountsDelete.js'
import { discountsGet } from '@polar-sh/sdk/funcs/discountsGet.js'
import { discountsList } from '@polar-sh/sdk/funcs/discountsList.js'
import { discountsUpdate } from '@polar-sh/sdk/funcs/discountsUpdate.js'
import { ordersList } from '@polar-sh/sdk/funcs/ordersList.js'
import { refundsCreate } from '@polar-sh/sdk/funcs/refundsCreate.js'
import { type Billing, setupBilling } from '../../src/convex/integrations/billing'
import { giftSenderName } from '../../src/convex/integrations/billing/gifts'
import { setupEmail } from '../../src/convex/integrations/email'

// Credit-pack gifts as the provider runs them: the purchaser buys the pack's
// private gift product on their own billing entity, the paid order mints a
// single-use 100% discount, and the recipient claims the pack at $0 into
// their own entity. Every provider function is faked; the component is an
// in-memory gift row the mutations below move through its states.

vi.mock('@polar-sh/sdk/funcs/checkoutsClientConfirm.js', () => ({ checkoutsClientConfirm: vi.fn() }))
vi.mock('@polar-sh/sdk/funcs/checkoutsCreate.js', () => ({ checkoutsCreate: vi.fn() }))
vi.mock('@polar-sh/sdk/funcs/customersCreate.js', () => ({ customersCreate: vi.fn() }))
vi.mock('@polar-sh/sdk/funcs/customersGet.js', () => ({ customersGet: vi.fn() }))
vi.mock('@polar-sh/sdk/funcs/customersGetExternal.js', () => ({ customersGetExternal: vi.fn() }))
vi.mock('@polar-sh/sdk/funcs/customersUpdate.js', () => ({ customersUpdate: vi.fn() }))
vi.mock('@polar-sh/sdk/funcs/customersGetStateExternal.js', () => ({ customersGetStateExternal: vi.fn() }))
vi.mock('@polar-sh/sdk/funcs/customersList.js', () => ({ customersList: vi.fn() }))
vi.mock('@polar-sh/sdk/funcs/discountsCreate.js', () => ({ discountsCreate: vi.fn() }))
vi.mock('@polar-sh/sdk/funcs/discountsDelete.js', () => ({ discountsDelete: vi.fn() }))
vi.mock('@polar-sh/sdk/funcs/discountsGet.js', () => ({ discountsGet: vi.fn() }))
vi.mock('@polar-sh/sdk/funcs/discountsList.js', () => ({ discountsList: vi.fn() }))
vi.mock('@polar-sh/sdk/funcs/discountsUpdate.js', () => ({ discountsUpdate: vi.fn() }))
vi.mock('@polar-sh/sdk/funcs/ordersList.js', () => ({ ordersList: vi.fn() }))
vi.mock('@polar-sh/sdk/funcs/refundsCreate.js', () => ({ refundsCreate: vi.fn() }))

const mockConfirm = vi.mocked(checkoutsClientConfirm)
const mockCheckoutsCreate = vi.mocked(checkoutsCreate)
const mockCustomersCreate = vi.mocked(customersCreate)
const mockCustomersList = vi.mocked(customersList)
const mockDiscountsCreate = vi.mocked(discountsCreate)
const mockDiscountsDelete = vi.mocked(discountsDelete)
const mockDiscountsGet = vi.mocked(discountsGet)
const mockRefundsCreate = vi.mocked(refundsCreate)
const mockCustomersUpdate = vi.mocked(customersUpdate)
const mockDiscountsList = vi.mocked(discountsList)
const mockDiscountsUpdate = vi.mocked(discountsUpdate)
const mockOrdersList = vi.mocked(ordersList)

const components = {
  polar: { lib: { insertCustomer: 'ref:insertCustomer' } },
  backend: {
    billing: { entityProfile: 'ref:entityProfile', userByCustomer: 'ref:userByCustomer', getBenefitMetadata: 'ref:getBenefitMetadata', upsert: 'ref:upsert' },
    gifts: {
      create: 'ref:gifts.create',
      markPaid: 'ref:gifts.markPaid',
      setDiscount: 'ref:gifts.setDiscount',
      markNotified: 'ref:gifts.markNotified',
      startClaim: 'ref:gifts.startClaim',
      markClaimed: 'ref:gifts.markClaimed',
      markRefunded: 'ref:gifts.markRefunded',
      listByEmail: 'ref:gifts.listByEmail',
      countBought: 'ref:gifts.countBought',
      get: 'ref:gifts.get',
      personalEntity: 'ref:gifts.personalEntity',
    },
    email: { send: 'ref:email.send' },
  },
} as never
const email = setupEmail(components)
const config = {
  email,
  accessToken: 'oat_test',
  // A plan and a credit pack; `billing sync` made the pack's gift twin.
  products: { pro: 'p1', credits500: 'p_pack' },
  catalog: { sandbox: { gifts: { credits500: 'p_pack_gift' } } },
  trustedOrigins: ['https://app'],
}

const purchaser = { subject: 'u-buyer', email: 'buyer@example.com', emailVerified: true, name: 'Buyer', activeOrganizationId: 'org-team' }
const recipient = { subject: 'u-r', email: 'R@Example.com', emailVerified: true, name: 'Rita', activeOrganizationId: 'org-team' }
const giftArgs = { pack: 'credits500', recipientEmail: 'r@example.com', origin: 'https://app', successUrl: 'https://app/done' }

interface GiftRow {
  id: string
  recipientEmail: string
  purchaserUserId: string
  purchaserEntityId?: string
  purchaserName?: string
  pack?: string
  productIds: string[]
  giftProductId?: string
  message?: string
  status: string
  billingOrderId?: string
  amount?: number
  currency?: string
  discountId?: string
  claimingEntityId?: string
  claimingUserId?: string
  claimedEntityId?: string
  notifiedAt?: number
  createdAt: number
}

/**
 * One gift row the component mutations move through its states, the
 * signed-in caller, and what was emailed. `personal` is the caller's personal
 * workspace; `bought` how many gifts they bought in the window.
 */
function world(row: Partial<GiftRow> = {}, { claims = purchaser as Record<string, unknown> | null, personal = 'org-personal' as string | null, bought = 0 } = {}) {
  const gift: GiftRow = {
    id: 'gift-1',
    recipientEmail: 'r@example.com',
    purchaserUserId: 'u-buyer',
    purchaserEntityId: 'org-buyer',
    purchaserName: 'Buyer',
    pack: 'credits500',
    productIds: ['p_pack'],
    giftProductId: 'p_pack_gift',
    status: 'pending',
    createdAt: 1,
    ...row,
  }
  const sends: Array<Record<string, unknown>> = []
  const ctx = {
    runQuery: vi.fn(async (ref: unknown, _args?: unknown): Promise<unknown> => {
      if (ref === 'ref:gifts.get') return { ...gift }
      if (ref === 'ref:gifts.listByEmail') return [{ ...gift }]
      if (ref === 'ref:gifts.personalEntity') return personal
      if (ref === 'ref:gifts.countBought') return { count: bought, oldest: bought > 0 ? Date.now() - 1000 : null }
      if (ref === 'ref:getBenefitMetadata') return []
      return null
    }),
    runMutation: vi.fn(async (ref: unknown, args?: unknown): Promise<unknown> => {
      const input = (args ?? {}) as Record<string, unknown>
      switch (ref) {
        case 'ref:gifts.create':
          return 'gift-1'
        case 'ref:gifts.markPaid':
          if (gift.status === 'pending') Object.assign(gift, { status: 'paid', billingOrderId: input.billingOrderId, amount: input.amount, currency: input.currency })
          return null
        case 'ref:gifts.setDiscount':
          gift.discountId ??= input.discountId as string
          return true
        case 'ref:gifts.markNotified':
          gift.notifiedAt ??= Date.now()
          return true
        case 'ref:gifts.startClaim':
          Object.assign(gift, { claimingUserId: input.userId, claimingEntityId: input.entityId })
          return true
        case 'ref:gifts.markClaimed':
          if (gift.status === 'paid') Object.assign(gift, { status: 'claimed', claimedEntityId: input.entityId })
          return null
        case 'ref:gifts.markRefunded':
          if (gift.status !== 'claimed') gift.status = 'refunded'
          return true
        case 'ref:email.send':
          sends.push(input)
          return 'email_1'
      }
      return null
    }),
    auth: { getUserIdentity: vi.fn(async () => claims) },
  }
  return { gift, ctx, sends }
}

/** A registered function's implementation, the seam convex-test drives too. */
const handlerOf = (fn: unknown) => (fn as { _handler: (ctx: unknown, args: unknown) => Promise<unknown> })._handler

/** The purchaser's earlier, paid order. */
const PAID_ORDER = { id: 'order_earlier', status: 'paid', netAmount: 2900 }

let billing: Billing

beforeEach(() => {
  vi.clearAllMocks()
  billing = setupBilling(components, config as never)
  vi.spyOn(Polar.prototype, 'getProduct').mockImplementation(async (_ctx, { productId }) =>
    ({ p_pack: { id: 'p_pack', name: '500 credits', isRecurring: false, isArchived: false }, p1: { id: 'p1', isRecurring: true, isArchived: false } } as Record<string, unknown>)[productId] as never ?? null)
  // Each entity already has its customer, mapped in the component.
  vi.spyOn(Polar.prototype, 'getCustomerByUserId').mockResolvedValue({ id: 'cus_entity' } as never)
  mockOrdersList.mockResolvedValue({ ok: true, value: { result: { items: [PAID_ORDER], pagination: { totalCount: 1, maxPage: 1 } } } } as never)
  mockCheckoutsCreate.mockResolvedValue({ ok: true, value: { url: 'https://checkout/gift', clientSecret: 'cs_1', totalAmount: 0 } } as never)
  mockDiscountsList.mockResolvedValue({ ok: true, value: { result: { items: [] } } } as never)
  mockDiscountsCreate.mockResolvedValue({ ok: true, value: { id: 'disc_1' } } as never)
  mockDiscountsUpdate.mockResolvedValue({ ok: true, value: {} } as never)
  mockDiscountsDelete.mockResolvedValue({ ok: true, value: undefined } as never)
  mockConfirm.mockResolvedValue({ ok: true, value: { status: 'confirmed', customerSessionToken: 'cst_secret' } } as never)
  vi.mocked(customersGetExternal).mockResolvedValue({ ok: false, error: { statusCode: 404 } } as never)
  // Each mapped customer is keyed by its entity's id already.
  vi.mocked(customersGet).mockImplementation((async (_client: unknown, { id }: { id: string }) => ({ ok: true, value: { id, externalId: null, metadata: {} } })) as never)
  mockCustomersUpdate.mockImplementation((async (_client: unknown, { id }: { id: string }) => ({ ok: true, value: { id } })) as never)
  // Nobody redeemed a gift's discount yet.
  mockDiscountsGet.mockResolvedValue({ ok: true, value: { id: 'disc_1', redemptionsCount: 0 } } as never)
  mockRefundsCreate.mockResolvedValue({ ok: true, value: { id: 'refund_1' } } as never)
  // The webhook's cache refresh reads the entity's state: nothing granted yet.
  vi.mocked(customersGetStateExternal).mockResolvedValue({ ok: true, value: { id: 'cus_entity' } } as never)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('buying a gift', () => {
  const giftCheckout = (instance: Billing = billing) => handlerOf(instance.api.giftCheckout)

  it('buys the pack\'s gift product on the purchaser\'s own entity, with no trace of the recipient', async () => {
    const { ctx } = world()

    const result = await giftCheckout()(ctx, { ...giftArgs, recipientEmail: 'R@Example.com', message: 'Happy birthday!' })

    expect(result).toStrictEqual({ url: 'https://checkout/gift' })
    expect(ctx.runMutation).toHaveBeenCalledWith('ref:gifts.create', {
      recipientEmail: 'r@example.com',
      purchaserUserId: 'u-buyer',
      purchaserEntityId: 'org-personal',
      purchaserName: 'Buyer',
      pack: 'credits500',
      productIds: ['p_pack'],
      giftProductId: 'p_pack_gift',
      message: 'Happy birthday!',
    })
    // The purchaser's own customer, by their entity's id: their receipt, and
    // no customer, name, address or email of the recipient in the checkout.
    expect(mockCheckoutsCreate).toHaveBeenCalledWith(expect.anything(), {
      products: ['p_pack_gift'],
      externalCustomerId: 'org-personal',
      embedOrigin: 'https://app',
      successUrl: 'https://app/done',
      allowDiscountCodes: false,
      metadata: { giftId: 'gift-1' },
    })
    expect(JSON.stringify(mockCheckoutsCreate.mock.calls)).not.toContain('r@example.com')
    expect(mockCustomersList).not.toHaveBeenCalled()
    expect(mockCustomersCreate).not.toHaveBeenCalled()
  })

  it('needs an earlier paid order on an entity the purchaser owns, before anything is created', async () => {
    mockOrdersList.mockResolvedValue({ ok: true, value: { result: { items: [{ id: 'o_free', status: 'paid', netAmount: 0 }, { id: 'o_back', status: 'refunded', netAmount: 2000 }], pagination: { totalCount: 2, maxPage: 1 } } } } as never)
    const { ctx } = world()

    await expect(giftCheckout()(ctx, giftArgs)).rejects.toMatchObject({ data: { code: 'forbidden', reason: 'gift_refused', message: expect.stringContaining('after your first purchase') } })
    expect(mockOrdersList).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ externalCustomerId: ['org-personal'] }))
    expect(ctx.runMutation).not.toHaveBeenCalledWith('ref:gifts.create', expect.anything())
    expect(mockCheckoutsCreate).not.toHaveBeenCalled()
  })

  it('counts orders across every workspace the purchaser owns', async () => {
    const { ctx } = world()
    ctx.runQuery.mockImplementation(async (ref: unknown) => {
      if (ref === 'ref:gifts.personalEntity') return 'org-personal'
      if (ref === 'ref:gifts.countBought') return { count: 0, oldest: null }
      if (ref === 'ref:entityProfile') return { name: 'Mine', personal: true, owner: { userId: 'u-buyer', email: 'buyer@example.com', name: 'Buyer', emailVerified: true }, ownedEntityIds: ['org-personal', 'org-team'] }
      return null
    })

    await giftCheckout()(ctx, giftArgs)

    expect(mockOrdersList).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ externalCustomerId: ['org-personal', 'org-team'] }))
  })

  it('caps how many gifts one purchaser buys, whatever limiter the app passes', async () => {
    const { ctx } = world({}, { bought: 10 })
    await expect(giftCheckout()(ctx, giftArgs)).rejects.toMatchObject({ data: { code: 'rate_limited', limit: 'gifts', retryAfter: expect.any(Number) } })
    expect(mockCheckoutsCreate).not.toHaveBeenCalled()

    const lenient = setupBilling(components, { ...config, giftLimit: { max: 20 } } as never)
    await expect(giftCheckout(lenient)(world({}, { bought: 10 }).ctx, giftArgs)).resolves.toEqual({ url: 'https://checkout/gift' })

    // A field left undefined keeps its default.
    const partial = setupBilling(components, { ...config, giftLimit: { max: undefined, days: 7 } } as never)
    await expect(giftCheckout(partial)(world({}, { bought: 10 }).ctx, giftArgs)).rejects.toMatchObject({ data: { code: 'rate_limited', limit: 'gifts' } })
  })

  it('counts the purchaser\'s open checkouts against the cap, and abandoned ones not', async () => {
    const { ctx } = world()
    await giftCheckout()(ctx, giftArgs)
    const [, args] = ctx.runQuery.mock.calls.find(([ref]) => ref === 'ref:gifts.countBought')! as [unknown, { since: number, pendingSince: number }]
    expect(args.since).toBeLessThan(args.pendingSince)
    expect(Date.now() - args.pendingSince).toBeGreaterThanOrEqual(60 * 60 * 1000 - 1000)
    expect(Date.now() - args.pendingSince).toBeLessThanOrEqual(60 * 60 * 1000 + 1000)
  })

  it('never bills a workspace an app\'s own resolver names but the purchaser does not own', async () => {
    const resolveEntity = vi.fn(async () => ({ userId: 'org-shared', email: 'buyer@example.com' }))
    const resolved = setupBilling(components, { ...config, resolveEntity } as never)
    const { ctx } = world()
    ctx.runQuery.mockImplementation(async (ref: unknown) =>
      ref === 'ref:entityProfile' ? { name: 'Shared', personal: false, owner: { userId: 'u-owner', email: 'o@example.com', name: 'O', emailVerified: true }, ownedEntityIds: ['org-shared'] } : null)

    await expect(giftCheckout(resolved)(ctx, giftArgs)).rejects.toMatchObject({ data: { code: 'no_workspace' } })
    expect(mockCheckoutsCreate).not.toHaveBeenCalled()
  })

  it('refuses a gift to the purchaser\'s own address', async () => {
    await expect(giftCheckout()(world().ctx, { ...giftArgs, recipientEmail: 'Buyer@Example.com' }))
      .rejects.toMatchObject({ data: { code: 'forbidden', reason: 'gift_refused' } })
    expect(mockOrdersList).not.toHaveBeenCalled()
  })

  it.each([
    ['a plan', { pack: 'pro' }, 'pack'],
    ['a key outside the catalog', { pack: 'credits_free' }, 'pack'],
    ['a product id in place of the key', { pack: 'p_pack' }, 'pack'],
    ['a foreign return URL', { successUrl: 'https://attacker.example/thanks' }, 'successUrl'],
    ['a foreign embed origin', { origin: 'https://attacker.example' }, 'origin'],
    ['the gift keys in its metadata', { metadata: { giftId: 'gift_of_someone_else' } }, 'metadata'],
    ['the claim phase in its metadata', { metadata: { Phase: 'claim' } }, 'metadata'],
    ['a message with a link', { message: 'Get yours at evil.com/now' }, 'message'],
    ['a message over 500 characters', { message: 'a'.repeat(501) }, 'message'],
  ])('refuses %s as invalid_input, before the provider', async (_name, extra, field) => {
    await expect(giftCheckout()(world().ctx, { ...giftArgs, ...extra }))
      .rejects.toMatchObject({ data: { code: 'invalid_input', field } })
    expect(mockOrdersList).not.toHaveBeenCalled()
    expect(mockCheckoutsCreate).not.toHaveBeenCalled()
  })

  it('is not_ready for a pack billing sync has not made a gift product for', async () => {
    const unsynced = setupBilling(components, { ...config, catalog: undefined } as never)
    await expect(giftCheckout(unsynced)(world().ctx, giftArgs)).rejects.toMatchObject({ data: { code: 'not_ready', reason: 'no_catalog' } })
  })

  it('never charges a shared workspace the purchaser only belongs to', async () => {
    const { ctx } = world({}, { personal: null })
    ctx.runQuery.mockImplementation(async (ref: unknown) =>
      ref === 'ref:entityProfile' ? { name: 'Team', personal: false, owner: { userId: 'u-owner', email: 'o@example.com', name: 'O', emailVerified: true }, ownedEntityIds: ['org-team'] } : null)

    await expect(giftCheckout()(ctx, giftArgs)).rejects.toMatchObject({ data: { code: 'no_workspace' } })
    expect(mockCheckoutsCreate).not.toHaveBeenCalled()
  })

  it('asks canGift with the paying entity, and throws its sentence', async () => {
    const canGift = vi.fn(() => ({ allowed: false as const, message: 'Gifts go to example.com only.' }))
    const gated = setupBilling(components, { ...config, canGift } as never)

    await expect(giftCheckout(gated)(world().ctx, giftArgs)).rejects.toMatchObject({ data: { code: 'forbidden', reason: 'gift_refused', message: 'Gifts go to example.com only.' } })
    expect(canGift).toHaveBeenCalledWith(expect.anything(), { recipientEmail: 'r@example.com', purchaserUserId: 'u-buyer', purchaserEntityId: 'org-personal' })
    expect(mockCheckoutsCreate).not.toHaveBeenCalled()
  })

  it('is throttled per purchaser on the billingSync limit, before the pack is read', async () => {
    const rateLimiter = { limit: vi.fn(async () => ({ ok: false })) }
    const limited = setupBilling(components, { ...config, rateLimiter } as never)
    const { ctx } = world()

    await expect(giftCheckout(limited)(ctx, giftArgs)).rejects.toThrow(/Too many gift checkouts/)
    expect(rateLimiter.limit).toHaveBeenCalledWith(ctx, 'billingSync', { key: 'u-buyer', throws: true })
    expect(mockCheckoutsCreate).not.toHaveBeenCalled()
  })
})

describe('a paid gift purchase', () => {
  /** The purchase order as the provider sends it once paid. */
  const purchase = (overrides: Record<string, unknown> = {}) => ({
    id: 'order_gift',
    status: 'paid',
    productId: 'p_pack_gift',
    customerId: 'cus_buyer',
    customer: { id: 'cus_buyer', externalId: 'org-buyer' },
    discountId: null,
    netAmount: 2000,
    currency: 'usd',
    metadata: { giftId: 'gift-1' },
    ...overrides,
  })
  const deliver = (ctx: unknown, order: Record<string, unknown>) => billing.webhookEvents['order.paid']!(ctx as never, { type: 'order.paid', data: order } as never)

  it('is marked paid with what it charged, mints the claim discount and tells the recipient', async () => {
    const { gift, ctx, sends } = world()

    await deliver(ctx, purchase())

    expect(gift).toMatchObject({ status: 'paid', billingOrderId: 'order_gift', amount: 2000, currency: 'usd', discountId: 'disc_1' })
    // Codeless, 100%, once, one redemption, the pack only, no personal data.
    expect(mockDiscountsCreate).toHaveBeenCalledWith(expect.anything(), {
      type: 'percentage',
      basisPoints: 10_000,
      duration: 'once',
      maxRedemptions: 1,
      products: ['p_pack'],
      name: 'gift-gift-1',
      metadata: { giftId: 'gift-1' },
    })
    expect(sends).toHaveLength(1)
    expect(sends[0]).toMatchObject({ to: 'r@example.com', idempotencyKey: 'nuxt-backend:gift:gift-1', subject: 'Buyer sent you a gift 🎁' })
    expect(String(sends[0]!.text)).toContain('Buyer sent you a gift: 500 credits.')
    expect(gift.notifiedAt).toBeTypeOf('number')
  })

  it.each([
    ['another product', { productId: 'p_pack' }],
    ['another customer', { customer: { id: 'cus_x', externalId: 'org-elsewhere' } }],
    ['a zero charge', { netAmount: 0 }],
    ['a discount', { discountId: 'disc_any' }],
    ['an unpaid status', { status: 'pending', paid: false }],
  ])('is not delivered when the order has %s', async (_name, overrides) => {
    const warned = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { gift, ctx, sends } = world()

    await deliver(ctx, purchase(overrides))

    expect(gift.status).toBe('pending')
    expect(mockDiscountsCreate).not.toHaveBeenCalled()
    expect(sends).toHaveLength(0)
    expect(warned).toHaveBeenCalledWith(expect.stringContaining('billing.gift_unverified'))
  })

  it('refunds a gift paid past the purchaser\'s cap instead of delivering it', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { gift, ctx, sends } = world({}, { bought: 10 })

    await deliver(ctx, purchase({ refundableAmount: 2000 }))

    expect(mockRefundsCreate).toHaveBeenCalledWith(expect.anything(), { orderId: 'order_gift', reason: 'other', amount: 2000, revokeBenefits: true })
    expect(gift.status).toBe('refunded')
    expect(mockDiscountsCreate).not.toHaveBeenCalled()
    expect(sends).toHaveLength(0)
  })

  it('never delivers a gift whose refund arrived before its order.paid', async () => {
    const { gift, ctx, sends } = world()

    await billing.webhookEvents['order.refunded']!(ctx as never, { type: 'order.refunded', data: purchase({ status: 'refunded' }) } as never)
    expect(gift.status).toBe('refunded')

    await deliver(ctx, purchase())
    expect(gift.status).toBe('refunded')
    expect(mockDiscountsCreate).not.toHaveBeenCalled()
    expect(sends).toHaveLength(0)
  })

  it('mints nothing when the lookup for an earlier discount fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mockDiscountsList.mockResolvedValue({ ok: false, error: { statusCode: 500 } } as never)
    const { ctx } = world()

    await expect(deliver(ctx, purchase())).rejects.toMatchObject({ data: { code: 'unavailable' } })
    expect(mockDiscountsCreate).not.toHaveBeenCalled()
  })

  it('voids the discount it minted when another run stored one first', async () => {
    const { gift, ctx } = world()
    const base = ctx.runMutation.getMockImplementation()!
    ctx.runMutation.mockImplementation(async (ref: unknown, args?: unknown) => {
      if (ref === 'ref:gifts.setDiscount') {
        gift.discountId = 'disc_other_run'
        return false
      }
      return base(ref, args)
    })

    await deliver(ctx, purchase())

    expect(mockDiscountsDelete).toHaveBeenCalledWith(expect.anything(), { id: 'disc_1' })
    expect(gift.discountId).toBe('disc_other_run')
  })

  it('reuses a discount an earlier run minted but never stored', async () => {
    mockDiscountsList.mockResolvedValue({ ok: true, value: { result: { items: [{ id: 'disc_earlier', metadata: { giftId: 'gift-1' } }] } } } as never)
    const { gift, ctx } = world()

    await deliver(ctx, purchase())

    expect(mockDiscountsList).toHaveBeenCalledWith(expect.anything(), { query: 'gift-gift-1', limit: 10 })
    expect(mockDiscountsCreate).not.toHaveBeenCalled()
    expect(gift.discountId).toBe('disc_earlier')
  })

  // Sent first and stamped after, so a send that throws is retried by the
  // provider's redelivery instead of being lost behind a stamp.
  it('a send that throws leaves no stamp; the redelivery sends exactly once and stamps', async () => {
    const { gift, ctx, sends } = world()
    const send = ctx.runMutation.getMockImplementation()!
    let failNext = true
    ctx.runMutation.mockImplementation(async (ref: unknown, args?: unknown) => {
      if (ref === 'ref:email.send' && failNext) {
        failNext = false
        sends.push(args as Record<string, unknown>)
        throw new Error('template override threw')
      }
      return send(ref, args)
    })

    await expect(deliver(ctx, purchase())).rejects.toThrow('template override threw')
    expect(gift.notifiedAt).toBeUndefined()

    await deliver(ctx, purchase())
    expect(sends).toHaveLength(2)
    expect(sends.map(entry => entry.idempotencyKey)).toEqual(['nuxt-backend:gift:gift-1', 'nuxt-backend:gift:gift-1'])
    expect(gift.notifiedAt).toBeTypeOf('number')
    // The discount was minted once across both runs.
    expect(mockDiscountsCreate).toHaveBeenCalledTimes(1)

    await deliver(ctx, purchase())
    expect(sends).toHaveLength(2)
  })
})

describe('claiming a gift', () => {
  const claimGift = (instance: Billing = billing) => handlerOf(instance.functions.claimGift)
  const paid = { status: 'paid', billingOrderId: 'order_gift', discountId: 'disc_1' }

  it('opens a $0 checkout of the pack on the recipient\'s own entity, and confirms it on the server', async () => {
    const { gift, ctx } = world(paid, { claims: recipient })

    const result = await claimGift()(ctx, { giftId: 'gift-1', successUrl: 'https://app/gifts' })

    expect(result).toStrictEqual({ url: null })
    expect(gift).toMatchObject({ claimingUserId: 'u-r', claimingEntityId: 'org-personal' })
    expect(mockCheckoutsCreate).toHaveBeenCalledWith(expect.anything(), {
      products: ['p_pack'],
      externalCustomerId: 'org-personal',
      discountId: 'disc_1',
      allowDiscountCodes: false,
      metadata: { giftId: 'gift-1', phase: 'claim' },
      successUrl: 'https://app/gifts',
    })
    expect(mockConfirm).toHaveBeenCalledWith(expect.anything(), { clientSecret: 'cs_1', checkoutConfirmStripe: {} })
    // The buyer's session token the confirm answers with never leaves the server.
    expect(JSON.stringify(result)).not.toContain('cst_secret')
  })

  it('hands back the provider\'s $0 checkout when the server can\'t confirm it', async () => {
    mockConfirm.mockResolvedValue({ ok: false, error: { statusCode: 422 } } as never)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { ctx } = world(paid, { claims: recipient })

    expect(await claimGift()(ctx, { giftId: 'gift-1' })).toStrictEqual({ url: 'https://checkout/gift' })
  })

  it('never confirms a claim checkout that would charge the recipient', async () => {
    mockCheckoutsCreate.mockResolvedValue({ ok: true, value: { url: 'https://checkout/gift', clientSecret: 'cs_1', totalAmount: 2000 } } as never)
    vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(claimGift()(world(paid, { claims: recipient }).ctx, { giftId: 'gift-1' })).rejects.toMatchObject({ data: { code: 'unavailable' } })
    expect(mockConfirm).not.toHaveBeenCalled()
  })

  it('refuses a gift for another address, or none at all, alike', async () => {
    for (const row of [{ ...paid, recipientEmail: 'other@example.com' }, null]) {
      const { ctx } = world(paid, { claims: recipient })
      if (row) ctx.runQuery.mockResolvedValue({ ...row, id: 'gift-1', productIds: ['p_pack'] })
      else ctx.runQuery.mockResolvedValue(null)
      await expect(claimGift()(ctx, { giftId: 'gift-1' })).rejects.toMatchObject({ data: { code: 'forbidden', reason: 'not_recipient' } })
    }
    expect(mockCheckoutsCreate).not.toHaveBeenCalled()
  })

  it('refuses an address its holder never proved', async () => {
    const { ctx } = world(paid, { claims: { ...recipient, emailVerified: false } })
    await expect(claimGift()(ctx, { giftId: 'gift-1' })).rejects.toMatchObject({ data: { code: 'forbidden', reason: 'no_email' } })
    expect(mockCheckoutsCreate).not.toHaveBeenCalled()
  })

  it('receives a gift paid before 0.2 by adopting its customer, or mints its discount on the claim', async () => {
    const adopted = world({ status: 'paid', billingCustomerId: 'cus_entity' } as never, { claims: recipient })
    expect(await claimGift()(adopted.ctx, { giftId: 'gift-1' })).toStrictEqual({ url: null })
    expect(adopted.gift.status).toBe('claimed')
    expect(mockCheckoutsCreate).not.toHaveBeenCalled()

    const stranded = world({ status: 'paid', billingCustomerId: 'cus_legacy_gift' } as never, { claims: recipient })
    expect(await claimGift()(stranded.ctx, { giftId: 'gift-1' })).toStrictEqual({ url: null })
    expect(stranded.gift.discountId).toBe('disc_1')
    expect(mockCheckoutsCreate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ discountId: 'disc_1' }))
  })

  it('refuses a refunded gift, and one whose purchase is not paid yet', async () => {
    await expect(claimGift()(world({ status: 'refunded' }, { claims: recipient }).ctx, { giftId: 'gift-1' }))
      .rejects.toMatchObject({ data: { code: 'forbidden', reason: 'gift_refunded' } })
    await expect(claimGift()(world({ status: 'pending' }, { claims: recipient }).ctx, { giftId: 'gift-1' }))
      .rejects.toMatchObject({ data: { code: 'not_ready', reason: 'not_paid' } })
    expect(mockCheckoutsCreate).not.toHaveBeenCalled()
  })

  const claimOrder = (overrides: Record<string, unknown> = {}) => ({ id: 'order_claim', status: 'paid', productId: 'p_pack', customer: { id: 'cus_r', externalId: 'org-personal' }, discountId: 'disc_1', netAmount: 0, metadata: { giftId: 'gift-1', phase: 'claim' }, ...overrides })
  const paidClaim = (ctx: unknown, order: Record<string, unknown>) => billing.webhookEvents['order.paid']!(ctx as never, { type: 'order.paid', data: order } as never)

  it('is received when the claim order redeemed the gift\'s own discount', async () => {
    const { gift, ctx } = world({ ...paid, claimingEntityId: 'org-personal', claimingUserId: 'u-r' })
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    await paidClaim(ctx, claimOrder({ discountId: 'disc_other' }))
    expect(gift.status).toBe('paid')

    await paidClaim(ctx, claimOrder())
    expect(ctx.runMutation).toHaveBeenCalledWith('ref:gifts.markClaimed', { giftId: 'gift-1', userId: 'u-r', entityId: 'org-personal', claimOrderId: 'order_claim' })
    expect(gift.status).toBe('claimed')
    // A claim mints nothing and emails nobody.
    expect(mockDiscountsCreate).not.toHaveBeenCalled()
  })

  // The recipient opened a claim into one workspace, then another: the order
  // paid for the first must still count, or a single-use discount is spent
  // on credits the gift never records.
  it('is received on whichever entity the paid claim landed, after a later claim moved the target', async () => {
    const { gift, ctx } = world({ ...paid, claimingEntityId: 'org-later', claimingUserId: 'u-r' })

    await paidClaim(ctx, claimOrder({ customer: { id: 'cus_r', externalId: 'org-first' } }))

    expect(gift).toMatchObject({ status: 'claimed', claimedEntityId: 'org-first' })
  })

  it('says so loudly when a claim lands on a gift already refunded', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { gift, ctx } = world({ ...paid, status: 'refunded' })

    await paidClaim(ctx, claimOrder())

    expect(gift.status).toBe('refunded')
    expect(errors).toHaveBeenCalledWith(expect.stringContaining('billing.gift_claimed_after_refund'))
  })
})

describe('a refunded gift purchase', () => {
  const refund = (ctx: unknown, overrides: Record<string, unknown> = {}) => billing.webhookEvents['order.refunded']!(ctx as never, {
    type: 'order.refunded',
    data: { id: 'order_gift', status: 'refunded', customer: { id: 'cus_buyer', externalId: 'org-buyer' }, metadata: { giftId: 'gift-1' }, ...overrides },
  } as never)
  const paid = { status: 'paid', billingOrderId: 'order_gift', discountId: 'disc_1' }

  it('voids an unclaimed gift: its discount ends now, is deleted, and the gift is refunded', async () => {
    const { gift, ctx } = world(paid)

    await refund(ctx)

    expect(mockDiscountsUpdate).toHaveBeenCalledWith(expect.anything(), { id: 'disc_1', discountUpdate: { endsAt: expect.any(Date) } })
    expect(mockDiscountsDelete).toHaveBeenCalledWith(expect.anything(), { id: 'disc_1' })
    expect(gift.status).toBe('refunded')
  })

  it('voids on a partial refund too: a gift is one pack', async () => {
    const partly = world(paid)
    await refund(partly.ctx, { status: 'partially_refunded' })
    expect(partly.gift.status).toBe('refunded')
    expect(mockDiscountsDelete).toHaveBeenCalledWith(expect.anything(), { id: 'disc_1' })
  })

  // The claim checkout is confirmed, its order.paid not here yet: the
  // discount is spent, so voiding now would refund money for credits the
  // recipient keeps.
  it('leaves a gift whose discount was already redeemed to its claim', async () => {
    const warned = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockDiscountsGet.mockResolvedValue({ ok: true, value: { id: 'disc_1', redemptionsCount: 1 } } as never)
    const { gift, ctx } = world(paid)

    await refund(ctx)

    expect(mockDiscountsDelete).not.toHaveBeenCalled()
    expect(gift.status).toBe('paid')
    expect(warned).toHaveBeenCalledWith(expect.stringContaining('billing.gift_refunded_after_claim'))
  })

  it('keeps a claimed gift, and ignores another order', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const claimed = world({ ...paid, status: 'claimed' })
    await refund(claimed.ctx)
    expect(claimed.gift.status).toBe('claimed')

    const other = world(paid)
    await refund(other.ctx, { id: 'order_unrelated' })
    expect(other.gift.status).toBe('paid')
    expect(mockDiscountsDelete).not.toHaveBeenCalled()
  })

  it('still voids the gift when its discount is already gone', async () => {
    mockDiscountsUpdate.mockResolvedValue({ ok: false, error: { statusCode: 404 } } as never)
    mockDiscountsDelete.mockResolvedValue({ ok: false, error: { statusCode: 404 } } as never)
    const { gift, ctx } = world(paid)

    await refund(ctx)

    expect(gift.status).toBe('refunded')
  })
})

describe('received gifts', () => {
  it('lists paid and claimed gifts with the sender\'s name, never their email or a billing id', async () => {
    const { ctx } = world({ status: 'paid', purchaserName: 'Buyer at buyer.com', message: 'Enjoy!', discountId: 'disc_1', billingOrderId: 'order_gift' }, { claims: recipient })
    const rows = [
      { id: 'gift-1', recipientEmail: 'r@example.com', purchaserUserId: 'u-buyer', purchaserEmail: 'buyer@example.com', purchaserName: 'Buyer at buyer.com', pack: 'credits500', productIds: ['p_pack'], message: 'Enjoy!', status: 'paid', discountId: 'disc_1', billingOrderId: 'order_gift', purchaserEntityId: 'org-buyer', createdAt: 1 },
    ]
    ctx.runQuery.mockImplementation(async (ref: unknown) => (ref === 'ref:gifts.listByEmail' ? rows : null))

    const received = await handlerOf(billing.functions.getReceivedGifts)(ctx, {})

    expect(ctx.runQuery).toHaveBeenCalledWith('ref:gifts.listByEmail', { email: 'r@example.com' })
    expect(received).toStrictEqual([{ id: 'gift-1', purchaserName: 'Buyer at', pack: 'credits500', productIds: ['p_pack'], message: 'Enjoy!', status: 'paid', createdAt: 1, paidAt: undefined, claimedAt: undefined }])
  })

  it('is null for a caller nobody signed in as, and for an address never proved', async () => {
    expect(await handlerOf(billing.functions.getReceivedGifts)(world({}, { claims: null }).ctx, {})).toBeNull()
    const unverified = world({}, { claims: { ...recipient, emailVerified: false } })
    expect(await handlerOf(billing.functions.getReceivedGifts)(unverified.ctx, {})).toBeNull()
    expect(unverified.ctx.runQuery).not.toHaveBeenCalled()
  })
})

describe('giftSenderName', () => {
  it.each([
    ['Ada Lovelace', 'Ada Lovelace'],
    ['Visit https://evil.example/claim now', 'Visit now'],
    ['Ada www.evil.example', 'Ada'],
    ['Ada evil.com/path', 'Ada'],
    ['Ada ｅｖｉｌ．ｃｏｍ', 'Ada'],
    ['Ada evil。com', 'Ada'],
    ['Ada ev\u200Bil.com', 'Ada'],
    ['St.John', 'St.John'],
    ['Mr. Smith', 'Mr. Smith'],
    ['J. R. R. Tolkien', 'J. R. R. Tolkien'],
    ['   ', undefined],
    [undefined, undefined],
  ])('makes %j into %j', (name, expected) => {
    expect(giftSenderName(name)).toBe(expected)
  })

  it('keeps at most 40 characters', () => {
    expect(giftSenderName('a'.repeat(60))).toHaveLength(40)
  })
})
