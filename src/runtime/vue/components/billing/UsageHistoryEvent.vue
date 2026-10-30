<script setup lang="ts">
import { formatBillingDate } from '../../composables/billing-format'
import { useLabels } from '../../composables/use-labels'
import type { UsageHistoryEventProps } from '../../parts'
import { useUsageLabels } from './usage-history'

/** One metered event of `<UsageHistory>`: its time, its name, and the units the meter priced it at. */
defineOptions({ name: 'UsageHistoryEvent' })
defineProps<UsageHistoryEventProps>()
const { t, locale } = useUsageLabels() ?? useLabels('usage')
</script>

<template>
  <article data-usage="event">
    <span data-usage="event-time">{{ formatBillingDate(event.timestamp, { dateStyle: 'medium', timeStyle: 'short' }, locale) }}</span>
    <span data-usage="event-name">{{ event.name }}</span>
    <!-- Units are resolved server-side from the meter's value property; an event the meter does not price shows no amount. -->
    <span
      v-if="typeof event.units === 'number'"
      data-usage="event-units"
    >{{ t('units', { count: event.units }) }}</span>
  </article>
</template>
