import { verifyWebhookSignature } from '../../../webhook-signatures.js'
import { PROVIDER_CAPABILITIES } from './capabilities.js'
import { ENTITY_METADATA_KEY, idOf, millis, num, providerClient, str, stringMetadata } from './http.js'
import type {
  CommerceProvider,
  NeutralBillingEvent,
  NeutralOrder,
  NeutralRefund,
  NeutralSubscription,
  NeutralSubscriptionStatus,
  ProviderOptions,
  VerifiedDelivery,
} from './types.js'
import { ProviderHttpError, ProviderUnsupportedError } from './types.js'

// Dodo Payments: a merchant of record that sells in its own name, collects
// and remits sales tax and VAT, and emails the receipts. Its webhooks sign
// to Standard Webhooks, so they go through the package's one verifier
// (webhook-signatures.ts), the same one Polar's and Resend's do.
// https://docs.dodopayments.com/api-reference/introduction

/** Dodo's hosts: test mode and live mode take separate keys. */
export const DODO_BASE_URLS = {
  sandbox: 'https://test.dodopayments.com',
  production: 'https://live.dodopayments.com',
} as const

const DODO_STATUSES: Readonly<Record<string, NeutralSubscriptionStatus>> = {
  pending: 'incomplete',
  active: 'active',
  on_hold: 'past_due',
  past_due: 'past_due',
  paused: 'paused',
  cancelled: 'ended',
  failed: 'ended',
  expired: 'ended',
}

/* eslint-disable @typescript-eslint/no-explicit-any -- the provider's JSON, read field by field */

/** A Dodo subscription (an API answer, or a `Subscription` webhook payload) in neutral words. */
export function dodoSubscription(subscription: any): NeutralSubscription {
  const metadata = stringMetadata(subscription.metadata)
  return {
    id: String(subscription.subscription_id),
    customerId: idOf(subscription.customer?.customer_id) ?? str(subscription.customer_id),
    entityId: metadata[ENTITY_METADATA_KEY] ?? null,
    productId: str(subscription.product_id),
    status: DODO_STATUSES[subscription.status] ?? 'incomplete',
    cancelAtPeriodEnd: Boolean(subscription.cancel_at_next_billing_date),
    currentPeriodEnd: millis(subscription.next_billing_date),
    metadata,
  }
}

/** A succeeded Dodo payment (a purchase, or a subscription's charge) as an order: the payment id is the order id. */
export function dodoOrder(payment: any): NeutralOrder {
  const metadata = stringMetadata(payment.metadata)
  const cart = Array.isArray(payment.product_cart) ? payment.product_cart : []
  return {
    id: String(payment.payment_id),
    customerId: str(payment.customer?.customer_id),
    entityId: metadata[ENTITY_METADATA_KEY] ?? null,
    productId: str(cart[0]?.product_id),
    subscriptionId: str(payment.subscription_id),
    amount: num(payment.total_amount) ?? 0,
    taxAmount: num(payment.tax),
    currency: String(payment.currency ?? '').toLowerCase(),
    metadata,
  }
}

function dodoRefund(refund: any): NeutralRefund {
  return {
    id: String(refund.refund_id),
    orderId: str(refund.payment_id),
    subscriptionId: null,
    amount: num(refund.amount),
    currency: str(refund.currency)?.toLowerCase() ?? null,
    status: refund.status === 'succeeded' ? 'succeeded' : refund.status === 'failed' ? 'failed' : 'pending',
  }
}

/** A verified Dodo event in neutral words. */
export function readDodoEvent(event: any): NeutralBillingEvent {
  const providerType = String(event.type)
  const data = event.data ?? {}
  if (providerType.startsWith('subscription.')) {
    return { type: 'subscription.updated', subscription: dodoSubscription(data), providerType }
  }
  switch (providerType) {
    case 'payment.succeeded':
      return { type: 'order.paid', order: dodoOrder(data), providerType }
    case 'refund.succeeded':
    case 'refund.failed':
      return { type: 'order.refunded', refund: dodoRefund(data), providerType }
    case 'dispute.opened':
      return { type: 'order.disputed', orderId: str(data.payment_id), subscriptionId: null, providerType }
    default:
      return { type: 'ignored', providerType }
  }
}

