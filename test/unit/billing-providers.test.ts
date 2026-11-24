import { Webhook } from 'standardwebhooks'
import { describe, expect, it, vi } from 'vitest'
import { createCommerceWebhookHandler } from '../../src/convex/integrations/billing/commerce-webhooks'
import {
  billingProviderName,
  commerceProviderFromEnv,
  consentFromMetadata,
  consentMetadata,
  PROVIDER_CAPABILITIES,
  ProviderHttpError,
  ProviderUnsupportedError,
  recordDigitalContentConsent,
  webhookSecretsFromEnv,
} from '../../src/convex/integrations/billing/providers'
import { createCreemProvider, readCreemEvent } from '../../src/convex/integrations/billing/providers/creem'
import { createDodoProvider, readDodoEvent } from '../../src/convex/integrations/billing/providers/dodo'
import { hmacSha256Hex, sha256Hex } from '../../src/convex/integrations/billing/providers/http'
import { createStripeProvider, readStripeEvent, STRIPE_API_VERSION, verifyStripeSignature } from '../../src/convex/integrations/billing/providers/stripe'
import { providerFailurePasses, markPassing } from '../../src/convex/integrations/billing/provider-failure'
import { backendError } from '../../src/convex/errors'
import { signingSecret } from '../helpers/secrets'

// The commerce adapters for Stripe Managed Payments, Dodo Payments and
// Creem: what each sends its provider (a fake `fetch` records it), how each
// verifies a delivery, and how each reads a provider's event into the
// package's neutral words. Payload shapes follow each provider's docs as of
// 2026-11-24.

interface Sent { url: URL, method: string, headers: Record<string, string>, body: string | undefined }

function fakeFetch(answer: (sent: Sent) => unknown, status = 200) {
  const sent: Sent[] = []
  const impl = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
    const request: Sent = { url: new URL(String(input)), method: init?.method ?? 'GET', headers: init?.headers as Record<string, string>, body: init?.body as string | undefined }
    sent.push(request)
    const value = answer(request)
    if (value instanceof ArrayBuffer) return new Response(value, { status })
    return new Response(JSON.stringify(value ?? {}), { status, headers: { 'content-type': 'application/json' } })
  })
  return { impl: impl as unknown as typeof fetch, sent }
}

const NOW = Date.UTC(2026, 10, 24, 12)

describe('choosing a provider', () => {
  it('defaults to Polar and refuses a name it does not know', () => {
    expect(billingProviderName(undefined)).toBe('polar')
    expect(billingProviderName(' Stripe ')).toBe('stripe')
    expect(() => billingProviderName('paddle')).toThrow(/BILLING_PROVIDER/)
  })

  it('builds the adapter the env names, and none for Polar', () => {
    expect(commerceProviderFromEnv({}, 'sandbox')).toBeNull()
    expect(commerceProviderFromEnv({ BILLING_PROVIDER: 'dodo', BILLING_ACCESS_TOKEN: 'k' }, 'sandbox')?.name).toBe('dodo')
    expect(() => commerceProviderFromEnv({ BILLING_PROVIDER: 'creem' }, 'sandbox')).toThrow(/BILLING_ACCESS_TOKEN/)
    expect(webhookSecretsFromEnv({ BILLING_WEBHOOK_SECRET: ' new , old ,' })).toEqual(['new', 'old'])
  })

  it('says every provider sells as merchant of record, and what Creem\'s API lacks', () => {
    for (const capabilities of Object.values(PROVIDER_CAPABILITIES)) expect(capabilities.merchantOfRecord).toBe(true)
    expect(PROVIDER_CAPABILITIES.creem.refundApi).toBe(false)
    expect(PROVIDER_CAPABILITIES.creem.invoices).toBe(false)
  })
})

