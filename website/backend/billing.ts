import { setupBilling, type DiscountInput } from 'nuxt-backend/billing'
import { v } from 'convex/values'
import { api, components, internal } from './_generated/api'
import { catalog } from './billing.generated'
import { internalAction, internalMutation, query } from './_generated/server'
import { authComponent } from './auth'
import { admin } from './functions'
import { rateLimiter } from './rateLimiter'

// Subscriptions, discounts, prepaid credits & gifts, linked to auth users.
// Configuration comes from the required BILLING_* env vars; the reactive
// feature/credit cache lives inside the backend component, so there's nothing
// to add to this schema.
export const billing = setupBilling(components, {
  // Throttle syncEntitlements per billing entity (guards the live provider fan-out).
  rateLimiter,
  // The catalog — plans, packs, the credit meter and feature benefits — is
  // declared in billing.catalog.ts and pushed with `npx nuxt-backend billing
  // sync`, which writes the provider ids into billing.generated.ts (the only
  // place UUIDs live). Plans grant prepaid units to the "credits" meter every
  // cycle and Pro/Ultra also grant feature benefits that `useFeatures().has()`
  // matches; packs grant once at purchase. `meter: 'credits'` in ai.ts spends
  // from the same meter.
  catalog,
  getUserInfo: async (ctx) => {
    const user = await ctx.runQuery(api.auth.getAuthUser, {})
    return { userId: user._id, email: user.email }
  },
  currentUserId: async (ctx) => {
    if (!(await ctx.auth.getUserIdentity())) return null
    return (await authComponent.getAuthUser(ctx))._id
  },
  // The consumer events map: react to verified webhook events after the
  // built-in cache refresh ran. The showcase logs a few high-signal types into
  // its own feed table — the packaged delivery log (getWebhookDeliveries,
  // shown on /playground/platform/webhooks) already records *every* delivery
  // and its outcome, so consumer handlers are for app reactions, not auditing.
  events: {
    'order.paid': async (ctx, event) => {
      await ctx.runMutation(internal.billing.recordWebhookEvent, {
        source: 'billing',
        type: event.type,
        summary: `order ${event.data.id} paid`,
      })
    },
    'subscription.active': async (ctx, event) => {
      await ctx.runMutation(internal.billing.recordWebhookEvent, {
        source: 'billing',
        type: event.type,
        summary: `subscription ${event.data.id} active`,
      })
    },
    'subscription.canceled': async (ctx, event) => {
      await ctx.runMutation(internal.billing.recordWebhookEvent, {
        source: 'billing',
        type: event.type,
        summary: `subscription ${event.data.id} canceled`,
      })
    },
    'benefit_grant.created': async (ctx, event) => {
      await ctx.runMutation(internal.billing.recordWebhookEvent, {
        source: 'billing',
        type: event.type,
        summary: `benefit ${event.data.benefitId} granted`,
      })
    },
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

// --- Showcase: the consumer-side event feed ------------------------------------
// Filled by the `events` handlers above (and email.ts's) — the app's own
// reactions to webhooks, distinct from the packaged per-delivery log.

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

// --- Discounts -----------------------------------------------------------------

const discountArgs = {
  name: v.string(),
  percent: v.number(),
  code: v.optional(v.string()),
  // `forever` keeps recurring checkouts card-free in the sandbox.
  duration: v.optional(v.union(v.literal('once'), v.literal('forever'))),
}

function percentageDiscount({ name, percent, code, duration }: {
  name: string
  percent: number
  code?: string
  duration?: 'once' | 'forever'
}): DiscountInput {
  return {
    type: 'percentage',
    name,
    code,
    duration: duration ?? 'once',
    // Clamped to [0, 100] — a percentage outside it is a typo, not a discount.
    basisPoints: Math.round(Math.min(Math.max(percent, 0), 100) * 100),
  }
}

/**
 * Mint a percentage coupon from ops, exactly as the scaffold ships it: an
 * internalAction, so the CLI (`npx convex run billing:createDiscount …`) and
 * server code can call it while no client ever can. The test playbook's
 * card-free `E2E100` coupon comes from here.
 */
export const createDiscount = internalAction({
  args: discountArgs,
  handler: async (ctx, args) => billing.discounts.create(percentageDiscount(args)),
})

/**
 * The same mint for the playground's billing page — re-declared with the
 * `admin.action` builder, as the security guide describes. The playground is
 * public, and a signed-in gate alone would let any visitor with a test inbox
 * mint a 100%-off code against the showcase org.
 */
export const createDiscountAsAdmin = admin.action({
  args: discountArgs,
  handler: async (ctx, args) => billing.discounts.create(percentageDiscount(args)),
})
