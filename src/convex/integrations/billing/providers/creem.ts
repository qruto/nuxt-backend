import { PROVIDER_CAPABILITIES } from './capabilities.js'
import { constantTimeEqual, ENTITY_METADATA_KEY, hmacSha256Hex, idOf, millis, num, providerClient, sha256Hex, str, stringMetadata } from './http.js'
import {
  type CommerceProvider,
  type NeutralBillingEvent,
  type NeutralOrder,
  type NeutralRefund,
  type NeutralSubscription,
  type NeutralSubscriptionStatus,
  type ProviderOptions,
  ProviderUnsupportedError,
  type VerifiedDelivery,
} from './types.js'

// Creem: a merchant of record that sells in its own name, handles sales tax
// and VAT, and emails receipts. Its API has no refund or invoice endpoint:
// refunds are made in its dashboard, and the `refund.created` webhook still
// tells the app. Its webhooks carry an HMAC of the body alone, with no
// timestamp, so a replay is caught by the delivery log's dedupe on the
// event id, never by the signature.
// https://docs.creem.io/api-reference/introduction

/** Creem's hosts: test mode and production take separate keys. */
export const CREEM_BASE_URLS = {
  sandbox: 'https://test-api.creem.io/v1',
  production: 'https://api.creem.io/v1',
} as const

const CREEM_STATUSES: Readonly<Record<string, NeutralSubscriptionStatus>> = {
  trialing: 'trialing',
  active: 'active',
  scheduled_cancel: 'active',
  past_due: 'past_due',
  unpaid: 'past_due',
  paused: 'paused',
  canceled: 'ended',
  expired: 'ended',
  incomplete: 'incomplete',
}

/* eslint-disable @typescript-eslint/no-explicit-any -- the provider's JSON, read field by field */

/** A Creem subscription in neutral words. */
export function creemSubscription(subscription: any): NeutralSubscription {
  const metadata = stringMetadata(subscription.metadata)
  return {
    id: String(subscription.id),
    customerId: idOf(subscription.customer),
    entityId: metadata[ENTITY_METADATA_KEY] ?? null,
    productId: idOf(subscription.product),
    status: CREEM_STATUSES[subscription.status] ?? 'incomplete',
    cancelAtPeriodEnd: subscription.status === 'scheduled_cancel',
    currentPeriodEnd: millis(subscription.current_period_end_date),
    metadata,
  }
}

/**
 * A completed checkout's order. The transaction id is the order id, as a
 * `refund.created` names the transaction it refunds.
 */
export function creemCheckoutOrder(checkout: any): NeutralOrder {
  const order = checkout.order ?? {}
  const metadata = stringMetadata(checkout.metadata)
  return {
    id: idOf(order.transaction) ?? String(order.id ?? checkout.id),
    customerId: idOf(checkout.customer) ?? idOf(order.customer),
    entityId: metadata[ENTITY_METADATA_KEY] ?? null,
    productId: idOf(checkout.product) ?? idOf(order.product),
    subscriptionId: idOf(checkout.subscription),
    amount: num(order.amount_paid) ?? num(order.amount) ?? 0,
    taxAmount: num(order.tax_amount),
    currency: String(order.currency ?? '').toLowerCase(),
    metadata,
  }
}

/** A subscription's charge (`subscription.paid`) as an order: its last transaction. */
export function creemRenewalOrder(subscription: any): NeutralOrder {
  const transaction = subscription.last_transaction ?? {}
  const metadata = stringMetadata(subscription.metadata)
  return {
    id: String(transaction.id ?? subscription.last_transaction_id ?? subscription.id),
    customerId: idOf(subscription.customer),
    entityId: metadata[ENTITY_METADATA_KEY] ?? null,
    productId: idOf(subscription.product),
    subscriptionId: str(subscription.id),
    amount: num(transaction.amount_paid) ?? num(transaction.amount) ?? 0,
    taxAmount: num(transaction.tax_amount),
    currency: String(transaction.currency ?? '').toLowerCase(),
    metadata,
  }
}

function creemRefund(refund: any): NeutralRefund {
  return {
    id: String(refund.id),
    orderId: idOf(refund.transaction),
    subscriptionId: idOf(refund.subscription),
    amount: num(refund.refund_amount),
    currency: str(refund.refund_currency)?.toLowerCase() ?? null,
    status: refund.status === 'succeeded' ? 'succeeded' : refund.status === 'failed' ? 'failed' : 'pending',
  }
}

/** A verified Creem event in neutral words. */
export function readCreemEvent(event: any): NeutralBillingEvent {
  const providerType = String(event.eventType)
  const object = event.object ?? {}
  switch (providerType) {
    case 'checkout.completed':
      // A subscription's charges arrive as `subscription.paid`, its first
      // one included, so only a one-time checkout is an order here.
      return object.subscription
        ? { type: 'ignored', providerType }
        : { type: 'order.paid', order: creemCheckoutOrder(object), providerType }
    case 'subscription.paid':
      return { type: 'order.paid', order: creemRenewalOrder(object), providerType }
    case 'refund.created':
      return { type: 'order.refunded', refund: creemRefund(object), providerType }
    case 'dispute.created':
      return { type: 'order.disputed', orderId: idOf(object.transaction), subscriptionId: idOf(object.subscription), providerType }
    default:
      return providerType.startsWith('subscription.')
        ? { type: 'subscription.updated', subscription: creemSubscription(object), providerType }
        : { type: 'ignored', providerType }
  }
}

