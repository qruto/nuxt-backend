<script setup lang="ts">
/**
 * The admin console's Suppressions tab: the addresses the email provider
 * stopped delivering to (a hard bounce, a complaint, by hand), newest
 * first, as the deployment mirrors them from its webhook. Lift asks the
 * provider to deliver to an address again, after a confirmation and a
 * recent sign-in through the tab's own `<ReauthenticateDialog>`. The console
 * shows it once `backend/email.ts` re-exports `getSuppressions`.
 *
 * Internal: the console's tab, built on `useSuppressionsAdmin`.
 *
 * @internal
 */
import AdminTabDialogs from './AdminTabDialogs.vue'
import AdminTabStatus from './AdminTabStatus.vue'
import { useSuppressionsTab } from './admin-suppressions-tab'

const tab = useSuppressionsTab()
const { t, admin, message } = tab
</script>

<template>
  <section
    data-admin="suppressions"
    :aria-busy="admin.isLoading.value || undefined"
  >
    <p
      v-if="admin.isRefused.value"
      data-admin="refused"
      role="status"
    >
      {{ t('suppressions.refused') }}
    </p>
    <template v-else-if="admin.suppressions.value">
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
        data-admin="suppressions-intro"
      >
        {{ t('suppressions.intro') }}
      </p>
      <p
        v-if="!admin.suppressions.value.length"
        data-admin="suppressions-empty"
        role="status"
      >
        {{ t('suppressions.empty') }}
      </p>
      <table
        v-else
        data-admin="suppressions-list"
        :aria-describedby="`${tab.id}-intro`"
      >
        <caption>{{ t('suppressions.caption') }}</caption>
        <thead>
          <tr>
            <th scope="col">
              {{ t('suppressions.address') }}
            </th>
            <th scope="col">
              {{ t('suppressions.origin') }}
            </th>
            <th scope="col">
              {{ t('suppressions.since') }}
            </th>
            <th scope="col">
              <span data-admin="visually-hidden">{{ t('suppressions.lift') }}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in admin.suppressions.value"
            :key="row.email"
            data-admin="suppression"
            :data-origin="row.origin"
          >
            <th scope="row">
              {{ row.email }}
            </th>
            <td>{{ tab.originName(row) }}</td>
            <td>{{ tab.date(row.suppressedAt) }}</td>
            <td>
              <button
                data-admin="lift"
                type="button"
                :aria-disabled="tab.busy(`lift:${row.email}`)"
                :aria-label="tab.busy(`lift:${row.email}`) ? undefined : t('suppressions.liftNamed', { email: row.email })"
                @click="tab.lift(row)"
              >
                {{ tab.busy(`lift:${row.email}`) ? t('suppressions.lifting') : t('suppressions.lift') }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </template>
    <AdminTabStatus
      v-else-if="admin.error.value || admin.isLoading.value"
      :error="admin.error.value"
    />
    <AdminTabDialogs :confirmation="tab.confirmation" />
  </section>
</template>
