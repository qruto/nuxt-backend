import { setupBilling, type DiscountInput } from 'nuxt-backend/billing'
import { v } from 'convex/values'
import { components } from './_generated/api'
import { internalAction } from './_generated/server'
import { catalog } from './billing.generated'

// Subscriptions, discounts, prepaid credits & gift purchases. Billing
// follows the tenant: with the default `billTo: 'organization'` the active
// workspace owns the subscription and credits (members share them); switch to
// `billTo: 'user'` for per-user B2C billing. The billing entity resolves from
// identity claims automatically, configuration comes from the BILLING_* env
// vars (optional — billing stays empty until BILLING_ACCESS_TOKEN is set),
// and the reactive feature/credit cache lives inside the backend component —
// nothing to add to your schema. The catalog (plans, packs, credit meters)
// is declared in billing.catalog.ts and pushed with
// `npx nuxt-backend billing sync`, which fills billing.generated.ts.
// The instance is exported for ai.ts (metered actions spend through it).
export const billing = setupBilling(components, { catalog })

export const { provider } = billing
// Checkout / portal / subscription / gift functions for `useBilling`.
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
// Reactive queries + actions behind `useBilling` / `useFeatures` /
// `useCredits` / `useGifts`.
export const {
  getCurrentSubscription,
  getFeatures,
  getCredits,
  syncEntitlements,
  syncProducts,
  getReceivedGifts,
  claimGift,
  getWebhookDeliveries,
  // Subscription lifecycle — upgrade/downgrade, cancel, uncancel,
  // pause/resume. Each resolves the caller's own billing entity, so a
  // client can only ever act on its own subscription.
  updateSubscription,
  cancelSubscription,
  uncancelSubscription,
  pauseSubscription,
  resumeSubscription,
  // Order history, invoices and metered usage, read live from the provider
  // (this package keeps no local order or usage table — the provider is the
  // ledger).
  getOrders,
  getInvoiceUrl,
  getUsageHistory,
  // Admin-tier: gated by `setupBilling({ requireAdmin })`, which defaults
  // to an `admin` role claim on the caller's identity.
  refundOrder,
} = billing.functions
// Webhook handlers (imported by http.ts) that keep the cache fresh.
export const { webhookEvents } = billing

// Discounts: mint a percentage coupon. This is privileged — a public action
// would let anyone create a 100%-off code — so it ships as an internalAction:
// run it from ops (`npx convex run billing:createDiscount '{"name":"Launch","percent":20}'`)
// or your own server code. To expose it to an admin UI, re-declare it with
// the `admin.action` builder from ./functions instead of internalAction.
export const createDiscount = internalAction({
  args: { name: v.string(), percent: v.number(), code: v.optional(v.string()) },
  handler: async (ctx, { name, percent, code }) => {
    const basisPoints = Math.round(Math.min(Math.max(percent, 0), 100) * 100)
    const discount: DiscountInput = { type: 'percentage', name, code, duration: 'once', basisPoints }
    return billing.discounts.create(discount)
  },
})

// Credits are prepaid: a credit pack is a one-time product whose Credits
// benefit tops up a meter balance (`useCredits().topUp(packId)` — or gift
// one to someone else with `useCredits().gift(packId, { recipientEmail })`).
// Spend them from your own server code when a metered feature is used —
// `spendCredits` blocks (throws) when the balance is too low, so credits are
// never billed as overage. Uncomment and point `meterId` at your credit meter:
//
// export const consumeCredit = action({
//   args: { meterId: v.string() },
//   handler: async (ctx, { meterId }) => {
//     // The billing entity (active workspace or user) resolves from identity.
//     await billing.spendCredits(ctx, { name: 'credits', meterId })
//   },
// })
