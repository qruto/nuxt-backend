import { setupBilling } from 'nuxt-backend/billing'
import { components } from './_generated/api'
import { audit } from './audit'
import { catalog } from './billing.generated'
import { email } from './email'
import { paths } from './paths.generated'

// Subscriptions, discounts, prepaid credits & gift purchases. Billing
// follows the tenant: with the default `billTo: 'workspace'` the active
// workspace owns the subscription and credits (members share them); switch to
// `billTo: 'user'` for per-user B2C billing. The billing entity resolves from
// identity claims automatically, configuration comes from the BILLING_* env
// vars (optional — billing stays empty until BILLING_ACCESS_TOKEN is set),
// and the reactive feature/credit cache lives inside the backend component —
// nothing to add to your schema. The catalog (plans, packs, credit meters)
// is declared in billing.catalog.ts and pushed with
// `npx nuxt-backend billing sync`, which fills billing.generated.ts.
// A gift's recipient hears of it through `email` (email.ts), which holds
// the template. Checkouts, plan changes, refunds, gifts and the provider's
// webhooks are recorded on the activity trail through `audit` (audit.ts).
// functions.ts builds its withFeature tier on this instance, and ai.ts
// spends credits through it; this file imports nothing from functions.ts.
// `paths` (paths.generated.ts) is the settings page its emails link to.
export const billing = setupBilling(components, { catalog, email, audit, paths })

// Every function the billing composables call, by name: checkout, the
// portal and the price list (the server sells only the catalog's plans and
// packs, and sends buyers back only to SITE_URL), the reactive
// subscription, feature and credit reads, the gifts, the subscription's
// lifecycle (each resolves the caller's own billing entity), the order and
// usage history read live from the provider, the admin-only refund and
// revenue metrics (the admin console's Revenue view), the free plan every new
// workspace starts on (internal; run by the workpool), and the gift sweep
// (internal; woken by the component's cron, and scheduled for a gift dated
// for later).
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

// Credits are prepaid: a credit pack is a one-time product whose Credits
// benefit tops up a meter balance (`useCredits().topUp(packId)`, or as a gift
// by its catalog key: `useGifts().send('credits500', { recipientEmail })`).
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
