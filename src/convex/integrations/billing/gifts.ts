import type { PolarWebhookEvent } from '@convex-dev/polar'
import { checkoutsCreate } from '@polar-sh/sdk/funcs/checkoutsCreate.js'
import { customersCreate } from '@polar-sh/sdk/funcs/customersCreate.js'
import { customersGet } from '@polar-sh/sdk/funcs/customersGet.js'
import { customersList } from '@polar-sh/sdk/funcs/customersList.js'
import { customersUpdate } from '@polar-sh/sdk/funcs/customersUpdate.js'
import { actionGeneric, queryGeneric } from 'convex/server'
import { ConvexError, v } from 'convex/values'
import { type BillingContext, readEnv } from './context.js'
import type { BillingEntitlements } from './entitlements.js'
import type { ProviderCtx, RunWriteCtx } from './types/base.js'
import type { GiftRecord } from './types/records.js'
import { logBackend } from '../../log.js'

/** The fields of a paid order's payload that gift fulfilment reads. */
type PaidOrder = {
  id?: string
  customerId?: string
  customer?: { id?: string, email?: string | null }
  metadata?: Record<string, unknown>
}

/**
 * What a claim says when the gift's billing customer already pays for another
 * entity. The customer is keyed by the recipient's email, and the gift's
 * benefits were granted to it — so they already sit with that entity.
 */
const GIFT_CUSTOMER_TAKEN = {
  organization: 'This gift went to the billing profile of your email, which already pays for another workspace — its plan or credits are there. Open that workspace to receive it.',
  user: 'This gift went to the billing profile of your email, which already belongs to another account, so it can\'t be received in this one.',
} as const

/**
 * Gift purchases: the checkout, the claim, and fulfilment when the order is
 * paid, which tells the recipient through the app's email instance.
 */
