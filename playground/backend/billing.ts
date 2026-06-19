import { setupBilling, type DiscountInput } from 'nuxt-backend/convex/billing'
import type { GenericActionCtx, GenericDataModel } from 'convex/server'
import { v } from 'convex/values'
import { api, components, internal } from './_generated/api'
import { action, env, internalMutation, query } from './_generated/server'
import { authComponent } from './auth'

// Subscriptions, discounts & prepaid credits via the Polar component, linked to
// auth users. The reactive feature/credit cache lives inside the `backend`
// component, so there's nothing to add to this schema. Set
// POLAR_ORGANIZATION_TOKEN (and POLAR_SERVER) to enable checkout/credits/discounts.
const billing = setupBilling(components.polar, components.backend, {
  organizationToken: env.POLAR_ORGANIZATION_TOKEN,
  server: env.POLAR_SERVER ?? 'sandbox',
  // Demo catalog in the qruto Polar sandbox: a monthly subscription (`pro`, grants
  // a "premium" benefit) and a one-time credit pack (`credits`, grants 100 units to
  // the "Credits" meter). Configured here so `useBilling().products` resolves them.
  products: {
    pro: 'd852636d-a5fb-4472-b592-3ac921a84ba3',
    credits: 'f55734b4-428f-47b9-b305-70576acf9181',
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

export const { polar } = billing
export const {
  generateCheckoutLink,
  generateCustomerPortalUrl,
  getConfiguredProducts,
  listAllProducts,
  listAllSubscriptions,
  changeCurrentSubscription,
  cancelCurrentSubscription,
} = billing.api
export const {
  getCurrentSubscription,
  getFeatures,
  getCredits,
  syncEntitlements,
} = billing.functions

// --- Showcase: a live feed of incoming Polar webhooks --------------------------

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
      await ctx.runMutation(internal.billing.recordWebhookEvent, { source: 'polar', type, summary: type })
      await (handler as unknown as ((c: GenericActionCtx<GenericDataModel>, e: { type: string }) => Promise<void>) | undefined)?.(ctx, event)
    },
  ]),
) as typeof billing.webhookEvents

// --- Credits -------------------------------------------------------------------

/** Spend one prepaid credit for the current user (blocks when the balance is empty). */
export const consumeCredit = action({
  args: { meterId: v.string() },
  handler: async (ctx, { meterId }) => {
    const user = await ctx.runQuery(api.auth.getAuthUser, {})
    if (!user) throw new Error('Sign in to use credits.')
    await billing.spendCredits(ctx, { userId: user._id, name: 'credits', meterId })
    return null
  },
})

// --- Discounts -----------------------------------------------------------------

/** Create a percentage discount/coupon (admin). */
export const createDiscount = action({
  args: { name: v.string(), percent: v.number(), code: v.optional(v.string()) },
  handler: async (ctx, { name, percent, code }) => {
    const discount: DiscountInput = {
      type: 'percentage',
      name,
      code,
      duration: 'once',
      basisPoints: Math.round(percent * 100),
    }
    return billing.createDiscount(discount)
  },
})
