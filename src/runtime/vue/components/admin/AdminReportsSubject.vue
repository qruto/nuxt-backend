<script setup lang="ts">
/**
 * One reported thing: its title and link (or that it is gone), its author
 * with a link that opens their account in the Users tab, how many reports are open and why, the
 * 48-hour deadline of an intimate-image request, the Art. 18 flag, the
 * notices with their notifiers, and the decision form.
 *
 * Internal: a part of `AdminReports.vue`.
 *
 * @internal
 */
import type { ReportedSubject } from '../../../../convex/integrations/reports'
import AdminReportsDecision from './AdminReportsDecision.vue'
import AdminReportsNotice from './AdminReportsNotice.vue'
import type { ReportsTab } from './admin-reports-tab'

const props = defineProps<{ tab: ReportsTab, subject: ReportedSubject }>()
const { t } = props.tab
</script>

<template>
  <article
    data-admin="reports-item"
    :data-state="subject.deadline !== null ? 'intimate' : 'open'"
  >
    <h3 data-admin="reports-title">
      <a
        v-if="subject.described?.url"
        :href="subject.described.url"
        target="_blank"
        rel="noopener"
      >{{ subject.described.title }}</a>
      <template v-else-if="subject.described">
        {{ subject.described.title }}
      </template>
      <template v-else>
        {{ t('reports.gone') }}
      </template>
    </h3>
    <p data-admin="reports-meta">
      <span>{{ subject.subject.table }}</span>
      <span>{{ t('reports.open', { count: subject.open }) }}</span>
      <span>{{ tab.reasonsText(subject) }}</span>
    </p>
    <p
      v-if="subject.author"
      data-admin="reports-author"
    >
      {{ t('reports.author', { email: subject.author.email ?? subject.author.id }) }}
      <a :href="`?tab=users&user=${encodeURIComponent(subject.author.id)}`">{{ t('reports.openAuthor') }}</a>
    </p>
    <p
      v-if="subject.deadline !== null"
      data-admin="reports-deadline"
      :data-state="tab.overdue(subject.deadline) ? 'overdue' : 'due'"
      :role="tab.overdue(subject.deadline) ? 'alert' : undefined"
    >
      {{ t(tab.overdue(subject.deadline) ? 'reports.overdue' : 'reports.deadline', { date: tab.date(subject.deadline) }) }}
    </p>
    <p
      v-if="subject.crime"
      data-admin="reports-crime"
    >
      {{ t('reports.crime', { date: tab.date(subject.crime.at) }) }}
    </p>
    <ul
      v-if="subject.notices.length"
      data-admin="reports-notices"
      :aria-label="t('reports.notices')"
    >
      <li
        v-for="notice in subject.notices"
        :key="notice.id"
      >
        <AdminReportsNotice
          :tab="tab"
          :notice="notice"
        />
      </li>
    </ul>
    <AdminReportsDecision
      :tab="tab"
      :target="{ subject: subject.subject }"
    />
  </article>
</template>
