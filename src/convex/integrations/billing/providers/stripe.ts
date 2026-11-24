import { constantTimeEqual, ENTITY_METADATA_KEY, hmacSha256Hex, idOf, millis, num, providerClient, str, stringMetadata, stripeForm } from './http.js'
import { PROVIDER_CAPABILITIES } from './capabilities.js'
import type {
  CheckoutRequest,
  CommerceProvider,
  InvoiceAnswer,
  NeutralBillingEvent,
  NeutralOrder,
  NeutralRefund,
  NeutralSubscription,
  NeutralSubscriptionStatus,
  ProviderOptions,
  VerifiedDelivery,
} from './types.js'
import { ProviderUnsupportedError } from './types.js'

// Stripe Managed Payments: Stripe sells as merchant of record through its
// Checkout, with `managed_payments[enabled]=true` on every session. Stripe
// then calculates, collects, files and remits sales tax and VAT, sends the
// receipts and invoices (from Link), and answers payment support and
// disputes. Each product needs a tax code Stripe marks "Eligible for Managed
// Payments"; `billing doctor` cannot check that for you yet.
// https://docs.stripe.com/payments/managed-payments/set-up

/**
 * The API version every request pins. `2026-04-22.dahlia` is the first that
 * types `managed_payments` on Checkout Sessions, Payment Links and
 * Subscriptions. Set the webhook endpoint to the same version, or the
 * deliveries keep an older shape.
 *
 * @experimental
 */
export const STRIPE_API_VERSION = '2026-04-22.dahlia'

/** How far a delivery's `t=` may be from now, in seconds: Stripe's own default tolerance. */
export const STRIPE_WEBHOOK_TOLERANCE_SECONDS = 300

const STRIPE_STATUSES: Readonly<Record<string, NeutralSubscriptionStatus>> = {
  trialing: 'trialing',
  active: 'active',
  past_due: 'past_due',
  unpaid: 'past_due',
  paused: 'paused',
  canceled: 'ended',
  incomplete: 'incomplete',
  incomplete_expired: 'ended',
}

/* eslint-disable @typescript-eslint/no-explicit-any -- the provider's JSON, read field by field */

/** A Stripe subscription in neutral words. The period end moved onto the items in `2025-03-31.basil`; both places are read. */
export function stripeSubscription(subscription: any): NeutralSubscription {
  const item = subscription.items?.data?.[0]
  const metadata = stringMetadata(subscription.metadata)
  return {
    id: String(subscription.id),
    customerId: idOf(subscription.customer),
    entityId: metadata[ENTITY_METADATA_KEY] ?? null,
    productId: idOf(item?.price) ?? idOf(item?.plan),
    status: STRIPE_STATUSES[subscription.status] ?? 'incomplete',
    cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end) || num(subscription.cancel_at) !== null,
    currentPeriodEnd: millis(item?.current_period_end ?? subscription.current_period_end, 'seconds'),
    metadata,
  }
}

/** The subscription an invoice bills: under `parent.subscription_details` since basil, on the invoice before it. */
function invoiceSubscription(invoice: any): { id: string | null, metadata: Record<string, string> } {
  const details = invoice.parent?.subscription_details
  return {
    id: idOf(details?.subscription) ?? idOf(invoice.subscription),
    metadata: { ...stringMetadata(invoice.metadata), ...stringMetadata(details?.metadata) },
  }
}

/** A paid invoice (a subscription's charge) as an order: the invoice id is the order id. */
export function stripeInvoiceOrder(invoice: any): NeutralOrder {
  const line = invoice.lines?.data?.[0]
  const { id: subscriptionId, metadata } = invoiceSubscription(invoice)
  const taxes = Array.isArray(invoice.total_taxes) ? invoice.total_taxes.reduce((sum: number, tax: any) => sum + (num(tax.amount) ?? 0), 0) : num(invoice.tax)
  return {
    id: String(invoice.id),
    customerId: idOf(invoice.customer),
    entityId: metadata[ENTITY_METADATA_KEY] ?? null,
    productId: str(line?.pricing?.price_details?.price) ?? idOf(line?.price),
    subscriptionId,
    amount: num(invoice.amount_paid) ?? 0,
    taxAmount: taxes ?? null,
    currency: String(invoice.currency ?? '').toLowerCase(),
    metadata,
  }
}

/** A paid one-time Checkout Session as an order: its PaymentIntent is the order id, which a refund names. */
export function stripeSessionOrder(session: any): NeutralOrder {
  const metadata = stringMetadata(session.metadata)
  return {
    id: idOf(session.payment_intent) ?? String(session.id),
    customerId: idOf(session.customer),
    entityId: metadata[ENTITY_METADATA_KEY] ?? str(session.client_reference_id),
    productId: metadata.product_id ?? null,
    subscriptionId: null,
    amount: num(session.amount_total) ?? 0,
    taxAmount: num(session.total_details?.amount_tax),
    currency: String(session.currency ?? '').toLowerCase(),
    metadata,
  }
}