describe('stripe managed payments', () => {
  const secret = signingSecret()
  const signed = async (body: string, at = NOW, key = secret) => `t=${Math.floor(at / 1000)},v1=${await hmacSha256Hex(key, `${Math.floor(at / 1000)}.${body}`)}`

  it('verifies a signature, a rotation, and refuses a stale or foreign one', async () => {
    const body = '{"id":"evt_1"}'
    expect(await verifyStripeSignature(body, await signed(body), [secret], NOW)).toBe(true)
    expect(await verifyStripeSignature(body, await signed(body), [signingSecret(), secret], NOW)).toBe(true)
    expect(await verifyStripeSignature(body, await signed(body, NOW - 301_000), [secret], NOW)).toBe(false)
    expect(await verifyStripeSignature(body, await signed(body, NOW, signingSecret()), [secret], NOW)).toBe(false)
    expect(await verifyStripeSignature(`${body} `, await signed(body), [secret], NOW)).toBe(false)
    expect(await verifyStripeSignature(body, null, [secret], NOW)).toBe(false)
    expect(await verifyStripeSignature(body, 't=abc,v1=00', [secret], NOW)).toBe(false)
  })

  it('opens a Managed Payments checkout on the pinned API version', async () => {
    const { impl, sent } = fakeFetch(() => ({ id: 'cs_1', url: 'https://checkout.stripe.com/c/cs_1' }))
    const stripe = createStripeProvider({ apiKey: 'sk_test_1', environment: 'sandbox', fetch: impl })
    const session = await stripe.createCheckout({
      productId: 'price_issue1',
      kind: 'one_time',
      customer: { entityId: 'ws_1', email: 'reader@example.com' },
      successUrl: 'https://comics.my/thanks',
      idempotencyKey: 'checkout-1',
      metadata: { dc_consent_v: 'v1' },
    })
    expect(session).toEqual({ id: 'cs_1', url: 'https://checkout.stripe.com/c/cs_1' })
    const [request] = sent
    expect(request!.url.pathname).toBe('/v1/checkout/sessions')
    expect(request!.headers['stripe-version']).toBe(STRIPE_API_VERSION)
    expect(request!.headers['idempotency-key']).toBe('checkout-1')
    const form = new URLSearchParams(request!.body)
    expect(form.get('managed_payments[enabled]')).toBe('true')
    expect(form.get('mode')).toBe('payment')
    expect(form.get('line_items[0][price]')).toBe('price_issue1')
    expect(form.get('customer_email')).toBe('reader@example.com')
    expect(form.get('customer_creation')).toBe('always')
    expect(form.get('metadata[entity_id]')).toBe('ws_1')
    expect(form.get('payment_intent_data[metadata][dc_consent_v]')).toBe('v1')
    // Managed Payments refuses these: the adapter never sends them.
    for (const key of ['automatic_tax[enabled]', 'tax_id_collection[enabled]', 'payment_method_types[0]', 'invoice_creation[enabled]']) expect(form.has(key)).toBe(false)
  })

  it('carries the entity onto a subscription, and looks a promotion code up', async () => {
    const { impl, sent } = fakeFetch(r => r.url.pathname.endsWith('promotion_codes') ? { data: [{ id: 'promo_1' }] } : { id: 'cs_2', url: 'u' })
    const stripe = createStripeProvider({ apiKey: 'sk_test_1', environment: 'sandbox', fetch: impl })
    await stripe.createCheckout({ productId: 'price_monthly', kind: 'subscription', customer: { entityId: 'ws_1', providerCustomerId: 'cus_1' }, successUrl: 'https://x', discountCode: 'LAUNCH', trialDays: 7 })
    expect(sent[0]!.url.searchParams.get('code')).toBe('LAUNCH')
    const form = new URLSearchParams(sent[1]!.body)
    expect(form.get('mode')).toBe('subscription')
    expect(form.get('customer')).toBe('cus_1')
    expect(form.has('customer_email')).toBe(false)
    expect(form.get('subscription_data[metadata][entity_id]')).toBe('ws_1')
    expect(form.get('subscription_data[trial_period_days]')).toBe('7')
    expect(form.get('discounts[0][promotion_code]')).toBe('promo_1')
  })

  it('reads a paid one-time session, a paid invoice (basil shape) and a subscription', () => {
    const paid = readStripeEvent({ type: 'checkout.session.completed', data: { object: { id: 'cs_1', mode: 'payment', payment_status: 'paid', payment_intent: 'pi_1', customer: 'cus_1', amount_total: 499, currency: 'EUR', total_details: { amount_tax: 80 }, metadata: { entity_id: 'ws_1', product_id: 'price_issue1' } } } })
    expect(paid).toMatchObject({ type: 'order.paid', order: { id: 'pi_1', entityId: 'ws_1', productId: 'price_issue1', amount: 499, taxAmount: 80, currency: 'eur' } })
    expect(readStripeEvent({ type: 'checkout.session.completed', data: { object: { mode: 'subscription', payment_status: 'paid' } } }).type).toBe('ignored')
    expect(readStripeEvent({ type: 'checkout.session.completed', data: { object: { mode: 'payment', payment_status: 'unpaid' } } }).type).toBe('ignored')

    const invoice = readStripeEvent({ type: 'invoice.paid', data: { object: { id: 'in_1', customer: 'cus_1', amount_paid: 900, currency: 'usd', total_taxes: [{ amount: 50 }, { amount: 25 }], lines: { data: [{ pricing: { price_details: { price: 'price_monthly' } } }] }, parent: { subscription_details: { subscription: 'sub_1', metadata: { entity_id: 'ws_1' } } } } } })
    expect(invoice).toMatchObject({ type: 'order.paid', order: { id: 'in_1', subscriptionId: 'sub_1', entityId: 'ws_1', productId: 'price_monthly', taxAmount: 75 } })

    const subscription = readStripeEvent({ type: 'customer.subscription.updated', data: { object: { id: 'sub_1', customer: 'cus_1', status: 'active', cancel_at_period_end: true, metadata: { entity_id: 'ws_1' }, items: { data: [{ id: 'si_1', price: { id: 'price_monthly' }, current_period_end: 1_800_000_000 }] } } } })
    expect(subscription).toMatchObject({ type: 'subscription.updated', subscription: { id: 'sub_1', status: 'active', cancelAtPeriodEnd: true, productId: 'price_monthly', currentPeriodEnd: 1_800_000_000_000 } })
    expect(readStripeEvent({ type: 'customer.subscription.deleted', data: { object: { id: 'sub_1', status: 'canceled' } } })).toMatchObject({ subscription: { status: 'ended' } })
    expect(readStripeEvent({ type: 'charge.dispute.created', data: { object: { payment_intent: 'pi_1' } } })).toMatchObject({ type: 'order.disputed', orderId: 'pi_1' })
  })

  it('refunds an invoice through the PaymentIntent that paid it', async () => {
    const { impl, sent } = fakeFetch(r => r.url.pathname.endsWith('invoice_payments') ? { data: [{ payment: { payment_intent: 'pi_9' } }] } : { id: 're_1', payment_intent: 'pi_9', amount: 900, currency: 'usd', status: 'succeeded' })
    const stripe = createStripeProvider({ apiKey: 'sk_test_1', environment: 'sandbox', fetch: impl })
    const refund = await stripe.refundOrder({ orderId: 'in_1', reason: 'EU withdrawal' })
    expect(refund).toMatchObject({ id: 're_1', orderId: 'in_1', status: 'succeeded' })
    const form = new URLSearchParams(sent[1]!.body)
    expect(form.get('payment_intent')).toBe('pi_9')
    expect(form.get('reason')).toBe('requested_by_customer')
    expect(form.get('metadata[reason]')).toBe('EU withdrawal')
  })

  it('names a subscription refund by the invoice order.paid named, and a one-time one by its PaymentIntent', async () => {
    const at = Math.floor(NOW / 1000)
    const secret = signingSecret()
    const deliver = async (stripe: ReturnType<typeof createStripeProvider>, event: object) => {
      const body = JSON.stringify(event)
      return stripe.verifyWebhook(body, new Headers({ 'stripe-signature': `t=${at},v1=${await hmacSha256Hex(secret, `${at}.${body}`)}` }), [secret], NOW)
    }
    const { impl, sent } = fakeFetch(() => ({ data: [{ invoice: { id: 'in_1', parent: { subscription_details: { subscription: 'sub_1' } } } }] }))
    const refund = await deliver(createStripeProvider({ apiKey: 'sk_test_1', environment: 'sandbox', fetch: impl }), { id: 'evt_r', type: 'refund.created', data: { object: { id: 're_1', payment_intent: 'pi_9', status: 'succeeded' } } })
    expect(refund?.event).toMatchObject({ type: 'order.refunded', refund: { orderId: 'in_1', subscriptionId: 'sub_1' } })
    expect(sent[0]!.url.searchParams.get('payment[payment_intent]')).toBe('pi_9')
    const oneTime = await deliver(createStripeProvider({ apiKey: 'sk_test_1', environment: 'sandbox', fetch: fakeFetch(() => ({ data: [] })).impl }), { id: 'evt_d', type: 'charge.dispute.created', data: { object: { payment_intent: 'pi_1' } } })
    expect(oneTime?.event).toMatchObject({ type: 'order.disputed', orderId: 'pi_1', subscriptionId: null })
  })

  it('refuses a change of billing interval at the next renewal, which Stripe would bill at once', async () => {
    const { impl, sent } = fakeFetch(r => r.url.pathname.includes('/prices/')
      ? { id: 'price_yearly', recurring: { interval: 'year', interval_count: 1 } }
      : { id: 'sub_1', items: { data: [{ id: 'si_1', price: { recurring: { interval: 'month', interval_count: 1 } } }] } })
    const stripe = createStripeProvider({ apiKey: 'sk_test_1', environment: 'sandbox', fetch: impl })
    await expect(stripe.changePlan({ subscriptionId: 'sub_1', productId: 'price_yearly', proration: 'next_period' })).rejects.toBeInstanceOf(ProviderUnsupportedError)
    expect(sent.every(r => r.method === 'GET')).toBe(true)
    await stripe.changePlan({ subscriptionId: 'sub_1', productId: 'price_yearly', proration: 'immediately' })
    expect(new URLSearchParams(sent.at(-1)!.body).get('proration_behavior')).toBe('always_invoice')
  })

  it('answers a refusal as a ProviderHttpError a retry policy can read', async () => {
    const { impl } = fakeFetch(() => ({ error: { code: 'rate_limit', message: 'secret details' } }), 429)
    const stripe = createStripeProvider({ apiKey: 'sk_test_1', environment: 'sandbox', fetch: impl })
    const error = await stripe.getSubscription('sub_1').then(() => null, (caught: unknown) => caught as ProviderHttpError)
    expect(error).toBeInstanceOf(ProviderHttpError)
    if (!error) return
    expect(error.statusCode).toBe(429)
    expect(error.message).not.toContain('secret details')
    expect(providerFailurePasses(markPassing(backendError('unavailable', { service: 'billing', reason: 'provider_refused' }), error))).toBe(true)
  })

  it('has no pause under Managed Payments', async () => {
    const stripe = createStripeProvider({ apiKey: 'sk_test_1', environment: 'sandbox', fetch: fakeFetch(() => ({})).impl })
    await expect(stripe.pauseSubscription('sub_1')).rejects.toBeInstanceOf(ProviderUnsupportedError)
  })
})

