import { vi } from 'vitest'
import { hmacSha256Hex } from '../../src/convex/integrations/billing/providers/http'
import type { Billing } from '../../src/convex/integrations/billing/types/surface'
import { fakeCredential } from '../helpers/secrets'
import { commerceSuite, json, stubApi, type FakeEvent } from './commerce-suite'

// Billing on Creem end to end: the shared adapter flows (commerce-suite.ts)
// against a fake of Creem's API, its webhooks signed with the
// `creem-signature` HMAC of the body. Creem has no refund or invoice API,
// so those two refuse.

const fixture = vi.hoisted(() => ({
  billing: undefined as Billing | undefined,
  ids: { 'pro': 'prod_pro_month', 'pro:year': 'prod_pro_year', 'credits100': 'prod_pack_100' },
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

const SECRET = fakeCredential('whsec_')
vi.stubEnv('BILLING_PROVIDER', 'creem')
vi.stubEnv('BILLING_ACCESS_TOKEN', 'creem_test_commerce_suite')
vi.stubEnv('BILLING_WEBHOOK_SECRET', SECRET)
vi.stubEnv('SITE_URL', 'http://localhost:3000')
vi.stubEnv('AUTH_SECRET', 'commerce-suite-secret-0123456789abcdefghijkl')

const periodEnd = () => new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString()

/** The status each lifecycle call leaves a Creem subscription in. */
const AFTER: Record<string, (body: Record<string, unknown>) => string> = {
  cancel: body => (body.mode === 'immediate' ? 'canceled' : 'scheduled_cancel'),
  resume: () => 'active',
  pause: () => 'paused',
}

commerceSuite({
  name: 'creem',
  ids: fixture.ids,
  fake: () => stubApi('test-api.creem.io', '/v1/', (call, state) => {
    if (call.path === 'checkouts') return json({ id: 'ch_1', checkout_url: 'https://creem.io/test/checkout/ch_1' })
    if (call.path === 'customers/billing') return json({ customer_portal_link: 'https://creem.io/test/portal/cust_1' })
    if (call.path === 'subscriptions') return state.subscriptions[call.query.get('subscription_id') ?? ''] ? json(state.subscriptions[call.query.get('subscription_id')!]) : undefined
    const [, id, action] = /^subscriptions\/([^/]+)\/(.+)$/.exec(call.path) ?? []
    const held = id ? state.subscriptions[id] : undefined
    if (!held || !action) return undefined
    if (action === 'upgrade') held.product = call.body.product_id
    else if (AFTER[action]) held.status = AFTER[action](call.body)
    return json(held)
  }),
  delivery: async ({ type, object }: FakeEvent, id: string) => {
    const body = JSON.stringify({ id, eventType: type, created_at: Date.now(), object })
    return { body, headers: { 'creem-signature': await hmacSha256Hex(SECRET, body) } }
  },
  events: {
    subscription: (entityId, fields = {}) => ({
      id: 'sub_creem_1',
      object: 'subscription',
      customer: { id: 'cust_1' },
      product: { id: fixture.ids.pro },
      status: 'active',
      current_period_end_date: periodEnd(),
      metadata: { entity_id: entityId },
      ...fields,
    }),
    yearly(entityId) {
      return this.subscription(entityId, { product: { id: fixture.ids['pro:year'] } })
    },
    created: subscription => ({ type: 'subscription.active', object: subscription }),
    updated: subscription => ({ type: 'subscription.update', object: subscription }),
    ended: subscription => ({ type: 'subscription.canceled', object: { ...subscription, status: 'canceled' } }),
    charge: (subscription, orderId) => ({ type: 'subscription.paid', object: { ...subscription, last_transaction: { id: orderId, amount_paid: 1200, currency: 'USD' } } }),
    pack: (entityId, orderId) => ({
      type: 'checkout.completed',
      object: { id: `ch_${orderId}`, customer: { id: 'cust_1' }, product: { id: fixture.ids.credits100 }, order: { id: `ord_${orderId}`, transaction: orderId, amount_paid: 500, currency: 'USD' }, metadata: { entity_id: entityId } },
    }),
    refund: (orderId, refundId) => ({ type: 'refund.created', object: { id: refundId, transaction: { id: orderId }, refund_amount: 500, refund_currency: 'USD', status: 'succeeded' } }),
    dispute: orderId => ({ type: 'dispute.created', object: { id: 'disp_1', transaction: { id: orderId } } }),
  },
  checkoutOf: call => ({ productId: call.body.product_id, entityId: (call.body.metadata as Record<string, string>).entity_id }),
  portalUrl: 'https://creem.io/test/portal/cust_1',
  lifecycle: {
    cancel: call => call.path.endsWith('/cancel') && call.body.mode === 'scheduled',
    uncancel: call => call.path.endsWith('/resume'),
    pause: call => call.path.endsWith('/pause'),
    cancelNow: call => call.path.endsWith('/cancel') && call.body.mode === 'immediate',
  },
  schedulesChanges: false,
  invoices: false,
  refunds: false,
}, fixture)
