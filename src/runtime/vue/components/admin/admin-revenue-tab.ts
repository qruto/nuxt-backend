import { computed, useId } from 'vue'
import { REVENUE_INTERVALS, type RevenueMetric, type RevenueReport } from '../../../../convex/integrations/billing/types/revenue'
import { REVENUE_WINDOWS, useRevenue } from '../../composables/use-revenue'
import { useLabels } from '../../composables/use-labels'

// The Revenue view's state, headless: `AdminRevenue.vue` renders it. The
// billing provider's metrics over a window, as figures, series for the
// charts, cancellations per reason and usage per meter, with money, counts
// and rates in the reader's locale.

/** One point of a chart: when its period starts, its value, and the value in words. */
export interface ChartPoint {
  at: number
  value: number
  label: string
}

/** One chart's series: its points, the largest value (the bars' scale), and its total in words. */
export interface ChartSeries {
  points: ChartPoint[]
  max: number
  total: string
}

/** The cancel flow's eight reasons, in the order the view lists them. */
const REASONS = ['too_expensive', 'missing_features', 'switched_service', 'unused', 'customer_service', 'low_quality', 'too_complex', 'other'] as const

/**
 * The Revenue view, as state.
 *
 * @internal
 */
export function useRevenueTab() {
  const revenue = useRevenue()
  const { t, errorMessage, locale, lookup } = useLabels('admin')
  const id = useId()
  const report = computed(() => revenue.report.value ?? null)

  // Amounts arrive in cents: shown in dollars, with the cents a small amount needs.
  const money = (cents: number | null) => cents === null ? '—' : new Intl.NumberFormat(locale.value, { style: 'currency', currency: 'USD', maximumFractionDigits: Math.abs(cents) < 100 && cents !== 0 ? 4 : 2 }).format(cents / 100)
  const count = (value: number | null) => value === null ? '—' : new Intl.NumberFormat(locale.value).format(value)
  const rate = (value: number | null) => value === null ? '—' : new Intl.NumberFormat(locale.value, { style: 'percent', maximumFractionDigits: 1 }).format(value)
  const day = (at: number) => new Intl.DateTimeFormat(locale.value, revenue.interval.value === 'month' ? { month: 'short', year: 'numeric', timeZone: 'UTC' } : { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(at)

  /** A metric's points over the periods, formatted as `format` says. */
  const series = (data: RevenueReport, metric: RevenueMetric, format: (value: number | null) => string): ChartSeries => {
    const points = data.periods.map(period => ({ at: period.at, value: period[metric] ?? 0, label: t('revenue.point', { at: day(period.at), value: format(period[metric]) }) }))
    return { points, max: Math.max(0, ...points.map(point => point.value)), total: t('revenue.total', { value: format(data.totals[metric]) }) }
  }

  const charts = computed(() => {
    const data = report.value
    if (!data) return null
    return {
      revenue: series(data, 'revenue', money),
      newSubscriptions: series(data, 'newSubscriptions', count),
      renewedSubscriptions: series(data, 'renewedSubscriptions', count),
      churnedSubscriptions: series(data, 'churnedSubscriptions', count),
      checkouts: series(data, 'checkouts', count),
      succeededCheckouts: series(data, 'succeededCheckouts', count),
    }
  })

  /** The figures over the window, each with its words. */
  const figures = computed(() => {
    const totals = report.value?.totals
    if (!totals) return []
    return [
      { key: 'mrr', label: t('revenue.mrr'), value: money(totals.monthlyRecurringRevenue) },
      { key: 'arr', label: t('revenue.arr'), value: money(totals.annualRecurringRevenue) },
      { key: 'revenue', label: t('revenue.revenue'), value: money(totals.revenue) },
      { key: 'active', label: t('revenue.activeSubscriptions'), value: count(totals.activeSubscriptions) },
      { key: 'churn', label: t('revenue.churnRate'), value: rate(totals.churnRate) },
      { key: 'ltv', label: t('revenue.lifetimeValue'), value: money(totals.lifetimeValue) },
    ]
  })

  /** Cancellations per reason, the reason in the cancel flow's words; the bars' scale is the largest. */
  const reasons = computed(() => {
    const counts = report.value?.cancellations.reasons
    if (!counts) return null
    const rows = REASONS.map(reason => ({ reason, label: lookup(`cancelFlow.reasons.${reason}`) ?? reason, value: counts[reason], text: count(counts[reason]) }))
    return { rows, max: Math.max(0, ...rows.map(row => row.value)) }
  })

  /** Each catalog meter's usage, as a chart of its own. */
  const meters = computed(() => (report.value?.meters ?? []).map((meter) => {
    const points = meter.periods.map(period => ({ at: period.at, value: period.quantity, label: t('revenue.point', { at: day(period.at), value: count(period.quantity) }) }))
    return { meter: meter.meter, series: { points, max: Math.max(0, ...points.map(point => point.value)), total: t('revenue.meterTotal', { total: count(meter.total) }) } }
  }))

  /** Costs and margin, once a usage event carried a cost; `null` until then. */
  const costs = computed(() => {
    const totals = report.value?.totals
    if (!totals || !totals.costs) return null
    return [
      { key: 'costs', label: t('revenue.cost'), value: money(totals.costs) },
      { key: 'costPerUser', label: t('revenue.costPerUser'), value: money(totals.costPerUser) },
      { key: 'grossMargin', label: t('revenue.grossMargin'), value: `${money(totals.grossMargin)} (${rate(totals.grossMarginPercentage)})` },
    ]
  })

  return {
    id,
    t,
    errorMessage,
    revenue,
    report,
    windows: REVENUE_WINDOWS,
    intervals: REVENUE_INTERVALS,
    figures,
    charts,
    reasons,
    meters,
    costs,
    conversion: computed(() => t('revenue.conversion', { rate: rate(report.value?.totals.checkoutsConversion ?? null) })),
    saveOffers: computed(() => {
      const offers = report.value?.cancellations.saveOffers
      return offers ? t('revenue.saveOffers', { accepted: count(offers.accepted), made: count(offers.made) }) : ''
    }),
  }
}