describe('dodo payments', () => {
  const secret = signingSecret(32)

  it('opens a checkout on the test host with the entity in its metadata', async () => {
    const { impl, sent } = fakeFetch(() => ({ session_id: 'cks_1', checkout_url: 'https://test.checkout.dodopayments.com/session/cks_1' }))
    const dodo = createDodoProvider({ apiKey: 'dodo_test_1', environment: 'sandbox', fetch: impl })
    const session = await dodo.createCheckout({ productId: 'pdt_issue1', kind: 'one_time', customer: { entityId: 'ws_1', email: 'r@example.com', name: 'R' }, successUrl: 'https://comics.my/thanks', discountCode: 'LAUNCH' })
    expect(session.id).toBe('cks_1')
    expect(sent[0]!.url.href).toBe('https://test.dodopayments.com/checkouts')
    expect(sent[0]!.headers.authorization).toBe('Bearer dodo_test_1')
    expect(JSON.parse(sent[0]!.body!)).toMatchObject({ product_cart: [{ product_id: 'pdt_issue1', quantity: 1 }], customer: { email: 'r@example.com' }, return_url: 'https://comics.my/thanks', metadata: { entity_id: 'ws_1' }, discount_codes: ['LAUNCH'] })
  })

  it('calls the live host in production, and each subscription endpoint', async () => {
    const { impl, sent } = fakeFetch(r => r.url.pathname.includes('customer-portal') ? { link: 'https://portal' } : {})
    const dodo = createDodoProvider({ apiKey: 'dodo_live_1', environment: 'production', fetch: impl })
    expect(await dodo.customerPortalUrl('cus_1', { returnUrl: 'https://comics.my/account' })).toBe('https://portal')
    await dodo.changePlan({ subscriptionId: 'sub_1', productId: 'pdt_yearly', proration: 'immediately' })
    await dodo.cancelSubscription('sub_1')
    await dodo.cancelSubscription('sub_1', { immediately: true })
    await dodo.pauseSubscription('sub_1')
    expect(sent.map(r => `${r.method} ${r.url.pathname}`)).toEqual([
      'POST /customers/cus_1/customer-portal/session',
      'POST /subscriptions/sub_1/change-plan',
      'PATCH /subscriptions/sub_1',
      'PATCH /subscriptions/sub_1',
      'PATCH /subscriptions/sub_1',
    ])
    expect(sent[0]!.url.origin).toBe('https://live.dodopayments.com')
    expect(sent[0]!.url.searchParams.get('return_url')).toBe('https://comics.my/account')
    expect(JSON.parse(sent[1]!.body!)).toMatchObject({ proration_billing_mode: 'prorated_immediately', effective_at: 'immediately' })
    expect(JSON.parse(sent[2]!.body!)).toEqual({ cancel_at_next_billing_date: true })
    expect(JSON.parse(sent[3]!.body!)).toMatchObject({ status: 'cancelled' })
    expect(JSON.parse(sent[4]!.body!)).toEqual({ status: 'paused' })
  })

  it('refunds part of a payment by its line item, and serves the invoice PDF', async () => {
    const pdf = new TextEncoder().encode('%PDF').buffer as ArrayBuffer
    const { impl, sent } = fakeFetch((r) => {
      if (r.url.pathname.endsWith('/line-items')) return { currency: 'EUR', partial_refund_allowed: true, items: [{ items_id: 'pdt_issue1', amount: 499, tax: 80, refundable_amount: 499 }] }
      if (r.url.pathname.startsWith('/payments/')) return { currency: 'EUR', product_cart: [{ product_id: 'pdt_issue1' }] }
      if (r.url.pathname.startsWith('/invoices/')) return pdf
      return { refund_id: 'ref_1', payment_id: 'pay_1', amount: 200, currency: 'EUR', status: 'pending' }
    })
    const dodo = createDodoProvider({ apiKey: 'dodo_test_1', environment: 'sandbox', fetch: impl })
    expect(await dodo.refundOrder({ orderId: 'pay_1', amount: 200 })).toMatchObject({ id: 'ref_1', orderId: 'pay_1', status: 'pending', currency: 'eur' })
    expect(sent[1]!.url.searchParams.get('currency')).toBe('EUR')
    expect(JSON.parse(sent[2]!.body!)).toMatchObject({ payment_id: 'pay_1', items: [{ item_id: 'pdt_issue1', amount: 200 }], currency: 'EUR' })
    expect(JSON.parse(sent[2]!.body!).reason.length).toBeGreaterThanOrEqual(5)
    const invoice = await dodo.invoice('pay_1')
    expect(invoice.kind).toBe('pdf')
  })

  it('refunds part of a subscription charge by the line it was charged for, after a plan change too', async () => {
    const { impl, sent } = fakeFetch((r) => {
      // The subscription has since moved to pdt_yearly; the payment's own line still names pdt_monthly.
      if (r.url.pathname.endsWith('/line-items')) return { currency: 'USD', partial_refund_allowed: true, items: [{ items_id: 'pdt_monthly', amount: 900, tax: 0, refundable_amount: 900 }] }
      if (r.url.pathname.startsWith('/payments/')) return { currency: 'USD', subscription_id: 'sub_1' }
      return { refund_id: 'ref_2', payment_id: 'pay_2', status: 'pending' }
    })
    const dodo = createDodoProvider({ apiKey: 'dodo_test_1', environment: 'sandbox', fetch: impl })
    await dodo.refundOrder({ orderId: 'pay_2', amount: 300 })
    expect(sent.some(r => r.url.pathname.startsWith('/subscriptions/'))).toBe(false)
    expect(JSON.parse(sent[2]!.body!)).toMatchObject({ items: [{ item_id: 'pdt_monthly', amount: 300 }], currency: 'USD' })
  })

  it('refuses a partial refund the payment method does not allow', async () => {
    const { impl, sent } = fakeFetch(r => r.url.pathname.endsWith('/line-items') ? { currency: 'USD', partial_refund_allowed: false, items: [{ items_id: 'pdt_1' }] } : { currency: 'USD' })
    const dodo = createDodoProvider({ apiKey: 'dodo_test_1', environment: 'sandbox', fetch: impl })
    await expect(dodo.refundOrder({ orderId: 'pay_3', amount: 100 })).rejects.toBeInstanceOf(ProviderUnsupportedError)
    expect(sent.every(r => r.method === 'GET')).toBe(true)
  })

  it('verifies a Standard Webhooks delivery and reads its events', async () => {
    const body = JSON.stringify({ business_id: 'bus_1', type: 'payment.succeeded', timestamp: '2026-11-24T12:00:00Z', data: { payload_type: 'Payment', payment_id: 'pay_1', customer: { customer_id: 'cus_1', email: 'r@example.com' }, total_amount: 499, tax: 80, currency: 'EUR', metadata: { entity_id: 'ws_1' }, product_cart: [{ product_id: 'pdt_issue1', quantity: 1 }] } })
    const now = new Date()
    const headers = new Headers({ 'webhook-id': 'msg_1', 'webhook-timestamp': String(Math.floor(now.getTime() / 1000)), 'webhook-signature': new Webhook(secret).sign('msg_1', now, body) })
    const dodo = createDodoProvider({ apiKey: 'dodo_test_1', environment: 'sandbox', fetch: fakeFetch(() => ({})).impl })
    const delivery = await dodo.verifyWebhook(body, headers, [secret])
    expect(delivery).toMatchObject({ id: 'msg_1', event: { type: 'order.paid', order: { id: 'pay_1', entityId: 'ws_1', productId: 'pdt_issue1', amount: 499, taxAmount: 80, currency: 'eur' } } })
    expect(await dodo.verifyWebhook(`${body} `, headers, [secret])).toBeNull()

    expect(readDodoEvent({ type: 'subscription.on_hold', data: { subscription_id: 'sub_1', status: 'on_hold', product_id: 'pdt_m', customer: { customer_id: 'cus_1' }, next_billing_date: '2026-12-24T00:00:00Z', cancel_at_next_billing_date: false, metadata: {} } }))
      .toMatchObject({ type: 'subscription.updated', subscription: { id: 'sub_1', status: 'past_due', customerId: 'cus_1', currentPeriodEnd: Date.UTC(2026, 11, 24) } })
    expect(readDodoEvent({ type: 'refund.succeeded', data: { refund_id: 'ref_1', payment_id: 'pay_1', status: 'succeeded' } })).toMatchObject({ type: 'order.refunded', refund: { orderId: 'pay_1', status: 'succeeded' } })
    expect(readDodoEvent({ type: 'payout.success', data: {} }).type).toBe('ignored')
  })
})

