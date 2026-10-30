<script setup lang="ts">
/**
 * The admin console's Webhooks tab: the delivery log of both providers,
 * newest first and narrowed by service, each delivery with its outcome and
 * a Replay button that asks the provider to send it again, signed, to the
 * same route. A replay asks for a recent sign-in through the tab's own
 * `<ReauthenticateDialog>`. A row counting requests refused before any
 * signature verified has nothing to replay. The console shows it once the
 * app has `backend/webhooks.ts`.
 *
 * Internal: the console's tab, built on `useWebhookLog`.
 *
 * @internal
 */
import { useWebhooksTab } from './admin-webhooks-tab'

const tab = useWebhooksTab()
const { t, errorMessage, log, message, rows } = tab
</script>

<template>
  <section
    data-admin="webhooks"
    :aria-busy="log.isLoading.value || undefined"
  >
    <p
      v-if="log.isRefused.value"
      data-admin="refused"
      role="status"
    >
      {{ t('webhooks.refused') }}
    </p>
    <template v-else-if="log.deliveries.value">
      <p
        v-if="message"
        data-admin="message"
        :data-state="message.ok ? 'ok' : 'error'"
        :role="message.ok ? 'status' : 'alert'"
      >
        {{ message.text }}
      </p>
      <p
        :id="`${tab.id}-intro`"
        data-admin="webhooks-intro"
      >
        {{ t('webhooks.intro') }}
      </p>
      <label data-admin="webhooks-filter">
        {{ t('webhooks.filter') }}
        <select v-model="tab.service.value">
          <option value="all">{{ t('webhooks.all') }}</option>
          <option
            v-for="service in tab.services"
            :key="service"
            :value="service"
          >
            {{ tab.serviceName(service) }}
          </option>
        </select>
      </label>
      <p
        v-if="!rows.length"
        data-admin="webhooks-empty"
        role="status"
      >
        {{ t('webhooks.empty') }}
      </p>
      <table
        v-else
        data-admin="webhooks-log"
        :aria-describedby="`${tab.id}-intro`"
      >
        <caption>{{ t('webhooks.caption') }}</caption>
        <thead>
          <tr>
            <th scope="col">
              {{ t('webhooks.service') }}
            </th>
            <th scope="col">
              {{ t('webhooks.event') }}
            </th>
            <th scope="col">
              {{ t('webhooks.outcome') }}
            </th>
            <th scope="col">
              {{ t('webhooks.received') }}
            </th>
            <th scope="col">
              <span data-admin="visually-hidden">{{ t('webhooks.replay') }}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in rows"
            :key="tab.key(row)"
            data-admin="webhook"
            :data-outcome="row.outcome"
          >
            <td>{{ tab.serviceName(row.service) }}</td>
            <th scope="row">
              <code>{{ row.type ?? '—' }}</code>
            </th>
            <td>
              <span data-admin="webhook-outcome">{{ row.outcome }}</span>
              <span
                v-if="row.count"
                data-admin="webhook-count"
              >{{ t('webhooks.counted', { count: row.count }) }}</span>
              <span
                v-if="row.note"
                data-admin="webhook-note"
              >{{ row.note }}</span>
            </td>
            <td>
              {{ tab.date(row.receivedAt) }}
              <span
                v-if="row.replayedAt"
                data-admin="webhook-replayed"
              >{{ t('webhooks.replayed', { date: tab.date(row.replayedAt) }) }}</span>
            </td>
            <td>
              <button
                v-if="tab.replayable(row)"
                data-admin="replay"
                type="button"
                :aria-disabled="tab.busy(`replay:${tab.key(row)}`)"
                :aria-label="tab.busy(`replay:${tab.key(row)}`) ? undefined : t('webhooks.replayNamed', { event: row.type ?? row.deliveryId, date: tab.date(row.receivedAt) })"
                @click="tab.replay(row)"
              >
                {{ tab.busy(`replay:${tab.key(row)}`) ? t('webhooks.replaying') : t('webhooks.replay') }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </template>
    <p
      v-else-if="log.error.value"
      data-admin="error"
      role="alert"
    >
      {{ errorMessage(log.error.value) }}
    </p>
    <p
      v-else-if="log.isLoading.value"
      data-admin="loading"
      role="status"
      aria-live="polite"
    >
      {{ t('loading') }}
    </p>
    <ReauthenticateDialog />
  </section>
</template>
