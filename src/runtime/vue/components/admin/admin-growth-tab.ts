import { computed, ref, useId } from 'vue'
import { FUNNEL_DIMENSIONS, FUNNEL_DIRECT, FUNNEL_OTHER, FUNNEL_STEPS, type FunnelDimension, PERSON_STEPS } from '../../../../convex/funnel-rules'
import { FUNNEL_WINDOWS, useFunnel } from '../../composables/use-funnel'
import { useLabels } from '../../composables/use-labels'

// The Growth view's state, headless: `AdminGrowth.vue` renders it. The
// funnel's steps with each one's share of the step before, one dimension's
// breakdown at a time, the "Other" answers and each sign-up week's
// retention, with counts, rates and weeks in the reader's locale.

/**
 * The Growth view, as state.
 *
 * @internal
 */
export function useGrowthTab() {
  const funnel = useFunnel()
  const { t, errorMessage, locale } = useLabels('admin')
  const id = useId()
  const report = computed(() => funnel.report.value ?? null)
  const dimension = ref<FunnelDimension>('campaign')

  const count = (value: number) => new Intl.NumberFormat(locale.value).format(value)
  const rate = (part: number, whole: number) => new Intl.NumberFormat(locale.value, { style: 'percent', maximumFractionDigits: 1 }).format(whole > 0 ? part / whole : 0)
  const week = (at: number) => new Intl.DateTimeFormat(locale.value, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(at)

  /** Each step with its count and its share of the step before; the bars' scale is the largest. */
  const steps = computed(() => {
    const data = report.value
    if (!data) return null
    const rows = FUNNEL_STEPS.map((step, index) => {
      const before = index > 0 ? data[FUNNEL_STEPS[index - 1]!] : null
      return {
        step,
        label: t(`growth.step.${step}`),
        value: data[step],
        text: count(data[step]),
        // The share of the step before, where the step before counted anyone.
        ofPrevious: before ? t('growth.ofPrevious', { rate: rate(data[step], before) }) : null,
      }
    })
    return { rows, max: Math.max(0, ...rows.map(row => row.value)) }
  })

  /** A value as the reader reads it: "Direct or unknown", "Everything else", a referrer's name with the code, or the value. */
  const valueLabel = (value: string, label?: string) => value === FUNNEL_DIRECT ? t('growth.direct') : value === FUNNEL_OTHER ? t('growth.other') : label ? `${label} (${value})` : value

  /** The chosen dimension's rows: each value with its people per person step. */
  const breakdown = computed(() => (report.value?.breakdowns[dimension.value] ?? []).map(row => ({
    value: row.value,
    label: valueLabel(row.value, row.label),
    cells: PERSON_STEPS.map(step => ({ step, text: count(row.counts[step]) })),
  })))

  /** Each sign-up week with its size and the share of it active in each week after. */
  const cohorts = computed(() => (report.value?.cohorts ?? []).map(cohort => ({
    week: cohort.week,
    label: week(cohort.week),
    size: count(cohort.size),
    cells: cohort.active.map((active, offset) => ({ offset, value: cohort.size > 0 ? active / cohort.size : 0, text: t('growth.retained', { rate: rate(active, cohort.size), count: count(active) }) })),
  })))

  return {
    id,
    t,
    errorMessage,
    funnel,
    report,
    windows: FUNNEL_WINDOWS,
    dimensions: FUNNEL_DIMENSIONS,
    personSteps: PERSON_STEPS,
    dimension,
    steps,
    breakdown,
    cohorts,
    weeksAfter: computed(() => Array.from({ length: report.value?.weeks ?? 0 }, (_, offset) => offset)),
    isEmpty: computed(() => report.value !== null && report.value.signup === 0 && report.value.waitlist === 0),
  }
}
