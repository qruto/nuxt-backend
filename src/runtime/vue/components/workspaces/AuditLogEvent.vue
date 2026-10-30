<script setup lang="ts">
import { computed } from 'vue'
import { formatBillingDate } from '../../composables/billing-format'
import { useLabels } from '../../composables/use-labels'
import type { AuditLogEventProps } from '../../parts'
import { describeAuditEvent, useAuditLabels } from './audit-log'

/** One entry of the activity trail: its time, its sentence, and what the sentence leaves out. */
defineOptions({ name: 'AuditLogEvent' })
const props = defineProps<AuditLogEventProps>()
const labels = useAuditLabels() ?? useLabels('audit')
const described = computed(() => describeAuditEvent(labels, props.event))
</script>

<template>
  <article data-audit="event">
    <time
      data-audit="event-time"
      :datetime="new Date(event.at).toISOString()"
    >{{ formatBillingDate(event.at, { dateStyle: 'medium', timeStyle: 'short' }, labels.locale.value) }}</time>
    <p data-audit="event-text">
      {{ described.text }}
    </p>
    <p
      v-if="described.details.length > 0"
      data-audit="event-details"
    >
      {{ described.details.join(' · ') }}
    </p>
  </article>
</template>
