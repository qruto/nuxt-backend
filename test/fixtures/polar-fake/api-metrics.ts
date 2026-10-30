import type { ApiContext, Handler, Route } from './api-kit'
import { find } from './api-kit'
import { invalid, refused } from './errors'
import type { FakeState, OrderRecord, SubscriptionRecord } from './state'

// The provider's metrics, computed from the fake's own records the way the
// provider counts them, closely enough for the suites: orders and their
// revenue, subscriptions started, renewed, cancelled (per reason) and
// ended, recurring revenue and checkouts per period, and a meter's
// quantities from the ingested events. Costs stay at zero: the fake keeps
// only the primitive metadata of an event, not its `_cost`.

const DAY = 24 * 60 * 60 * 1000

/** The scope the metrics routes need: a test drops it with `state.deniedScopes`. */
const METRICS_SCOPE = 'metrics:read'

type Interval = 'year' | 'month' | 'week' | 'day' | 'hour'

const INTERVALS: readonly Interval[] = ['year', 'month', 'week', 'day', 'hour']

const REASONS = ['customer_service', 'low_quality', 'missing_features', 'switched_service', 'too_complex', 'too_expensive', 'unused', 'other'] as const

/** The next period's start after `at`. */
function step(at: number, interval: Interval): number {
  const date = new Date(at)
  if (interval === 'year') return Date.UTC(date.getUTCFullYear() + 1, 0, 1)
  if (interval === 'month') return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)
  if (interval === 'week') return at + 7 * DAY
  if (interval === 'hour') return at + 60 * 60 * 1000
  return at + DAY
}

/** The first period's start: the start's month or year for those intervals, the start itself otherwise. */
function align(at: number, interval: Interval): number {
  const date = new Date(at)
  if (interval === 'year') return Date.UTC(date.getUTCFullYear(), 0, 1)
  if (interval === 'month') return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)
  return at
}

/** The periods from `start` to the end of `end`'s day: `[from, to)` each. */
function periodsOf(start: number, end: number, interval: Interval): Array<[number, number]> {
  const periods: Array<[number, number]> = []
  for (let from = align(start, interval); from < end; from = step(from, interval)) periods.push([from, Math.min(step(from, interval), end)])
  return periods
}

/** What an order brought in, before refunds. */
const gross = (order: OrderRecord) => order.subtotalAmount - order.discountAmount

/** A subscription's recurring revenue per month. */
function monthly(subscription: SubscriptionRecord): number {
  const months = { day: 1 / 30, week: 7 / 30, month: 1, year: 12 }[subscription.recurringInterval] * subscription.recurringIntervalCount
  return Math.round(subscription.amount / months)
}

/** Whether a subscription is live at `at`: started, not ended, and charging (no trial, no pause). */
function liveAt(subscription: SubscriptionRecord, at: number): boolean {
  if (subscription.startedAt > at || (subscription.endedAt !== null && subscription.endedAt <= at)) return false
  return subscription.status === 'active' || subscription.status === 'past_due' || (subscription.status === 'canceled' && subscription.endedAt !== null)
}

const within = (at: number | null, [from, to]: [number, number]) => at !== null && at >= from && at < to

/** Every metric of one window, by its slug. */
function metricsOf(state: FakeState, window: [number, number]): Record<string, number> {
  const orders = Object.values(state.orders).filter(order => within(order.createdAt, window))
  const subscriptions = Object.values(state.subscriptions)
  const checkouts = Object.values(state.checkouts).filter(checkout => within(checkout.createdAt, window))
  const live = subscriptions.filter(subscription => liveAt(subscription, window[1] - 1))
  const revenue = orders.reduce((sum, order) => sum + gross(order), 0)
  const net = revenue - orders.reduce((sum, order) => sum + order.refundedAmount, 0)
  const canceled = subscriptions.filter(subscription => within(subscription.canceledAt, window))
  const succeeded = checkouts.filter(checkout => checkout.status === 'succeeded').length
  const mrr = live.reduce((sum, subscription) => sum + monthly(subscription), 0)
  const churned = subscriptions.filter(subscription => within(subscription.endedAt, window)).length
  const reasons = Object.fromEntries(REASONS.map(reason => [`canceled_subscriptions_${reason}`, canceled.filter(subscription => (subscription.customerCancellationReason ?? 'other') === reason).length]))
  return {
    orders: orders.length,
    revenue,
    net_revenue: net,
    active_subscriptions: live.length,
    monthly_recurring_revenue: mrr,
    annual_recurring_revenue: mrr * 12,
    new_subscriptions: subscriptions.filter(subscription => within(subscription.startedAt, window)).length,
    renewed_subscriptions: orders.filter(order => order.billingReason === 'subscription_cycle').length,
    churned_subscriptions: churned,
    churn_rate: live.length + churned > 0 ? churned / (live.length + churned) : 0,
    canceled_subscriptions: canceled.length,
    ...reasons,
    checkouts: checkouts.length,
    succeeded_checkouts: succeeded,
    checkouts_conversion: checkouts.length > 0 ? succeeded / checkouts.length : 0,
    ltv: live.length > 0 ? Math.round(mrr / live.length) * 12 : 0,
    costs: 0,
    cost_per_user: 0,
    gross_margin: net,
    gross_margin_percentage: net > 0 ? 1 : 0,
  }
}

