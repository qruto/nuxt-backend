import type { PolarWebhookEvent } from '@convex-dev/polar'
import { checkoutsCreate } from '@polar-sh/sdk/funcs/checkoutsCreate.js'
import { customersCreate } from '@polar-sh/sdk/funcs/customersCreate.js'
import { customersList } from '@polar-sh/sdk/funcs/customersList.js'
import { customersUpdate } from '@polar-sh/sdk/funcs/customersUpdate.js'
import { actionGeneric, queryGeneric } from 'convex/server'
import { ConvexError, v } from 'convex/values'
import { type BillingContext, readEnv } from './context.js'
import type { BillingEntitlements } from './entitlements.js'
import type { PolarRunQueryCtx, RunWriteCtx } from './types/base.js'
import type { GiftEmailData, GiftEmailMessage, GiftRecord } from './types/records.js'
import { logBackend } from '../../log.js'

/**
 * Gift purchases: the checkout, the claim, and fulfilment when the order is
 * paid. `defaultGiftEmail` is the packaged template, passed in by the entry
 * that exports it so this module never imports the entry back.
 */
export function createGifts(
  { components, config, billTo, provider, providerLib, entityFromIdentity }: BillingContext,
  { refreshEntitlements }: BillingEntitlements,
  defaultGiftEmail: (data: GiftEmailData) => GiftEmailMessage,
) {
  const gifts = components.backend.gifts

  /**
   * Attach a paid gift's billing customer to the recipient's billing entity:
   * insert the provider's customer↔entity mapping (unless already mapped), tag
   * the customer with the entity id so future webhooks self-resolve, mark the
   * gift claimed, and refresh the entitlement cache. Idempotent.
   */
  const attachGift = async (ctx: RunWriteCtx, gift: GiftRecord, userId: string, entityId: string): Promise<void> => {
    const existing = await provider.getCustomerByUserId(ctx as unknown as PolarRunQueryCtx, entityId)
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
      await ctx.runMutation(providerLib.insertCustomer, { id: gift.billingCustomerId, userId: entityId })
    }
    // Tag the provider customer so future webhooks resolve the entity directly.
    const updated = await customersUpdate(provider.polar, {
      id: gift.billingCustomerId,
      customerUpdate: { metadata: { userId: entityId } },
    })
    if (!updated.ok) throw updated.error
    await ctx.runMutation(gifts.markClaimed, { giftId: gift.id, userId, entityId })
    await refreshEntitlements(ctx, entityId)
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
      if (config.canGift) {
        const verdict = await config.canGift(ctx, { recipientEmail, purchaserUserId })
        if (verdict !== true) {
          throw new ConvexError(verdict.message ?? 'This address can\'t receive gifts.')
        }
      }
      // Find-or-create the provider customer keyed by the recipient's email —
      // reusing an existing customer means a recipient who already subscribed
      // receives the gift on their existing billing profile. Deliberately no
      // `userId` metadata yet: that's set at claim time.
      const existing = await customersList(provider.polar, { email: recipientEmail, limit: 1 })
      const found = existing.ok ? existing.value.result.items[0] : undefined
      let billingCustomerId = found?.id
      if (!billingCustomerId) {
        const created = await customersCreate(provider.polar, {
          email: recipientEmail,
          metadata: { giftRecipient: 'true' },
        })
        if (!created.ok) throw created.error
        billingCustomerId = created.value.id
      }
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
        customerId: billingCustomerId,
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
      if (!checkout.ok) throw checkout.error
      return { url: checkout.value.url }
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
      const entity = await entityFromIdentity(ctx)
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
   * Gift fulfilment on `order.paid`: mark the gift paid, auto-attach it when
   * the recipient already has an account (and, in org mode, a workspace), and
   * email the recipient — the same notification doubles as an invite to sign
   * up when the email has no account yet (claiming then happens on first
   * sign-in via `useGifts`).
   */
  const handleGiftOrderPaid = async (ctx: RunWriteCtx, event: PolarWebhookEvent): Promise<void> => {
    const data = event.data as { id?: string, metadata?: Record<string, unknown> }
    const meta = data.metadata ?? {}
    if (meta.gift !== 'true' || typeof meta.giftId !== 'string') return
    await ctx.runMutation(gifts.markPaid, {
      giftId: meta.giftId,
      billingOrderId: typeof data.id === 'string' ? data.id : undefined,
    })
    const gift = await ctx.runQuery(gifts.get, { giftId: meta.giftId })
    if (!gift || gift.status === 'claimed') return
    const recipient = await ctx.runQuery(gifts.resolveRecipient, { email: gift.recipientEmail })
    if (recipient) {
      const entityId = billTo === 'organization' ? recipient.organizationId : recipient.userId
      if (entityId) {
        try {
          await attachGift(ctx, gift, recipient.userId, entityId)
        }
        catch (error) {
          // Leave the gift `paid` — the recipient can still claim from the app.
          logBackend('warn', 'billing.gift_attach_failed', 'Gift auto-attach failed; the recipient can claim it on sign-in.', error)
        }
      }
    }
    const sendEmail = components.backend.email?.send
    if (sendEmail) {
      // Status-guarded stamp: webhook redeliveries of `order.paid` (retries,
      // manual replays) must never email the recipient twice.
      const shouldNotify = await ctx.runMutation(gifts.markNotified, { giftId: gift.id })
      if (shouldNotify) {
        const claimUrl = readEnv('SITE_URL') ?? ''
        const template = config.giftEmail ?? defaultGiftEmail
        const message = template({
          recipientEmail: gift.recipientEmail,
          purchaserName: gift.purchaserName,
          purchaserEmail: gift.purchaserEmail,
          message: gift.message,
          claimUrl,
        })
        await ctx.runMutation(sendEmail, message)
      }
    }
    else {
      // Never fail the webhook — the gift stays claimable in-app — but don't
      // be silent about the recipient not hearing of it.
      logBackend('warn', 'billing.gift_email_unsent', 'Gift notification not sent — the backend component has no email module.')
    }
  }

  return { giftCheckout, claimGift, getReceivedGifts, handleGiftOrderPaid }
}

export type BillingGifts = ReturnType<typeof createGifts>
