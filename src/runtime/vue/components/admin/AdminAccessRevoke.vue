<script setup lang="ts">
/**
 * Revoke one code, link or invitation by address in the Access tab, after
 * the tab's confirm; busy while it runs.
 *
 * Internal: a part of `AdminAccess.vue`.
 *
 * @internal
 */
import type { AccessTab } from './admin-access-tab'

const props = defineProps<{ tab: AccessTab, target: { id: string, label: string } }>()
const { t, busy, running, revoke } = props.tab
</script>

<template>
  <button
    type="button"
    data-admin="access-revoke"
    :aria-disabled="busy(`revoke:${target.id}`)"
    @click="revoke(target)"
  >
    {{ running === `revoke:${target.id}` ? t('access.revoking') : t('access.revoke') }}
  </button>
</template>
