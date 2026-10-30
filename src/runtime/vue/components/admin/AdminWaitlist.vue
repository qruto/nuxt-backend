<script setup lang="ts">
/**
 * The admin console's Waitlist tab: a count per status, the room a wave
 * has, the waiting people (the oldest first, narrowed by domain, source or
 * an answer), and what an administrator does with them: approve the ones
 * ticked or the next N, decline them, remove them as abuse, and keep a note
 * on an entry. Every change asks for a recent sign-in through the tab's
 * own `<ReauthenticateDialog>` and lands on the activity trail. The console
 * shows it once the app has `backend/waitlist.ts`.
 *
 * Internal: the console's tab, built on `useWaitlistAdmin`.
 *
 * @internal
 */
import AdminTabDialogs from './AdminTabDialogs.vue'
import AdminTabStatus from './AdminTabStatus.vue'
import { onMounted } from 'vue'
import AdminWaitlistActions from './AdminWaitlistActions.vue'
import AdminWaitlistFilter from './AdminWaitlistFilter.vue'
import AdminWaitlistSummary from './AdminWaitlistSummary.vue'
import AdminWaitlistTable from './AdminWaitlistTable.vue'
import { useWaitlistTab } from './admin-waitlist-tab'

const props = defineProps<{
  /** Ask before entries are declined or removed; resolves `true` to go ahead. Default: the tab's own confirmation dialog. */
  confirm?: (text: string) => boolean | Promise<boolean>
}>()

const tab = useWaitlistTab(() => props.confirm)
const { t, waitlist, data, message, entries } = tab

onMounted(() => void tab.loadCaps())
</script>

<template>
  <section
    data-admin="waitlist"
    :aria-busy="waitlist.isLoading.value || undefined"
  >
    <p
      v-if="waitlist.isRefused.value"
      data-admin="refused"
      role="status"
    >
      {{ t('waitlist.refused') }}
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
      <AdminWaitlistSummary
        :tab="tab"
        :data="data"
      />
      <AdminWaitlistFilter :tab="tab" />
      <AdminWaitlistActions :tab="tab" />
      <p
        v-if="!entries.length"
        data-admin="waitlist-empty"
        role="status"
      >
        {{ t('waitlist.noEntries') }}
      </p>
      <AdminWaitlistTable
        v-else
        :tab="tab"
      />
    </template>
    <AdminTabStatus
      v-else-if="waitlist.error.value || waitlist.isLoading.value"
      :error="waitlist.error.value"
    />
    <AdminTabDialogs :confirmation="tab.confirmation" />
  </section>
</template>
