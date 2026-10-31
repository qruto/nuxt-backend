import { inject, provide, type InjectionKey } from 'vue'
import type { UsageEvent } from '../../composables/use-billing'
import type { UseLabelsReturn } from '../../composables/use-labels'
import type { UseUsageReturn } from '../../composables/use-usage'

export interface UsageHistorySlotContext {
  usage: UseUsageReturn
  /** The page of events in view (empty while loading or when there are none). */
  items: UsageEvent[]
  isLoading: boolean
  error: string | null
}

/** `<UsageHistory>`'s slots, one per region; each receives {@link UsageHistorySlotContext}. */
export interface UsageHistorySlots {
  /** Above the list: replaces the heading. */
  header: (context: UsageHistorySlotContext) => unknown
  /** While the first page loads. */
  loading: (context: UsageHistorySlotContext) => unknown
  /** When nothing has been metered. */
  empty: (context: UsageHistorySlotContext) => unknown
  /** One metered event, with the event it renders. */
  event: (context: UsageHistorySlotContext & { event: UsageEvent }) => unknown
  /** The newer and older buttons. */
  pager: (context: UsageHistorySlotContext) => unknown
  /** Why the usage could not be read. */
  error: (context: UsageHistorySlotContext) => unknown
  /** Below everything. */
  footer: (context: UsageHistorySlotContext) => unknown
}

const USAGE_LABELS: InjectionKey<UseLabelsReturn<'usage'>> = Symbol('nuxt-backend:usage')

/** @internal */
export function provideUsageLabels(labels: UseLabelsReturn<'usage'>): void {
  provide(USAGE_LABELS, labels)
}

/** The labels of the `<UsageHistory>` around a part, else `null`. @internal */
export function useUsageLabels(): UseLabelsReturn<'usage'> | null {
  return inject(USAGE_LABELS, null)
}
