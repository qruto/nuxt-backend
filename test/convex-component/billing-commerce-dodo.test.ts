import { Webhook } from 'standardwebhooks'
import { vi } from 'vitest'
import type { Billing } from '../../src/convex/integrations/billing/types/surface'
import { signingSecret } from '../helpers/secrets'
import { commerceSuite, json, stubApi, type FakeEvent } from './commerce-suite'

// Billing on Dodo Payments end to end: the shared adapter flows
// (commerce-suite.ts) against a fake of Dodo's API, its webhooks signed to
// Standard Webhooks as Dodo signs them.

const fixture = vi.hoisted(() => ({
  billing: undefined as Billing | undefined,
  ids: { 'pro': 'pdt_pro_month', 'pro:year': 'pdt_pro_year', 'credits100': 'pdt_pack_100' },
}))

vi.mock('nuxt-backend/billing', async () => {
  const source = await import('../../src/convex/integrations/billing')
  const { CATALOG } = await import('./commerce-suite')
  const setupBilling: typeof source.setupBilling = (components, config) => {
    fixture.billing = source.setupBilling(components, { ...config, catalog: undefined, commerce: { definition: CATALOG, products: { sandbox: fixture.ids } } })
    return fixture.billing
  }
  return { ...source, setupBilling }
})

const SECRET = signingSecret()
vi.stubEnv('BILLING_PROVIDER', 'dodo')
vi.stubEnv('BILLING_ACCESS_TOKEN', 'dodo_test_commerce_suite')
vi.stubEnv('BILLING_WEBHOOK_SECRET', SECRET)
vi.stubEnv('SITE_URL', 'http://localhost:3000')
vi.stubEnv('AUTH_SECRET', 'commerce-suite-secret-0123456789abcdefghijkl')

const nextBilling = () => new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString()

/** A succeeded payment, as `payment.succeeded` carries it. */
const payment = (paymentId: string, productId: string, amount: number, fields: Record<string, unknown>) => ({
  payment_id: paymentId,
  customer: { customer_id: 'cus_dodo_1' },
  product_cart: [{ product_id: productId, quantity: 1 }],
  total_amount: amount,
  tax: 0,
  currency: 'USD',
  metadata: {},
  ...fields,
})

commerceSuite({
  name: 'dodo',
  ids: fixture.ids,
  fake: () => stubApi('test.dodopayments.com', '/', (call, state) => {
    if (call.path === 'checkouts') return json({ session_id: 'cks_1', checkout_url: 'https://test.checkout.dodopayments.com/session/cks_1' })
    if (/^customers\/[^/]+\/customer-portal\/session$/.test(call.path)) return json({ link: 'https://test.customer.dodopayments.com/portal/1' })
    if (call.path === 'refunds') return json({ refund_id: 'rfd_1', payment_id: call.body.payment_id, amount: 1200, currency: 'USD', status: 'pending' })
    if (call.path.startsWith('invoices/payments/')) return new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46]), { status: 200, headers: { 'content-type': 'application/pdf' } })
    const [, id, action] = /^subscriptions\/([^/]+)(?:\/(.+))?$/.exec(call.path) ?? []
    const held = id ? state.subscriptions[id] : undefined
    if (!held) return undefined
    if (call.method === 'PATCH') Object.assign(held, call.body)
    // A change for the next billing date waits for it.
    if (action === 'change-plan' && call.body.effective_at !== 'next_billing_date') held.product_id = call.body.product_id
    return json(held)
  }),
  delivery: async ({ type, object }: FakeEvent, id: string) => {
    const at = new Date()
    const body = JSON.stringify({ business_id: 'bus_1', type, timestamp: at.toISOString(), data: object })
    return { body, headers: { 'webhook-id': id, 'webhook-timestamp': String(Math.floor(at.getTime() / 1000)), 'webhook-signature': new Webhook(SECRET).sign(id, at, body) } }
  },
  events: {
    subscription: (entityId, fields = {}) => ({
      subscription_id: 'sub_dodo_1',
      customer: { customer_id: 'cus_dodo_1' },
      product_id: fixture.ids.pro,
      status: 'active',
      cancel_at_next_billing_date: false,
      next_billing_date: nextBilling(),
      metadata: { entity_id: entityId },
      ...fields,
    }),
    yearly(entityId) {
      return this.subscription(entityId, { product_id: fixture.ids['pro:year'] })
    },
    renewed: (subscription, periodEnd) => ({ ...subscription, next_billing_date: new Date(periodEnd).toISOString() }),
    created: subscription => ({ type: 'subscription.active', object: subscription }),
    updated: subscription => ({ type: 'subscription.updated', object: subscription }),
    ended: subscription => ({ type: 'subscription.cancelled', object: { ...subscription, status: 'cancelled' } }),
    // A subscription's charge names the subscription, not the entity: the linked customer finds it.
    charge: (subscription, orderId) => ({ type: 'payment.succeeded', object: payment(orderId, String(subscription.product_id), 1200, { subscription_id: subscription.subscription_id }) }),
    pack: (entityId, orderId) => ({ type: 'payment.succeeded', object: payment(orderId, fixture.ids.credits100, 500, { metadata: { entity_id: entityId } }) }),
    refund: (orderId, refundId) => ({ type: 'refund.succeeded', object: { refund_id: refundId, payment_id: orderId, amount: 500, currency: 'USD', status: 'succeeded' } }),
    dispute: orderId => ({ type: 'dispute.opened', object: { dispute_id: 'dsp_1', payment_id: orderId, amount: '500', currency: 'USD' } }),
  },
  checkoutOf: call => ({ productId: (call.body.product_cart as Array<{ product_id: string }>)[0]?.product_id, entityId: (call.body.metadata as Record<string, string>).entity_id }),
  portalUrl: 'https://test.customer.dodopayments.com/portal/1',
  lifecycle: {
    cancel: call => call.method === 'PATCH' && call.body.cancel_at_next_billing_date === true,
    uncancel: call => call.method === 'PATCH' && call.body.cancel_at_next_billing_date === false,
    pause: call => call.method === 'PATCH' && call.body.status === 'paused',
    cancelNow: call => call.method === 'PATCH' && call.body.status === 'cancelled',
  },
  schedulesChanges: true,
  invoices: true,
  refunds: true,
}, fixture)