function stripeRefund(refund: any): NeutralRefund {
  return {
    id: String(refund.id),
    orderId: idOf(refund.payment_intent) ?? idOf(refund.charge),
    subscriptionId: null,
    amount: num(refund.amount),
    currency: str(refund.currency)?.toLowerCase() ?? null,
    status: refund.status === 'succeeded' ? 'succeeded' : refund.status === 'failed' || refund.status === 'canceled' ? 'failed' : 'pending',
  }
}

/** A verified Stripe event in neutral words. */
export function readStripeEvent(event: any): NeutralBillingEvent {
  const providerType = String(event.type)
  const object = event.data?.object ?? {}
  switch (providerType) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded':
      // A subscription's first charge arrives as `invoice.paid`, so only a
      // paid one-time session is an order here; an async method (a bank
      // debit) completes unpaid and pays later.
      return object.mode === 'payment' && object.payment_status === 'paid'
        ? { type: 'order.paid', order: stripeSessionOrder(object), providerType }
        : { type: 'ignored', providerType }
    case 'invoice.paid':
      return { type: 'order.paid', order: stripeInvoiceOrder(object), providerType }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
    case 'customer.subscription.paused':
    case 'customer.subscription.resumed':
      return { type: 'subscription.updated', subscription: stripeSubscription(object), providerType }
    case 'refund.created':
    case 'refund.updated':
    case 'refund.failed':
      return { type: 'order.refunded', refund: stripeRefund(object), providerType }
    case 'charge.dispute.created':
      return { type: 'order.disputed', orderId: idOf(object.payment_intent) ?? idOf(object.charge), subscriptionId: null, providerType }
    default:
      return { type: 'ignored', providerType }
  }
}

/**
 * Whether `header` (`Stripe-Signature: t=…,v1=…[,v1=…]`) signs `body` under
 * one of `secrets` within the tolerance. Stripe keys the HMAC with the whole
 * `whsec_…` string and signs `${t}.${body}`; a rotation sends one `v1` per
 * live secret.
 */
export async function verifyStripeSignature(body: string, header: string | null, secrets: readonly string[], now = Date.now()): Promise<boolean> {
  if (!header) return false
  let timestamp: string | undefined
  const signatures: string[] = []
  for (const part of header.split(',')) {
    const [key, value] = part.split('=', 2)
    if (key?.trim() === 't') timestamp = value?.trim()
    else if (key?.trim() === 'v1' && value) signatures.push(value.trim())
  }
  if (!timestamp || !/^\d{1,12}$/.test(timestamp) || signatures.length === 0) return false
  if (Math.abs(now / 1000 - Number(timestamp)) > STRIPE_WEBHOOK_TOLERANCE_SECONDS) return false
  for (const secret of secrets) {
    if (!secret) continue
    const expected = await hmacSha256Hex(secret, `${timestamp}.${body}`)
    if (signatures.some(signature => constantTimeEqual(signature, expected))) return true
  }
  return false
}

