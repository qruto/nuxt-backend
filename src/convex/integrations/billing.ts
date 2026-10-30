import { createCheckout } from './billing/checkout.js'
import { BILLING_METERS, BILLING_TO, createBillingContext } from './billing/context.js'
import { createCredits } from './billing/credits.js'
import { createCustomers } from './billing/customers.js'
import { createCatalogDiscounts } from './billing/discounts.js'
import { createEntitlements } from './billing/entitlements.js'
import { createBillingErasure } from './billing/erasure.js'
import { createFeatures } from './billing/features.js'
import { createFreePlan } from './billing/free-plan.js'
import { createBillingFunctions } from './billing/functions.js'
import { createGifts } from './billing/gifts.js'
import { createHistory } from './billing/history.js'
import { createLifecycle } from './billing/lifecycle.js'
import { createPricing } from './billing/pricing.js'
import { createPurchaseRules } from './billing/purchase.js'
import { createReferralOrders } from './billing/referral-orders.js'
import { createRevenue } from './billing/revenue.js'
import { createQuotas } from './billing/quotas.js'
import { BILLING_REWARDS, createRewards } from './billing/rewards.js'
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
  ApplyDiscountOptions,
  CheckoutPrefill,
  CampaignAttribution,
  CheckoutTrial,
  CheckoutOptions,
  ServerCheckoutOptions,
  FeatureCheckOptions,
} from './billing/types/options.js'
export type {
  BenefitKind,
  EntitlementBenefit,
  EntitlementMeter,
  CustomerEntitlements,
  CreditMeterConfig,
  BillingCatalogIds,
  CatalogPassIds,
  BillingCatalogDiscount,
  SpendCreditsEvent,
  SpendReservation,
  RefundCreditsEvent,
  CostReport,
  GiftRecord,
  GiftTask,
  PricedCredits,
  PricedTrial,
  PricedPlanPrice,
  PricedPlan,
  PricedPack,
  PricedOffer,
  PricedPromotion,
  Pricing,
  QuotaUsage,
} from './billing/types/records.js'
export type { BillingWebhookEventHandlers, SaveOfferTerms, BillingComponents, BillingEmail, BillingEntity, BillingAccessRule, BillingEntityCtx, EntityProfile, SetupBillingConfig } from './billing/types/setup.js'
export type { AccountBillingErasure, AccountBillingErasureInput, AccountBillingExport, AccountBillingRecord, Billing } from './billing/types/surface.js'
export type { BillingAudit } from './billing/activity.js'
export type { BillingLifecycle, CancelOutcome, BillingConsole, SaveOffer, SaveOfferRule, WithdrawalPeriod } from './billing/types/lifecycle.js'
export type { MeterUsage, RevenueCancellations, RevenueInterval, RevenueMetric, RevenueOptions, RevenuePeriod, RevenueReport, RevenueValues } from './billing/types/revenue.js'

// Catalog-as-code authoring surface (billing.catalog.ts / `billing sync`).
export { type BillingCatalog, type CatalogCreditGrant, type CatalogCurrencyPrices, type CatalogDiscount, type CatalogDiscountDuration, type CatalogDiscountProducts, type CatalogDiscountTerms, type CatalogFeature, type CatalogInterval, type CatalogMeter, type CatalogPack, type CatalogPackPrices, type CatalogPlan, type CatalogPlanCreditGrant, type CatalogPlanGift, type CatalogPlanPrices, type CatalogQuota, defineBillingCatalog } from '../catalog.js'
export { ALL_BILLING_EVENTS } from './billing/events.js'

