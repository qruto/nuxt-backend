import { setupBilling, type DiscountInput } from 'nuxt-backend/billing'
import { v } from 'convex/values'
import { components, internal } from './_generated/api'
import { env, internalAction, internalMutation } from './_generated/server'
import { rateLimiter } from './rateLimiter'

// CUSTOMIZATION: explicit billing config instead of the env-var defaults, a
// consumer webhook hook composed after the built-ins, and a custom gift email.
export const billing = setupBilling(components, {
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
  // CUSTOMIZATION: the gift notification the recipient receives.
  giftEmail: ({ recipientEmail, purchaserName, message, claimUrl }) => ({
    to: recipientEmail,
    subject: `${purchaserName ?? 'Someone'} sent you a gift on Advanced example`,
    text: `${message ? `“${message}”\n\n` : ''}Sign in to receive it: ${claimUrl}\n\n(Custom template from convex/billing.ts.)`,
  }),
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
    return billing.createDiscount(discount)
  },
})
