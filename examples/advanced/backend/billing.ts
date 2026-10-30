import { setupBilling } from 'nuxt-backend/billing'
import { v } from 'convex/values'
import { components, internal } from './_generated/api'
import { env, internalMutation } from './_generated/server'
import { audit } from './audit'
import { email } from './email'
import { rateLimiter } from './rateLimiter'
import { paths } from './paths.generated'

// CUSTOMIZATION: explicit billing config instead of the env-var defaults, and
// a consumer webhook hook composed after the built-ins.
export const billing = setupBilling(components, {
  // The settings page the plan-pass and renewal emails link to (paths.generated.ts).
  paths,
  // The gift notification is restyled in email.ts.
  email,
  // Checkouts, plan changes, refunds, gifts and webhooks on the activity trail.
  audit,
  // Explicit values win over the BILLING_* env defaults (same names here, but
  // any source works — a secrets manager, per-tenant config, …).
  accessToken: env.BILLING_ACCESS_TOKEN,
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
  getPricing, getConfiguredProducts, getBillingAccess, getFeatures, getCredits,
  getCurrentSubscription, listAllSubscriptions, syncEntitlements, syncProducts, startFreePlan,
  generateCheckoutLink, generateCustomerPortalUrl,
  updateSubscription, cancelSubscription, acceptSaveOffer, uncancelSubscription,
  cancelPendingChange, pauseSubscription, resumeSubscription,
  getOrders, getInvoiceUrl, getUsageHistory, refundOrder, getWithdrawal, withdraw,
  giftCheckout, getReceivedGifts, claimGift, getSentGifts, resendGift, changeGiftRecipient,
  rescheduleGift, cancelGift, runGiftSweep, getRevenue, getBillingConsole,
} = billing.api
export const { webhookEvents } = billing

// App-side bookkeeping written by the order.paid hook above.
export const recordOrder = internalMutation({
  args: { orderId: v.string() },
  handler: async (ctx, { orderId }) => {
    await ctx.db.insert('orders', { orderId, at: Date.now() })
    return null
  },
})

// Quotas (experimental): how many of a thing a plan allows, declared as
// `quotas` in billing.catalog.ts. Count one in the mutation that makes
// the thing, where the check and the count are one transaction, and give
// it back in the one that removes it (`workspace` from ./functions):
//
// export const createProject = workspace.mutation({
//   args: { name: v.string() },
//   handler: async (ctx, { name }) => {
//     await billing.requireQuota(ctx, 'projects')
//     return ctx.db.insert('projects', { name, workspaceId: ctx.workspace.id })
//   },
// })
