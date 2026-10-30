<script setup lang="ts">
/**
 * One message of the Inbox tab: who wrote and when, where it came from and
 * what became of it; opened, its text, its attachments and, for a thread of
 * the support inbox, a reply form. The text is shown as text, never as markup.
 *
 * Internal: a part of `AdminInbox.vue`.
 *
 * @internal
 */
import type { InboxRow } from '../../composables/use-inbox-admin'
import type { InboxTab } from './admin-inbox-tab'

const props = defineProps<{ tab: InboxTab, row: InboxRow }>()
const { t, openId, drafts } = props.tab
</script>

<template>
  <li
    data-admin="inbox-row"
    :data-state="row.kind"
  >
    <div data-admin="inbox-summary">
      <strong data-admin="inbox-sender">{{ tab.sender(row) }}</strong>
      <span data-admin="inbox-kind">{{ tab.kindName(row.kind) }}</span>
      <time data-admin="inbox-time">{{ tab.date(row.at) }}</time>
      <span
        v-if="row.delivery"
        data-admin="inbox-delivery"
        :data-state="row.delivery"
      >{{ t(`inbox.deliveries.${row.delivery}`) }}</span>
      <span
        v-if="row.repliedAt"
        data-admin="inbox-answered"
      >{{ t('inbox.answered') }}</span>
      <button
        type="button"
        data-admin="inbox-open"
        :aria-expanded="openId === row.id"
        :aria-controls="`${tab.id}-${row.id}`"
        @click="tab.toggle(row.id)"
      >
        {{ openId === row.id ? t('inbox.close') : t('inbox.open') }}
      </button>
    </div>
    <div
      v-if="openId === row.id"
      :id="`${tab.id}-${row.id}`"
      data-admin="inbox-body"
    >
      <p
        v-if="row.from || row.account"
        data-admin="inbox-from"
      >
        {{ t('inbox.from') }}: {{ row.from }}<template v-if="row.account">
          ({{ t('inbox.account', { name: row.account.name || row.account.email }) }})
        </template>
      </p>
      <h3
        data-admin="inbox-subject"
      >
        {{ row.subject || t('inbox.noSubject') }}
      </h3>
      <p data-admin="inbox-text">
        {{ row.text }}
      </p>
      <ul
        v-if="row.attachments.length"
        data-admin="inbox-attachments"
        :aria-label="t('inbox.attachments', { count: row.attachments.length })"
      >
        <li
          v-for="attachment in row.attachments"
          :key="attachment.name"
          data-admin="inbox-attachment"
        >
          {{ attachment.name }}
        </li>
      </ul>
      <form
        v-if="row.canReply"
        data-admin="inbox-reply"
        @submit.prevent="tab.reply(row)"
      >
        <label>
          {{ t('inbox.replyLabel') }}
          <textarea
            v-model="drafts[row.id]"
            rows="5"
            maxlength="10000"
            :aria-describedby="`${tab.id}-${row.id}-hint`"
          />
        </label>
        <p
          :id="`${tab.id}-${row.id}-hint`"
          data-admin="inbox-hint"
        >
          {{ t('inbox.replyHint') }}
        </p>
        <button
          type="submit"
          data-admin="inbox-send"
          :aria-disabled="tab.busy(`reply:${row.id}`)"
        >
          {{ tab.running.value === `reply:${row.id}` ? t('inbox.sending') : t('inbox.send') }}
        </button>
      </form>
      <p
        v-else
        data-admin="inbox-no-reply"
      >
        {{ t('inbox.cannotReply') }}
      </p>
    </div>
  </li>
</template>