/** The Dodo Payments adapter. */
export function createDodoProvider({ apiKey, environment, fetch: fetchImpl }: ProviderOptions): CommerceProvider {
  const call = providerClient('dodo', DODO_BASE_URLS[environment], { authorization: `Bearer ${apiKey}` }, fetchImpl)
  const subscriptionPath = (id: string) => `subscriptions/${encodeURIComponent(id)}`
  const patch = (operation: string, id: string, body: Record<string, unknown>) => call(operation, { method: 'PATCH', path: subscriptionPath(id), body })
  /**
   * The line item a partial refund names: the payment's own first line, as
   * the payment was charged (a subscription's product may have changed
   * since), with the amounts in the currency the customer paid in.
   */
  const refundableItemOf = async (paymentId: string): Promise<{ itemId: string, currency: string }> => {
    const payment = await call<any>('payment read', { method: 'GET', path: `payments/${encodeURIComponent(paymentId)}` })
    const lines = await call<any>('payment line items read', { method: 'GET', path: `payments/${encodeURIComponent(paymentId)}/line-items`, query: { currency: str(payment.currency) ?? undefined } })
    if (lines.partial_refund_allowed === false) throw new ProviderUnsupportedError('dodo', 'refund part of this payment', 'its payment method refunds in full only: refund the whole order.')
    const itemId = str(lines.items?.[0]?.items_id)
    if (!itemId) throw new Error(`[nuxt-backend] Dodo payment ${paymentId} has no line item to refund part of.`)
    return { itemId, currency: String(lines.currency) }
  }

  return {
    name: 'dodo',
    environment,
    capabilities: PROVIDER_CAPABILITIES.dodo,
    createCheckout: async (request) => {
      const { providerCustomerId, email, name, entityId } = request.customer
      const session = await call<{ session_id: string, checkout_url: string }>('checkout', {
        method: 'POST',
        path: 'checkouts',
        body: {
          product_cart: [{ product_id: request.productId, quantity: request.quantity ?? 1 }],
          customer: providerCustomerId ? { customer_id: providerCustomerId } : email ? { email, name } : undefined,
          return_url: request.successUrl,
          cancel_url: request.cancelUrl,
          metadata: { ...request.metadata, [ENTITY_METADATA_KEY]: entityId },
          discount_codes: request.discountCode ? [request.discountCode] : undefined,
          subscription_data: request.kind === 'subscription' && request.trialDays ? { trial_period_days: request.trialDays } : undefined,
        },
      })
      return { id: session.session_id, url: session.checkout_url }
    },
    customerPortalUrl: async (customerId, options) => {
      const session = await call<{ link: string }>('portal', {
        method: 'POST',
        path: `customers/${encodeURIComponent(customerId)}/customer-portal/session`,
        query: { return_url: options?.returnUrl },
      })
      return session.link
    },
    getSubscription: async id => dodoSubscription(await call('subscription read', { method: 'GET', path: subscriptionPath(id) })),
    changePlan: async ({ subscriptionId, productId, proration, quantity }) => {
      await call('plan change', {
        method: 'POST',
        path: `${subscriptionPath(subscriptionId)}/change-plan`,
        body: proration === 'immediately'
          ? { product_id: productId, quantity: quantity ?? 1, proration_billing_mode: 'prorated_immediately', effective_at: 'immediately', on_payment_failure: 'prevent_change' }
          : { product_id: productId, quantity: quantity ?? 1, proration_billing_mode: 'do_not_bill', effective_at: 'next_billing_date' },
      })
    },
    cancelSubscription: async (id, options) => {
      await patch('cancellation', id, options?.immediately ? { status: 'cancelled', cancel_reason: 'cancelled_by_customer' } : { cancel_at_next_billing_date: true })
    },
    // Dodo documents no un-cancel: clearing the flag it set is the documented
    // field's other value. Confirm on a test-mode subscription before relying on it.
    uncancelSubscription: async (id) => {
      await patch('uncancellation', id, { cancel_at_next_billing_date: false })
    },
    // `paused` and `active` must be sent alone, or Dodo answers 422.
    pauseSubscription: async (id) => {
      await patch('pause', id, { status: 'paused' })
    },
    resumeSubscription: async (id) => {
      await patch('resume', id, { status: 'active' })
    },
    refundOrder: async ({ orderId, amount, reason }) => {
      // A partial refund names the item it refunds, in the payment's currency.
      let partial: { items: Array<{ item_id: string, amount: number }>, currency: string } | undefined
      if (amount !== undefined) {
        const { itemId, currency } = await refundableItemOf(orderId)
        partial = { items: [{ item_id: itemId, amount }], currency }
      }
      const refund = await call('refund', {
        method: 'POST',
        path: 'refunds',
        // Dodo asks for a reason of 5 to 3,000 characters.
        body: { payment_id: orderId, ...partial, reason: (reason && reason.length >= 5 ? reason : 'Refund requested by the customer').slice(0, 3000) },
      }).catch((error: unknown) => {
        // An earlier refund made in the settlement currency (in the dashboard)
        // leaves the payment refundable in that currency only; amounts here
        // are always the currency the customer paid in.
        if (partial && error instanceof ProviderHttpError && error.code === 'REFUND_CURRENCY_NOT_SUPPORTED') {
          throw new ProviderUnsupportedError('dodo', 'refund part of this payment in the currency the customer paid', 'an earlier refund was made in the settlement currency: refund the rest in the Dodo dashboard.')
        }
        throw error
      })
      return dodoRefund(refund)
    },
    invoice: async (orderId) => {
      const bytes = await call<ArrayBuffer>('invoice read', { method: 'GET', path: `invoices/payments/${encodeURIComponent(orderId)}`, binary: true })
      return { kind: 'pdf', bytes }
    },
    verifyWebhook: async (body, headers, secrets): Promise<VerifiedDelivery | null> => {
      if (!verifyWebhookSignature(secrets, body, headers)) return null
      return { id: headers.get('webhook-id') ?? '', event: readDodoEvent(JSON.parse(body)) }
    },
    verifyCheckoutRedirect: async () => {
      throw new ProviderUnsupportedError('dodo', 'verify the success redirect', 'read the payment by the payment_id in the success URL, or wait for order.paid.')
    },
  }
}

/* eslint-enable @typescript-eslint/no-explicit-any */
