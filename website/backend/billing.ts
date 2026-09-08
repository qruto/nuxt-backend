import { setupBilling, type DiscountInput } from 'nuxt-backend/billing'
import { v } from 'convex/values'
import { api, components, internal } from './_generated/api'
import { catalog } from './billing.generated'
import { internalMutation, query } from './_generated/server'
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
