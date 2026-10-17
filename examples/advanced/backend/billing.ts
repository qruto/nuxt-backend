import { setupBilling, type DiscountInput } from 'nuxt-backend/billing'
import { v } from 'convex/values'
import { components, internal } from './_generated/api'
import { env, internalAction, internalMutation } from './_generated/server'
import { email } from './email'
import { rateLimiter } from './rateLimiter'

// CUSTOMIZATION: explicit billing config instead of the env-var defaults, and
// a consumer webhook hook composed after the built-ins.
export const billing = setupBilling(components, {
  // The gift notification is restyled in email.ts.
  email,
  // Explicit values win over the BILLING_* env defaults (same names here, but
  // any source works — a secrets manager, per-tenant config, …).
  accessToken: env.BILLING_ACCESS_TOKEN,
  environment: env.BILLING_ENVIRONMENT,
  webhookSecret: env.BILLING_WEBHOOK_SECRET,
  rateLimiter,
  // CUSTOMIZATION: react to billing webhooks after the built-in entitlement
  // refresh + gift fulfilment — entitlements read fresh in here.
  events: {
    'order.paid': async (ctx, event) => {
      await ctx.runMutation(internal.billing.recordOrder, {
        orderId: String((event.data as { id?: string }).id ?? 'unknown'),
      })
    },
  },
})

export const {
  generateCheckoutLink,
  generateCustomerPortalUrl,
  getConfiguredProducts,
  listAllSubscriptions,
  giftCheckout,
} = billing.api
export const {
  getCurrentSubscription,
  getFeatures,
  getCredits,
  syncEntitlements,
  syncProducts,
  getReceivedGifts,
  claimGift,
  // The webhook delivery log, for DevTools: admins only, null for anyone else.
  getWebhookDeliveries,
  updateSubscription,
  cancelSubscription,
  uncancelSubscription,
  pauseSubscription,
  resumeSubscription,
  getOrders,
  getInvoiceUrl,
  getUsageHistory,
  refundOrder,
} = billing.functions
export const { webhookEvents } = billing

// App-side bookkeeping written by the order.paid hook above.
export const recordOrder = internalMutation({
  args: { orderId: v.string() },
  handler: async (ctx, { orderId }) => {
    await ctx.db.insert('orders', { orderId, at: Date.now() })
    return null
  },
})

export const createDiscount = internalAction({
  args: { name: v.string(), percent: v.number(), code: v.optional(v.string()) },
  handler: async (ctx, { name, percent, code }) => {
    const basisPoints = Math.round(Math.min(Math.max(percent, 0), 100) * 100)
    const discount: DiscountInput = { type: 'percentage', name, code, duration: 'once', basisPoints }
    return billing.discounts.create(discount)
  },
})
