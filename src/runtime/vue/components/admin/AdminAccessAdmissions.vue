<script setup lang="ts">
/**
 * The Access tab's invitations by address: the form that invites a pasted
 * list, and the newest invitations, each with Revoke while unused.
 *
 * Internal: a part of `AdminAccess.vue`.
 *
 * @internal
 */
import { computed } from 'vue'
import AdminAccessAdmit from './AdminAccessAdmit.vue'
import AdminAccessTable from './AdminAccessTable.vue'
import type { AccessTab } from './admin-access-tab'

const props = defineProps<{ tab: AccessTab }>()
const { id, t, date } = props.tab
const data = props.tab.data
const headers = computed(() => [t('access.emails'), t('access.label'), t('access.expiresAt'), t('access.status')])
const rows = computed(() => (data.value?.admissions ?? []).map(admission => ({
  id: admission.id,
  state: admission.usedAt === null ? 'waiting' : 'used',
  cells: [admission.email, admission.label ?? '', date(admission.expiresAt), admission.usedAt === null ? t('access.waiting') : t('access.used')],
  revocable: admission.usedAt === null,
  label: admission.email,
})))
</script>

<template>
  <section
    data-admin="access-admit"
    :aria-labelledby="`${id}-admit`"
  >
    <h2 :id="`${id}-admit`">
      {{ t('access.admitTitle') }}
    </h2>
    <p
      :id="`${id}-admit-hint`"
      data-admin="hint"
    >
      {{ t('access.admitHint') }}
    </p>
    <AdminAccessAdmit :tab="tab" />
    <h3>{{ t('access.admissionsTitle') }}</h3>
    <AdminAccessTable
      v-if="rows.length"
      :tab="tab"
      hook="access-admissions-table"
      :headers="headers"
      :rows="rows"
    />
    <p
      v-else
      data-admin="empty"
      role="status"
    >
      {{ t('access.noAdmissions') }}
    </p>
  </section>
</template>
