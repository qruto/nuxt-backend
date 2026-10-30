<script setup lang="ts">
/**
 * The admin console's Referrals tab: the program's totals by state, its
 * terms, the top referrers, and the flagged queue, where an administrator
 * releases a reward or voids the referral. A decision asks for a recent
 * sign-in through the tab's own `<ReauthenticateDialog>`. The console shows
 * the tab once the app has `backend/referrals.ts`.
 *
 * Internal: the console's tab, built on `useReferralAdmin`.
 *
 * @internal
 */
import { computed, ref, useId } from 'vue'
import { formatBillingDate } from '../../composables/billing-format'
import type { BackendLabels, LabelKey } from '../../composables/use-labels'
import { useReferralAdmin } from '../../composables/use-referral-admin'
import { useAdminChanges } from '../../utils/admin-changes'
import ConfirmDialog from '../shell/ConfirmDialog.vue'

const props = defineProps<{
  /** Ask before a referral is voided; resolves `true` to go ahead. Default: the tab's own confirmation dialog. */
  confirm?: (text: string) => boolean | Promise<boolean>
}>()

const referrerId = ref<string | undefined>(undefined)
const referrals = useReferralAdmin({ referrerId })
const { t, errorMessage, locale, message, confirmation, confirmed, change, busy } = useAdminChanges(() => props.confirm)
const id = useId()

const data = referrals.console
const states = ['claimed', 'held', 'rewarded', 'voided', 'capped', 'flagged'] as const
const date = (at: number | null) => (at === null ? '' : formatBillingDate(at, { dateStyle: 'medium' }, locale.value))
const flagsText = (flags: readonly string[]) => flags.map(flag => t(`referrals.flagNames.${flag}` as LabelKey<BackendLabels['admin']>)).join(', ')
const program = computed(() => data.value?.program)

async function release(rowId: string) {
  await change(`release:${rowId}`, () => referrals.resolve(rowId, 'release'), () => t('referrals.released'))
}
async function voidIt(rowId: string) {
  if (!(await confirmed(t('referrals.voidConfirm')))) return
  await change(`void:${rowId}`, () => referrals.resolve(rowId, 'void'), () => t('referrals.voided'))
}
</script>

<template>
  <section
    data-admin="referrals"
    :aria-busy="referrals.isLoading.value || undefined"
  >
    <p
      v-if="referrals.isRefused.value"
      data-admin="refused"
      role="status"
    >
      {{ t('referrals.refused') }}
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
      <ul
        data-admin="referrals-counts"
        :aria-label="t('referrals.totals')"
      >
        <li
          v-for="state in states"
          :key="state"
          :data-state="state"
        >
          <span data-admin="referrals-count-name">{{ t(`referrals.states.${state}`) }}</span>
          <strong data-admin="referrals-count">{{ data.totals[state] }}</strong>
        </li>
      </ul>
      <p
        v-if="program"
        data-admin="referrals-program"
      >
        {{ t('referrals.holdDays', { count: program.holdDays }) }}
        <template v-if="program.caps.perReferrer">
          {{ t('referrals.capPerReferrer', { count: program.caps.perReferrer }) }}
        </template>
        <template v-if="program.caps.perMonth">
          {{ t('referrals.capPerMonth', { count: program.caps.perMonth }) }}
        </template>
      </p>

      <section :aria-labelledby="`${id}-flagged`">
        <h3 :id="`${id}-flagged`">
          {{ t('referrals.flaggedTitle') }}
        </h3>
        <p
          v-if="!data.flagged.length"
          data-admin="referrals-empty"
          role="status"
        >
          {{ t('referrals.flaggedEmpty') }}
        </p>
        <template v-else>
          <p>{{ t('referrals.flaggedHint') }}</p>
          <table data-admin="referrals-flagged">
            <thead>
              <tr>
                <th
                  v-for="column in ['state', 'claimedAt', 'holdUntil', 'flags'] as const"
                  :key="column"
                  scope="col"
                >
                  {{ t(`referrals.${column}`) }}
                </th>
                <th scope="col" />
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in data.flagged"
                :key="row.id"
                :data-state="row.state"
              >
                <th scope="row">
                  {{ t(`referrals.states.${row.state}`) }}
                </th>
                <td>{{ date(row.claimedAt) }}</td>
                <td>{{ date(row.holdUntil) }}</td>
                <td>{{ flagsText(row.flags) }}</td>
                <td data-admin="referrals-actions">
                  <button
                    type="button"
                    :aria-disabled="busy(`release:${row.id}`)"
                    @click="release(row.id)"
                  >
                    {{ busy(`release:${row.id}`) ? t('referrals.releasing') : t('referrals.release') }}
                  </button>
                  <button
                    type="button"
                    :aria-disabled="busy(`void:${row.id}`)"
                    @click="voidIt(row.id)"
                  >
                    {{ busy(`void:${row.id}`) ? t('referrals.voiding') : t('referrals.void') }}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </template>
      </section>

      <section :aria-labelledby="`${id}-top`">
        <h3 :id="`${id}-top`">
          {{ t('referrals.topTitle') }}
        </h3>
        <p
          v-if="!data.top.length"
          data-admin="referrals-empty"
          role="status"
        >
          {{ t('referrals.topEmpty') }}
        </p>
        <table
          v-else
          data-admin="referrals-top"
        >
          <thead>
            <tr>
              <th scope="col">
                {{ t('referrals.referrer') }}
              </th>
              <th scope="col">
                {{ t('referrals.referrals') }}
              </th>
              <th scope="col">
                {{ t('referrals.rewarded') }}
              </th>
              <th scope="col" />
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in data.top"
              :key="row.referrerId"
            >
              <th scope="row">
                {{ row.name ?? row.referrerId }}
              </th>
              <td>{{ row.referrals }}</td>
              <td>{{ row.rewarded }}</td>
              <td>
                <button
                  type="button"
                  :aria-pressed="referrerId === row.referrerId"
                  @click="referrerId = referrerId === row.referrerId ? undefined : row.referrerId"
                >
                  {{ t('referrals.history') }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section
        v-if="data.history.length"
        :aria-labelledby="`${id}-history`"
      >
        <h3 :id="`${id}-history`">
          {{ t('referrals.historyTitle') }}
        </h3>
        <table data-admin="referrals-history">
          <thead>
            <tr>
              <th
                v-for="column in ['state', 'claimedAt', 'holdUntil'] as const"
                :key="column"
                scope="col"
              >
                {{ t(`referrals.${column}`) }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in data.history"
              :key="row.id"
              :data-state="row.state"
            >
              <th scope="row">
                {{ row.capped ? t('referrals.states.capped') : t(`referrals.states.${row.state}`) }}
              </th>
              <td>{{ date(row.claimedAt) }}</td>
              <td>{{ date(row.holdUntil) }}</td>
            </tr>
          </tbody>
        </table>
      </section>
    </template>
    <p
      v-else-if="referrals.error.value"
      data-admin="error"
      role="alert"
    >
      {{ errorMessage(referrals.error.value) }}
    </p>
    <p
      v-else-if="referrals.isLoading.value"
      data-admin="loading"
      role="status"
      aria-live="polite"
    >
      {{ t('loading') }}
    </p>
    <ReauthenticateDialog />
    <ConfirmDialog
      :confirmation="confirmation"
      :accept-label="t('confirmAccept')"
      :cancel-label="t('confirmCancel')"
    />
  </section>
</template>
