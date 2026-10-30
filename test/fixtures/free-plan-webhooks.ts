import { Polar } from '@polar-sh/sdk'
import { customersCreate } from '@polar-sh/sdk/funcs/customersCreate.js'
import { subscriptionsCreate } from '@polar-sh/sdk/funcs/subscriptionsCreate.js'
import { subscriptionsUpdate } from '@polar-sh/sdk/funcs/subscriptionsUpdate.js'
import { HTTPClient } from '@polar-sh/sdk/lib/http.js'
import { syncBillingCatalog } from '../../src/cli/billing/sync'
import { createPolarFake } from './polar-fake/server'
import { newWebhookSecret } from './polar-fake/state'
import type { BillingCatalog } from '../../src/convex/catalog'

// The free plan's webhook deliveries, a $0 subscription's whole life, as the
// billing fake signs and posts them: started without a checkout (the
// package's own start), renewed for a cycle (an order of $0), and ended.
// Every payload parses with the provider SDK's schemas, like any the
// fake sends. For the audit trail (F4) and notifications (F10): none of
// these is a charge, and none may reach either.

const BASE = 'http://127.0.0.1:4799'
const ENDPOINT = 'https://fixture.convex.site/billing/events'

/** One delivery: its event type, the signed request's headers and its body, as the deployment receives it. */
export interface FreePlanDelivery {
  type: string
  headers: Headers
  body: string
}

/** The catalog the deliveries come from: a free plan that grants credits, and a paid plan beside it. */
export const FREE_PLAN_CATALOG: BillingCatalog = {
  meters: { credits: { eventName: 'credits', property: 'amount' } },
  plans: {
    free: { name: 'Free', prices: { month: 0 }, credits: { meter: 'credits', units: 10 } },
    pro: { name: 'Pro', prices: { month: 2900 }, credits: { meter: 'credits', units: 500 } },
  },
}

/**
 * The deliveries of one billing entity's free plan, from its start to its
 * end, in the order they were posted, and the secret they are signed with
 * (the endpoint's). The catalog's own events (products, benefits) are left
 * out: only what one entity's free subscription causes.
 */
export async function freePlanWebhooks(): Promise<{ deliveries: FreePlanDelivery[], secret: string, endpoint: string }> {
  const posted: FreePlanDelivery[] = []
  const fake = createPolarFake({
    baseUrl: BASE,
    fetcher: async (_url, init) => {
      const body = String(init.body)
      posted.push({ type: String((JSON.parse(body) as { type?: unknown }).type), headers: new Headers(init.headers), body })
      return new Response('Accepted', { status: 202 })
    },
  })
  const httpClient = new HTTPClient({ fetcher: request => fake.handle(request instanceof Request ? request : new Request(request)) })
  const client = new Polar({ serverURL: BASE, accessToken: 'fixture', httpClient })
  const secret = newWebhookSecret()
  try {
    fake.ensureEndpoint(ENDPOINT, secret)
    const { ids } = await syncBillingCatalog(FREE_PLAN_CATALOG, { rootDir: '.', environment: 'sandbox', accessToken: 'polar_oat_fake', dryRun: false, adopt: {} }, client)
    await fake.idle()
    posted.length = 0
    const customer = await customersCreate(client, { type: 'team', externalId: 'workspace_free', name: 'Free workspace', owner: { email: 'free@example.com', name: 'Free', externalId: 'user_free' }, metadata: { userId: 'workspace_free' } })
    if (!customer.ok) throw customer.error
    await fake.idle()
    posted.length = 0
    const started = await subscriptionsCreate(client, { productId: ids.plans!.free!.month!, externalCustomerId: 'workspace_free' })
    if (!started.ok) throw started.error
    // One cycle: the period ends, a $0 order renews it.
    await fake.handle(new Request(`${BASE}/_fake/clock`, { method: 'POST', headers: { 'content-type': 'application/json', 'origin': BASE }, body: JSON.stringify({ action: 'renew', subscription: started.value.id }) }))
    // And its end: the entity goes, and so does its free plan.
    const ended = await subscriptionsUpdate(client, { id: started.value.id, subscriptionUpdate: { revoke: true } })
    if (!ended.ok) throw ended.error
    await fake.idle()
    return { deliveries: [...posted], secret, endpoint: ENDPOINT }
  }
  finally {
    fake.close()
  }
}
