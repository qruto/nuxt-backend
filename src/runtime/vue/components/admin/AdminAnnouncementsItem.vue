<script setup lang="ts">
/**
 * One published announcement in the Announcements tab: its notice, where it
 * stands, and its email's preview, send and cancel.
 *
 * Internal: a part of `AdminAnnouncements.vue`.
 *
 * @internal
 */
import type { AnnouncementRow } from '../../composables/use-announcements'
import type { AnnouncementsTab } from './admin-announcements-tab'

const props = defineProps<{ tab: AnnouncementsTab, row: AnnouncementRow }>()
const { t, data, sendAt, running, busy, id } = props.tab
</script>

<template>
  <li
    data-admin="announcement"
    :data-state="tab.noticeState(row).key"
  >
    <p data-admin="announcement-message">
      {{ row.message }}
    </p>
    <p data-admin="announcement-state">
      {{ tab.noticeState(row).text }}
    </p>
    <button
      v-if="tab.noticeState(row).key === 'live'"
      type="button"
      data-admin="announcement-end"
      :aria-disabled="busy(`end:${row.id}`)"
      @click="tab.end(row)"
    >
      {{ running === `end:${row.id}` ? t('announcements.ending') : t('announcements.end') }}
    </button>
    <div
      v-if="row.broadcast"
      data-admin="announcement-email"
      role="group"
      :aria-label="t('announcements.emailTitle', { subject: row.broadcast.subject })"
    >
      <p>
        <strong>{{ t('announcements.emailTitle', { subject: row.broadcast.subject }) }}</strong>
        · {{ tab.emailState(row) }}
      </p>
      <template v-if="tab.canSend(row)">
        <button
          type="button"
          data-admin="announcement-preview"
          :aria-disabled="busy(`preview:${row.id}`)"
          @click="tab.preview(row)"
        >
          {{ running === `preview:${row.id}` ? t('announcements.previewing') : t('announcements.preview') }}
        </button>
        <label v-if="data?.canBroadcast">
          {{ t('announcements.sendAt') }}
          <input
            v-model="sendAt[row.id]"
            type="datetime-local"
            :aria-describedby="`${id}-${row.id}-send-hint`"
          >
          <span
            :id="`${id}-${row.id}-send-hint`"
            data-admin="hint"
          >{{ t('announcements.sendAtHint') }}</span>
        </label>
        <button
          v-if="data?.canBroadcast"
          type="button"
          data-admin="announcement-send"
          :aria-disabled="busy(`send:${row.id}`) ?? (data?.postalAddress ? undefined : 'true')"
          @click="tab.send(row)"
        >
          {{ running === `send:${row.id}` ? t('announcements.sending') : t('announcements.send') }}
        </button>
      </template>
      <button
        v-if="tab.canCancel(row)"
        type="button"
        data-admin="announcement-cancel"
        :aria-disabled="busy(`cancel:${row.id}`)"
        @click="tab.cancel(row)"
      >
        {{ running === `cancel:${row.id}` ? t('announcements.cancelling') : t('announcements.cancel') }}
      </button>
    </div>
  </li>
</template>
