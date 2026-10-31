import { metersQuantities } from '@polar-sh/sdk/funcs/metersQuantities.js'
import { metricsGet } from '@polar-sh/sdk/funcs/metricsGet.js'
import { RFCDate } from '@polar-sh/sdk/types/rfcdate.js'
import type { Auth } from 'convex/server'
import type { BillingContext } from './context.js'
import type { CancellationReason, RunWriteCtx } from './types/base.js'
import { REVENUE_INTERVALS, REVENUE_MAX_DAYS, REVENUE_METRICS, type MeterUsage, type RevenueInterval, type RevenueMetric, type RevenueOptions, type RevenueReport, type RevenueValues } from './types/revenue.js'
import { backendError } from '../../errors.js'
import { logBackend } from '../../log.js'
import type { CallerRule } from '../access.js'

// The Revenue view's read (analytics): the billing provider's own metrics,
// read live each time an administrator opens the view, with nothing kept.
// Recurring revenue, subscriptions, churn, checkouts, lifetime value, costs
// and margin are the provider's numbers, computed its way; usage is each
// catalog meter's quantities; only the save offers are counted here, from
// the cancel flow's own records.

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * An administrator in person: a visit to someone's account reads nothing,
 * since the view shows the whole business, not the account visited. No
 * recent sign-in: it moves no money and changes nothing.
 */
const ADMIN_VIEW: CallerRule = { impersonation: 'refused' }

/** The provider's slug of each metric (snake case, as its metrics API names them). */
const PROVIDER_SLUG: Record<RevenueMetric, string> = {
  monthlyRecurringRevenue: 'monthly_recurring_revenue',
  annualRecurringRevenue: 'annual_recurring_revenue',
  revenue: 'revenue',
  netRevenue: 'net_revenue',
  activeSubscriptions: 'active_subscriptions',
  newSubscriptions: 'new_subscriptions',
  renewedSubscriptions: 'renewed_subscriptions',
  churnedSubscriptions: 'churned_subscriptions',
  canceledSubscriptions: 'canceled_subscriptions',
  churnRate: 'churn_rate',
  checkouts: 'checkouts',
  succeededCheckouts: 'succeeded_checkouts',
  checkoutsConversion: 'checkouts_conversion',
  lifetimeValue: 'ltv',
  costs: 'costs',
  costPerUser: 'cost_per_user',
  grossMargin: 'gross_margin',
  grossMarginPercentage: 'gross_margin_percentage',
}

/** The provider SDK's field for a slug: the slug, camel-cased. */
function sdkField(slug: string): string {
  return slug.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())
}

/** The eight reasons the cancel flow asks about, each with the provider's cancellations metric for it. */
const REASONS: ReadonlyArray<[CancellationReason, string]> = (['customer_service', 'low_quality', 'missing_features', 'switched_service', 'too_complex', 'too_expensive', 'unused', 'other'] as const)
  .map(reason => [reason, `canceled_subscriptions_${reason}`])

const METRICS = Object.keys(REVENUE_METRICS) as RevenueMetric[]

