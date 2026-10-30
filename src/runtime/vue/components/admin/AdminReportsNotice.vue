<script setup lang="ts">
/**
 * One notice from the public form: its reason and explanation, the link it
 * gave, who sent it (for their outcome email), the signature of an
 * intimate-image request, and on a notice on its own the 48-hour deadline
 * of an intimate-image request and the Art. 18 flag.
 *
 * Internal: a part of `AdminReports.vue`.
 *
 * @internal
 */
import type { ReportNotice } from '../../../../convex/integrations/reports'
import type { ReportsTab } from './admin-reports-tab'

const props = defineProps<{ tab: ReportsTab, notice: ReportNotice }>()
const { t } = props.tab
</script>

<template>
  <div
    data-admin="reports-notice"
    :data-state="notice.reason"
  >
    <p>
      <strong>{{ t(`reports.reasons.${notice.reason}`) }}</strong>
      · {{ tab.date(notice.createdAt) }}
    </p>
    <p v-if="notice.details">
      {{ notice.details }}
    </p>
    <p v-if="notice.url">
      {{ t('reports.link') }}: <a
        :href="notice.url"
        target="_blank"
        rel="noopener noreferrer nofollow"
      >{{ notice.url }}</a>
    </p>
    <p>{{ tab.notifierText(notice) }}</p>
    <p v-if="notice.signature">
      {{ t('reports.signedBy', { name: notice.signature }) }}
    </p>
    <p
      v-if="notice.deadline"
      data-admin="reports-deadline"
      :data-state="tab.overdue(notice.deadline) ? 'overdue' : 'due'"
      :role="tab.overdue(notice.deadline) ? 'alert' : undefined"
    >
      {{ t(tab.overdue(notice.deadline) ? 'reports.overdue' : 'reports.deadline', { date: tab.date(notice.deadline) }) }}
    </p>
    <p
      v-if="notice.crime"
      data-admin="reports-crime"
    >
      {{ t('reports.crime', { date: tab.date(notice.crime.at) }) }}
    </p>
  </div>
</template>