/** The Stripe Managed Payments adapter. */
export function createStripeProvider({ apiKey, environment, fetch: fetchImpl }: ProviderOptions): CommerceProvider {
  // Stripe has one host; a test key (`sk_test_…`) is its sandbox.
  const call = providerClient('stripe', 'https://api.stripe.com/v1', {
    'authorization': `Bearer ${apiKey}`,
    'stripe-version': STRIPE_API_VERSION,
  }, fetchImpl)

  /** A promotion code's id, from the code a buyer typed: Checkout takes ids only. */
  const promotionCodeId = async (code: string): Promise<string> => {
    const found = await call<{ data: Array<{ id: string }> }>('promotion code lookup', { method: 'GET', path: 'promotion_codes', query: { code, active: true, limit: 1 } })
    const id = found.data[0]?.id
    if (!id) throw new Error(`[nuxt-backend] Stripe has no active promotion code "${code}".`)
    return id
  }

  const createCheckout = async (request: CheckoutRequest) => {
    const metadata = { ...request.metadata, [ENTITY_METADATA_KEY]: request.customer.entityId, product_id: request.productId }
    const subscription = request.kind === 'subscription'
    const session = await call<{ id: string, url: string }>('checkout', {
      method: 'POST',
      path: 'checkout/sessions',
      headers: request.idempotencyKey ? { 'idempotency-key': request.idempotencyKey } : undefined,
      body: stripeForm({
        mode: subscription ? 'subscription' : 'payment',
        managed_payments: { enabled: true },
        line_items: [{ price: request.productId, quantity: request.quantity ?? 1 }],
        success_url: request.successUrl,
        cancel_url: request.cancelUrl,
        client_reference_id: request.customer.entityId,
        customer: request.customer.providerCustomerId,
        customer_email: request.customer.providerCustomerId ? undefined : request.customer.email,
        // A one-time buyer needs a customer for the portal and for their receipts later.
        customer_creation: subscription || request.customer.providerCustomerId ? undefined : 'always',
        locale: request.locale,
        metadata,
        discounts: request.discountCode ? [{ promotion_code: await promotionCodeId(request.discountCode) }] : undefined,
        subscription_data: subscription ? { metadata, trial_period_days: request.trialDays } : undefined,
        payment_intent_data: subscription ? undefined : { metadata },
      }),
    })
    return { id: session.id, url: session.url }
  }

  const getSubscription = async (subscriptionId: string) =>
    stripeSubscription(await call('subscription read', { method: 'GET', path: `subscriptions/${encodeURIComponent(subscriptionId)}` }))

  /** The PaymentIntent an order id names: itself, or the one that paid an invoice. */
  const paymentIntentOf = async (orderId: string): Promise<string> => {
    if (!orderId.startsWith('in_')) return orderId
    const payments = await call<{ data: any[] }>('invoice payment read', { method: 'GET', path: 'invoice_payments', query: { invoice: orderId, status: 'paid', limit: 1 } })
    const intent = idOf(payments.data[0]?.payment?.payment_intent)
    if (!intent) throw new Error(`[nuxt-backend] Stripe invoice ${orderId} has no paid PaymentIntent to refund.`)
    return intent
  }

  return {
    name: 'stripe',
    environment,
    capabilities: PROVIDER_CAPABILITIES.stripe,
    createCheckout,
    customerPortalUrl: async (customerId, options) => {
      const session = await call<{ url: string }>('portal', { method: 'POST', path: 'billing_portal/sessions', body: stripeForm({ customer: customerId, return_url: options?.returnUrl }) })
      return session.url
    },
    getSubscription,
    changePlan: async ({ subscriptionId, productId, proration, quantity }) => {
      const current = await call<any>('subscription read', { method: 'GET', path: `subscriptions/${encodeURIComponent(subscriptionId)}` })
      const itemId = current.items?.data?.[0]?.id
      await call('plan change', {
        method: 'POST',
        path: `subscriptions/${encodeURIComponent(subscriptionId)}`,
        body: stripeForm({
          items: [{ id: itemId, price: productId, quantity }],
          proration_behavior: proration === 'immediately' ? 'always_invoice' : 'none',
          cancel_at_period_end: false,
        }),
      })
    },
    cancelSubscription: async (subscriptionId, options) => {
      await (options?.immediately
        ? call('cancellation', { method: 'DELETE', path: `subscriptions/${encodeURIComponent(subscriptionId)}` })
        : call('cancellation', { method: 'POST', path: `subscriptions/${encodeURIComponent(subscriptionId)}`, body: stripeForm({ cancel_at_period_end: true }) }))
    },
    uncancelSubscription: async (subscriptionId) => {
      await call('uncancellation', { method: 'POST', path: `subscriptions/${encodeURIComponent(subscriptionId)}`, body: stripeForm({ cancel_at_period_end: false }) })
    },
    pauseSubscription: async () => {
      throw new ProviderUnsupportedError('stripe', 'pause a Managed Payments subscription', 'cancel it at period end instead, or let the customer manage it in the portal.')
    },
    resumeSubscription: async () => {
      throw new ProviderUnsupportedError('stripe', 'resume a Managed Payments subscription', 'a cancelled one is bought again through checkout.')
    },
    refundOrder: async ({ orderId, amount, reason, idempotencyKey }) => {
      const refund = await call('refund', {
        method: 'POST',
        path: 'refunds',
        headers: idempotencyKey ? { 'idempotency-key': idempotencyKey } : undefined,
        body: stripeForm({
          payment_intent: await paymentIntentOf(orderId),
          amount,
          reason: 'requested_by_customer',
          metadata: reason ? { reason: reason.slice(0, 500) } : undefined,
        }),
      })
      return { ...stripeRefund(refund), orderId }
    },
    invoice: async (orderId): Promise<InvoiceAnswer> => {
      if (orderId.startsWith('in_')) {
        const invoice = await call<any>('invoice read', { method: 'GET', path: `invoices/${encodeURIComponent(orderId)}` })
        const url = str(invoice.hosted_invoice_url) ?? str(invoice.invoice_pdf)
        if (!url) throw new Error(`[nuxt-backend] Stripe invoice ${orderId} has no link yet: it is not finalized.`)
        return { kind: 'url', url }
      }
      const intent = await call<any>('receipt read', { method: 'GET', path: `payment_intents/${encodeURIComponent(orderId)}`, query: { 'expand[]': 'latest_charge' } })
      const url = str(intent.latest_charge?.receipt_url)
      if (!url) throw new Error(`[nuxt-backend] Stripe order ${orderId} has no receipt link: Managed Payments emails it from Link.`)
      return { kind: 'url', url }
    },
    verifyWebhook: async (body, headers, secrets, now): Promise<VerifiedDelivery | null> => {
      if (!await verifyStripeSignature(body, headers.get('stripe-signature'), secrets, now)) return null
      const event = JSON.parse(body)
      return { id: String(event.id), event: readStripeEvent(event) }
    },
  }
}

/* eslint-enable @typescript-eslint/no-explicit-any */