describe('creem', () => {
  const secret = 'creem_whsec_test'

  it('opens a checkout on the test host with the API key header', async () => {
    const { impl, sent } = fakeFetch(() => ({ id: 'ch_1', checkout_url: 'https://checkout.creem.io/ch_1' }))
    const creem = createCreemProvider({ apiKey: 'creem_test_1', environment: 'sandbox', fetch: impl })
    expect(await creem.createCheckout({ productId: 'prod_1', kind: 'one_time', customer: { entityId: 'ws_1', email: 'r@example.com' }, successUrl: 'https://comics.my/thanks', idempotencyKey: 'req_1' })).toEqual({ id: 'ch_1', url: 'https://checkout.creem.io/ch_1' })
    expect(sent[0]!.url.href).toBe('https://test-api.creem.io/v1/checkouts')
    expect(sent[0]!.headers['x-api-key']).toBe('creem_test_1')
    expect(JSON.parse(sent[0]!.body!)).toMatchObject({ product_id: 'prod_1', request_id: 'req_1', customer: { email: 'r@example.com' }, metadata: { entity_id: 'ws_1' } })
  })

  it('verifies the body HMAC and reads its events', async () => {
    const creem = createCreemProvider({ apiKey: 'creem_test_1', environment: 'sandbox', fetch: fakeFetch(() => ({})).impl })
    const body = JSON.stringify({ id: 'evt_1', eventType: 'checkout.completed', created_at: NOW, object: { id: 'ch_1', metadata: { entity_id: 'ws_1' }, product: { id: 'prod_1' }, customer: { id: 'cust_1', email: 'r@example.com' }, order: { id: 'ord_1', transaction: 'tran_1', amount: 499, amount_paid: 499, tax_amount: 80, currency: 'EUR', status: 'paid', type: 'one_time' } } })
    const headers = new Headers({ 'creem-signature': await hmacSha256Hex(secret, body) })
    expect(await creem.verifyWebhook(body, headers, ['old', secret])).toMatchObject({ id: 'evt_1', event: { type: 'order.paid', order: { id: 'tran_1', entityId: 'ws_1', productId: 'prod_1', customerId: 'cust_1', currency: 'eur' } } })
    expect(await creem.verifyWebhook(body, new Headers({ 'creem-signature': 'ab' }), [secret])).toBeNull()
    expect(await creem.verifyWebhook(body, new Headers(), [secret])).toBeNull()

    expect(readCreemEvent({ eventType: 'checkout.completed', object: { subscription: { id: 'sub_1' } } }).type).toBe('ignored')
    expect(readCreemEvent({ eventType: 'subscription.scheduled_cancel', object: { id: 'sub_1', status: 'scheduled_cancel', product: { id: 'prod_m' }, customer: { id: 'cust_1' }, current_period_end_date: '2026-12-24T00:00:00.000Z' } }))
      .toMatchObject({ subscription: { status: 'active', cancelAtPeriodEnd: true, productId: 'prod_m' } })
    expect(readCreemEvent({ eventType: 'subscription.paid', object: { id: 'sub_1', product: { id: 'prod_m' }, last_transaction: { id: 'tran_2', amount: 900, currency: 'USD' }, metadata: { entity_id: 'ws_1' } } }))
      .toMatchObject({ type: 'order.paid', order: { id: 'tran_2', subscriptionId: 'sub_1', entityId: 'ws_1' } })
    expect(readCreemEvent({ eventType: 'refund.created', object: { id: 'ref_1', status: 'succeeded', refund_amount: 499, refund_currency: 'EUR', transaction: { id: 'tran_1' } } }))
      .toMatchObject({ type: 'order.refunded', refund: { orderId: 'tran_1', amount: 499, status: 'succeeded' } })
  })

  it('checks the success redirect\'s signature', async () => {
    const pairs = 'checkout_id=ch_1|order_id=ord_1|customer_id=cust_1|product_id=prod_1'
    const signature = await sha256Hex(`${pairs}|salt=creem_test_1`)
    const search = `?checkout_id=ch_1&order_id=ord_1&customer_id=cust_1&subscription_id=&product_id=prod_1&signature=${signature}`
    const creem = createCreemProvider({ apiKey: 'creem_test_1', environment: 'sandbox', fetch: fakeFetch(() => ({})).impl })
    expect(await creem.verifyCheckoutRedirect(search)).toBe(true)
    expect(await creem.verifyCheckoutRedirect(search.replace('ord_1', 'ord_2'))).toBe(false)
    const stripe = createStripeProvider({ apiKey: 'sk_test_1', environment: 'sandbox', fetch: fakeFetch(() => ({})).impl })
    await expect(stripe.verifyCheckoutRedirect(search)).rejects.toBeInstanceOf(ProviderUnsupportedError)
  })

  it('has no refund or invoice API: it says where to go instead', async () => {
    const creem = createCreemProvider({ apiKey: 'creem_test_1', environment: 'sandbox', fetch: fakeFetch(() => ({})).impl })
    await expect(creem.refundOrder({ orderId: 'tran_1' })).rejects.toThrow(/dashboard/)
    await expect(creem.invoice('tran_1')).rejects.toBeInstanceOf(ProviderUnsupportedError)
  })
})

