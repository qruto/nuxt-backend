import { computed, useId } from 'vue'
import { COST_WINDOWS, type PersonCost, personName, useAiCosts } from '../../composables/use-ai-costs'
import { useLabels } from '../../composables/use-labels'

// The Costs tab's state, headless: `AdminCosts.vue` renders it. What each
// person's AI calls cost over a window of days, in total and per person,
// the costliest first, with the money and the counts in the reader's locale.

/**
 * The Costs tab, as state.
 *
 * @internal
 */
export function useCostsTab() {
  const costs = useAiCosts()
  const { t, errorMessage, locale } = useLabels('admin')
  const id = useId()

  const money = (usd: number) => new Intl.NumberFormat(locale.value, { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: usd > 0 && usd < 1 ? 4 : 2 }).format(usd)
  const count = (value: number) => new Intl.NumberFormat(locale.value).format(value)

  return {
    id,
    t,
    errorMessage,
    costs,
    data: computed(() => costs.costs.value ?? null),
    windows: COST_WINDOWS,
    money,
    count,
    /** Who a row names: the account, the visitors, or the id the row holds. */
    who: (person: PersonCost) => person.who === 'guest' ? t('costs.guest') : personName(person),
    tokens: (person: PersonCost) => t('costs.tokenCounts', { input: count(person.input), output: count(person.output) }),
  }
}