// The referral program (REF), set up in its own backend file beside billing.
export { setupReferrals } from './referrals.js'
export type { ClaimRefusal, DueReferral, ReferralCodeView, ReferralComponents, ReferralRefs, ReferralConsole, ReferralConsoleRow, ReferralConsoleRows, ReferralEntry, ReferralPreview, ReferralProgram, Referrals, ReferralsApi, ReferralsView, ReferredOffer, ReferrerOffer, SetupReferralsOptions, StoredTerms } from './referrals.js'
export type { ReferralCaps, ReferralRewards, ReferralState, ReferralTerms, ReferredReward, ReferrerReward } from '../referral-rules.js'

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
 * Billing follows the tenant: with the default `billTo: 'workspace'` the
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
 * export const {
 *   generateCheckoutLink, generateCustomerPortalUrl, getConfiguredProducts, getPricing, giftCheckout,
 *   getCurrentSubscription, getFeatures, getCredits, syncEntitlements,
 *   startFreePlan, getReceivedGifts, claimGift,
 * } = billing.api
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
      + 'an import cycle runs through email.ts (say email.ts imports functions.ts, which imports billing.ts). Break the cycle so email.ts finishes loading first.',
    )
  }
  const context = createBillingContext(components, config)
  const { provider, resolveEntity, requireEntity } = context
  const rules = createPurchaseRules(context)
  const catalogDiscounts = createCatalogDiscounts(context)
  const customers = createCustomers(context, rules)
  const freePlan = createFreePlan(context, customers)
  const entitlements = createEntitlements(context, customers)
  const { getCustomerState, forgetEntity } = entitlements
  const { reserveCredits, settleSpend, releaseSpend, spendCredits, refundCredits, reportCost } = createCredits(context, entitlements)
  const subscriptions = createSubscriptions(context, rules, freePlan, catalogDiscounts)
  const { discounts, applyDiscount, updateSubscription, cancelSubscription, uncancelSubscription, cancelPendingChange, pauseSubscription, resumeSubscription } = subscriptions
  const history = createHistory(context, customers)
  const { getOrders, getInvoiceUrl, getUsageHistory, refundOrder } = history
  const revenue = createRevenue(context)
  const pricing = createPricing(context, catalogDiscounts)
  const { getPricing } = pricing
  const quotas = createQuotas(context, pricing)
  const { getQuota, requireQuota, releaseQuota, forgetQuotas, plansAllowing } = quotas
  const gifts = createGifts(context, customers, rules, freePlan)
  const lifecycle = createLifecycle(context, subscriptions, catalogDiscounts, gifts.passes, freePlan)
  const rewards = createRewards(context, customers, rules, catalogDiscounts, gifts.passes)
  // A new workspace's first free plan becomes the reverse trial's pass, which the gift sweep then follows.
  freePlan.hooks.firstStart = async (ctx, entityId, owner, subscriptionId) => {
    if (await lifecycle.startReverseTrial(ctx, entityId, owner, subscriptionId)) await gifts.registerSweep(ctx)
  }
  const { generateCheckoutLink, checkout } = createCheckout(context, rules, customers, freePlan, catalogDiscounts, lifecycle)
  const { giftCheckout, claimGift, getReceivedGifts, getSentGifts, resendGift, changeGiftRecipient, rescheduleGift, cancelGift, runGiftSweep } = gifts
  const functions = createBillingFunctions(context, entitlements, subscriptions, history, customers, quotas, freePlan, lifecycle, revenue)
  const { webhookEvents, webhookHandler } = createWebhooks(context, entitlements, gifts, customers, subscriptions, freePlan, lifecycle, createReferralOrders(context, rewards))
  const { hasFeature, requireFeature, activePlans } = createFeatures(context, pricing)
  // The counts first: they are found by the grants the cache still holds.
  const forgetBillingEntity: Billing['forgetEntity'] = async (ctx, userId) => {
    await forgetQuotas(ctx, userId)
    await forgetEntity(ctx, userId)
  }
  const { forgetAccount, exportAccount } = createBillingErasure(context, forgetBillingEntity, customers)

  const billing: Billing = {
    api: {
      // Only the provider's price-list read: its checkout, portal, product
      // list and one-subscription actions are left out, so a provider
      // release that adds a public action never ships it to the app.
      getConfiguredProducts: provider.api().getConfiguredProducts,
      getPricing,
      listAllSubscriptions: functions.listAllSubscriptions,
      generateCheckoutLink,
      generateCustomerPortalUrl: functions.generateCustomerPortalUrl,
      giftCheckout,
      getCurrentSubscription: functions.getCurrentSubscription,
      getFeatures: functions.getFeatures,
      getCredits: functions.getCredits,
      getBillingAccess: functions.getBillingAccess,
      syncEntitlements: functions.syncEntitlements,
      syncProducts: functions.syncProducts,
      startFreePlan: functions.startFreePlan,
      getReceivedGifts,
      claimGift,
      getSentGifts,
      resendGift,
      changeGiftRecipient,
      rescheduleGift,
      cancelGift,
      runGiftSweep,
      getBillingConsole: functions.getBillingConsole,
      updateSubscription: functions.updateSubscriptionFn,
      cancelSubscription: functions.cancelSubscriptionFn,
      acceptSaveOffer: functions.acceptSaveOfferFn,
      getWithdrawal: functions.getWithdrawal,
      withdraw: functions.withdrawFn,
      uncancelSubscription: functions.uncancelSubscriptionFn,
      cancelPendingChange: functions.cancelPendingChangeFn,
      pauseSubscription: functions.pauseSubscriptionFn,
      resumeSubscription: functions.resumeSubscriptionFn,
      getOrders: functions.getOrdersFn,
      getInvoiceUrl: functions.getInvoiceUrlFn,
      getUsageHistory: functions.getUsageHistoryFn,
      refundOrder: functions.refundOrderFn,
      getRevenue: functions.getRevenueFn,
    },
    webhookEvents,
    webhookHandler,
    getCustomerState,
    checkout,
    portal: customers.portal,
    spendCredits,
    refundCredits,
    reserveCredits,
    settleSpend,
    releaseSpend,
    reportCost,
    resolveEntity,
    requireEntity,
    startFreePlan: freePlan.queue,
    entityCreated: freePlan.entityCreated,
    deletionRefusal: freePlan.deletionRefusal,
    recordEvent: context.recordEvent,
    hasFeature,
    requireFeature,
    activePlans,
    getQuota,
    requireQuota,
    releaseQuota,
    plansAllowing,
    forgetEntity: forgetBillingEntity,
    forgetAccount,
    exportAccount,
    discounts,
    applyDiscount,
    updateSubscription,
    cancelSubscription,
    uncancelSubscription,
    cancelPendingChange,
    pauseSubscription,
    resumeSubscription,
    getOrders,
    getInvoiceUrl,
    getUsageHistory,
    refundOrder,
  }
  BILLING_METERS.set(billing, context.resolveMeter)
  BILLING_TO.set(billing, context.billTo)
  BILLING_REWARDS.set(billing, rewards)
  return billing
}
