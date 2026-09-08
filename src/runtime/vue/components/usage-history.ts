import { computed, defineComponent, h, type PropType, type VNodeChild } from 'vue'
import { toBillingDate, type UsageEvent } from '../composables/use-billing'
import { useBackendConfig } from '../composables/use-backend-config'
import { useUsage, type UseUsageReturn } from '../composables/use-usage'

export interface UsageHistorySlotContext {
  usage: UseUsageReturn
  /** The page of events in view (empty while loading or when there are none). */
  items: UsageEvent[]
  isLoading: boolean
  error: string | null
}

/** A timestamp the way the visitor writes them; the raw string if it will not parse. */
function formatTimestamp(value: unknown): string {
  const date = toBillingDate(value)
  if (!date) return typeof value === 'string' ? value : ''
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
  }
  catch {
    return date.toISOString()
  }
}

/**
 * Metered consumption, event by event, straight from the provider's events
 * API — the same records that drew the credit balance down. Nothing is
 * mirrored locally, so this cannot disagree with what the customer is billed.
 *
 * Headless like `<PricingTable>`: `data-usage` attributes for styling, a slot
 * for every region (each receives {@link UsageHistorySlotContext}), and no
 * copy that cannot be replaced through `appConfig.backend.labels.usage`.
 *
 * Renders its empty state — never an error — when billing is unconfigured or
 * the visitor is signed out.
 *
 * @example
 * ```vue
 * <UsageHistory meter="credits" :limit="20" />
 * ```
 */
export const UsageHistory = defineComponent({
  name: 'UsageHistory',
  props: {
    /** Credit-meter name (or raw meter id). Omit for every metered event. */
    meter: { type: String as PropType<string | undefined>, default: undefined },
    title: { type: String, default: undefined },
    /** Events per page. Default: the provider's own page size. */
    limit: { type: Number as PropType<number | undefined>, default: undefined },
  },
  setup(props, { slots }) {
    const usage = useUsage({ meter: () => props.meter, limit: () => props.limit })
    const config = useBackendConfig()
    const labels = { ...config.labels.usage }

    const items = computed(() => usage.events.value ?? [])
    const context = (): UsageHistorySlotContext => ({
      usage,
      items: items.value,
      isLoading: usage.isLoading.value,
      error: usage.error.value,
    })

    const unitsText = (units: number): string =>
      (labels.units ?? '{units} credits').replace('{units}', String(units))

    const eventRow = (event: UsageEvent): VNodeChild => {
      if (slots.event) return slots.event({ ...context(), event })
      return h('article', { 'data-usage': 'event', 'key': event.id }, [
        h('span', { 'data-usage': 'event-time' }, formatTimestamp(event.timestamp)),
        h('span', { 'data-usage': 'event-name' }, event.name),
        // Units are resolved server-side from the meter's value property; an
        // event the meter does not price simply shows no amount.
        typeof event.units === 'number'
          ? h('span', { 'data-usage': 'event-units' }, unitsText(event.units))
          : null,
      ])
    }

    const pager = (): VNodeChild => {
      if (slots.pager) return slots.pager(context())
      if (!usage.hasMore.value && !usage.hasPrevious.value) return null
      return h('div', { 'data-usage': 'pager' }, [
        h('button', {
          'data-usage': 'newer',
          'type': 'button',
          'disabled': !usage.hasPrevious.value || usage.isLoading.value,
          'onClick': () => usage.previous(),
        }, labels.newer ?? 'Newer'),
        h('button', {
          'data-usage': 'older',
          'type': 'button',
          'disabled': !usage.hasMore.value || usage.isLoading.value,
          'onClick': () => usage.next(),
        }, labels.older ?? 'Older'),
      ])
    }

    return () => {
      const ctx = context()
      const title = props.title ?? labels.title
      const loadingFirstPage = usage.isLoading.value && usage.events.value === undefined
      return h('div', { 'data-usage': 'root' }, [
        slots.header?.(ctx) ?? (title ? h('h2', { 'data-usage': 'header' }, title) : null),
        loadingFirstPage
          ? slots.loading?.(ctx) ?? h('p', { 'data-usage': 'loading' }, labels.loading ?? 'Loading…')
          : items.value.length === 0
            ? slots.empty?.(ctx) ?? h('p', { 'data-usage': 'empty' }, labels.empty ?? 'No usage recorded yet.')
            : h('div', { 'data-usage': 'list' }, items.value.map(eventRow)),
        pager(),
        usage.error.value
          ? slots.error?.(ctx) ?? h('p', { 'data-usage': 'error', 'role': 'alert' }, usage.error.value)
          : null,
        slots.footer?.(ctx) ?? null,
      ])
    }
  },
})
