<script setup lang="ts">
/**
 * The admin console's Announcements tab: a composer that publishes a
 * notice every signed-in person sees in `<BackendNotices>` until it
 * expires or they dismiss it, with an optional email to the people who
 * opted into a topic (or the waitlist's launch-news list); and the list of
 * what was published, where a notice is ended early and its email
 * previewed, sent once (now or scheduled) or cancelled. Every change asks
 * for a recent sign-in through the tab's own `<ReauthenticateDialog>` and
 * lands on the activity trail. The console shows it once the app has
 * `backend/email.ts`.
 *
 * Internal: the console's tab, built on `useAnnouncementsAdmin`.
 *
 * @internal
 */
import AdminTabDialogs from './AdminTabDialogs.vue'
import AdminTabStatus from './AdminTabStatus.vue'
import AdminAnnouncementsCompose from './AdminAnnouncementsCompose.vue'
import AdminAnnouncementsItem from './AdminAnnouncementsItem.vue'
import { useAnnouncementsTab } from './admin-announcements-tab'

const props = defineProps<{
  /** Ask before a notice is ended or an email sent; resolves `true` to go ahead. Default: the tab's own confirmation dialog. */
  confirm?: (text: string) => boolean | Promise<boolean>
}>()

const tab = useAnnouncementsTab(() => props.confirm)
const { t, admin, data, message, id } = tab
</script>

<template>
  <section
    data-admin="announcements"
    :aria-busy="admin.isLoading.value || undefined"
  >
    <p
      v-if="admin.isRefused.value"
      data-admin="refused"
      role="status"
    >
      {{ t('announcements.refused') }}
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
      <AdminAnnouncementsCompose :tab="tab" />

      <h3 :id="`${id}-list`">
        {{ t('announcements.listTitle') }}
      </h3>
      <p
        v-if="!data.canBroadcast"
        data-admin="hint"
      >
        {{ t('announcements.testMode') }}
      </p>
      <p
        v-else-if="!data.postalAddress"
        data-admin="hint"
        data-state="error"
      >
        {{ t('announcements.noAddress') }}
      </p>
      <p
        v-if="!admin.announcements.value.length"
        data-admin="announcements-empty"
        role="status"
      >
        {{ t('announcements.noAnnouncements') }}
      </p>
      <ul
        v-else
        data-admin="announcements-list"
        :aria-labelledby="`${id}-list`"
      >
        <AdminAnnouncementsItem
          v-for="row in admin.announcements.value"
          :key="row.id"
          :tab="tab"
          :row="row"
        />
      </ul>
    </template>
    <AdminTabStatus
      v-else-if="admin.error.value || admin.isLoading.value"
      :error="admin.error.value"
    />
    <AdminTabDialogs :confirmation="tab.confirmation" />
  </section>
</template>
