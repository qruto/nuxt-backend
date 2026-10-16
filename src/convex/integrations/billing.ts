import { createCheckout } from './billing/checkout.js'
import { createBillingContext } from './billing/context.js'
import { createCredits } from './billing/credits.js'
import { createEntitlements } from './billing/entitlements.js'
import { createBillingFunctions } from './billing/functions.js'
import { createGifts } from './billing/gifts.js'
import { createHistory } from './billing/history.js'
import { createSubscriptions } from './billing/subscriptions.js'
import type { GiftEmailData, GiftEmailMessage } from './billing/types/records.js'
import type { BillingComponents, SetupBillingConfig } from './billing/types/setup.js'
import type { Billing } from './billing/types/surface.js'
import { createWebhooks } from './billing/webhooks.js'

// The public types live in billing/types/, one file per concern, and are
// re-exported in declaration order. TypeDoc lists a page's symbols by
// declaring file, then position, so those files are named to sort in the
// order the API reference has always listed them in.
export type { BillingRateLimiter, DiscountInput, ProrationBehavior, ClientProrationBehavior, CancellationReason, RefundReason } from './billing/types/base.js'
export type {
  SubscriptionTarget,
  UpdateSubscriptionOptions,
  CancelSubscriptionOptions,
  PauseSubscriptionOptions,
  CurrentSubscriptions,
  OrdersOptions,
  BillingOrder,
  BillingPage,
  UsageHistoryOptions,
  UsageEvent,
  RefundOrderOptions,
  RefundRecord,
  DiscountListOptions,
  BillingDiscounts,
  CheckoutPrefill,
  CheckoutOptions,
} from './billing/types/options.js'
export type {
  EntitlementBenefit,
  EntitlementMeter,
  CustomerEntitlements,
  CreditMeterConfig,
  BillingCatalogIds,
  SpendCreditsEvent,
  SpendReservation,
  RefundCreditsEvent,
  GiftRecord,
  GiftEmailMessage,
  GiftEmailData,
} from './billing/types/records.js'
export type { BillingWebhookEventHandlers, BillingComponents, SetupBillingConfig } from './billing/types/setup.js'
export type { Billing } from './billing/types/surface.js'

/** Webhook events that signal a customer's plans / benefits / credits may have changed. */
// Catalog-as-code authoring surface (billing.catalog.ts / `billing sync`).
export { type BillingCatalog, BILLING_WEBHOOK_PROVISION_EVENTS, type CatalogCreditGrant, type CatalogFeature, type CatalogMeter, type CatalogPack, type CatalogPlan, defineBillingCatalog } from '../catalog.js'
export { BILLING_REFRESH_EVENTS, ALL_BILLING_EVENTS } from './billing/events.js'

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c] ?? c
  ))
}

/**
 * The packaged default gift-notification email — minimal, dependency-free.
 * Used when `giftEmail` ({@link SetupBillingConfig}) is not supplied; exported so
 * apps can preview it or build their override on top of it.
 */
export function defaultGiftEmail(data: GiftEmailData): GiftEmailMessage {
  const from = data.purchaserName || data.purchaserEmail || 'Someone'
  const intro = `${from} sent you a gift! Sign in to receive it.`
  const safeUrl = escapeHtml(data.claimUrl)
  return {
    to: data.recipientEmail,
    subject: `${from} sent you a gift 🎁`,
    text: `${intro}${data.message ? `\n\n“${data.message}”` : ''}\n\n${data.claimUrl}`,
    html: `<div style="font-family:system-ui,sans-serif;font-size:16px;line-height:1.5">`
      + `<p>${escapeHtml(intro)}</p>`
      + (data.message ? `<blockquote style="margin:0 0 12px;padding:8px 12px;border-left:3px solid #ddd;color:#444">${escapeHtml(data.message)}</blockquote>` : '')
      + `<p><a href="${safeUrl}" style="display:inline-block;padding:10px 16px;background:#111;color:#fff;border-radius:8px;text-decoration:none">Receive your gift</a></p>`
      + `<p style="color:#666">Or paste this link into your browser:<br>${safeUrl}</p>`
      + `</div>`,
  }
}