/** A metric's value off a provider period or total: a number, else `null`. */
function valueOf(source: Record<string, unknown>, field: string): number | null {
  const value = source[field]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function valuesOf(source: Record<string, unknown>): RevenueValues {
  return Object.fromEntries(METRICS.map(metric => [metric, valueOf(source, sdkField(PROVIDER_SLUG[metric]))])) as RevenueValues
}

/** The start of `at`'s UTC day. */
function dayOf(at: number): number {
  return at - (((at % DAY_MS) + DAY_MS) % DAY_MS)
}

/** `at`'s UTC day as `YYYY-MM-DD`, the provider's date. */
function isoDay(at: number): string {
  return new Date(at).toISOString().slice(0, 10)
}

/**
 * The window a read covers, whole UTC days: from `since`'s day to
 * `until`'s (now by default, and never past it). Refuses a window that
 * ends before it starts or is longer than {@link REVENUE_MAX_DAYS}.
 */
function revenueWindow(options: RevenueOptions, now: number): { first: number, last: number, interval: RevenueInterval } {
  const interval = options.interval ?? 'day'
  if (!REVENUE_INTERVALS.includes(interval)) throw backendError('invalid_input', { field: 'interval' }, `[nuxt-backend] getRevenue: interval is one of ${REVENUE_INTERVALS.join(', ')}.`)
  if (!Number.isFinite(options.since)) throw backendError('invalid_input', { field: 'since' }, '[nuxt-backend] getRevenue: since is a time in epoch milliseconds.')
  const until = options.until ?? now
  if (!Number.isFinite(until)) throw backendError('invalid_input', { field: 'until' }, '[nuxt-backend] getRevenue: until is a time in epoch milliseconds.')
  const first = dayOf(options.since)
  const last = dayOf(Math.min(until, now))
  if (last < first) throw backendError('invalid_input', { field: 'until' }, '[nuxt-backend] getRevenue: the window ends before it starts.')
  if ((last - first) / DAY_MS + 1 > REVENUE_MAX_DAYS) throw backendError('invalid_input', { field: 'since', reason: 'too_long' }, `[nuxt-backend] getRevenue: a window covers at most ${REVENUE_MAX_DAYS} days.`)
  return { first, last, interval }
}

type MetricsRead = Awaited<ReturnType<typeof metricsGet>>
type MetricsPeriod = Record<string, unknown> & { timestamp: Date }

/** The provider's answer to some metrics: its periods and totals, and the slugs it failed on. */
interface MetricsAnswer {
  periods: MetricsPeriod[]
  totals: Record<string, unknown>
  missing: string[]
}

/** A failure of the provider's own (a 5xx), which a read of fewer metrics may avoid. */
function failedOnItsSide(read: { ok: true } | { ok: false, error: unknown }): boolean {
  if (read.ok) return false
  const status = (read.error as { statusCode?: unknown }).statusCode
  return typeof status === 'number' && status >= 500
}

/** Two answers for different metrics of the same window, as one. */
function merged(a: MetricsAnswer, b: MetricsAnswer): MetricsAnswer {
  const byTime = new Map<number, MetricsPeriod>()
  for (const period of [...a.periods, ...b.periods]) {
    const at = period.timestamp.getTime()
    byTime.set(at, { ...byTime.get(at), ...period })
  }
  return { periods: [...byTime.values()].sort((x, y) => x.timestamp.getTime() - y.timestamp.getTime()), totals: { ...a.totals, ...b.totals }, missing: [...a.missing, ...b.missing] }
}

/** The Revenue view's read: `getRevenue`, for administrators. */
export function createRevenue({ components, creditMeters, provider, requireAdmin, requireProviderAccess, unwrapProvider }: BillingContext) {
  /** One catalog meter's quantities over the window, as the provider answers. */
  const meterRead = (meterId: string, window: { first: number, last: number, interval: RevenueInterval }) => metersQuantities(provider.polar, {
    id: meterId,
    startTimestamp: new Date(window.first),
    endTimestamp: new Date(window.last + DAY_MS),
    interval: window.interval,
  })

  const getRevenue = async (ctx: RunWriteCtx & { auth?: Auth }, options: RevenueOptions): Promise<RevenueReport> => {
    // Who is asking first: an administrator in person, the role read fresh.
    await requireAdmin(ctx, 'getRevenue', ADMIN_VIEW)
    requireProviderAccess('revenue read')
    const window = revenueWindow(options, Date.now())
    const slugs = [...METRICS.map(metric => PROVIDER_SLUG[metric]), ...REASONS.map(([, slug]) => slug)]
    const meters = Object.entries(creditMeters).filter(([, meter]) => meter.meterId)
    const read = (metrics: string[]) => metricsGet(provider.polar, { startDate: new RFCDate(isoDay(window.first)), endDate: new RFCDate(isoDay(window.last)), interval: window.interval, timezone: 'UTC', metrics })
    // The provider can fail on its side for one metric (its sandbox has, on a
    // catalog priced in two currencies): halves are read until the failing
    // ones are found, and the view shows the rest. Any other refusal is final.
    const answer = async (metrics: string[], first?: MetricsRead): Promise<MetricsAnswer> => {
      const result = first ?? await read(metrics)
      if (result.ok) return { periods: result.value.periods as unknown as MetricsPeriod[], totals: result.value.totals as unknown as Record<string, unknown>, missing: [] }
      if (!failedOnItsSide(result)) return unwrapProvider(result, 'revenue read')
      if (metrics.length === 1) return { periods: [], totals: {}, missing: metrics }
      const half = Math.ceil(metrics.length / 2)
      return merged(...await Promise.all([answer(metrics.slice(0, half)), answer(metrics.slice(half))]) as [MetricsAnswer, MetricsAnswer])
    }
    // Every read settles before any refusal: none is left running.
    const [whole, usageReads, saveOffers] = await Promise.all([
      read(slugs),
      Promise.all(meters.map(([, meter]) => meterRead(meter.meterId!, window))),
      ctx.runQuery(components.backend.subscriptions.offerCounts, { since: window.first, until: window.last + DAY_MS }),
    ])
    const { periods, totals, missing } = await answer(slugs, whole)
    // Failing on every metric is the provider being down: refused as it came.
    if (missing.length === slugs.length) unwrapProvider(whole, 'revenue read')
    // A meter the provider fails on, on its side, is left out like a metric.
    const usage: MeterUsage[] = []
    meters.forEach(([meter], index) => {
      const usageRead = usageReads[index]!
      if (usageRead.ok) {
        const { quantities, total } = usageRead.value
        usage.push({ meter, total, periods: quantities.map(({ timestamp, quantity }) => ({ at: timestamp.getTime(), quantity })) })
      }
      else if (failedOnItsSide(usageRead)) missing.push(`meter:${meter}`)
      else unwrapProvider(usageRead, 'usage read')
    })
    if (missing.length > 0) logBackend('warn', 'billing.revenue_metrics_missing', `The billing provider failed on ${missing.length} revenue metrics or meters; they show empty.`, { metrics: missing })
    const totalsRecord = totals
    return {
      since: window.first,
      until: window.last + DAY_MS,
      interval: window.interval,
      totals: valuesOf(totalsRecord),
      periods: periods.map(period => ({ at: period.timestamp.getTime(), ...valuesOf(period as unknown as Record<string, unknown>) })),
      cancellations: {
        reasons: Object.fromEntries(REASONS.map(([reason, slug]) => [reason, valueOf(totalsRecord, sdkField(slug)) ?? 0])) as Record<CancellationReason, number>,
        saveOffers,
      },
      meters: usage,
    }
  }

  return { getRevenue }
}

export type BillingRevenue = ReturnType<typeof createRevenue>