export function createGifts(
  { components, config, billTo, provider, providerLib, resolveEntity, requireProviderAccess, unwrapProvider, throttle, customerOwner }: BillingContext,
  { refreshEntitlements }: BillingEntitlements,
) {
  const gifts = components.backend.gifts

  /**
   * Attach a paid gift's billing customer to the recipient's billing entity:
   * insert the provider's customer↔entity mapping (unless already mapped), tag
   * the customer with the entity id so future webhooks self-resolve, mark the
   * gift claimed, and refresh the entitlement cache. Idempotent.
   */
  const attachGift = async (ctx: RunWriteCtx, gift: GiftRecord, userId: string, entityId: string): Promise<void> => {
    const existing = await provider.getCustomerByUserId(ctx as unknown as ProviderCtx, entityId)
    if (existing && existing.id !== gift.billingCustomerId) {
      // The entity already bills through another provider customer (e.g. the
      // recipient subscribed under a different email than the gift was sent
      // to). Entitlements can't move between provider customers — documented
      // limitation; the purchaser can re-gift to the recipient's billing email.
      throw new Error(
        '[nuxt-backend] This gift is attached to a different billing profile than your account uses. '
        + 'Ask the sender to re-send it to your billing email.',
      )
    }
    if (!existing) {
      // Checkout's rule (see checkout.ts): a customer that already pays for
      // another entity is never mapped to a second one — the two would share
      // one set of benefits and credits.
      const customer = unwrapProvider(await customersGet(provider.polar, { id: gift.billingCustomerId }), 'gift claim')
      const owner = await customerOwner(ctx, customer)
      if (owner !== null && owner !== entityId) throw new ConvexError(GIFT_CUSTOMER_TAKEN[billTo])
      await ctx.runMutation(providerLib.insertCustomer, { id: gift.billingCustomerId, userId: entityId })
    }
    // Tag the provider customer so future webhooks resolve the entity directly.
    const updated = await customersUpdate(provider.polar, {
      id: gift.billingCustomerId,
      customerUpdate: { metadata: { userId: entityId } },
    })
    unwrapProvider(updated, 'gift claim')
    await ctx.runMutation(gifts.markClaimed, { giftId: gift.id, userId, entityId })
    await refreshEntitlements(ctx, entityId)
  }

  /**
   * The provider customer a gift to this address bills to: the one that
   * already carries the email (the provider keys customers by email), or a
   * new one for a recipient it has never seen — deliberately without `userId`
   * metadata, which is set when the gift is claimed. Resolved here, on the
   * server; the purchaser's checkout never names it (see `giftCheckout`).
   */
  const recipientCustomer = async (recipientEmail: string): Promise<string> => {
    const listed = unwrapProvider(await customersList(provider.polar, { email: recipientEmail, limit: 1 }), 'gift checkout')
    const found = listed.result.items[0]
    if (found) return found.id
    const created = await customersCreate(provider.polar, {
      email: recipientEmail,
      metadata: { giftRecipient: 'true' },
    })
    return unwrapProvider(created, 'gift checkout').id
  }

  const giftCheckout = actionGeneric({
    args: {
      productIds: v.array(v.string()),
      recipientEmail: v.string(),
      message: v.optional(v.string()),
      origin: v.string(),
      successUrl: v.string(),
      metadata: v.optional(v.record(v.string(), v.string())),
    },
    handler: async (ctx, args) => {
      requireProviderAccess('gift checkout')
      const identity = await ctx.auth.getUserIdentity()
      if (!identity) {
        throw new Error('[nuxt-backend] giftCheckout: sign in to send a gift.')
      }
      const claims = identity as unknown as Record<string, unknown>
      const purchaserUserId = identity.subject
      const purchaserEmail = typeof claims.email === 'string' ? claims.email : undefined
      const purchaserName = typeof claims.name === 'string' ? claims.name : undefined
      const recipientEmail = args.recipientEmail.trim().toLowerCase()
      if (!recipientEmail || !recipientEmail.includes('@')) {
        throw new Error('[nuxt-backend] giftCheckout: a valid recipient email is required.')
      }
      // Every gift checkout reaches the provider for an address the purchaser
      // picked, so a purchaser is held to the `billingSync` limit (keyed by
      // their user id) like every other client-callable provider call.
      await throttle(ctx, purchaserUserId, 'gift checkouts')
      if (config.canGift) {
        const verdict = await config.canGift(ctx, { recipientEmail, purchaserUserId })
        if (verdict !== true) {
          throw new ConvexError(verdict.message ?? 'This address can\'t receive gifts.')
        }
      }
      const billingCustomerId = await recipientCustomer(recipientEmail)
      const giftId = await ctx.runMutation(gifts.create, {
        recipientEmail,
        purchaserUserId,
        purchaserEmail,
        purchaserName,
        productIds: args.productIds,
        message: args.message,
        billingCustomerId,
      })
      const checkout = await checkoutsCreate(provider.polar, {
        // The recipient's email, never their `customerId`: a checkout bound to
        // a customer pre-fills that customer's name, billing address and tax
        // id — and its public checkout object exposes them — to whoever pays.
        // The provider settles the order on the customer carrying this email;
        // fulfilment checks that it did (`handleGiftOrderPaid`).
        customerEmail: recipientEmail,
        products: args.productIds,
        embedOrigin: args.origin,
        successUrl: args.successUrl,
        allowDiscountCodes: true,
        metadata: {
          ...args.metadata,
          gift: 'true',
          giftId,
          recipientEmail,
          purchaserUserId,
        },
      })
      return { url: unwrapProvider(checkout, 'gift checkout').url }
    },
  })

  /** Claim one gift (by id) or every paid gift addressed to the caller's email. */
  const claimGift = actionGeneric({
    args: { giftId: v.optional(v.string()) },
    handler: async (ctx, { giftId }) => {
      const identity = await ctx.auth.getUserIdentity()
      if (!identity) {
        throw new Error('[nuxt-backend] claimGift: sign in to receive a gift.')
      }
      const claims = identity as unknown as Record<string, unknown>
      const email = typeof claims.email === 'string' ? claims.email.toLowerCase() : null
      if (!email) {
        throw new Error('[nuxt-backend] claimGift: the signed-in identity has no email claim.')
      }
      const entity = await resolveEntity(ctx)
      if (!entity) {
        throw new Error('[nuxt-backend] claimGift: no billing entity — sign in (a personal workspace is created automatically).')
      }
      // Email ownership is proven by the OTP sign-in flow, so matching the
      // identity's email against the gift's recipient is the authorization.
      const candidates: GiftRecord[] = giftId
        ? [await ctx.runQuery(gifts.get, { giftId })].filter((g): g is GiftRecord => g !== null)
        : await ctx.runQuery(gifts.listByEmail, { email, status: 'paid' })
      let claimed = 0
      for (const gift of candidates) {
        if (gift.recipientEmail !== email) {
          throw new Error('[nuxt-backend] claimGift: this gift is addressed to a different email.')
        }
        if (gift.status !== 'paid') continue
        await attachGift(ctx, gift, identity.subject, entity.userId)
        claimed++
      }
      return { claimed }
    },
  })

  const getReceivedGifts = queryGeneric({
    args: {},
    handler: async (ctx) => {
      const identity = await ctx.auth.getUserIdentity()
      if (!identity) return null
      const claims = identity as unknown as Record<string, unknown>
      const email = typeof claims.email === 'string' ? claims.email.toLowerCase() : null
      if (!email) return null
      return await ctx.runQuery(gifts.listByEmail, { email })
    },
  })

  /**
   * The provider customer a paid gift order landed on, when it is the
   * recipient's. The checkout carried only the recipient's email, which the
   * purchaser could still change before paying — so the order's customer is
   * checked, not assumed: the one recorded at checkout, or another carrying
   * the recipient's email (the provider settled the order by email). `null`
   * when the order went to anyone else.
   */
  const paidCustomer = (gift: GiftRecord, order: PaidOrder): string | null => {
    const customerId = order.customerId ?? order.customer?.id
    if (customerId === undefined || customerId === gift.billingCustomerId) return gift.billingCustomerId
    return order.customer?.email?.toLowerCase() === gift.recipientEmail ? customerId : null
  }

  /**
   * Attach a paid gift when its recipient already has an account (and, in
   * workspace mode, a workspace). A failure leaves it `paid` for the
   * recipient to claim — it never fails the delivery.
   */
  const autoAttach = async (ctx: RunWriteCtx, gift: GiftRecord): Promise<void> => {
    const recipient = await ctx.runQuery(gifts.resolveRecipient, { email: gift.recipientEmail })
    if (!recipient) return
    const entityId = billTo === 'organization' ? recipient.organizationId : recipient.userId
    if (!entityId) return
    try {
      await attachGift(ctx, gift, recipient.userId, entityId)
    }
    catch (error) {
      logBackend('warn', 'billing.gift_attach_failed', 'Gift auto-attach failed; the recipient can claim it on sign-in.', error)
    }
  }

  /**
   * Tell the recipient, once per gift: send first, stamp after. A send that
   * throws — a template override, test mode refusing the address, a
   * transient failure — leaves no stamp, so the redelivery of `order.paid`
   * sends again; a run that sent but never stamped is absorbed by the
   * idempotency key while the first email's record exists; and once stamped,
   * a replay sends nothing however late it comes. The key is namespaced so it
   * can never collide with one of the app's own.
   */
  const notifyRecipient = async (ctx: RunWriteCtx, gift: GiftRecord): Promise<void> => {
    if (gift.notifiedAt !== undefined) return
    await config.email.sendTemplate(ctx, 'gift', {
      recipientEmail: gift.recipientEmail,
      purchaserName: gift.purchaserName,
      purchaserEmail: gift.purchaserEmail,
      message: gift.message,
      claimUrl: readEnv('SITE_URL') ?? '',
    }, { idempotencyKey: `nuxt-backend:gift:${gift.id}` })
    await ctx.runMutation(gifts.markNotified, { giftId: gift.id })
  }

  /**
   * Gift fulfilment on `order.paid`: check the order landed on the
   * recipient's customer, mark the gift paid, auto-attach it when the
   * recipient already has an account, and email the recipient — the same
   * notification doubles as an invite to sign up when the email has no
   * account yet (claiming then happens on first sign-in via `useGifts`).
   */
  const handleGiftOrderPaid = async (ctx: RunWriteCtx, event: PolarWebhookEvent): Promise<void> => {
    const order = event.data as PaidOrder
    const meta = order.metadata ?? {}
    if (meta.gift !== 'true' || typeof meta.giftId !== 'string') return
    const recorded = await ctx.runQuery(gifts.get, { giftId: meta.giftId })
    if (!recorded) return
    const billingCustomerId = paidCustomer(recorded, order)
    if (billingCustomerId === null) {
      // The purchaser changed the email before paying: the order belongs to
      // whoever that email is, and attaching it here would hand the recipient
      // someone else's billing profile. The gift stays `pending`.
      logBackend('warn', 'billing.gift_misdirected', 'A gift order was paid under another email than the recipient\'s, so the gift was not delivered and stays pending.')
      return
    }
    await ctx.runMutation(gifts.markPaid, {
      giftId: meta.giftId,
      billingOrderId: typeof order.id === 'string' ? order.id : undefined,
      ...(billingCustomerId === recorded.billingCustomerId ? {} : { billingCustomerId }),
    })
    const gift = await ctx.runQuery(gifts.get, { giftId: meta.giftId })
    if (!gift) return
    if (gift.status !== 'claimed') await autoAttach(ctx, gift)
    await notifyRecipient(ctx, gift)
  }

  return { giftCheckout, claimGift, getReceivedGifts, handleGiftOrderPaid }
}

export type BillingGifts = ReturnType<typeof createGifts>
