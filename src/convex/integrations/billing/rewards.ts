import { checkoutsClientConfirm } from '@polar-sh/sdk/funcs/checkoutsClientConfirm.js'
import { checkoutsCreate } from '@polar-sh/sdk/funcs/checkoutsCreate.js'
import { ordersGet } from '@polar-sh/sdk/funcs/ordersGet.js'
import type { Auth, FunctionReference } from 'convex/server'
import { backendError } from '../../errors.js'
import { logBackend } from '../../log.js'
import type { CallerRule } from '../access.js'
import { mintClaimDiscount } from './claim-discount.js'
import { ADMIN_READ, type BillingContext, isProviderNotFound } from './context.js'
import type { BillingCustomers } from './customers.js'
import type { CatalogDiscounts, KeyedDiscount } from './discounts.js'
import { refusedDiscount } from './discounts.js'
import { giftCaller } from './gift-access.js'
import type { BillingPasses } from './passes.js'
import type { PurchaseRules } from './purchase.js'
import type { ProviderCtx, RunQueryCtx, RunWriteCtx } from './types/base.js'

// What the referral program asks of billing (REF): the rewards it grants and
// the facts it checks, all against the provider through the billing
// instance, so the program holds no provider client of its own. `setupBilling`
// registers this kit for its instance (`BILLING_REWARDS`), and
// `setupReferrals({ billing })` finds it there.

/** A person who is paid out: the account, and the address its billing customer carries. */
export interface RewardRecipient {
  userId: string
  entityId: string
  email: string
}

/** What `setupReferrals` asks of the billing instance it was given. */
export interface BillingRewards {
  billTo: 'workspace' | 'user'
  /** A catalog discount by its key. */
  discount: (key: string) => KeyedDiscount | undefined
  /** Whether the catalog sells a credit pack under this key. */
  hasPack: (ctx: RunQueryCtx, key: string) => Promise<boolean>
  /** A credit pack's name as the catalog sells it; its key when the product has not synced. */
  packName: (ctx: RunQueryCtx, key: string) => Promise<string>
  /** The signed-in caller: refused when nobody is, when banned, or when the rule refuses the session. */
  caller: (ctx: RunQueryCtx & { auth: Auth }, what: string, rule: CallerRule) => Promise<{ userId: string, email: string, name?: string }>
  /** Refuse anyone but an administrator (the rule's recent sign-in included). */
  requireAdmin: (ctx: RunQueryCtx & { auth?: Auth }, what: string, rule: CallerRule) => Promise<void>
  /** Whether the caller is an administrator now: the admin console's reads answer `null` to anyone else. */
  isAdmin: (ctx: RunQueryCtx & { auth?: Auth }, what: string) => Promise<boolean>
  /** The billing entity that owns an order's customer: the workspace's owner, or the account itself. */
  ownerOf: (ctx: RunQueryCtx, entityId: string) => Promise<string | null>
  /** Where a person's rewards land: their own billing entity (their personal workspace, or the account itself) and the address it is billed to. `null` for an account that is gone or banned. */
  recipientOf: (ctx: RunQueryCtx, userId: string) => Promise<RewardRecipient | null>
  /** Whether an order is paid and has no refund against it, read live from the provider. */
  orderIsSound: (orderId: string) => Promise<boolean>
  /**
   * Grant a credit pack at no cost: a single-use, code-free discount and a $0
   * checkout the provider fulfils, the way a gift is claimed. `discountId`
   * is the one minted by an earlier try, `remember` keeps a new one.
   */
  grantPack: (ctx: RunWriteCtx, input: { referralId: string, to: RewardRecipient, pack: string, discountId?: string, remember: (discountId: string) => Promise<void> }) => Promise<void>
  /** Grant free months of a plan (see `passes.rewardMonths`); `waitUntil` when the workspace can't take them yet. */
  grantMonths: (ctx: RunWriteCtx, input: { referralId: string, to: RewardRecipient, months: number, plan?: string, target?: number, remember: (endsAt: number) => Promise<void> }) => Promise<'extended' | 'pass' | { waitUntil: number }>
}

/** The billing instances' reward kits, by instance. */
export const BILLING_REWARDS = new WeakMap<object, BillingRewards>()

/**
 * The kit of one `setupBilling` call.
 */
