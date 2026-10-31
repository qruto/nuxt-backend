import type { PolarWebhookEvent } from '@convex-dev/polar'
import { checkoutsClientConfirm } from '@polar-sh/sdk/funcs/checkoutsClientConfirm.js'
import { checkoutsCreate } from '@polar-sh/sdk/funcs/checkoutsCreate.js'
import { discountsGet } from '@polar-sh/sdk/funcs/discountsGet.js'
import { ordersList } from '@polar-sh/sdk/funcs/ordersList.js'
import { refundsCreate } from '@polar-sh/sdk/funcs/refundsCreate.js'
import { actionGeneric, type Auth, createFunctionHandle, type FunctionReference, makeFunctionReference, queryGeneric, type Scheduler } from 'convex/server'
import { v } from 'convex/values'
import { BILLING_MANAGER_ROLES, RUN_GIFT_SWEEP_FUNCTION } from '../../constants.js'
import { hasAnyRole } from '../access.js'
import { mintClaimDiscount, voidClaimDiscount } from './claim-discount.js'
import { type BillingContext, isProviderNotFound, readEnv } from './context.js'
import type { BillingCustomers } from './customers.js'
import { withCheckoutReturn } from './checkout.js'
import type { BillingFreePlan } from './free-plan.js'
import { giftDeliverAt, giftMessage, giftSenderName } from './gift-rules.js'
import { GIFT_ACCESS, giftCaller } from './gift-access.js'
import { createGiftManagement } from './gift-manage.js'
import { createPasses } from './passes.js'
import type { PurchaseRules } from './purchase.js'
import type { CheckoutCreateInput, ProviderCtx, RunQueryCtx, RunWriteCtx } from './types/base.js'
import type { GiftRecord } from './types/records.js'
import type { BillingAccessRule } from './types/setup.js'
import { UNDELIVERABLE_CAUSES, undeliverableReason } from '../../delivery.js'
import { backendError } from '../../errors.js'
import { logBackend } from '../../log.js'
import { normalizeEmail } from '../../tokens.js'
import { pauseCheck, refusePaused } from '../../pauses.js'

// Gifts, native to the provider: a credit pack, or a plan as a pass. The purchaser buys the pack's
// private gift product on their own billing entity's customer, so the receipt
// and the invoice are theirs and nothing is created for the recipient. Once
// that order is paid, a single-use, code-free 100% discount on the pack is
// minted for the gift. The recipient signs in — which proves the address —
// and claims it through a $0 checkout of the pack on their own entity, so the
// provider grants the credits to their customer. A refund of the purchase
// before the claim deletes the discount. Gifts are service units, never money.
//
// A plan pass has no discount and no checkout: the claim switches the
// recipient's free workspace to the plan's pass product (passes.ts). A gift
// may be dated for later: it is paid at once and delivered (the recipient is
// told, and may see and claim it) on its date, by a scheduled function and,
// should that be missed, the component's sweep (gift-manage.ts).

export { giftSenderName } from './gift-rules.js'

/** The fields of a gift order's payload that fulfilment reads. */
type GiftOrder = {
  id?: string
  status?: string
  paid?: boolean
  productId?: string | null
  customerId?: string
  customer?: { id?: string, externalId?: string | null }
  discountId?: string | null
  netAmount?: number
  refundableAmount?: number
  currency?: string
  metadata?: Record<string, unknown>
}

/** How many gifts one purchaser may buy in a window, unless `setupBilling({ giftLimit })` says otherwise. */
const GIFT_LIMIT = { max: 10, days: 30 } as const
/** How long a purchaser's open gift checkout counts against their cap: past it, the checkout has expired at the provider. */
const OPEN_CHECKOUT_MS = 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
/** How many gifts one address may be sent in a day: nobody floods an inbox. */
const ADDRESS_LIMIT = 5

/** A date this close ahead is due: the mutation that stamped it and the action reading it do not share a clock to the millisecond. */
const CLOCK_SKEW_MS = 5000

/** What the purchaser reads when they have not paid for anything yet. */
const NO_EARLIER_ORDER = 'Gifts open after your first purchase. Buy a plan or a credit pack first, then send one.'
/** What the purchaser reads when the recipient is their own address. */
const OWN_ADDRESS = 'A gift is for someone else — send it to another address.'
/** What the purchaser reads when the recipient was sent five gifts today. */
const ADDRESS_FULL = 'This address can\'t receive more gifts today. Try again tomorrow.'
/**
 * Gift purchases: the purchaser's checkout, fulfilment and refund on the
 * provider's webhooks, and the recipient's claim.
 */
