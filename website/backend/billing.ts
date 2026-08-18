import { setupBilling, type DiscountInput } from 'nuxt-backend/billing'
import { v } from 'convex/values'
import { api, components, internal } from './_generated/api'
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
  // Demo catalog in the qruto Polar sandbox: three monthly plans that each grant
  // prepaid units to the "Credits" meter (Pro and Ultra also grant feature
  // benefits, matched by `useFeatures().has()` via benefit metadata keys), plus
  // two one-time credit packs. Configured here so `useBilling().products`
  // resolves them. These sandbox ids are hardcoded until a live
  // `nuxt-backend billing sync --adopt` run generates billing.generated.ts —
  // then this block becomes `catalog` (see the billing.ts scaffold template).
  products: {
    starter: '96561ea3-e168-4219-9716-5128ac57dd7c',
    pro: 'd852636d-a5fb-4472-b592-3ac921a84ba3',
    ultra: '9e9097b4-22dc-4b40-9823-47a15fbe9f17',
    credits100: 'f55734b4-428f-47b9-b305-70576acf9181',
    credits500: '907659da-d66c-4e4a-9cb3-799ec445c79b',
  },
  // The named credit meter metered actions/streams spend from
  // (`meter: 'credits'` in ai.ts). The sandbox meter counts `credits` events
  // (no `property`), so every spend is exactly 1 unit — same id source as the
  // product ids above, same `billing sync --adopt` migration path.
  credits: {
    credits: { meterId: 'aa62cf4c-2dcd-437d-a407-1872f51531b7' },
  },
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
