import type { PolarWebhookEvent } from '@convex-dev/polar'
import { checkoutsClientConfirm } from '@polar-sh/sdk/funcs/checkoutsClientConfirm.js'
import { checkoutsCreate } from '@polar-sh/sdk/funcs/checkoutsCreate.js'
import { discountsCreate } from '@polar-sh/sdk/funcs/discountsCreate.js'
import { discountsDelete } from '@polar-sh/sdk/funcs/discountsDelete.js'
import { discountsGet } from '@polar-sh/sdk/funcs/discountsGet.js'
import { discountsList } from '@polar-sh/sdk/funcs/discountsList.js'
import { discountsUpdate } from '@polar-sh/sdk/funcs/discountsUpdate.js'
import { ordersList } from '@polar-sh/sdk/funcs/ordersList.js'
import { refundsCreate } from '@polar-sh/sdk/funcs/refundsCreate.js'
import { actionGeneric, type Auth, queryGeneric } from 'convex/server'
import { v } from 'convex/values'
import { type BillingContext, isProviderNotFound, readEnv } from './context.js'
import type { BillingCustomers } from './customers.js'
import type { PurchaseRules } from './purchase.js'
import type { ProviderCtx, RunQueryCtx, RunWriteCtx } from './types/base.js'
import type { GiftRecord } from './types/records.js'
import { backendError } from '../../errors.js'
import { logBackend } from '../../log.js'

// Credit-pack gifts, native to the provider. The purchaser buys the pack's
// private gift product on their own billing entity's customer, so the receipt
// and the invoice are theirs and nothing is created for the recipient. Once
// that order is paid, a single-use, code-free 100% discount on the pack is
// minted for the gift. The recipient signs in — which proves the address —
// and claims it through a $0 checkout of the pack on their own entity, so the
// provider grants the credits to their customer. A refund of the purchase
// before the claim deletes the discount. Gifts are service units, never money.

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
/** The longest sender name a gift email shows. */
const SENDER_NAME_LENGTH = 40
/** The longest message a purchaser may write; it shows only inside the app. */
const MESSAGE_LENGTH = 500
/**
 * A link, or a bare domain with a top-level domain people link with: what
 * neither the sender name nor the message may carry. A dot alone is no link,
 * so a name like "St.John" or "J. R. R. Tolkien" stays as it is.
 */
const LINK = /(?:[a-z][\w+.-]*:\/\/|www\.)\S*|\b[\w-]+(?:\.[\w-]+)*\.(?:com|net|org|io|co|app|dev|ai|me|info|biz|xyz|online|site|store|shop|link|click|top|club|live|pro|tech|cloud|page|ly|gg|tv|uk|de|ru|fr|us|ca|au|in|cn|jp|nl|br|es|it|pl|ch|se|eu|cc)(?![\w-])(?:\/\S*)?/gi
/** The ideographic full stops a domain can hide behind. */
const IDEOGRAPHIC_STOP = /[\u3002\uFF61]/g
/** Format characters (zero-width joiners and the like) that split a domain to slip it past a check. */
const FORMAT_CHARACTERS = /\p{Cf}/gu

/** Text as a reader sees it: compatibility forms folded, full-width and ideographic dots made dots, invisible characters gone. */
function readable(text: string): string {
  return text.normalize('NFKC').replace(IDEOGRAPHIC_STOP, '.').replace(FORMAT_CHARACTERS, '')
}

/** What the purchaser reads when they have not paid for anything yet. */
const NO_EARLIER_ORDER = 'Gifts open after your first purchase. Buy a plan or a credit pack first, then send one.'
/** What the purchaser reads when the recipient is their own address. */
const OWN_ADDRESS = 'A gift is for someone else — send it to another address.'

/**
 * The sender's name as the gift email shows it: at most 40 characters, with
 * every link and bare domain taken out. A name is the purchaser's own text,
 * and an email from the app's domain must not carry a link someone typed.
 */
export function giftSenderName(name: string | undefined): string | undefined {
  if (name === undefined) return undefined
  const plain = readable(name).replace(LINK, ' ').replace(/\s+/g, ' ').trim().slice(0, SENDER_NAME_LENGTH).trim()
  return plain || undefined
}

/** The purchaser's message, trimmed: plain text of at most 500 characters, refused with a link in it. */
function giftMessage(message: string | undefined): string | undefined {
  const trimmed = message?.trim()
  if (!trimmed) return undefined
  // `search` ignores the shared expression's global position, where `test` would keep it.
  if (trimmed.length > MESSAGE_LENGTH || readable(trimmed).search(LINK) !== -1) {
    throw backendError('invalid_input', { field: 'message' }, `[nuxt-backend] giftCheckout: a gift message is plain text of at most ${MESSAGE_LENGTH} characters, with no links.`)
  }
  return trimmed
}

