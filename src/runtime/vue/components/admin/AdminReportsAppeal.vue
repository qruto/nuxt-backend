<script setup lang="ts">
/**
 * One open appeal: what was decided and why, what the author wrote, and
 * keep or reverse with a reason the author reads. Reversing a decision that
 * hid content shows it again through the app's `reports.restore`.
 *
 * Internal: a part of `AdminReports.vue`.
 *
 * @internal
 */
import { computed } from 'vue'
import type { ReportAppeal } from '../../../../convex/integrations/reports'
import type { ReportsTab } from './admin-reports-tab'

const props = defineProps<{ tab: ReportsTab, appeal: ReportAppeal }>()
const { t } = props.tab
const form = computed(() => props.tab.draft({ notice: `appeal:${props.appeal.id}` }))
const fieldId = computed(() => `${props.tab.id}-appeal-${props.appeal.id.replace(/\W/g, '-')}`)
const ready = computed(() => form.value.reason.trim().length > 0)
</script>

<template>
  <article data-admin="reports-item">
    <h3 data-admin="reports-title">
      {{ t('reports.appealOf', { title: appeal.described?.title ?? t('reports.gone') }) }}
    </h3>
    <p data-admin="reports-meta">
      {{ tab.date(appeal.decision.at) }} · {{ appeal.decision.reason }}
    </p>
    <blockquote data-admin="reports-appeal-text">
      <p>{{ t('reports.appealText') }}: {{ appeal.text }}</p>
    </blockquote>
    <form
      data-admin="reports-decision"
      @submit.prevent="tab.judgeAppeal(appeal.id, 'uphold')"
    >
      <label :for="`${fieldId}-reason`">{{ t('reports.reason') }}</label>
      <textarea
        :id="`${fieldId}-reason`"
        v-model="form.reason"
        rows="2"
        maxlength="2000"
        required
      />
      <div data-admin="reports-actions">
        <button
          type="submit"
          data-admin="reports-uphold"
          :aria-disabled="!ready || tab.busy(`uphold:${appeal.id}`) || undefined"
        >
          {{ t('reports.uphold') }}
        </button>
        <button
          type="button"
          data-admin="reports-reverse"
          :aria-disabled="!ready || tab.busy(`reverse:${appeal.id}`) || undefined"
          @click="tab.judgeAppeal(appeal.id, 'reverse')"
        >
          {{ t('reports.reverse') }}
        </button>
      </div>
    </form>
  </article>
</template>
