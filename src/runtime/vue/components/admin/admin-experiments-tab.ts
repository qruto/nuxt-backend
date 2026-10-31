import { computed, ref } from 'vue'
import { EXPERIMENT_MIN_EXPOSURES, type RateInterval } from '../../../../convex/funnel-rules'
import { type ExperimentResult, useExperimentResults } from '../../composables/use-experiment'
import { useLabels } from '../../composables/use-labels'
import { useReauthentication } from '../../composables/use-reauthentication'

// The Experiments view's state, headless: `AdminExperiments.vue` renders
// it. Each experiment with its status, how long it has run, its variants'
// exposures, goal rates with their intervals and guardrails, what the
// results say, and picking a winner, with counts and rates in the reader's
// locale.

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * The Experiments view, as state.
 *
 * @internal
 */
export function useExperimentsTab() {
  const results = useExperimentResults()
  const { t, errorMessage, locale } = useLabels('admin')
  const { withReauthentication } = useReauthentication()
  // The experiment and variant being saved, and why the last pick failed.
  const picking = ref<string | null>(null)
  const failure = ref<unknown>(null)

  const count = (value: number) => new Intl.NumberFormat(locale.value).format(value)
  const percent = (value: number) => new Intl.NumberFormat(locale.value, { style: 'percent', maximumFractionDigits: 1 }).format(value)
  const interval = (value: RateInterval) => t('experiments.interval', { rate: percent(value.rate), low: percent(value.low), high: percent(value.high) })
  const date = (at: number) => new Intl.DateTimeFormat(locale.value, { day: 'numeric', month: 'short', year: 'numeric' }).format(at)

  /** Its status in words: running, stopped, or showing its winner to everyone. */
  const status = (experiment: ExperimentResult) => experiment.winner
    ? t('experiments.decided', { variant: experiment.winner })
    : experiment.running ? t('experiments.running') : t('experiments.stopped')

  /** How long it has run, from its first exposure to now: days and full weeks. */
  const started = (experiment: ExperimentResult) => {
    if (experiment.startedAt === null) return t('experiments.notStarted')
    const days = Math.max(0, Math.floor((Date.now() - experiment.startedAt) / DAY_MS))
    return t('experiments.started', { date: date(experiment.startedAt), days: count(days), weeks: count(Math.floor(days / 7)) })
  }

  /** What the results say, in words. */
  const verdict = (experiment: ExperimentResult) => experiment.verdict.kind === 'leading'
    ? t('experiments.verdict.leading', { variant: experiment.verdict.leader })
    : experiment.verdict.kind === 'too_few'
      ? t('experiments.verdict.too_few', { count: count(EXPERIMENT_MIN_EXPOSURES) })
      : t('experiments.verdict.no_difference')

  const experiments = computed(() => (results.experiments.value ?? []).map(experiment => ({
    ...experiment,
    status: status(experiment),
    started: started(experiment),
    verdictText: verdict(experiment),
    rows: experiment.variants.map((variant, index) => ({
      ...variant,
      label: index === 0 ? t('experiments.control', { variant: variant.name }) : variant.name,
      shareText: percent(variant.share),
      exposedText: count(variant.exposed),
      convertedText: variant.goal ? count(variant.goal.count) : '—',
      rateText: variant.goal ? interval(variant.goal) : '—',
      guardrailCells: variant.guardrails.map(rail => ({ kind: rail.kind, worse: rail.worse, text: interval(rail) })),
    })),
  })))

  /** Show one variant to everyone, or run the experiment again with `null`. */
  async function pick(experiment: ExperimentResult, variant: string | null): Promise<void> {
    if (picking.value) return
    picking.value = `${experiment.key}:${variant}`
    failure.value = null
    try {
      await withReauthentication(() => results.pick(experiment, variant))
    }
    catch (error) {
      failure.value = error
    }
    finally {
      picking.value = null
    }
  }

  return {
    t,
    errorMessage,
    results,
    experiments,
    picking,
    failure,
    pick,
  }
}
