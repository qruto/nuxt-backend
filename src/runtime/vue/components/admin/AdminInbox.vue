<script setup lang="ts">
/**
 * The admin console's Inbox tab: what people sent through the contact form
 * and by email (replies to a reply address, mail to a workspace's address,
 * the support inbox), newest first and narrowed by where it came from. A row
 * opens to its message, and a thread of the support inbox to a reply form: the
 * reply goes out from the support address and stays on the thread. Every
 * reply asks for a recent sign-in through the tab's own
 * `<ReauthenticateDialog>`. The console shows it once `backend/email.ts`
 * re-exports `getInboxConsole`.
 *
 * Internal: the console's tab, built on `useInboxAdmin`.
 *
 * @internal
 */
import AdminInboxMessage from './AdminInboxMessage.vue'
import { useInboxTab } from './admin-inbox-tab'

const tab = useInboxTab()
const { t, errorMessage, inbox, data, message, rows } = tab
</script>

<template>
  <section
    data-admin="inbox"
    :aria-busy="inbox.isLoading.value || undefined"
  >
    <p
      v-if="inbox.isRefused.value"
      data-admin="refused"
      role="status"
    >
      {{ t('inbox.refused') }}
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
      <p data-admin="inbox-support">
        {{ data.support ? t('inbox.support', { address: data.support }) : t('inbox.noSupport') }}
      </p>
      <label data-admin="inbox-filter">
        {{ t('inbox.filter') }}
        <select v-model="tab.kind.value">
          <option value="all">{{ t('inbox.all') }}</option>
          <option
            v-for="kind in tab.kinds"
            :key="kind"
            :value="kind"
          >
            {{ tab.kindName(kind) }}
          </option>
        </select>
      </label>
      <p
        v-if="!rows.length"
        data-admin="inbox-empty"
        role="status"
      >
        {{ t('inbox.empty') }}
      </p>
      <ul
        v-else
        data-admin="inbox-list"
      >
        <AdminInboxMessage
          v-for="row in rows"
          :key="row.id"
          :tab="tab"
          :row="row"
        />
      </ul>
    </template>
    <p
      v-else-if="inbox.error.value"
      data-admin="error"
      role="alert"
    >
      {{ errorMessage(inbox.error.value) }}
    </p>
    <p
      v-else-if="inbox.isLoading.value"
      data-admin="loading"
      role="status"
      aria-live="polite"
    >
      {{ t('loading') }}
    </p>
    <ReauthenticateDialog />
  </section>
</template>
