<script setup lang="ts">
/**
 * The decision on a reported thing or a notice on its own: the reason the
 * people who reported it and its author read, the ground (the terms or the
 * law), and hide, dismiss, or flag a suspected crime. Hide and dismiss wait
 * for a reason. A notice the app could not place hides nothing of the
 * app's: its first action reads "Mark handled", and its sender hears that
 * it was acted on.
 *
 * Internal: a part of `AdminReports.vue`.
 *
 * @internal
 */
import { computed } from 'vue'
import type { ReportsTab } from './admin-reports-tab'

const props = defineProps<{ tab: ReportsTab, target: { subject?: { table: string, id: string }, notice?: string } }>()
const { t } = props.tab
const form = computed(() => props.tab.draft(props.target))
const key = computed(() => props.tab.keyOf(props.target))
const fieldId = computed(() => `${props.tab.id}-${key.value.replace(/\W/g, '-')}`)
const ready = computed(() => form.value.reason.trim().length > 0)
</script>

<template>
  <form
    data-admin="reports-decision"
    @submit.prevent="tab.decide(target, 'hide')"
  >
    <label :for="`${fieldId}-reason`">{{ t('reports.reason') }}</label>
    <textarea
      :id="`${fieldId}-reason`"
      v-model="form.reason"
      rows="2"
      maxlength="2000"
      required
      :aria-describedby="`${fieldId}-hint`"
    />
    <p
      :id="`${fieldId}-hint`"
      data-admin="reports-hint"
    >
      {{ t('reports.reasonHint') }}
    </p>
    <label :for="`${fieldId}-ground`">{{ t('reports.ground') }}</label>
    <select
      :id="`${fieldId}-ground`"
      v-model="form.ground"
    >
      <option value="terms">
        {{ t('reports.grounds.terms') }}
      </option>
      <option value="illegal">
        {{ t('reports.grounds.illegal') }}
      </option>
    </select>
    <div data-admin="reports-actions">
      <button
        type="submit"
        data-admin="reports-hide"
        :aria-disabled="!ready || tab.busy(`hide:${key}`) || undefined"
      >
        {{ t(target.subject ? 'reports.hide' : 'reports.markHandled') }}
      </button>
      <button
        type="button"
        data-admin="reports-dismiss"
        :aria-disabled="!ready || tab.busy(`dismiss:${key}`) || undefined"
        @click="tab.decide(target, 'dismiss')"
      >
        {{ t('reports.dismiss') }}
      </button>
      <button
        type="button"
        data-admin="reports-flag"
        :aria-disabled="tab.busy(`flag:${key}`)"
        @click="tab.flag(target)"
      >
        {{ t('reports.flag') }}
      </button>
    </div>
  </form>
</template>
