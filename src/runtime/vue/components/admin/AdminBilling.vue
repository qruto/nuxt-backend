<script setup lang="ts">
/**
 * The admin console's Billing tab: the billing lifecycle's records an
 * administrator answers for, newest first. The save offers the cancel flow
 * made, with the reason given and whether the person took it; the EU
 * withdrawals, whose refund is the administrator's to send; and the renewal
 * consent proofs, what each renewing checkout showed and who agreed. A
 * billing entity's id narrows all three to that entity. Read-only. The
 * console shows it once `backend/billing.ts` re-exports `getBillingConsole`.
 *
 * Internal: the console's tab, built on `useBillingTab`.
 *
 * @internal
 */
import AdminTabStatus from './AdminTabStatus.vue'
import { useBillingTab } from './admin-billing-tab'

const tab = useBillingTab()
const { t, data, entity, id } = tab
</script>

<template>
  <section
    data-admin="billing"
    :aria-busy="tab.isLoading.value || undefined"
  >
    <p
      v-if="tab.isRefused.value"
      data-admin="refused"
      role="status"
    >
      {{ t('billing.refused') }}
    </p>
    <template v-else>
      <p data-admin="billing-filter">
        <label :for="`${id}-entity`">{{ t('billing.entity') }}</label>
        <input
          :id="`${id}-entity`"
          v-model="entity"
          type="search"
          autocomplete="off"
          spellcheck="false"
          :aria-describedby="`${id}-entity-hint`"
        >
        <span
          :id="`${id}-entity-hint`"
          data-admin="billing-hint"
        >{{ t('billing.entityHint') }}</span>
      </p>
      <template v-if="data">
        <section :aria-labelledby="`${id}-offers`">
          <h3 :id="`${id}-offers`">
            {{ t('billing.offersTitle') }}
          </h3>
          <p data-admin="billing-hint">
            {{ t('billing.offersHint') }}
          </p>
          <p
            v-if="!data.saveOffers.length"
            data-admin="billing-empty"
            role="status"
          >
            {{ t('billing.offersEmpty') }}
          </p>
          <table
            v-else
            data-admin="billing-offers"
          >
            <thead>
              <tr>
                <th
                  v-for="column in ['madeAt', 'entity', 'reason', 'offer', 'outcome'] as const"
                  :key="column"
                  scope="col"
                >
                  {{ t(`billing.columns.${column}`) }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in data.saveOffers"
                :key="row.id"
                :data-state="row.acceptedAt === null ? 'declined' : 'accepted'"
              >
                <th scope="row">
                  {{ tab.date(row.madeAt) }}
                </th>
                <td data-admin="billing-id">
                  {{ row.entityId }}
                </td>
                <td>{{ tab.reasonText(row.reason) }}</td>
                <td>{{ tab.offerText(row) }}</td>
                <td
                  data-admin="billing-outcome"
                  :data-state="row.acceptedAt === null ? 'declined' : 'accepted'"
                >
                  {{ row.acceptedAt === null ? t('billing.declined') : t('billing.accepted', { date: tab.date(row.acceptedAt) }) }}
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <section :aria-labelledby="`${id}-withdrawals`">
          <h3 :id="`${id}-withdrawals`">
            {{ t('billing.withdrawalsTitle') }}
          </h3>
          <p data-admin="billing-hint">
            {{ t('billing.withdrawalsHint') }}
          </p>
          <p
            v-if="!data.withdrawals.length"
            data-admin="billing-empty"
            role="status"
          >
            {{ t('billing.withdrawalsEmpty') }}
          </p>
          <table
            v-else
            data-admin="billing-withdrawals"
          >
            <thead>
              <tr>
                <th
                  v-for="column in ['at', 'entity', 'plan', 'account'] as const"
                  :key="column"
                  scope="col"
                >
                  {{ t(`billing.columns.${column}`) }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in data.withdrawals"
                :key="row.subscriptionId"
              >
                <th scope="row">
                  {{ tab.date(row.at) }}
                </th>
                <td data-admin="billing-id">
                  {{ row.entityId }}
                </td>
                <td>{{ row.plan }}</td>
                <td data-admin="billing-id">
                  <a :href="`?tab=users&user=${encodeURIComponent(row.userId)}`">{{ row.userId }}</a>
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <section :aria-labelledby="`${id}-consents`">
          <h3 :id="`${id}-consents`">
            {{ t('billing.consentsTitle') }}
          </h3>
          <p data-admin="billing-hint">
            {{ t('billing.consentsHint') }}
          </p>
          <p
            v-if="!data.consents.length"
            data-admin="billing-empty"
            role="status"
          >
            {{ t('billing.consentsEmpty') }}
          </p>
          <table
            v-else
            data-admin="billing-consents"
          >
            <thead>
              <tr>
                <th
                  v-for="column in ['consentedAt', 'entity', 'plan', 'price', 'terms', 'account'] as const"
                  :key="column"
                  scope="col"
                >
                  {{ t(`billing.columns.${column}`) }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(row, index) in data.consents"
                :key="`${row.subscriptionId ?? row.entityId}:${row.consentedAt}:${index}`"
              >
                <th scope="row">
                  {{ tab.date(row.consentedAt) }}
                </th>
                <td data-admin="billing-id">
                  {{ row.entityId }}
                </td>
                <td>{{ row.plan }}</td>
                <td>{{ tab.priceText(row) }}</td>
                <td>{{ row.termsVersion ?? t('billing.noTerms') }}</td>
                <td data-admin="billing-id">
                  <a
                    v-if="row.userId"
                    :href="`?tab=users&user=${encodeURIComponent(row.userId)}`"
                  >{{ row.userId }}</a>
                </td>
              </tr>
            </tbody>
          </table>
        </section>
      </template>
      <AdminTabStatus
        v-else-if="tab.error.value || tab.isLoading.value"
        :error="tab.error.value"
      />
    </template>
  </section>
</template>
