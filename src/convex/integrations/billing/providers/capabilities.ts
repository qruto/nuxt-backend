import type { BillingProviderName, ProviderCapabilities } from './types.js'

/**
 * What each provider's API offers, checked against its docs on 2026-11-24.
 * The doctor and the docs read this table; a call a provider lacks throws
 * `ProviderUnsupportedError` and the app sends the customer to the portal
 * (or the seller to the dashboard) instead.
 *
 * - Stripe Managed Payments: docs.stripe.com/payments/managed-payments
 * - Dodo Payments: docs.dodopayments.com/api-reference
 * - Creem: docs.creem.io/api-reference. No refund or invoice endpoint is
 *   documented: refunds are made in the dashboard (the `refund.created`
 *   webhook still reaches the app) and Creem emails every receipt.
 *
 * @experimental
 */
export const PROVIDER_CAPABILITIES: Readonly<Record<BillingProviderName, ProviderCapabilities>> = {
  polar: {
    oneTime: true,
    subscriptions: true,
    customerPortal: true,
    changePlan: true,
    cancelAtPeriodEnd: true,
    uncancel: true,
    pause: false,
    refundApi: true,
    invoices: true,
    discountCodes: true,
    signedRedirect: false,
    merchantOfRecord: true,
    sendsReceipts: true,
  },
  stripe: {
    oneTime: true,
    subscriptions: true,
    customerPortal: true,
    changePlan: true,
    cancelAtPeriodEnd: true,
    uncancel: true,
    pause: false,
    refundApi: true,
    invoices: true,
    discountCodes: true,
    signedRedirect: false,
    merchantOfRecord: true,
    sendsReceipts: true,
  },
  dodo: {
    oneTime: true,
    subscriptions: true,
    customerPortal: true,
    changePlan: true,
    cancelAtPeriodEnd: true,
    uncancel: true,
    pause: true,
    refundApi: true,
    invoices: true,
    discountCodes: true,
    signedRedirect: false,
    merchantOfRecord: true,
    sendsReceipts: true,
  },
  creem: {
    oneTime: true,
    subscriptions: true,
    customerPortal: true,
    changePlan: true,
    cancelAtPeriodEnd: true,
    uncancel: true,
    pause: true,
    refundApi: false,
    invoices: false,
    discountCodes: true,
    signedRedirect: true,
    merchantOfRecord: true,
    sendsReceipts: true,
  },
}