describe('the EU digital-content consent', () => {
  it('refuses anything but an explicit tick, and round-trips through metadata', async () => {
    await expect(recordDigitalContentConsent({ accepted: 'true' })).rejects.toThrow(/withdrawal/)
    await expect(recordDigitalContentConsent({ accepted: undefined })).rejects.toThrow()
    const consent = await recordDigitalContentConsent({ accepted: true, now: NOW })
    expect(consent.textHash).toMatch(/^[0-9a-f]{64}$/)
    const metadata = consentMetadata(consent)
    for (const [key, value] of Object.entries(metadata)) {
      expect(key.length).toBeLessThanOrEqual(40)
      expect(value.length).toBeLessThanOrEqual(500)
    }
    expect(consentFromMetadata(metadata)).toEqual(consent)
    expect(consentFromMetadata({})).toBeNull()
  })
})

describe('the commerce webhook route', () => {
  function logCtx() {
    const rows: Array<Record<string, unknown>> = []
    const ctx = {
      runQuery: vi.fn(async (_ref: unknown, args: { deliveryId: string }) => rows.find(row => row.deliveryId === args.deliveryId && row.outcome === 'ok') ?? null),
      runMutation: vi.fn(async (_ref: unknown, row: Record<string, unknown>) => {
        rows.push(row)
        return null
      }),
    }
    return { ctx, rows }
  }
  const webhookLog = { record: 'record', find: 'find', listRecent: 'listRecent' } as never
  const secret = signingSecret()

  it('verifies, hands the neutral event on once, and dedupes a redelivery by the body id', async () => {
    const stripe = createStripeProvider({ apiKey: 'sk_test_1', environment: 'sandbox', fetch: fakeFetch(() => ({})).impl })
    const onEvent = vi.fn(async (_ctx: unknown, _event: unknown) => {})
    const handler = createCommerceWebhookHandler({ provider: stripe, secrets: [secret], webhookLog, onEvent })
    const body = JSON.stringify({ id: 'evt_route', type: 'customer.subscription.created', data: { object: { id: 'sub_1', status: 'active', metadata: { entity_id: 'ws_1' } } } })
    const at = Math.floor(Date.now() / 1000)
    const request = async () => new Request('https://x/billing/events', { method: 'POST', body, headers: { 'stripe-signature': `t=${at},v1=${await hmacSha256Hex(secret, `${at}.${body}`)}` } })
    const { ctx, rows } = logCtx()

    expect((await handler(ctx, await request())).status).toBe(200)
    expect(onEvent).toHaveBeenCalledTimes(1)
    expect(onEvent.mock.calls[0]![1]).toMatchObject({ type: 'subscription.updated', subscription: { entityId: 'ws_1' } })
    expect(rows.at(-1)).toMatchObject({ service: 'billing', deliveryId: 'evt_route', outcome: 'ok', type: 'customer.subscription.created' })

    expect(await (await handler(ctx, await request())).text()).toBe('Already processed')
    expect(onEvent).toHaveBeenCalledTimes(1)
  })

  it('dedupes Stripe and Creem by the signed body id, never by a header a replay can change', async () => {
    const creem = createCreemProvider({ apiKey: 'creem_test_1', environment: 'sandbox', fetch: fakeFetch(() => ({})).impl })
    const onEvent = vi.fn(async (_ctx: unknown, _event: unknown) => {})
    const handler = createCommerceWebhookHandler({ provider: creem, secrets: [secret], webhookLog, onEvent })
    const body = JSON.stringify({ id: 'evt_creem', eventType: 'subscription.active', object: { id: 'sub_1', status: 'active' } })
    const signature = await hmacSha256Hex(secret, body)
    const request = (id: string) => new Request('https://x/billing/events', { method: 'POST', body, headers: { 'creem-signature': signature, 'webhook-id': id } })
    const { ctx, rows } = logCtx()
    expect((await handler(ctx, request('first'))).status).toBe(200)
    expect(rows.at(-1)).toMatchObject({ deliveryId: 'evt_creem' })
    expect(await (await handler(ctx, request('other'))).text()).toBe('Already processed')
    expect(onEvent).toHaveBeenCalledTimes(1)
  })

  it('refuses a forged delivery, and answers 503 without a secret', async () => {
    const stripe = createStripeProvider({ apiKey: 'sk_test_1', environment: 'sandbox', fetch: fakeFetch(() => ({})).impl })
    const onEvent = vi.fn(async () => {})
    const forged = new Request('https://x/billing/events', { method: 'POST', body: '{"id":"evt_x","type":"invoice.paid"}', headers: { 'stripe-signature': 't=1,v1=00' } })
    const { ctx } = logCtx()
    expect((await createCommerceWebhookHandler({ provider: stripe, secrets: [secret], webhookLog, onEvent })(ctx, forged.clone())).status).toBe(403)
    expect((await createCommerceWebhookHandler({ provider: stripe, secrets: [], webhookLog, onEvent })(ctx, forged)).status).toBe(503)
    expect(onEvent).not.toHaveBeenCalled()
  })
})