export function createGifts(
  context: BillingContext,
  customers: BillingCustomers,
  { requireTrustedUrl, requirePack, requireGiftProduct, requirePassGift, requireClientMetadata, requireCurrency }: PurchaseRules,
  freePlan: Pick<BillingFreePlan, 'isFreeProduct'>,
) {
  const { components, config, billTo, provider, requireEntity, account, memberRole, requireProviderAccess, unwrapProvider, throttle, recordEvent } = context
  const { ensureCustomer, profileOf } = customers
  const passes = createPasses(context, customers, freePlan)
  const gifts = components.backend.gifts
  // The gift sweep, by the name every billing function goes by: scheduled for a gift dated later, woken by the component's cron.
  const sweepReference = makeFunctionReference<'action'>(RUN_GIFT_SWEEP_FUNCTION) as unknown as FunctionReference<'action', 'internal', { op?: 'sweep', giftId?: string }>
  // The pause_checkout kill switch: a gift is a purchase, a claim is not.
  const paused = pauseCheck(components.backend)
  // A field left undefined keeps its default.
  const limit = { max: config.giftLimit?.max ?? GIFT_LIMIT.max, days: config.giftLimit?.days ?? GIFT_LIMIT.days }

  /**
   * The billing entity a person buys a gift from and claims one into: their
   * personal workspace by default, else the active workspace when they own
   * it. With `billTo: 'user'` or an app's own `resolveEntity`, the entity it
   * resolves, asked for one the person manages (`rule`). A shared workspace
   * someone only belongs to is never charged for their gift, nor handed theirs.
   */
  const ownEntity = async (ctx: RunQueryCtx & { auth: Auth }, userId: string, what: string, rule: BillingAccessRule): Promise<string> => {
    const personal = billTo === 'workspace' && !config.resolveEntity ? await ctx.runQuery(gifts.personalEntity, { userId }) : null
    if (personal) return personal
    // The active workspace, or an app's own resolver's entity, checked as
    // every billing call checks it (a ban, the membership and the manager
    // role, read fresh), and only when the person owns it: a gift is never
    // billed to, nor claimed into, a workspace they only belong to. A user
    // entity has no owner to compare.
    const entity = (await requireEntity(ctx, rule)).userId
    const profile = entity ? await profileOf(ctx, entity) : null
    const owned = profile ? profile.owner?.userId === userId : billTo === 'user' || Boolean(config.resolveEntity)
    if (entity && owned) return entity
    throw backendError('no_workspace', {}, `[nuxt-backend] ${what}: no billing entity of your own — sign in again (a personal workspace is created automatically).`)
  }

  /**
   * The entity a gift is claimed into: `workspaceId` when the recipient
   * names one they manage (an owner or an admin of it, read fresh), else the
   * entity they own by default. With `billTo: 'user'` there is no workspace
   * to name.
   */
  const claimEntity = async (ctx: RunQueryCtx & { auth: Auth }, userId: string, workspaceId: string | undefined, what: string): Promise<string> => {
    if (workspaceId === undefined) return ownEntity(ctx, userId, what, GIFT_ACCESS.claim)
    if (billTo !== 'workspace' || config.resolveEntity) {
      throw backendError('invalid_input', { field: 'workspaceId' }, `[nuxt-backend] ${what}: there are no workspaces to receive into here — leave workspaceId out.`)
    }
    const role = await memberRole(ctx, userId, workspaceId)
    if (!role) throw backendError('forbidden', { reason: 'not_member' }, `[nuxt-backend] ${what}: you are no member of that workspace.`)
    if (!hasAnyRole(role, BILLING_MANAGER_ROLES)) {
      throw backendError('forbidden', { reason: 'not_billing_manager' }, `[nuxt-backend] ${what}: only an owner or an admin of a workspace can receive a gift into it.`)
    }
    return workspaceId
  }

  /**
   * How many gifts a purchaser has bought in the window, open checkouts
   * included unless `settledOnly`, leaving out `excludeGiftId`.
   */
  const giftsBought = (ctx: RunQueryCtx, purchaserUserId: string, { settledOnly = false, excludeGiftId }: { settledOnly?: boolean, excludeGiftId?: string } = {}) => {
    const now = Date.now()
    return ctx.runQuery(gifts.countBought, {
      purchaserUserId,
      since: now - limit.days * DAY_MS,
      pendingSince: settledOnly ? now + 1 : now - OPEN_CHECKOUT_MS,
      ...(excludeGiftId ? { excludeGiftId } : {}),
    })
  }

  /**
   * Refuse a purchaser who already bought `giftLimit.max` gifts in the
   * window, counting the checkouts they still have open: several opened at
   * once can't each slip under the cap and all be paid.
   */
  const requireGiftAllowance = async (ctx: RunQueryCtx, purchaserUserId: string): Promise<void> => {
    const windowMs = limit.days * DAY_MS
    const { count, oldest } = await giftsBought(ctx, purchaserUserId)
    if (count < limit.max) return
    const retryAfter = oldest === null ? undefined : Math.max(0, oldest + windowMs - Date.now())
    throw backendError('rate_limited', { limit: 'gifts', retryAfter }, `[nuxt-backend] giftCheckout: at most ${limit.max} gifts in ${limit.days} days — try again later.`)
  }

  /**
   * How many gifts an address was sent in the last day, open checkouts
   * included unless `settledOnly`, leaving out `excludeGiftId`.
   */
  const giftsSentTo = (ctx: RunQueryCtx, recipientEmail: string, { settledOnly = false, excludeGiftId }: { settledOnly?: boolean, excludeGiftId?: string } = {}) => {
    const now = Date.now()
    return ctx.runQuery(gifts.countToAddress, {
      email: recipientEmail,
      since: now - DAY_MS,
      pendingSince: settledOnly ? now + 1 : now - OPEN_CHECKOUT_MS,
      ...(excludeGiftId ? { excludeGiftId } : {}),
    })
  }

  /** Refuse a recipient already sent five gifts in the last day, so nobody floods one inbox. */
  const requireAddressAllowance = async (ctx: RunQueryCtx, recipientEmail: string): Promise<void> => {
    if (await giftsSentTo(ctx, recipientEmail) >= ADDRESS_LIMIT) throw backendError('forbidden', { reason: 'gift_refused', message: ADDRESS_FULL }, ADDRESS_FULL)
  }

  /**
   * Refuse a purchaser with no earlier paid order on any entity they own: a
   * stolen card that could buy gifts for strangers at once would be a way
   * to cash it out, and a claimed gift can't be taken back.
   */
  const requireEarlierOrder = async (entityIds: string[]): Promise<void> => {
    const listed = unwrapProvider(await ordersList(provider.polar, { externalCustomerId: entityIds, limit: 10, sorting: ['-created_at'] }), 'gift checkout')
    const paid = listed.result.items.some(order =>
      (order.status === 'paid' || order.status === 'partially_refunded') && order.netAmount > 0)
    if (!paid) throw backendError('forbidden', { reason: 'gift_refused', message: NO_EARLIER_ORDER }, NO_EARLIER_ORDER)
  }

  /** The app's own `canGift` veto, with its sentence when it wrote one. */
  const askCanGift = async (ctx: Parameters<NonNullable<typeof config.canGift>>[0], input: Parameters<NonNullable<typeof config.canGift>>[1]): Promise<void> => {
    if (!config.canGift) return
    const verdict = await config.canGift(ctx, input)
    if (verdict === true) return
    // The app's own sentence, when it wrote one: anything else reads as the default, never as a crash.
    const message = typeof verdict === 'object' && verdict !== null && typeof verdict.message === 'string' && verdict.message
      ? verdict.message
      : 'This address can\'t receive gifts.'
    throw backendError('forbidden', { reason: 'gift_refused', message }, message)
  }

  /** The recipient as the gift sends it to: a valid address, never the purchaser's own. */
  const requireRecipient = (typed: string, purchaserEmail: string): string => {
    const recipientEmail = normalizeEmail(typed)
    if (!recipientEmail || !recipientEmail.includes('@')) {
      throw backendError('invalid_input', { field: 'recipientEmail' }, '[nuxt-backend] giftCheckout: a valid recipient email is required.')
    }
    if (recipientEmail === purchaserEmail) {
      throw backendError('forbidden', { reason: 'gift_refused', message: OWN_ADDRESS }, OWN_ADDRESS)
    }
    return recipientEmail
  }

  /**
   * What a gift is, from the arguments: a pack by `pack`, or a plan pass by
   * `plan` and its `months`, one or the other. The products it is bought
   * with and claimed onto, resolved against the catalog.
   */
  const requireGiftItem = async (ctx: RunQueryCtx, args: { pack?: string, plan?: string, months?: number }): Promise<{ productId: string, giftProductId: string }> => {
    if ((args.pack === undefined) === (args.plan === undefined)) {
      throw backendError('invalid_input', { field: args.plan === undefined ? 'pack' : 'plan' }, '[nuxt-backend] giftCheckout: name the gift: a credit pack by `pack`, or a plan by `plan` with its `months`.')
    }
    if ((args.months === undefined) !== (args.plan === undefined)) {
      throw backendError('invalid_input', { field: 'months' }, '[nuxt-backend] giftCheckout: `months` goes with a `plan` (a plan pass), and a plan needs its `months`.')
    }
    if (args.plan === undefined) return { productId: await requirePack(ctx, args.pack!), giftProductId: requireGiftProduct(args.pack!) }
    const { passProductId, purchaseProductId } = requirePassGift(args.plan, args.months!)
    return { productId: passProductId, giftProductId: purchaseProductId }
  }

  /**
   * A gift is a credit pack named by its catalog key, or a plan named by its
   * key with a length in months (a plan pass): never a product outside the
   * catalog, and never a plan's own subscription, which would renew on
   * someone's card. The purchaser buys the item's private gift product on
   * their own billing entity's customer, with discount codes off: they get
   * the receipt, and the recipient's details appear nowhere in the checkout.
   * Every input is checked before the provider hears of it. `currency` pays
   * in one the gift product is priced in (`billing sync` gives it every
   * currency of its pack or plan), else in the catalog's own. `deliverAt`
   * dates the notice for later, at most a year ahead.
   */
  const giftCheckout = actionGeneric({
    args: {
      pack: v.optional(v.string()),
      plan: v.optional(v.string()),
      months: v.optional(v.number()),
      recipientEmail: v.string(),
      message: v.optional(v.string()),
      deliverAt: v.optional(v.number()),
      origin: v.string(),
      successUrl: v.string(),
      metadata: v.optional(v.record(v.string(), v.string())),
      currency: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
      const purchaser = await giftCaller(ctx, 'giftCheckout', GIFT_ACCESS.buy, account)
      await refusePaused(paused, ctx, 'checkout')
      requireProviderAccess('gift checkout')
      const recipientEmail = requireRecipient(args.recipientEmail, purchaser.email)
      const message = giftMessage(args.message)
      const deliverAt = giftDeliverAt(args.deliverAt)
      requireTrustedUrl(args.origin, 'origin')
      requireTrustedUrl(args.successUrl, 'successUrl')
      requireClientMetadata(args.metadata)
      // Every gift checkout reaches the provider for an address the purchaser
      // picked, so a purchaser is held to the `billingSync` limit (keyed by
      // their user id) like every other client-callable provider call — before
      // the pack is even read.
      await throttle(ctx, purchaser.userId, 'gift checkouts')
      const item = await requireGiftItem(ctx, args)
      const currency = await requireCurrency(ctx, args.currency, [item.giftProductId])
      const entityId = await ownEntity(ctx, purchaser.userId, 'giftCheckout', GIFT_ACCESS.buy)
      await requireGiftAllowance(ctx, purchaser.userId)
      await askCanGift(ctx, { recipientEmail, purchaserUserId: purchaser.userId, purchaserEntityId: entityId })
      // A gift whose email the deployment cannot deliver is refused before
      // anyone pays for it, as a code or an invitation is: after the app's
      // own refusal, so that is the one the purchaser reads.
      const unsendable = undeliverableReason(recipientEmail)
      if (unsendable) {
        logBackend('warn', 'email.undeliverable', `A gift checkout was refused: ${UNDELIVERABLE_CAUSES[unsendable]}`)
        throw backendError('unavailable', { service: 'email', reason: unsendable === 'test-mode' ? 'test_mode' : 'unconfigured' }, '[nuxt-backend] giftCheckout: the gift email to this recipient would not arrive.')
      }
      await requireAddressAllowance(ctx, recipientEmail)
      const profile = await profileOf(ctx, entityId)
      await requireEarlierOrder(profile?.ownedEntityIds ?? [entityId])
      await ensureCustomer(ctx, { userId: entityId, email: purchaser.email }, profile, 'gift checkout')
      const giftId = await ctx.runMutation(gifts.create, {
        recipientEmail,
        purchaserUserId: purchaser.userId,
        purchaserEntityId: entityId,
        purchaserName: purchaser.name,
        ...(args.plan === undefined ? { pack: args.pack } : { plan: args.plan, months: args.months }),
        productIds: [item.productId],
        giftProductId: item.giftProductId,
        message,
        ...(deliverAt === undefined ? {} : { deliverAt }),
      })
      const checkout = await checkoutsCreate(provider.polar, {
        products: [item.giftProductId],
        externalCustomerId: entityId,
        embedOrigin: args.origin,
        successUrl: args.successUrl,
        // A gift is bought at its price: a discount on it would be one more
        // way to turn a code into credits for someone else.
        allowDiscountCodes: false,
        ...(currency ? { currency: currency as CheckoutCreateInput['currency'] } : {}),
        metadata: { ...args.metadata, giftId },
      })
      return { url: unwrapProvider(checkout, 'gift checkout').url }
    },
  })

  /**
   * Claim one gift addressed to the caller's verified email, into a billing
   * entity they manage (`workspaceId`, else their own): a checkout of the
   * pack with the gift's single-use 100% discount locked on, which the server
   * confirms itself when the pack asks for no checkout fields — the provider
   * then grants the credits on the order. A pack that needs fields returns
   * the provider's $0 checkout to finish. `url` is `null` when the server
   * confirmed it; either way the gift counts as claimed once the provider says
   * the claim order is paid. A plan pass has no checkout: the workspace's
   * free subscription is switched to the pass, and the gift is claimed then.
   * A gift dated for later can't be claimed before its date.
   */
  const claimGift = actionGeneric({
    args: { giftId: v.string(), successUrl: v.optional(v.string()), workspaceId: v.optional(v.string()) },
    handler: async (ctx, { giftId, successUrl, workspaceId }): Promise<{ url: string | null }> => {
      const recipient = await giftCaller(ctx, 'claimGift', GIFT_ACCESS.claim, account)
      if (!recipient.email || !recipient.emailVerified) {
        throw backendError('forbidden', { reason: 'no_email' }, '[nuxt-backend] claimGift: the signed-in identity has no verified email.')
      }
      const gift = await ctx.runQuery(gifts.get, { giftId })
      // Email ownership is proven by the sign-in code, so the identity's
      // verified email matching the gift's recipient is the authorization. A
      // gift that does not exist refuses like someone else's.
      if (!gift || gift.recipientEmail !== recipient.email) {
        throw backendError('forbidden', { reason: 'not_recipient' }, '[nuxt-backend] claimGift: this gift is addressed to a different email.')
      }
      if (gift.status === 'refunded') {
        throw backendError('forbidden', { reason: 'gift_refunded' }, '[nuxt-backend] claimGift: this gift was refunded, so it can\'t be received.')
      }
      if (gift.status === 'claimed') return { url: null }
      // A gift paid before 0.2 has no discount: it gets one on its claim (below). A plan pass never has one.
      if (gift.status !== 'paid' || !(gift.plan || gift.discountId || gift.billingCustomerId)) {
        throw backendError('not_ready', { reason: 'not_paid' }, '[nuxt-backend] claimGift: this gift is not paid for yet.')
      }
      // Dated for later: not the recipient's before its notice goes out.
      if (!delivered(gift)) {
        throw backendError('not_ready', { reason: 'not_delivered' }, '[nuxt-backend] claimGift: this gift arrives on a later date.')
      }
      requireProviderAccess('gift claim')
      requireTrustedUrl(successUrl, 'successUrl')
      await throttle(ctx, recipient.userId, 'gift claims')
      const entityId = await claimEntity(ctx, recipient.userId, workspaceId, 'claimGift')
      if (gift.plan) {
        await passes.claimPass(ctx, gift, recipient, entityId)
        await recordClaimed(ctx, gift, entityId, recipient.userId)
        return { url: null }
      }
      return await claimPack(ctx, gift, recipient, entityId, successUrl)
    },
  })

  /**
   * A pack's claim: a checkout of the pack on the recipient's entity with the
   * gift's single-use discount locked on, confirmed by the server when the
   * pack asks for no checkout fields (`url: null`), else the provider's $0
   * checkout to finish. No checkout opens while the purchaser's cancellation
   * holds the gift.
   */
  const claimPack = async (ctx: RunWriteCtx, gift: GiftRecord, recipient: { userId: string, email: string }, entityId: string, successUrl: string | undefined): Promise<{ url: string | null }> => {
    const customerId = await ensureCustomer(ctx, { userId: entityId, email: recipient.email }, await profileOf(ctx, entityId), 'gift claim')
    const discountId = gift.discountId ?? await legacyDiscount(ctx, gift, customerId, recipient.userId, entityId)
    if (!discountId) return { url: null }
    if (!await ctx.runMutation(gifts.startClaim, { giftId: gift.id, userId: recipient.userId, entityId })) {
      throw backendError('forbidden', { reason: 'gift_refunded' }, '[nuxt-backend] claimGift: this gift is being cancelled by its sender, so it can\'t be received.')
    }
    const checkout = unwrapProvider(await checkoutsCreate(provider.polar, {
      products: gift.productIds,
      externalCustomerId: entityId,
      discountId,
      allowDiscountCodes: false,
      metadata: { giftId: gift.id, phase: 'claim' },
      // The claim grants the recipient's own credits: a hosted claim comes
      // back with its id, so the page refreshes them once.
      ...(successUrl ? { successUrl: withCheckoutReturn(successUrl) } : {}),
    }), 'gift claim')
    if (checkout.totalAmount !== 0) {
      // The discount did not cover the pack: never confirm a claim that charges the recipient.
      logBackend('error', 'billing.gift_claim_not_free', 'A gift claim checkout was not free, so it was not confirmed.', { totalAmount: checkout.totalAmount })
      throw backendError('unavailable', { service: 'billing', reason: 'provider_refused' }, '[nuxt-backend] claimGift: the gift could not be applied — try again shortly.')
    }
    // The session token the confirm returns is the buyer's: it is dropped here.
    const confirmed = await checkoutsClientConfirm(provider.polar, { clientSecret: checkout.clientSecret, checkoutConfirmStripe: {} })
    if (confirmed.ok) return { url: null }
    logBackend('warn', 'billing.gift_claim_hosted', 'A gift claim needs the provider\'s checkout to finish (the pack asks for checkout fields).')
    return { url: checkout.url }
  }

  /**
   * The gifts addressed to the caller's verified email that are theirs to
   * see: paid and claimed ones, with who sent them, what and when — never the
   * purchaser's email or a billing id. `null` for a caller with no verified
   * email.
   */
  const getReceivedGifts = queryGeneric({
    args: {},
    handler: async (ctx) => {
      const identity = await ctx.auth.getUserIdentity()
      if (!identity) return null
      const claims = identity as unknown as Record<string, unknown>
      const email = typeof claims.email === 'string' && claims.emailVerified === true ? claims.email.toLowerCase() : null
      if (!email) return null
      // A banned or deleted account receives nothing, whatever its token says.
      const stored = await account(ctx, identity.subject)
      if (!stored || stored.banned) return null
      const rows = await ctx.runQuery(gifts.listByEmail, { email })
      return rows.map(gift => ({
        id: gift.id,
        purchaserName: giftSenderName(gift.purchaserName),
        pack: gift.pack,
        plan: gift.plan,
        months: gift.months,
        productIds: gift.productIds,
        message: gift.message,
        status: gift.status,
        createdAt: gift.createdAt,
        paidAt: gift.paidAt,
        deliveredAt: gift.deliveredAt,
        claimedAt: gift.claimedAt,
      }))
    },
  })

  /** Whether an order bought this gift's own gift product, on the purchaser's own entity. */
  const isGiftOrder = (gift: GiftRecord, order: GiftOrder): boolean =>
    order.productId === gift.giftProductId && order.customer?.externalId === gift.purchaserEntityId

  /**
   * Whether a paid order is this gift's purchase: its gift product, on the
   * purchaser's own entity, paid at a price above zero with no discount.
   * Anything else is not delivered.
   */
  const isPurchase = (gift: GiftRecord, order: GiftOrder): boolean =>
    isGiftOrder(gift, order)
    && (order.status === 'paid' || order.paid === true)
    && !order.discountId
    && typeof order.netAmount === 'number' && order.netAmount > 0

  /** The gift's claim discount, minted once (see claim-discount.ts). */
  const mintDiscount = (gift: GiftRecord): Promise<string> => mintClaimDiscount(context, { kind: 'gift', id: gift.id, productIds: gift.productIds }, 'gift discount')

  /** End a discount now and delete it; one already gone is fine. */
  const voidDiscount = (discountId: string, operation: string): Promise<void> => voidClaimDiscount(context, discountId, operation)

  /**
   * Mint and store a paid gift's claim discount. When another run stored one
   * first, the one minted here is voided, so a gift never has two.
   */
  const storeDiscount = async (ctx: RunWriteCtx, gift: GiftRecord): Promise<string | undefined> => {
    const minted = await mintDiscount(gift)
    if (await ctx.runMutation(gifts.setDiscount, { giftId: gift.id, discountId: minted })) return minted
    const stored = (await ctx.runQuery(gifts.get, { giftId: gift.id }))?.discountId
    if (stored !== minted) await voidDiscount(minted, 'gift discount')
    return stored
  }

  /**
   * The claim discount of a gift paid before 0.2, which billed the pack to a
   * customer keyed by the recipient's email. When the recipient's entity
   * adopted that very customer, the credits are already theirs: the gift is
   * received, and there is nothing to check out (`undefined`). Otherwise the
   * credits sit on a customer no entity bills through, so the gift gets its
   * discount now, as a gift paid today does.
   */
  const legacyDiscount = async (ctx: RunWriteCtx, gift: GiftRecord, customerId: string, userId: string, entityId: string): Promise<string | undefined> => {
    if (customerId === gift.billingCustomerId) {
      await ctx.runMutation(gifts.markClaimed, { giftId: gift.id, userId, entityId })
      return undefined
    }
    return await storeDiscount(ctx, gift)
  }

  /**
   * Whether the recipient may see and claim a gift: its notice went out, or
   * it was paid before gifts had delivery dates (no date, no stamp).
   */
  const delivered = (gift: Pick<GiftRecord, 'deliveredAt' | 'deliverAt'>): boolean => gift.deliveredAt !== undefined || gift.deliverAt === undefined

  /**
   * Tell the recipient: the first notice once per gift, then a reminder or a
   * resend whenever asked. Send first, stamp after. A send that throws — a
   * template override, a transient failure — leaves no stamp, so the
   * redelivery of `order.paid` (or the next sweep) sends again; a run that
   * sent but never stamped is absorbed by the idempotency key while the first
   * email's record exists; and once stamped, a replay sends nothing however
   * late it comes. An email the deployment cannot deliver at all (test mode,
   * no key, no sender) is skipped and logged instead: a throw would fail
   * every redelivery and keep the app's own `order.paid` handler from
   * running, while the gift stands and the recipient can claim it in the app.
   * It stays unstamped, so a redelivery once the setting is fixed sends it.
   * The key is namespaced so it can never collide with one of the app's own,
   * and is the gift's alone for its first notice: later ones count up, and an
   * address the purchaser changed to gets keys of its own. The
   * email names the sender and the gift and links to the app with no token;
   * the message stays in the app. Returns whether an email went out.
   */
  const notifyRecipient = async (ctx: RunWriteCtx, gift: GiftRecord, kind: 'first' | 'reminder' | 'again' = 'first'): Promise<boolean> => {
    if (kind === 'first' && gift.notifiedAt !== undefined) return false
    const unsendable = undeliverableReason(gift.recipientEmail)
    if (unsendable) {
      logBackend('warn', 'email.undeliverable', `A paid gift's email to its recipient was not sent: ${UNDELIVERABLE_CAUSES[unsendable]}`)
      return false
    }
    const product = gift.productIds[0] ? await provider.getProduct(ctx as unknown as ProviderCtx, { productId: gift.productIds[0] }) : null
    const item = gift.plan ? await passes.planName(ctx, gift.plan) : product?.name ?? gift.pack ?? 'credits'
    const count = gift.noticeCount ?? 0
    const key = gift.recipientChanges ? `nuxt-backend:gift:${gift.id}:to${gift.recipientChanges}` : `nuxt-backend:gift:${gift.id}`
    // In the recipient's language when they have an account, else the purchaser's.
    await config.email.sendTemplate(ctx, 'gift', {
      recipientEmail: gift.recipientEmail,
      purchaserName: giftSenderName(gift.purchaserName),
      item,
      ...(gift.plan && gift.months ? { months: gift.months } : {}),
      claimUrl: readEnv('SITE_URL') ?? '',
      ...(kind === 'reminder' ? { reminder: true } : {}),
    }, { senderId: gift.purchaserUserId, idempotencyKey: kind === 'first' && count === 0 ? key : `${key}:${count + 1}` })
    if (kind === 'first') await ctx.runMutation(gifts.markNotified, { giftId: gift.id })
    await ctx.runMutation(gifts.noteNotice, { giftId: gift.id, reminder: kind === 'reminder' })
    return true
  }

  /** The scheduler of a function context that has one (an action's or an HTTP action's): a hand-built test context may not. */
  const schedulerOf = (ctx: RunWriteCtx): Scheduler | undefined => (ctx as { scheduler?: Scheduler }).scheduler

  /**
   * Keep the handle the component's sweep wakes the app by, so a delivery
   * that a restart missed is still made. Never fails a payment: the sweep
   * is the backstop, not the path.
   */
  const registerSweep = async (ctx: RunWriteCtx): Promise<void> => {
    try {
      await ctx.runMutation(gifts.registerSweep, { wake: await createFunctionHandle(sweepReference) })
    }
    catch (error) {
      logBackend('warn', 'billing.gift_sweep_unregistered', 'The gift sweep could not be registered, so a gift dated for later is delivered by its scheduled function only.', error)
    }
  }

  /**
   * Hand a paid gift to the recipient: tell them, then stamp it delivered so
   * they see it and may claim it. A gift dated for later is scheduled instead
   * (its scheduled function and the sweep deliver it on its date). A gift whose email can't go out is still delivered:
   * the recipient finds it in the app.
   */
  const deliver = async (ctx: RunWriteCtx, gift: GiftRecord): Promise<void> => {
    if (gift.status !== 'paid') return
    if (gift.deliverAt !== undefined && gift.deliverAt > Date.now() + CLOCK_SKEW_MS) {
      if (delivered(gift)) return
      await registerSweep(ctx)
      await schedulerOf(ctx)?.runAfter(gift.deliverAt - Date.now(), sweepReference, { giftId: gift.id })
      return
    }
    // The first notice goes once: a redelivery of the payment sends it if it never went, and nothing if it did.
    await notifyRecipient(ctx, gift)
    if (!delivered(gift)) await ctx.runMutation(gifts.markDelivered, { giftId: gift.id })
  }

  /** The one reminder of a gift still unclaimed a week after it was delivered. */
  const remind = async (ctx: RunWriteCtx, gift: GiftRecord): Promise<void> => {
    if (gift.status !== 'paid' || !delivered(gift) || gift.remindedAt !== undefined) return
    await notifyRecipient(ctx, gift, 'reminder')
    // Spent even when the email could not go out: one reminder, not one per sweep.
    if (!(await ctx.runQuery(gifts.get, { giftId: gift.id }))?.remindedAt) await ctx.runMutation(gifts.noteNotice, { giftId: gift.id, reminder: true })
  }

  /**
   * A gift paid past its cap — several checkouts opened at once, all paid —
   * is refunded in full instead of delivered: the purchaser's cap and the
   * address's daily cap hold at payment, not only at checkout.
   */
  const overCap = async (ctx: RunWriteCtx, gift: GiftRecord, order: GiftOrder): Promise<boolean> => {
    const { count } = await giftsBought(ctx, gift.purchaserUserId, { settledOnly: true, excludeGiftId: gift.id })
    const purchaserFull = count >= limit.max
    if (!purchaserFull && await giftsSentTo(ctx, gift.recipientEmail, { settledOnly: true, excludeGiftId: gift.id }) < ADDRESS_LIMIT) return false
    if (purchaserFull) logBackend('error', 'billing.gift_over_limit', 'A gift was paid past its purchaser\'s gift limit, so it was refunded instead of delivered.')
    else logBackend('error', 'billing.gift_over_address_limit', 'A gift was paid past its recipient address\'s daily limit, so it was refunded instead of delivered.')
    const amount = order.refundableAmount ?? order.netAmount
    if (order.id && typeof amount === 'number' && amount > 0) {
      unwrapProvider(await refundsCreate(provider.polar, { orderId: order.id, reason: 'other', amount, revokeBenefits: true }), 'gift refund')
    }
    if (await ctx.runMutation(gifts.markRefunded, { giftId: gift.id })) await recordGift(ctx, gift.purchaserEntityId, { type: 'gift.refunded', actor: null, targetId: gift.id })
    return true
  }

  /**
   * The purchase is paid: check it is the gift's own and within the caps,
   * mark it paid with what it charged, mint the claim discount (a pack's; a
   * plan pass has none) and deliver it: now, or on its date. Each step is
   * idempotent, so a redelivery picks up where a failed run stopped; a gift
   * refunded in the meantime is never delivered.
   */
  const purchasePaid = async (ctx: RunWriteCtx, gift: GiftRecord, order: GiftOrder): Promise<void> => {
    if (gift.status === 'pending') {
      if (!isPurchase(gift, order)) {
        logBackend('warn', 'billing.gift_unverified', 'A paid order named a gift it did not buy (another product, customer or price), so the gift stays pending.')
        return
      }
      if (await overCap(ctx, gift, order)) return
      await ctx.runMutation(gifts.markPaid, { giftId: gift.id, billingOrderId: order.id, amount: order.netAmount, currency: order.currency })
      await recordGift(ctx, gift.purchaserEntityId, {
        type: 'gift.purchased',
        actor: null,
        targetId: gift.id,
        data: { ...(typeof order.netAmount === 'number' ? { amount: order.netAmount } : {}), ...(order.currency ? { currency: order.currency } : {}) },
      })
    }
    let current = await ctx.runQuery(gifts.get, { giftId: gift.id })
    if (current?.status !== 'paid' || current.billingOrderId !== order.id) return
    if (!current.plan && !current.discountId) {
      await storeDiscount(ctx, current)
      current = await ctx.runQuery(gifts.get, { giftId: gift.id })
      if (!current) return
    }
    await deliver(ctx, current)
  }

  /**
   * A claim order is paid: it is the gift's claim when it redeemed the
   * gift's own single-use discount, whichever entity it landed on — only
   * the server ever puts that discount on a checkout, and the recipient may
   * have opened another claim since. A claim that lands on a gift already
   * refunded is a loss the operator has to see.
   */
  const claimPaid = async (ctx: RunWriteCtx, gift: GiftRecord, order: GiftOrder): Promise<void> => {
    if (!gift.discountId || order.discountId !== gift.discountId) {
      logBackend('warn', 'billing.gift_unverified', 'A paid claim order did not redeem its gift\'s own discount, so the gift was left as it was.')
      return
    }
    if (gift.status === 'refunded') {
      logBackend('error', 'billing.gift_claimed_after_refund', 'A gift was claimed after its purchase was refunded: the recipient holds credits nobody paid for.')
      return
    }
    if (gift.status !== 'paid') return
    const entityId = order.customer?.externalId ?? gift.claimingEntityId ?? ''
    await ctx.runMutation(gifts.markClaimed, { giftId: gift.id, userId: gift.claimingUserId ?? entityId, entityId, claimOrderId: order.id })
    // The recipient claimed it, by the checkout they opened.
    await recordClaimed(ctx, gift, entityId, gift.claimingUserId)
  }

  /** The gift a paid or refunded order names in its metadata, which only the server writes on gift checkouts. */
  const giftOf = async (ctx: RunWriteCtx, order: GiftOrder): Promise<GiftRecord | null> => {
    const giftId = order.metadata?.giftId
    if (typeof giftId !== 'string') return null
    return await ctx.runQuery(gifts.get, { giftId })
  }

  /**
   * Record a gift's step for the entity it concerns: the purchaser's for a
   * purchase and a refund, the recipient's for a claim. A gift bought before
   * 0.2 names no purchasing entity, and records nothing.
   */
  const recordGift = async (ctx: RunWriteCtx, entityId: string | undefined, event: Parameters<typeof recordEvent>[2]): Promise<void> => {
    if (entityId) await recordEvent(ctx, entityId, event)
  }

  /** A claim happened: the recipient's entity records it, and the purchaser's entity learns its gift was received. */
  const recordClaimed = async (ctx: RunWriteCtx, gift: GiftRecord, entityId: string, userId: string | undefined): Promise<void> => {
    await recordGift(ctx, entityId, { type: 'gift.claimed', actor: userId ? { userId } : null, targetId: gift.id })
    if (gift.purchaserEntityId && gift.purchaserEntityId !== entityId) await recordGift(ctx, gift.purchaserEntityId, { type: 'gift.claimed', actor: null, targetId: gift.id })
  }

  /** Gift fulfilment on `order.paid`: a purchase delivers the gift, a claim marks it received. */
  const handleGiftOrderPaid = async (ctx: RunWriteCtx, event: PolarWebhookEvent): Promise<void> => {
    const order = event.data as GiftOrder
    const gift = await giftOf(ctx, order)
    if (!gift) return
    if (order.metadata?.phase === 'claim') await claimPaid(ctx, gift, order)
    else await purchasePaid(ctx, gift, order)
  }

  /** Whether the gift's discount was redeemed: a claim order is under way, or done. */
  const discountRedeemed = async (discountId: string): Promise<boolean> => {
    const found = await discountsGet(provider.polar, { id: discountId })
    if (!found.ok && isProviderNotFound(found.error)) return false
    return unwrapProvider(found, 'gift refund').redemptionsCount > 0
  }

  /**
   * Any refund of a purchase before the claim voids the gift — a partial one
   * too, since a gift is one pack and a refunded share would otherwise still
   * deliver all of it: the discount ends now and is deleted, so the recipient
   * can't redeem it. A refund that arrives before the order's `order.paid`
   * voids the pending gift, so it is never delivered. A gift whose discount
   * was already redeemed is claimed, or about to be: the credits can't be
   * taken back, so it is left to its claim, and the refund logged.
   */
  const handleGiftOrderRefunded = async (ctx: RunWriteCtx, event: PolarWebhookEvent): Promise<void> => {
    const order = event.data as GiftOrder
    if (order.metadata?.phase === 'claim') return
    const gift = await giftOf(ctx, order)
    const ours = gift && (gift.billingOrderId === order.id || (gift.status === 'pending' && isGiftOrder(gift, order)))
    if (!gift || !ours || gift.status === 'refunded') return
    if (gift.status === 'claimed' || (gift.discountId && await discountRedeemed(gift.discountId))) {
      logBackend('warn', 'billing.gift_refunded_after_claim', 'A gift purchase was refunded after its recipient claimed it; the credits stay with them.')
      return
    }
    if (gift.discountId) await voidDiscount(gift.discountId, 'gift refund')
    if (await ctx.runMutation(gifts.markRefunded, { giftId: gift.id })) await recordGift(ctx, gift.purchaserEntityId, { type: 'gift.refunded', actor: null, targetId: gift.id })
  }

  const management = createGiftManagement(context, {
    passes,
    delivered,
    deliver,
    remind,
    notifyRecipient,
    askCanGift: askCanGift as never,
    requireAddressAllowance,
    voidDiscount,
    discountRedeemed,
    recordGift,
    schedulerOf,
    sweepReference,
    registerSweep,
  })

  return { giftCheckout, claimGift, getReceivedGifts, handleGiftOrderPaid, handleGiftOrderRefunded, passes, registerSweep, ...management }
}

export type BillingGifts = ReturnType<typeof createGifts>
