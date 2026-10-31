<script setup lang="ts">
import { computed } from 'vue'
import { useLabels, type BackendLabels, type LabelOverrides } from '../../composables/use-labels'
import { useUsage } from '../../composables/use-usage'
import { usePageTurns } from '../../utils/page-turns'
import { VNodes } from '../../utils/vnodes'
import PagedList from '../shell/PagedList.vue'
import { provideUsageLabels, type UsageHistorySlotContext, type UsageHistorySlots } from './usage-history'

/**
 * Metered consumption, event by event, straight from the provider's events
 * API — the same records that drew the credit balance down. Nothing is
 * mirrored locally, so this cannot disagree with what the customer is billed.
 *
 * `data-usage` attributes for styling, each event a `UsageHistoryEvent`
 * part, a slot for every region (each receives {@link UsageHistorySlotContext}),
 * and its copy from the `usage` labels. Renders its empty state — never an
 * error — when billing is unconfigured or the visitor is signed out.
 *
 * @example
 * ```vue
 * <UsageHistory meter="credits" :limit="20" />
 * ```
 */
defineOptions({ name: 'UsageHistory' })

const props = withDefaults(defineProps<{
  /** Credit-meter name (or raw meter id). Omit for every metered event. */
  meter?: string
  title?: string
  /** Events per page. Default: the provider's own page size. */
  limit?: number
  /** Copy for this component, over `appConfig.backend.labels.usage` and the translations. */
  labels?: LabelOverrides<BackendLabels['usage']>
}>(), { meter: undefined, title: undefined, limit: undefined, labels: undefined })
defineEmits({})
const slots = defineSlots<UsageHistorySlots>()

const usage = useUsage({ meter: () => props.meter, limit: () => props.limit })
const labels = useLabels('usage', () => props.labels)
const { t, errorMessage } = labels
provideUsageLabels(labels)
const items = computed(() => usage.events.value ?? [])
const context = computed<UsageHistorySlotContext>(() => ({
  usage,
  items: items.value,
  isLoading: usage.isLoading.value,
  error: usage.error.value ? errorMessage(usage.error.value) : null,
}))
const pages = usePageTurns(usage, 'usage')
// Busy while a page loads; the loading and empty notes are polite statuses, the failure an alert.
const busy = computed(() => usage.isLoading.value || pages.turning.value !== null)
const firstLoad = computed(() => usage.isLoading.value && usage.events.value === undefined)
const empty = computed(() => !firstLoad.value && items.value.length === 0 && usage.events.value !== undefined && !usage.error.value)
const heading = computed(() => props.title ?? t('title'))
</script>

<template>
  <div
    data-usage="root"
    :aria-busy="busy ? 'true' : undefined"
  >
    <slot
      name="header"
      v-bind="context"
    >
      <h2
        v-if="heading"
        data-usage="header"
      >
        {{ heading }}
      </h2>
    </slot>
    <PagedList
      :family="'usage'"
      :slots="slots"
      :context="context"
      :items="items"
      :first-load="firstLoad"
      :empty="empty"
      :error="usage.error.value ? errorMessage(usage.error.value) : null"
      :status="pages.turning.value ? t('pageLoading') : ''"
      :pages="pages"
      :words="{ loading: t('loading'), empty: t('empty'), newer: t('newer'), older: t('older'), pageLoading: t('pageLoading') }"
    >
      <template #item="{ item }">
        <VNodes
          v-if="slots.event"
          :nodes="slots.event({ ...context, event: item }) as never"
        />
        <UsageHistoryEvent
          v-else
          :event="item"
        />
      </template>
    </PagedList>
  </div>
</template>
