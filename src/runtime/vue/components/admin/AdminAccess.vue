<script setup lang="ts">
/**
 * The admin console's Access tab: the launch phase and the move to another,
 * the invite codes and access links (made here, each shown once, revoked
 * here), and the invitations by address (pasted, no email sent). Every
 * change asks for a recent sign-in through the tab's own
 * `<ReauthenticateDialog>` and lands on the activity trail. Moving the
 * phase and revoking ask first (`confirm`). The console shows it once the
 * app has `backend/access.ts`.
 *
 * Internal: the console's tab, built on `useAccessAdmin`.
 *
 * @internal
 */
import AdminTabDialogs from './AdminTabDialogs.vue'
import AdminTabStatus from './AdminTabStatus.vue'
import AdminAccessAdmissions from './AdminAccessAdmissions.vue'
import AdminAccessInvites from './AdminAccessInvites.vue'
import AdminAccessPhase from './AdminAccessPhase.vue'
import { useAccessTab } from './admin-access-tab'

const props = defineProps<{
  /** Ask before the phase moves or something is revoked; resolves `true` to go ahead. Default: the tab's own confirmation dialog. */
  confirm?: (text: string) => boolean | Promise<boolean>
}>()

const tab = useAccessTab(() => props.confirm)
const { t, access, data, message } = tab
</script>

<template>
  <section
    data-admin="access"
    :aria-busy="access.isLoading.value || undefined"
  >
    <p
      v-if="access.isRefused.value"
      data-admin="refused"
      role="status"
    >
      {{ t('access.refused') }}
    </p>
    <template v-else-if="data">
      <p
        v-if="message"
        data-admin="message"
        :data-state="message.ok ? 'ok' : 'error'"
        :role="message.ok ? 'status' : 'alert'"
      >
        {{ message.text }}
      </p>
      <AdminAccessPhase :tab="tab" />
      <AdminAccessInvites :tab="tab" />
      <AdminAccessAdmissions :tab="tab" />
    </template>
    <AdminTabStatus
      v-else-if="access.error.value || access.isLoading.value"
      :error="access.error.value"
    />
    <AdminTabDialogs :confirmation="tab.confirmation" />
  </section>
</template>
