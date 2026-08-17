import { setupBilling, type DiscountInput } from 'nuxt-backend/billing'
import type { GenericActionCtx, GenericDataModel } from 'convex/server'
import { v } from 'convex/values'
import { api, components, internal } from './_generated/api'
import { action, internalMutation, query } from './_generated/server'
import { authComponent } from './auth'
import { authed } from './functions'
import { rateLimiter } from './rateLimiter'

// Subscriptions, discounts, prepaid credits & gifts, linked to auth users.
// Configuration comes from the required BILLING_* env vars; the reactive
// feature/credit cache lives inside the backend component, so there's nothing
// to add to this schema.
export const billing = setupBilling(components, {
  // Throttle syncEntitlements per billing entity (guards the live provider fan-out).
  rateLimiter,
  // Demo catalog in the qruto Polar sandbox: three monthly plans that each grant
  // prepaid units to the "Credits" meter (Pro and Ultra also grant feature
  // benefits, matched by `useFeatures().has()` via benefit metadata keys), plus
  // two one-time credit packs. Configured here so `useBilling().products`
  // resolves them.
  products: {
    starter: '96561ea3-e168-4219-9716-5128ac57dd7c',
    pro: 'd852636d-a5fb-4472-b592-3ac921a84ba3',
    ultra: '9e9097b4-22dc-4b40-9823-47a15fbe9f17',
    credits100: 'f55734b4-428f-47b9-b305-70576acf9181',
    credits500: '907659da-d66c-4e4a-9cb3-799ec445c79b',
  },
  getUserInfo: async (ctx) => {
    const user = await ctx.runQuery(api.auth.getAuthUser, {})
    return { userId: user._id, email: user.email }
  },
  currentUserId: async (ctx) => {
    if (!(await ctx.auth.getUserIdentity())) return null
    return (await authComponent.getAuthUser(ctx))._id
  },
})

export const { provider } = billing
export const {
  generateCheckoutLink,
  generateCustomerPortalUrl,
  getConfiguredProducts,
  listAllProducts,
  listAllSubscriptions,
  changeCurrentSubscription,
  cancelCurrentSubscription,
  giftCheckout,
} = billing.api
export const {
  getCurrentSubscription,
  getFeatures,
  getCredits,
  syncEntitlements,
  getReceivedGifts,
  claimGift,
} = billing.functions

// --- Showcase: a live feed of incoming billing webhooks ------------------------

export const recordWebhookEvent = internalMutation({
  args: { source: v.string(), type: v.string(), summary: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.insert('webhookEvents', { ...args, createdAt: Date.now() })
    return null
  },
})

/** Recent webhook events for the showcase activity feed. */
export const listWebhookEvents = query({
  args: {},
  handler: async ctx => ctx.db.query('webhookEvents').withIndex('createdAt').order('desc').take(10),
})

// Wrap each built-in handler so the showcase also logs the event to a feed before
// it refreshes the reactive feature/credit cache.
export const webhookEvents = Object.fromEntries(
  Object.entries(billing.webhookEvents).map(([type, handler]) => [
    type,
    async (ctx: GenericActionCtx<GenericDataModel>, event: { type: string }) => {
      await ctx.runMutation(internal.billing.recordWebhookEvent, { source: 'billing', type, summary: type })
      await (handler as unknown as ((c: GenericActionCtx<GenericDataModel>, e: { type: string }) => Promise<void>) | undefined)?.(ctx, event)
    },
  ]),
) as typeof billing.webhookEvents

// --- Credits -------------------------------------------------------------------

/** Spend one prepaid credit for the current entity (blocks when the balance is empty). */
export const consumeCredit = action({
  args: { meterId: v.string() },
  handler: async (ctx, { meterId }) => {
    if (!(await ctx.auth.getUserIdentity())) throw new Error('Sign in to use credits.')
    // No explicit userId: the billing entity (the active workspace) resolves
    // from the caller's identity claims, matching how checkout billed it.
    await billing.spendCredits(ctx, { name: 'credits', meterId })
    return null
  },
})

// --- Discounts -----------------------------------------------------------------

/**
 * Create a percentage discount/coupon. Gated to a signed-in caller (a public
 * action would let anyone mint a 100%-off code); `percent` is clamped to
 * [0, 100]. This is a sandbox showcase — a production app should require an
 * admin role here (swap `authed.action` for `admin.action`).
 */
export const createDiscount = authed.action({
  args: {
    name: v.string(),
    percent: v.number(),
    code: v.optional(v.string()),
    // `forever` keeps recurring checkouts card-free in the sandbox.
    duration: v.optional(v.union(v.literal('once'), v.literal('forever'))),
  },
  handler: async (ctx, { name, percent, code, duration }) => {
    const discount: DiscountInput = {
      type: 'percentage',
      name,
      code,
      duration: duration ?? 'once',
      basisPoints: Math.round(Math.min(Math.max(percent, 0), 100) * 100),
    }
    return billing.createDiscount(discount)
  },
})
