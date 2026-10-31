import { catalogRoutes } from './api-catalog'
import { commerceRoutes } from './api-commerce'
import { customerRoutes } from './api-customers'
import { metricsRoutes } from './api-metrics'
import type { ApiContext, Body, Route } from './api-kit'
import { createDeliveries, EVENT_DATA, type FakeEventType } from './deliver'
import { FakeApiError } from './errors'
import { createFlows } from './flows'
import { createModels } from './models'
import { emptyState, type EndpointRecord, type FakeState, newId } from './state'

// A fake of the billing provider's server for the suites: a web-standard
// `(Request) => Response` handler over one in-memory state. It serves the
// REST API under `/v1` that the package's calls make, the paying of a
// checkout and the portal's plan actions, and a test's controls under
// `/_fake` (the clock, an event on demand). It exists so billing sync, the
// billing component and the webhook route run through the real provider SDK
// with no network. Development never uses it: development bills in the
// provider's own sandbox.

/** The host the provider SDK reaches for its sandbox server: a suite routes requests to it into the fake. */
export const SANDBOX_API_HOST = 'sandbox-api.polar.sh'

export interface FakeOptions {
  /** The origin checkout, portal and invoice URLs start with. */
  baseUrl: string
  /** How webhook deliveries are sent: `fetch` by default; a test routes them into its deployment. */
  fetcher?: (url: string, init: RequestInit) => Promise<Response>
  now?: () => number
  log?: (line: string) => void
}

/** A compiled route: the method, the path's pattern, the names of its parameters. */
interface Compiled {
  method: string
  pattern: RegExp
  route: Route
}

function compile(routes: Route[]): Compiled[] {
  return routes.map(route => ({
    method: route[0],
    pattern: new RegExp(`^${route[1].replace(/\{(\w+)\}/g, '(?<$1>[^/]+)')}$`),
    route,
  }))
}

function json(status: number, body: unknown): Response {
  return status === 204 ? new Response(null, { status }) : Response.json(body, { status })
}

function redirect(location: string): Response {
  return new Response(null, { status: 303, headers: { location } })
}

/** A request body as fields: JSON, or a form a test posted. */
async function fieldsOf(request: Request): Promise<Body> {
  const text = await request.text()
  if (!text) return {}
  if (request.headers.get('content-type')?.includes('application/x-www-form-urlencoded')) return Object.fromEntries(new URLSearchParams(text))
  try {
    const parsed: unknown = JSON.parse(text)
    return typeof parsed === 'object' && parsed !== null ? parsed as Body : {}
  }
  catch {
    throw new FakeApiError(422, { detail: [{ loc: ['body'], msg: 'JSON decode error', type: 'json_invalid' }] })
  }
}

/** The models of one event type, by the object id a test names. */
function eventSource(state: FakeState, type: FakeEventType, id: string): unknown {
  const data = EVENT_DATA[type]
  const collections: Record<string, keyof FakeState> = {
    'checkout': 'checkouts',
    'customer': 'customers',
    'customer-state': 'customers',
    'member': 'members',
    'order': 'orders',
    'subscription': 'subscriptions',
    'refund': 'refunds',
    'product': 'products',
    'benefit': 'benefits',
    'benefit-grant': 'grants',
  }
  return (state[collections[data]!] as Record<string, unknown>)[id]
}

/** The plans a customer may switch to in the portal: public, live, recurring products. */
function portalPlans(state: FakeState) {
  return Object.values(state.products).filter(product => product.recurringInterval && !product.isArchived && product.visibility === 'public')
}