/** The caller's identity as a gift needs it, or the refusal for nobody signed in. */
async function giftCaller(ctx: { auth: Auth }, what: string) {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) throw backendError('unauthenticated', {}, `[nuxt-backend] ${what}: sign in first.`)
  const claims = identity as unknown as Record<string, unknown>
  return {
    userId: identity.subject,
    email: typeof claims.email === 'string' ? claims.email.toLowerCase() : '',
    // Proven by a sign-in code: what lets an address claim what was sent to it.
    emailVerified: claims.emailVerified === true,
    name: typeof claims.name === 'string' ? claims.name : undefined,
  }
}

/**
 * Gift purchases: the purchaser's checkout, fulfilment and refund on the
 * provider's webhooks, and the recipient's claim.
 */
export function createGifts(
  { components, config, billTo, provider, resolveEntity, requireProviderAccess, unwrapProvider, throttle }: BillingContext,
  { ensureCustomer, profileOf }: BillingCustomers,
  { requireTrustedUrl, requirePack, requireGiftProduct, requireClientMetadata }: PurchaseRules,
) {
  const gifts = components.backend.gifts
  // A field left undefined keeps its default.
  const limit = { max: config.giftLimit?.max ?? GIFT_LIMIT.max, days: config.giftLimit?.days ?? GIFT_LIMIT.days }

  /**
   * The billing entity a person buys a gift from and claims one into: their
   * personal workspace by default, else the active workspace when they own
   * it. With `billTo: 'user'` or an app's own `resolveEntity`, the entity it
   * resolves. A shared workspace someone only belongs to is never charged
   * for their gift, nor handed theirs.
   */
  const ownEntity = async (ctx: RunQueryCtx & { auth: Auth }, userId: string, what: string): Promise<string> => {
    const personal = billTo === 'organization' && !config.resolveEntity ? await ctx.runQuery(gifts.personalEntity, { userId }) : null
    if (personal) return personal
    // The active workspace, or an app's own resolver's entity, only when the
    // person owns it: a gift is never billed to, nor claimed into, a
    // workspace they only belong to. A user entity has no owner to compare.
    const entity = (await resolveEntity(ctx))?.userId
    const profile = entity ? await profileOf(ctx, entity) : null
    const owned = profile ? profile.owner?.userId === userId : billTo === 'user' || Boolean(config.resolveEntity)
    if (entity && owned) return entity
    throw backendError('no_workspace', {}, `[nuxt-backend] ${what}: no billing entity of your own — sign in again (a personal workspace is created automatically).`)
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

  /**
   * A gift is a credit pack, named by its catalog key: never a plan, which
   * would renew on someone's card, and never a product outside the catalog.
   * The purchaser buys the pack's private gift product on their own billing
   * entity's customer, with discount codes off: they get the receipt, and
   * the recipient's details appear nowhere in the checkout. Every input is
   * checked before the provider hears of it.
   */
  const giftCheckout = actionGeneric({
    args: {
      pack: v.string(),
      recipientEmail: v.string(),
      message: v.optional(v.string()),
      origin: v.string(),
      successUrl: v.string(),
      metadata: v.optional(v.record(v.string(), v.string())),
    },
    handler: async (ctx, args) => {
      const purchaser = await giftCaller(ctx, 'giftCheckout')
      requireProviderAccess('gift checkout')
      const recipientEmail = args.recipientEmail.trim().toLowerCase()
      if (!recipientEmail || !recipientEmail.includes('@')) {
        throw backendError('invalid_input', { field: 'recipientEmail' }, '[nuxt-backend] giftCheckout: a valid recipient email is required.')
      }
      if (recipientEmail === purchaser.email) {
        throw backendError('forbidden', { reason: 'gift_refused', message: OWN_ADDRESS }, OWN_ADDRESS)
      }
      const message = giftMessage(args.message)
      requireTrustedUrl(args.origin, 'origin')
      requireTrustedUrl(args.successUrl, 'successUrl')
      requireClientMetadata(args.metadata)
      // Every gift checkout reaches the provider for an address the purchaser
      // picked, so a purchaser is held to the `billingSync` limit (keyed by
      // their user id) like every other client-callable provider call — before
      // the pack is even read.
      await throttle(ctx, purchaser.userId, 'gift checkouts')
      const productId = await requirePack(ctx, args.pack)
      const giftProductId = requireGiftProduct(args.pack)
      const entityId = await ownEntity(ctx, purchaser.userId, 'giftCheckout')
      await requireGiftAllowance(ctx, purchaser.userId)
      await askCanGift(ctx, { recipientEmail, purchaserUserId: purchaser.userId, purchaserEntityId: entityId })
      const profile = await profileOf(ctx, entityId)
      await requireEarlierOrder(profile?.ownedEntityIds ?? [entityId])
      await ensureCustomer(ctx, { userId: entityId, email: purchaser.email }, profile, 'gift checkout')
      const giftId = await ctx.runMutation(gifts.create, {
        recipientEmail,
        purchaserUserId: purchaser.userId,
        purchaserEntityId: entityId,
        purchaserName: purchaser.name,
        pack: args.pack,
        productIds: [productId],
        giftProductId,
        message,
      })
      const checkout = await checkoutsCreate(provider.polar, {
        products: [giftProductId],
        externalCustomerId: entityId,
        embedOrigin: args.origin,
        successUrl: args.successUrl,
        // A gift is bought at its price: a discount on it would be one more
        // way to turn a code into credits for someone else.
        allowDiscountCodes: false,
        metadata: { ...args.metadata, giftId },
      })
      return { url: unwrapProvider(checkout, 'gift checkout').url }
    },
  })

  /**
   * Claim one gift addressed to the caller's verified email, into their own
   * billing entity: a checkout of the pack with the gift's single-use 100%
   * discount locked on, which the server confirms itself when the pack asks
   * for no checkout fields — the provider then grants the credits on the
   * order. A pack that needs fields returns the provider's $0 checkout to
   * finish. `url` is `null` when the server confirmed it; either way the gift
   * counts as claimed once the provider says the claim order is paid.
   */
  const claimGift = actionGeneric({
    args: { giftId: v.string(), successUrl: v.optional(v.string()) },
    handler: async (ctx, { giftId, successUrl }): Promise<{ url: string | null }> => {
      const recipient = await giftCaller(ctx, 'claimGift')
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
      // A gift paid before 0.2 has no discount: it gets one on its claim (below).
      if (gift.status !== 'paid' || !(gift.discountId || gift.billingCustomerId)) {
        throw backendError('not_ready', { reason: 'not_paid' }, '[nuxt-backend] claimGift: this gift is not paid for yet.')
      }
      requireProviderAccess('gift claim')
      requireTrustedUrl(successUrl, 'successUrl')
      await throttle(ctx, recipient.userId, 'gift claims')
      const entityId = await ownEntity(ctx, recipient.userId, 'claimGift')
      const customerId = await ensureCustomer(ctx, { userId: entityId, email: recipient.email }, await profileOf(ctx, entityId), 'gift claim')
      const discountId = gift.discountId ?? await legacyDiscount(ctx, gift, customerId, recipient.userId, entityId)
      if (!discountId) return { url: null }
      await ctx.runMutation(gifts.startClaim, { giftId: gift.id, userId: recipient.userId, entityId })
      const checkout = unwrapProvider(await checkoutsCreate(provider.polar, {
        products: gift.productIds,
        externalCustomerId: entityId,
        discountId,
        allowDiscountCodes: false,
        metadata: { giftId: gift.id, phase: 'claim' },
        ...(successUrl ? { successUrl } : {}),
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
    },
  })

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
      const rows = await ctx.runQuery(gifts.listByEmail, { email })
      return rows.map(gift => ({
        id: gift.id,
        purchaserName: giftSenderName(gift.purchaserName),
        pack: gift.pack,
        productIds: gift.productIds,
        message: gift.message,
        status: gift.status,
        createdAt: gift.createdAt,
        paidAt: gift.paidAt,
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

  /**
   * The gift's claim discount, minted once: codeless, 100%, once, a single
   * redemption, on the pack only, named after the gift with no personal
   * data. A run that minted but never stored it finds it by name; a lookup
   * that fails stops the run rather than minting a second one.
   */
  const mintDiscount = async (gift: GiftRecord): Promise<string> => {
    const name = `gift-${gift.id}`
    const listed = unwrapProvider(await discountsList(provider.polar, { query: name, limit: 10 }), 'gift discount')
    const minted = listed.result.items.find(discount => discount.metadata?.giftId === gift.id)
    if (minted) return minted.id
    const created = await discountsCreate(provider.polar, {
      type: 'percentage',
      basisPoints: 10_000,
      duration: 'once',
      maxRedemptions: 1,
      products: gift.productIds,
      name,
      metadata: { giftId: gift.id },
    })
    return unwrapProvider(created, 'gift discount').id
  }

  /** End a discount now and delete it; one already gone is fine. Ended first, so a failed deletion leaves nothing to redeem. */
  const voidDiscount = async (discountId: string, operation: string): Promise<void> => {
    for (const done of [
      await discountsUpdate(provider.polar, { id: discountId, discountUpdate: { endsAt: new Date() } }),
      await discountsDelete(provider.polar, { id: discountId }),
    ]) {
      if (!done.ok && !isProviderNotFound(done.error)) unwrapProvider(done, operation)
    }
  }

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
   * Tell the recipient, once per gift: send first, stamp after. A send that
   * throws — a template override, test mode refusing the address, a
   * transient failure — leaves no stamp, so the redelivery of `order.paid`
   * sends again; a run that sent but never stamped is absorbed by the
   * idempotency key while the first email's record exists; and once stamped,
   * a replay sends nothing however late it comes. The key is namespaced so it
   * can never collide with one of the app's own. The email names the sender
   * and the pack and links to the app with no token; the message stays in
   * the app.
   */
  const notifyRecipient = async (ctx: RunWriteCtx, gift: GiftRecord): Promise<void> => {
    if (gift.notifiedAt !== undefined) return
    const product = gift.productIds[0] ? await provider.getProduct(ctx as unknown as ProviderCtx, { productId: gift.productIds[0] }) : null
    await config.email.sendTemplate(ctx, 'gift', {
      recipientEmail: gift.recipientEmail,
      purchaserName: giftSenderName(gift.purchaserName),
      item: product?.name ?? gift.pack ?? 'credits',
      claimUrl: readEnv('SITE_URL') ?? '',
    }, { idempotencyKey: `nuxt-backend:gift:${gift.id}` })
    await ctx.runMutation(gifts.markNotified, { giftId: gift.id })
  }

  /**
   * A gift paid past its purchaser's cap — several checkouts opened at once,
   * all paid — is refunded in full instead of delivered: the cap holds at
   * payment, not only at checkout.
   */
  const overCap = async (ctx: RunWriteCtx, gift: GiftRecord, order: GiftOrder): Promise<boolean> => {
    const { count } = await giftsBought(ctx, gift.purchaserUserId, { settledOnly: true, excludeGiftId: gift.id })
    if (count < limit.max) return false
    logBackend('error', 'billing.gift_over_limit', 'A gift was paid past its purchaser\'s gift limit, so it was refunded instead of delivered.')
    const amount = order.refundableAmount ?? order.netAmount
    if (order.id && typeof amount === 'number' && amount > 0) {
      unwrapProvider(await refundsCreate(provider.polar, { orderId: order.id, reason: 'other', amount, revokeBenefits: true }), 'gift refund')
    }
    await ctx.runMutation(gifts.markRefunded, { giftId: gift.id })
    return true
  }

  /**
   * The purchase is paid: check it is the gift's own and within the
   * purchaser's cap, mark it paid with what it charged, mint the claim
   * discount and tell the recipient. Each step is idempotent, so a
   * redelivery picks up where a failed run stopped; a gift refunded in the
   * meantime is never delivered.
   */
  const purchasePaid = async (ctx: RunWriteCtx, gift: GiftRecord, order: GiftOrder): Promise<void> => {
    if (gift.status === 'pending') {
      if (!isPurchase(gift, order)) {
        logBackend('warn', 'billing.gift_unverified', 'A paid order named a gift it did not buy (another product, customer or price), so the gift stays pending.')
        return
      }
      if (await overCap(ctx, gift, order)) return
      await ctx.runMutation(gifts.markPaid, { giftId: gift.id, billingOrderId: order.id, amount: order.netAmount, currency: order.currency })
    }
    let current = await ctx.runQuery(gifts.get, { giftId: gift.id })
    if (current?.status !== 'paid' || current.billingOrderId !== order.id) return
    if (!current.discountId) {
      await storeDiscount(ctx, current)
      current = await ctx.runQuery(gifts.get, { giftId: gift.id })
      if (!current) return
    }
    await notifyRecipient(ctx, current)
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
  }

  /** The gift a paid or refunded order names in its metadata, which only the server writes on gift checkouts. */
  const giftOf = async (ctx: RunWriteCtx, order: GiftOrder): Promise<GiftRecord | null> => {
    const giftId = order.metadata?.giftId
    if (typeof giftId !== 'string') return null
    return await ctx.runQuery(gifts.get, { giftId })
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
    await ctx.runMutation(gifts.markRefunded, { giftId: gift.id })
  }

  return { giftCheckout, claimGift, getReceivedGifts, handleGiftOrderPaid, handleGiftOrderRefunded }
}

export type BillingGifts = ReturnType<typeof createGifts>
