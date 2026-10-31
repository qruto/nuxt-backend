<script setup lang="ts">
/**
 * The Analytics tab's Revenue view: the billing provider's own metrics over
 * the last 30, 90 or 365 days, per day, week or month. Recurring revenue
 * and the key figures, revenue, subscriptions (new, renewed, churned),
 * cancellations per reason with the save offers accepted, checkouts and
 * their conversion, usage per catalog meter, and costs and margin once a
 * usage event carries a cost. It reads when it opens, when the window
 * changes and on Refresh; nothing is kept. Shown once `backend/billing.ts`
 * re-exports `getRevenue`.
 *
 * Internal: the console's view, built on `useRevenue`.
 *
 * @internal
 */
import { busyAttributes } from '../../a11y'
import AdminChart from './AdminChart.vue'
import { useRevenueTab } from './admin-revenue-tab'

const tab = useRevenueTab()
const { t, errorMessage, revenue, report, charts, reasons, costs } = tab
</script>

<template>
  <section
    data-admin="revenue"
    :aria-busy="revenue.isLoading.value || undefined"
  >
    <div data-admin="revenue-controls">
      <label data-admin="revenue-window">
        {{ t('revenue.window') }}
        <select v-model.number="revenue.days.value">
          <option
            v-for="days in tab.windows"
            :key="days"
            :value="days"
          >
            {{ t('revenue.days', { count: days }) }}
          </option>
        </select>
      </label>
      <label data-admin="revenue-interval">
        {{ t('revenue.interval') }}
        <select v-model="revenue.interval.value">
          <option
            v-for="interval in tab.intervals"
            :key="interval"
            :value="interval"
          >
            {{ t(`revenue.intervals.${interval}`) }}
          </option>
        </select>
      </label>
      <button
        data-admin="refresh"
        type="button"
        v-bind="busyAttributes(revenue.isLoading.value)"
        @click="revenue.refresh"
      >
        {{ t('revenue.refresh') }}
      </button>
    </div>
    <p
      v-if="revenue.error.value"
      data-admin="error"
      role="alert"
    >
      {{ errorMessage(revenue.error.value) }}
    </p>
    <p
      v-else-if="revenue.isLoading.value && !report"
      data-admin="loading"
      role="status"
      aria-live="polite"
    >
      {{ t('loading') }}
    </p>
    <template v-if="report && charts">
      <p
        :id="`${tab.id}-source`"
        data-admin="revenue-source"
      >
        {{ t('revenue.source') }}
      </p>
      <dl
        data-admin="revenue-figures"
        :aria-label="t('revenue.figures')"
      >
        <div
          v-for="figure in tab.figures.value"
          :key="figure.key"
          data-admin="revenue-figure"
          :data-figure="figure.key"
        >
          <dt>{{ figure.label }}</dt>
          <dd>{{ figure.value }}</dd>
        </div>
      </dl>
      <div data-admin="revenue-charts">
        <AdminChart
          :label="t('revenue.revenueChart')"
          :series="charts.revenue"
        />
      </div>
      <h3 data-admin="revenue-heading">
        {{ t('revenue.subscriptions') }}
      </h3>
      <div data-admin="revenue-charts">
        <AdminChart
          :label="t('revenue.newSubscriptions')"
          :series="charts.newSubscriptions"
        />
        <AdminChart
          :label="t('revenue.renewedSubscriptions')"
          :series="charts.renewedSubscriptions"
        />
        <AdminChart
          :label="t('revenue.churnedSubscriptions')"
          :series="charts.churnedSubscriptions"
          tone="loss"
        />
      </div>
      <h3 data-admin="revenue-heading">
        {{ t('revenue.cancellations') }}
      </h3>
      <ul
        v-if="reasons"
        data-admin="revenue-reasons"
      >
        <li
          v-for="row in reasons.rows"
          :key="row.reason"
          data-admin="revenue-reason"
          :data-reason="row.reason"
          :style="{ '--admin-chart-value': reasons.max > 0 ? row.value / reasons.max : 0 }"
        >
          <span>{{ row.label }}</span>
          <span data-admin="revenue-reason-count">{{ row.text }}</span>
        </li>
      </ul>
      <p data-admin="revenue-save-offers">
        {{ tab.saveOffers.value }}
      </p>
      <p
        v-if="report.cancellations.saveOffers.truncated"
        data-admin="revenue-truncated"
        role="status"
      >
        {{ t('revenue.saveOffersTruncated') }}
      </p>
      <h3 data-admin="revenue-heading">
        {{ t('revenue.checkouts') }}
      </h3>
      <p data-admin="revenue-conversion">
        {{ tab.conversion.value }}
      </p>
      <div data-admin="revenue-charts">
        <AdminChart
          :label="t('revenue.checkoutsStarted')"
          :series="charts.checkouts"
        />
        <AdminChart
          :label="t('revenue.checkoutsCompleted')"
          :series="charts.succeededCheckouts"
        />
      </div>
      <h3 data-admin="revenue-heading">
        {{ t('revenue.usage') }}
      </h3>
      <p
        v-if="!tab.meters.value.length"
        data-admin="revenue-usage-empty"
      >
        {{ t('revenue.usageEmpty') }}
      </p>
      <div
        v-else
        data-admin="revenue-charts"
      >
        <AdminChart
          v-for="meter in tab.meters.value"
          :key="meter.meter"
          :label="meter.meter"
          :series="meter.series"
        />
      </div>
      <h3 data-admin="revenue-heading">
        {{ t('revenue.costs') }}
      </h3>
      <dl
        v-if="costs"
        data-admin="revenue-figures"
      >
        <div
          v-for="figure in costs"
          :key="figure.key"
          data-admin="revenue-figure"
          :data-figure="figure.key"
        >
          <dt>{{ figure.label }}</dt>
          <dd>{{ figure.value }}</dd>
        </div>
      </dl>
      <p
        v-else
        data-admin="revenue-no-costs"
      >
        {{ t('revenue.noCosts') }}
      </p>
    </template>
  </section>
</template>
