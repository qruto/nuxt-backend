<script setup lang="ts">
/**
 * The Access tab's invite codes and access links: the form that makes one,
 * and the table of the newest, never the code itself, each with its uses,
 * expiry, status and Revoke.
 *
 * Internal: a part of `AdminAccess.vue`.
 *
 * @internal
 */
import { computed } from 'vue'
import AdminAccessCreate from './AdminAccessCreate.vue'
import AdminAccessTable from './AdminAccessTable.vue'
import type { AccessTab } from './admin-access-tab'

const props = defineProps<{ tab: AccessTab }>()
const { id, t, date, statusName } = props.tab
const data = props.tab.data
const headers = computed(() => [t('access.label'), t('access.kind'), t('access.maxUses'), t('access.expiresAt'), t('access.status')])
const rows = computed(() => (data.value?.invites ?? []).map(invite => ({
  id: invite.id,
  state: invite.status,
  cells: [invite.label, t(`access.kinds.${invite.kind}`), t('access.uses', { uses: invite.uses, maxUses: invite.maxUses }), date(invite.expiresAt), statusName(invite.status)],
  revocable: invite.status === 'valid',
  label: invite.label,
})))
</script>

<template>
  <section
    data-admin="access-invites"
    :aria-labelledby="`${id}-invites`"
  >
    <h2 :id="`${id}-invites`">
      {{ t('access.invitesTitle') }}
    </h2>
    <p data-admin="hint">
      {{ t('access.invitesHint') }}
    </p>
    <AdminAccessCreate :tab="tab" />
    <AdminAccessTable
      v-if="rows.length"
      :tab="tab"
      hook="access-invites-table"
      :headers="headers"
      :rows="rows"
    />
    <p
      v-else
      data-admin="empty"
      role="status"
    >
      {{ t('access.noInvites') }}
    </p>
  </section>
</template>
