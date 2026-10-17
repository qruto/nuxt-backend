import { createCheckout } from './billing/checkout.js'
import { createBillingContext } from './billing/context.js'
import { createCredits } from './billing/credits.js'
import { createEntitlements } from './billing/entitlements.js'
import { createBillingFunctions } from './billing/functions.js'
import { createGifts } from './billing/gifts.js'
import { createHistory } from './billing/history.js'
import { createSubscriptions } from './billing/subscriptions.js'
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
} from './billing/types/records.js'
export type { BillingWebhookEventHandlers, BillingComponents, BillingEmail, BillingEntity, BillingEntityCtx, SetupBillingConfig } from './billing/types/setup.js'
export type { Billing } from './billing/types/surface.js'

// Catalog-as-code authoring surface (billing.catalog.ts / `billing sync`).
export { type BillingCatalog, type CatalogCreditGrant, type CatalogFeature, type CatalogMeter, type CatalogPack, type CatalogPlan, defineBillingCatalog } from '../catalog.js'
export { ALL_BILLING_EVENTS } from './billing/events.js'

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
 * the entity resolves from identity claims — zero wiring — unless
 * `resolveEntity` says otherwise.
 *
 * @example
 * ```ts
 * import { setupBilling } from 'nuxt-backend/billing'
 * import { components } from './_generated/api'
 * import { email } from './email'
 *
 * const billing = setupBilling(components, { email })
 *
 * export const { generateCheckoutLink, generateCustomerPortalUrl, giftCheckout } = billing.api
 * export const {
 *   getCurrentSubscription, getFeatures, getCredits, syncEntitlements,
 *   getReceivedGifts, claimGift,
 * } = billing.functions
 * ```
 */
export function setupBilling(
  components: BillingComponents,
  config: SetupBillingConfig,
): Billing {
  // The type makes `email` required, but an import cycle hands it over as
  // `undefined` all the same: when `email.ts` is still evaluating as this
  // module reads it, its export is not set yet. Left unchecked, that
  // surfaces only when a paid gift tries to send.
  if (typeof (config.email as Partial<SetupBillingConfig['email']> | undefined)?.sendTemplate !== 'function') {
    throw new TypeError(
      '[nuxt-backend] setupBilling: `email` is not a setupEmail instance. Pass the app\'s, from email.ts: '
      + '`setupBilling(components, { email })`. If you already do, it was still undefined when billing.ts loaded — '
      + 'an import cycle runs through email.ts (say email.ts imports functions.ts, functions.ts imports auth.ts, '
      + 'and auth.ts imports email.ts). Break the cycle so email.ts finishes loading first.',
    )
  }
  const context = createBillingContext(components, config)
  const { provider, resolveEntity } = context
  const entitlements = createEntitlements(context)
  const { getCustomerState, forgetEntity } = entitlements
  const { reserveCredits, settleSpend, releaseSpend, spendCredits, refundCredits } = createCredits(context, entitlements)
  const subscriptions = createSubscriptions(context)
  const { discounts, updateSubscription, cancelSubscription, uncancelSubscription, pauseSubscription, resumeSubscription } = subscriptions
  const history = createHistory(context)
  const { getOrders, getInvoiceUrl, getUsageHistory, refundOrder } = history
  const { generateCheckoutLink } = createCheckout(context)
  const gifts = createGifts(context, entitlements)
  const { giftCheckout, claimGift, getReceivedGifts } = gifts
  const {
    generateCustomerPortalUrl,
    changeCurrentSubscription,
    cancelCurrentSubscription,
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
    api: {
      ...provider.api(),
      listAllSubscriptions,
      generateCheckoutLink,
      generateCustomerPortalUrl,
      changeCurrentSubscription,
      cancelCurrentSubscription,
      giftCheckout,
    },
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
    resolveEntity,
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
