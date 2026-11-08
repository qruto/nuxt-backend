<script setup lang="ts">
/**
 * The Access tab's member tickets (`access.memberTickets`): the ones that
 * end last, never the token, each with its member, uses, end, status and
 * Revoke while it may still admit someone. Shows once a member asked for one.
 *
 * Internal: a part of `AdminAccess.vue`.
 *
 * @internal
 */
import { computed } from 'vue'
import AdminAccessTable from './AdminAccessTable.vue'
import type { AccessTab } from './admin-access-tab'

const props = defineProps<{ tab: AccessTab }>()
const { id, t, date, statusName } = props.tab
const data = props.tab.data
const headers = computed(() => [t('access.member'), t('access.maxUses'), t('access.expiresAt'), t('access.status')])
const rows = computed(() => (data.value?.memberTickets ?? []).map((ticket) => {
  const member = ticket.email ?? ticket.holder
  return {
    id: ticket.id,
    state: ticket.status,
    cells: [member, t('access.uses', { uses: ticket.uses, maxUses: ticket.maxUses }), date(ticket.expiresAt), statusName(ticket.status)],
    // A used-up ticket admits nobody, but revoking it still keeps its member from a new one until it ends.
    revocable: ticket.status === 'valid' || ticket.status === 'used-up',
    label: member,
  }
}))
</script>

<template>
  <section
    v-if="rows.length"
    data-admin="access-member-tickets"
    :aria-labelledby="`${id}-member-tickets`"
  >
    <h2 :id="`${id}-member-tickets`">
      {{ t('access.memberTicketsTitle') }}
    </h2>
    <p data-admin="hint">
      {{ t('access.memberTicketsHint') }}
    </p>
    <AdminAccessTable
      :tab="tab"
      hook="access-member-tickets-table"
      :headers="headers"
      :rows="rows"
    />
  </section>
</template>