/** The date query parameters as the start of the first day and the end of the last. */
function dates(query: URLSearchParams): [number, number] {
  const start = Date.parse(`${query.get('start_date') ?? ''}T00:00:00Z`)
  const end = Date.parse(`${query.get('end_date') ?? ''}T00:00:00Z`)
  if (Number.isNaN(start)) throw invalid('start_date', 'Input should be a valid date')
  if (Number.isNaN(end)) throw invalid('end_date', 'Input should be a valid date')
  return [start, end + DAY]
}

function intervalOf(query: URLSearchParams): Interval {
  const interval = query.get('interval') as Interval | null
  if (!interval || !INTERVALS.includes(interval)) throw invalid('interval', 'Input should be \'year\', \'month\', \'week\', \'day\' or \'hour\'')
  return interval
}

/** The metrics and meter quantities a token with `metrics:read` and `meters:read` reads. */
export function metricsRoutes({ state }: ApiContext): Route[] {
  const allowed = (scope: string) => {
    if (state.deniedScopes?.includes(scope)) throw refused('insufficient_scope', `The access token lacks the ${scope} scope.`)
  }

  const metrics: Handler = ({ query }) => {
    allowed(METRICS_SCOPE)
    const [start, end] = dates(query)
    const interval = intervalOf(query)
    const asked = query.getAll('metrics')
    const pick = (values: Record<string, number>) => asked.length === 0 ? values : Object.fromEntries(Object.entries(values).filter(([slug]) => asked.includes(slug)))
    const totals = pick(metricsOf(state, [start, end]))
    // Recurring revenue and active subscriptions are a level, not a sum: the window's total is its end.
    return {
      status: 200,
      body: {
        periods: periodsOf(start, end, interval).map(window => ({ timestamp: new Date(window[0]).toISOString(), ...pick(metricsOf(state, window)) })),
        totals,
        metrics: Object.fromEntries(Object.keys(totals).map(slug => [slug, { slug, display_name: slug, type: 'scalar' }])),
      },
    }
  }

  const limits: Handler = () => {
    allowed(METRICS_SCOPE)
    return { status: 200, body: { min_date: '2020-01-01', intervals: Object.fromEntries(INTERVALS.map(interval => [interval, { min_days: 0, max_days: 3650 }])) } }
  }

  const quantities: Handler = ({ params, query }) => {
    const meter = find(state.meters, params.id, 'Meter')
    const start = Date.parse(query.get('start_timestamp') ?? '')
    const end = Date.parse(query.get('end_timestamp') ?? '')
    if (Number.isNaN(start)) throw invalid('start_timestamp', 'Input should be a valid datetime')
    if (Number.isNaN(end)) throw invalid('end_timestamp', 'Input should be a valid datetime')
    const events = state.events.filter(event => event.name === meter.eventName)
    const amount = (window: [number, number]) => events.filter(event => within(event.timestamp, window)).reduce((sum, event) => {
      if (meter.aggregation.func === 'count') return sum + 1
      const value = event.metadata[meter.aggregation.property]
      return sum + (typeof value === 'number' ? value : 0)
    }, 0)
    const periods = periodsOf(start, end, intervalOf(query))
    return {
      status: 200,
      body: {
        quantities: periods.map(window => ({ timestamp: new Date(window[0]).toISOString(), quantity: amount(window) })),
        total: amount([start, end]),
      },
    }
  }

  return [
    ['GET', '/v1/metrics', metrics],
    ['GET', '/v1/metrics/limits', limits],
    ['GET', '/v1/meters/{id}/quantities', quantities],
  ]
}