/**
 * Configure billing for subscriptions, discounts, prepaid credits, and gift
 * purchases — linked to your auth users and cached reactively inside the
 * `backend` component (so consumers add nothing to their own schema).
 *
 * Subscription / feature / credit reads return `null`/empty until the provider
 * has synced, so a mid-configuration deployment degrades gracefully; checkout /
 * portal / credit / discount operations need the required
 * `BILLING_ACCESS_TOKEN` env var.
 *
 * Billing follows the tenant: with the default `billTo: 'organization'` the
 * active workspace owns the subscription and credits (every member shares
 * them); with `billTo: 'user'` each user is their own customer. Either way
 * the entity resolves from identity claims — zero wiring.
 *
 * @example
 * ```ts
 * import { setupBilling } from 'nuxt-backend/billing'
 * import { components } from './_generated/api'
 *
 * const billing = setupBilling(components)
 *
 * export const { provider } = billing
 * export const { generateCheckoutLink, generateCustomerPortalUrl, giftCheckout } = billing.api
 * export const {
 *   getCurrentSubscription, getFeatures, getCredits, syncEntitlements,
 *   getReceivedGifts, claimGift,
 * } = billing.functions
 * ```
 */
export function setupBilling(
  components: BillingComponents,
  config: SetupBillingConfig = {},
): Billing {
  const context = createBillingContext(components, config)
  const { provider, entityFromIdentity } = context
  const entitlements = createEntitlements(context)
  const { getCustomerState, forgetEntity } = entitlements
  const { reserveCredits, settleSpend, releaseSpend, spendCredits, refundCredits } = createCredits(context, entitlements)
  const subscriptions = createSubscriptions(context)
  const { discounts, updateSubscription, cancelSubscription, uncancelSubscription, pauseSubscription, resumeSubscription } = subscriptions
  const history = createHistory(context)
  const { getOrders, getInvoiceUrl, getUsageHistory, refundOrder } = history
  const { generateCheckoutLink } = createCheckout(context)
  const gifts = createGifts(context, entitlements, defaultGiftEmail)
  const { giftCheckout, claimGift, getReceivedGifts } = gifts
  const {
    getCurrentSubscription,
    listAllSubscriptions,
    getFeatures,
    getCredits,
    getWebhookDeliveries,
    syncEntitlements,
    syncProducts,
    updateSubscriptionFn,
    cancelSubscriptionFn,
    uncancelSubscriptionFn,
    pauseSubscriptionFn,
    resumeSubscriptionFn,
    getOrdersFn,
    getInvoiceUrlFn,
    getUsageHistoryFn,
    refundOrderFn,
  } = createBillingFunctions(context, entitlements, subscriptions, history)
  const { webhookEvents, webhookHandler } = createWebhooks(context, entitlements, gifts)

  return {
    provider,
    api: { ...provider.api(), listAllSubscriptions, generateCheckoutLink, giftCheckout },
    functions: {
      getCurrentSubscription,
      getFeatures,
      getCredits,
      syncEntitlements,
      syncProducts,
      getReceivedGifts,
      claimGift,
      getWebhookDeliveries,
      updateSubscription: updateSubscriptionFn,
      cancelSubscription: cancelSubscriptionFn,
      uncancelSubscription: uncancelSubscriptionFn,
      pauseSubscription: pauseSubscriptionFn,
      resumeSubscription: resumeSubscriptionFn,
      getOrders: getOrdersFn,
      getInvoiceUrl: getInvoiceUrlFn,
      getUsageHistory: getUsageHistoryFn,
      refundOrder: refundOrderFn,
    },
    webhookEvents,
    webhookHandler,
    getCustomerState,
    spendCredits,
    refundCredits,
    reserveCredits,
    settleSpend,
    releaseSpend,
    resolveEntity: entityFromIdentity,
    forgetEntity,
    discounts,
    updateSubscription,
    cancelSubscription,
    uncancelSubscription,
    pauseSubscription,
    resumeSubscription,
    getOrders,
    getInvoiceUrl,
    getUsageHistory,
    refundOrder,
  }
}
