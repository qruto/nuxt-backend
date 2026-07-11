import { setupBilling, type DiscountInput } from 'nuxt-backend/convex/billing'
import { v } from 'convex/values'
import { components } from './_generated/api'
import { action, env } from './_generated/server'

// Subscriptions, discounts & prepaid credits via the Polar component. Billing
// follows the tenant: with the default `billTo: 'organization'` the active
// workspace owns the subscription and credits (members share them); switch to
// `billTo: 'user'` for per-user B2C billing. The billing entity resolves from
// identity claims automatically. The reactive feature/credit cache lives inside
// the `backend` component, so there's nothing to add to your schema. Set
// POLAR_ORGANIZATION_TOKEN (and POLAR_SERVER) to enable checkout/credits/discounts.
const billing = setupBilling(components.polar, components.backend, {
  organizationToken: env.POLAR_ORGANIZATION_TOKEN,
  server: env.POLAR_SERVER ?? 'sandbox',
})

export const { polar } = billing
// Checkout / portal / subscription functions (Polar) for `useBilling`.
export const {
  generateCheckoutLink,
  generateCustomerPortalUrl,
  getConfiguredProducts,
  listAllProducts,
  listAllSubscriptions,
  changeCurrentSubscription,
  cancelCurrentSubscription,
} = billing.api
// Reactive queries + sync behind `useBilling` / `useFeatures` / `useCredits`.
export const {
  getCurrentSubscription,
  getFeatures,
  getCredits,
  syncEntitlements,
} = billing.functions
// Webhook handlers (imported by http.ts) that keep the cache fresh.
export const { webhookEvents } = billing

// Discounts: create a percentage coupon (treat as an admin action).
export const createDiscount = action({
  args: { name: v.string(), percent: v.number(), code: v.optional(v.string()) },
  handler: async (ctx, { name, percent, code }) => {
    const discount: DiscountInput = { type: 'percentage', name, code, duration: 'once', basisPoints: Math.round(percent * 100) }
    return billing.createDiscount(discount)
  },
})

// Credits are prepaid: a credit pack is a one-time Polar product whose Credits
// benefit tops up a meter balance (`useCredits().topUp(packId)`). Spend them
// from your own server code when a metered feature is used — `spendCredits`
// blocks (throws) when the balance is too low, so credits are never billed as
// overage. Uncomment and point `meterId` at your credit meter:
//
// export const consumeCredit = action({
//   args: { meterId: v.string() },
//   handler: async (ctx, { meterId }) => {
//     // The billing entity (active workspace or user) resolves from identity.
//     await billing.spendCredits(ctx, { name: 'credits', meterId })
//   },
// })