export function createRewards(
  context: BillingContext,
  { profileOf, ensureCustomer }: Pick<BillingCustomers, 'profileOf' | 'ensureCustomer'>,
  { requirePack }: Pick<PurchaseRules, 'requirePack'>,
  discounts: CatalogDiscounts,
  passes: Pick<BillingPasses, 'rewardMonths'>,
): BillingRewards {
  const { components, config, billTo, provider, account, requireAdmin, requireProviderAccess, unwrapProvider } = context
  const findOne = components.backend.adapter.findOne as FunctionReference<'query', 'internal'>

  const ownerOf: BillingRewards['ownerOf'] = async (ctx, entityId) => {
    if (billTo === 'user') return entityId
    return (await profileOf(ctx, entityId))?.owner?.userId ?? null
  }

  const recipientOf: BillingRewards['recipientOf'] = async (ctx, userId) => {
    if (config.resolveEntity) {
      throw backendError('not_ready', { reason: 'custom_entity' }, '[nuxt-backend] referral rewards go to the person\'s own billing entity, which an app\'s own `resolveEntity` hides from the program. Drop `resolveEntity`, or grant the reward in your own code.')
    }
    const user = await ctx.runQuery(findOne, { model: 'user', where: [{ field: '_id', value: userId }] }) as { email?: string, banned?: boolean | null } | null
    if (!user?.email || user.banned) return null
    if (billTo === 'user') return { userId, entityId: userId, email: user.email.toLowerCase() }
    const entityId = await ctx.runQuery(components.backend.gifts.personalEntity, { userId })
    return entityId ? { userId, entityId, email: user.email.toLowerCase() } : null
  }

  const orderIsSound: BillingRewards['orderIsSound'] = async (orderId) => {
    const read = await ordersGet(provider.polar, { id: orderId })
    if (!read.ok && isProviderNotFound(read.error)) return false
    const order = unwrapProvider(read, 'referral order') as unknown as { status?: string, refundedAmount?: number }
    return order.status === 'paid' && !(order.refundedAmount && order.refundedAmount > 0)
  }

  const grantPack: BillingRewards['grantPack'] = async (ctx, { referralId, to, pack, discountId, remember }) => {
    requireProviderAccess('referral reward')
    const productId = await requirePack(ctx, pack)
    await ensureCustomer(ctx, { userId: to.entityId, email: to.email }, await profileOf(ctx, to.entityId), 'referral reward')
    const minted = discountId ?? await mintClaimDiscount(context, { kind: 'referral', id: referralId, productIds: [productId] }, 'referral discount')
    if (minted !== discountId) await remember(minted)
    const created = await checkoutsCreate(provider.polar, {
      products: [productId],
      externalCustomerId: to.entityId,
      discountId: minted,
      allowDiscountCodes: false,
      metadata: { referralId, phase: 'reward' },
    })
    // The discount is single-use: one the provider refuses was redeemed by an earlier try that stopped before it was noted.
    if (!created.ok && refusedDiscount(created.error)) return
    const checkout = unwrapProvider(created, 'referral reward')
    if (checkout.totalAmount !== 0) {
      logBackend('error', 'referrals.reward_failed', 'A referral reward\'s checkout was not free, so it was not confirmed.', { totalAmount: checkout.totalAmount })
      throw backendError('unavailable', { service: 'billing', reason: 'provider_refused' }, '[nuxt-backend] referral reward: the pack could not be granted at no cost — it is tried again at the next sweep.')
    }
    const confirmed = await checkoutsClientConfirm(provider.polar, { clientSecret: checkout.clientSecret, checkoutConfirmStripe: {} })
    if (confirmed.ok) return
    logBackend('error', 'referrals.reward_failed', 'A referral reward\'s pack asks for checkout fields, so the provider cannot grant it without the person: pick a pack that asks for none.')
    throw backendError('unavailable', { service: 'billing', reason: 'provider_refused' }, '[nuxt-backend] referral reward: the pack needs checkout fields filled in, which a reward cannot do for the person.')
  }

  return {
    billTo,
    discount: key => discounts.discountOf(key),
    hasPack: async (ctx, key) => {
      try {
        await requirePack(ctx, key)
        return true
      }
      catch {
        return false
      }
    },
    packName: async (ctx, key) => {
      try {
        const product = await provider.getProduct(ctx as unknown as ProviderCtx, { productId: await requirePack(ctx, key) })
        return product?.name ?? key
      }
      catch {
        return key
      }
    },
    caller: async (ctx, what, rule) => {
      const found = await giftCaller(ctx, what, rule, account)
      return { userId: found.userId, email: found.email, ...(found.name ? { name: found.name } : {}) }
    },
    requireAdmin,
    isAdmin: async (ctx, what) => {
      try {
        await requireAdmin(ctx, what, ADMIN_READ)
        return true
      }
      catch {
        return false
      }
    },
    ownerOf,
    recipientOf,
    orderIsSound,
    grantPack,
    grantMonths: (ctx, { referralId, to, months, plan, target, remember }) => passes.rewardMonths(ctx, { rewardId: referralId, userId: to.userId, entityId: to.entityId, email: to.email, months, plan, target, remember }),
  }
}