/** One fake: its state, its API, and its webhook deliveries. */
export function createPolarFake(options: FakeOptions) {
  const now = options.now ?? Date.now
  const log = options.log ?? (() => {})
  const state = emptyState(now())
  const models = createModels(state, options.baseUrl)
  const fetcher = options.fetcher ?? ((url: string, init: RequestInit) => fetch(url, init))
  const deliveries = createDeliveries({ state, fetcher, now, onChange: () => {}, log })
  const flows = createFlows({ state, models, deliveries, now })
  const context: ApiContext = { state, models, flows, deliveries, now, baseUrl: options.baseUrl }
  const api = compile([...catalogRoutes(context), ...customerRoutes(context), ...commerceRoutes(context), ...metricsRoutes(context)])

  /** Send every product to the endpoints again, as `product.updated`. */
  const replayProducts = (): number => {
    const products = Object.values(state.products)
    for (const product of products) deliveries.emit('product.updated', models.product(product))
    return products.length
  }

  /** The endpoint a deployment receives events at, registered or given its new secret. */
  const ensureEndpoint = (url: string, secret: string) => {
    const found = Object.values(state.endpoints).find(endpoint => endpoint.url === url)
    if (found) Object.assign(found, { secret, enabled: true })
    else {
      const id = newId()
      const endpoint: EndpointRecord = { id, url, secret, format: 'raw', events: [], enabled: true, createdAt: now() }
      state.endpoints[id] = endpoint
    }
  }

  const handleApi = async (request: Request, url: URL, path: string): Promise<Response> => {
    const match = api.map(entry => ({ entry, found: entry.method === request.method ? entry.pattern.exec(path) : null })).find(({ found }) => found)
    if (!match) return json(404, { error: 'ResourceNotFound', detail: `The fake provider does not implement ${request.method} ${path}.` })
    if (!path.startsWith('/v1/checkouts/client/') && !request.headers.get('authorization')?.startsWith('Bearer ')) {
      return json(401, { error: 'Unauthorized', detail: 'An access token is required.' })
    }
    try {
      const body = request.method === 'GET' ? {} : await fieldsOf(request)
      const response = match.entry.route[2]({ params: { ...match.found!.groups }, query: url.searchParams, body })
      return json(response.status, response.body)
    }
    catch (error) {
      if (error instanceof FakeApiError) return json(error.status, error.body)
      // A model that no longer fits the provider SDK's schema: the drift the
      // fake exists to catch, said where a developer sees it.
      log(`${request.method} ${path} failed: ${error instanceof Error ? error.message : String(error)}`)
      return json(500, { error: 'FakeError', detail: error instanceof Error ? error.message : String(error) })
    }
  }

  /**
   * Move time on for the subscriptions due: `renew` (the period ends),
   * `end-trial`, or `fail-payment` (the renewal's payment fails, and the
   * subscription is past due until the next renewal).
   */
  const clock = (fields: Body): number => {
    const only = typeof fields.subscription === 'string' ? fields.subscription : null
    const due = Object.values(state.subscriptions).filter(entry => (!only || entry.id === only) && (entry.status === 'active' || entry.status === 'trialing' || entry.status === 'past_due'))
    const act = fields.action === 'end-trial' ? flows.endTrial : fields.action === 'fail-payment' ? flows.failPayment : flows.renew
    return due.filter(entry => act(entry)).length
  }

  const fire = (fields: Body): boolean => {
    const type = String(fields.type) as FakeEventType
    if (!(type in EVENT_DATA)) return false
    const source = eventSource(state, type, typeof fields.id === 'string' ? fields.id : '')
    if (!source) return false
    const build: Record<string, (record: never) => unknown> = {
      'checkout': models.checkout,
      'customer': models.customer,
      'customer-state': models.customerState,
      'member': models.member,
      'order': models.order,
      'subscription': models.subscription,
      'refund': models.refund,
      'product': models.product,
      'benefit': models.benefit,
      'benefit-grant': models.benefitGrant,
    }
    deliveries.emit(type, build[EVENT_DATA[type]]!(source as never) as never)
    return true
  }

  const handleControl = async (request: Request, path: string): Promise<Response | null> => {
    const actions: Record<string, (fields: Body) => unknown> = {
      '/_fake/replay/products': () => ({ count: replayProducts() }),
      '/_fake/clock': fields => ({ changed: clock(fields) }),
      '/_fake/fire': fields => ({ sent: fire(fields) }),
    }
    const action = actions[path]
    if (request.method !== 'POST' || !action) return null
    return json(200, await action(await fieldsOf(request)))
  }

  const checkoutAction = async (request: Request, checkout: FakeState['checkouts'][string], verb: string | undefined): Promise<Response> => {
    if (checkout.status === 'open' && checkout.expiresAt <= now()) checkout.status = 'expired'
    if (request.method === 'GET') return json(200, { id: checkout.id, status: checkout.status })
    if (verb === 'cancel') return redirect(checkout.returnUrl ?? new URL(checkout.successUrl).origin)
    if (verb !== 'pay' || checkout.status !== 'open') return redirect(`/checkout/${checkout.id}`)
    try {
      flows.completeCheckout(checkout)
    }
    catch (error) {
      // A discount used up since the checkout opened: the provider refuses the payment.
      if (!(error instanceof FakeApiError)) throw error
      return json(error.status, error.body)
    }
    // The app reads its entitlements as soon as it is back: deliver first.
    await deliveries.idle()
    // Every placeholder, as the provider formats the URL with the id.
    return redirect(checkout.successUrl.replaceAll('{CHECKOUT_ID}', checkout.id))
  }

  const portalAction = async (request: Request, session: FakeState['sessions'][string], subscriptionId: string): Promise<Response> => {
    const fields = await fieldsOf(request)
    const subscription = state.subscriptions[subscriptionId]
    if (subscription && subscription.customerId === session.customerId && subscription.status !== 'canceled') {
      // Only to a plan the portal offers: public, live and recurring, never a private twin.
      const plan = typeof fields.productId === 'string' ? portalPlans(state).find(product => product.id === fields.productId) : undefined
      if (fields.action === 'cancel') flows.setCancelAtPeriodEnd(subscription, true, { reason: null, comment: null })
      else if (fields.action === 'uncancel') flows.setCancelAtPeriodEnd(subscription, false, { reason: null, comment: null })
      else if (fields.action === 'change' && plan && plan.id !== subscription.productId) flows.changePlan(subscription, plan.id, null)
      await deliveries.idle()
    }
    return redirect(`/portal/${session.token}`)
  }

  /** What a test posts to a checkout (`/checkout/<id>/pay`) and to the portal (`/portal/<token>/subscriptions/<id>`). */
  const handlePage = async (request: Request, path: string): Promise<Response | null> => {
    const [, kind, id, verb, subscriptionId] = path.split('/')
    if (kind === 'checkout' && id && state.checkouts[id]) return checkoutAction(request, state.checkouts[id], verb)
    const session = kind === 'portal' ? Object.values(state.sessions).find(entry => entry.token === id && entry.expiresAt > now()) : undefined
    if (session && verb === 'subscriptions' && subscriptionId) return portalAction(request, session, subscriptionId)
    return null
  }

  const handle = async (request: Request): Promise<Response> => {
    const url = new URL(request.url)
    const path = url.pathname.replace(/\/+$/, '') || '/'
    if (path.startsWith('/v1/')) return handleApi(request, url, path)
    try {
      return await handleControl(request, path) ?? await handlePage(request, path) ?? json(404, { error: 'ResourceNotFound' })
    }
    catch (error) {
      if (error instanceof FakeApiError) return json(error.status, error.body)
      throw error
    }
  }

  return {
    state,
    handle,
    idle: deliveries.idle,
    ensureEndpoint,
    replayProducts,
    close: deliveries.close,
  }
}

export type PolarFake = ReturnType<typeof createPolarFake>

/**
 * A `fetch` for a suite to stub in globally: the provider's sandbox API and
 * the fake's own origin go to the fake, anything else to `otherwise`
 * (refused by default, so a suite never reaches a network).
 */
export function routeToFake(
  fake: PolarFake,
  baseUrl: string,
  otherwise: (request: Request) => Promise<Response> = async () => Response.json({ error: 'not reachable from the suite' }, { status: 503 }),
) {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = new Request(input, init)
    return new URL(request.url).host === SANDBOX_API_HOST || request.url.startsWith(baseUrl) ? fake.handle(request) : otherwise(request)
  }
}