/** Whether `signature` (the `creem-signature` header) is the HMAC-SHA256 hex of `body` under one of `secrets`. */
export async function verifyCreemSignature(body: string, signature: string | null, secrets: readonly string[]): Promise<boolean> {
  if (!signature) return false
  for (const secret of secrets) {
    if (secret && constantTimeEqual(signature.trim().toLowerCase(), await hmacSha256Hex(secret, body))) return true
  }
  return false
}

/**
 * Whether the query Creem appends to a checkout's success URL is its own:
 * a SHA-256 hex over the `key=value` pairs in URL order, empty ones
 * dropped, joined by `|`, with `salt=<api key>` last.
 */
async function verifyCreemRedirect(search: string | URLSearchParams, apiKey: string): Promise<boolean> {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search
  const signature = params.get('signature')
  if (!signature) return false
  const pairs: string[] = []
  for (const [key, value] of params) {
    if (key !== 'signature' && value && value !== 'null') pairs.push(`${key}=${value}`)
  }
  pairs.push(`salt=${apiKey}`)
  return constantTimeEqual(signature.toLowerCase(), await sha256Hex(pairs.join('|')))
}

/** The Creem adapter. */
export function createCreemProvider({ apiKey, environment, fetch: fetchImpl }: ProviderOptions): CommerceProvider {
  const call = providerClient('creem', CREEM_BASE_URLS[environment], { 'x-api-key': apiKey }, fetchImpl)
  const subscriptionPath = (id: string) => `subscriptions/${encodeURIComponent(id)}`

  return {
    name: 'creem',
    environment,
    capabilities: PROVIDER_CAPABILITIES.creem,
    createCheckout: async (request) => {
      const { providerCustomerId, email, entityId } = request.customer
      const checkout = await call<{ id: string, checkout_url: string }>('checkout', {
        method: 'POST',
        path: 'checkouts',
        body: {
          product_id: request.productId,
          // Creem's own reference for the checkout, returned on the success URL and every webhook.
          request_id: request.idempotencyKey ?? entityId,
          units: request.quantity,
          discount_code: request.discountCode,
          customer: providerCustomerId ? { id: providerCustomerId } : email ? { email } : undefined,
          success_url: request.successUrl,
          metadata: { ...request.metadata, [ENTITY_METADATA_KEY]: entityId },
        },
      })
      return { id: checkout.id, url: checkout.checkout_url }
    },
    customerPortalUrl: async (customerId) => {
      const portal = await call<{ customer_portal_link: string }>('portal', { method: 'POST', path: 'customers/billing', body: { customer_id: customerId } })
      return portal.customer_portal_link
    },
    getSubscription: async id => creemSubscription(await call('subscription read', { method: 'GET', path: 'subscriptions', query: { subscription_id: id } })),
    changePlan: async ({ subscriptionId, productId, proration, quantity }) => {
      // Creem's upgrade takes a product only: units change in a separate update.
      if (quantity !== undefined) throw new ProviderUnsupportedError('creem', 'change the quantity in a plan change', 'change the product alone, or let the customer change seats in the Creem portal.')
      await call('plan change', {
        method: 'POST',
        path: `${subscriptionPath(subscriptionId)}/upgrade`,
        body: { product_id: productId, update_behavior: proration === 'immediately' ? 'proration-charge-immediately' : 'proration-none' },
      })
    },
    cancelSubscription: async (id, options) => {
      await call('cancellation', { method: 'POST', path: `${subscriptionPath(id)}/cancel`, body: { mode: options?.immediately ? 'immediate' : 'scheduled' } })
    },
    // Resuming before the period ends takes a scheduled cancellation back.
    uncancelSubscription: async (id) => {
      await call('uncancellation', { method: 'POST', path: `${subscriptionPath(id)}/resume` })
    },
    pauseSubscription: async (id) => {
      await call('pause', { method: 'POST', path: `${subscriptionPath(id)}/pause` })
    },
    resumeSubscription: async (id) => {
      await call('resume', { method: 'POST', path: `${subscriptionPath(id)}/resume` })
    },
    refundOrder: async () => {
      throw new ProviderUnsupportedError('creem', 'refund an order', 'refund it in the Creem dashboard; the refund.created webhook updates the app.')
    },
    invoice: async () => {
      throw new ProviderUnsupportedError('creem', 'read an invoice', 'Creem emails each receipt to the customer, and the portal lists them.')
    },
    verifyWebhook: async (body, headers, secrets): Promise<VerifiedDelivery | null> => {
      if (!await verifyCreemSignature(body, headers.get('creem-signature'), secrets)) return null
      const event = JSON.parse(body)
      return { id: String(event.id), event: readCreemEvent(event) }
    },
    verifyCheckoutRedirect: search => verifyCreemRedirect(search, apiKey),
  }
}

/* eslint-enable @typescript-eslint/no-explicit-any */
