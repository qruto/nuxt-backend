<script setup lang="ts">
/**
 * The admin console's Costs tab: what each person's AI calls cost over the
 * last 7, 30 or 90 days, as the gateway reported them, in total and per
 * person, the costliest first: the job queue, metered actions, streams,
 * chat replies and knowledge embeddings. It reads once, when it opens, when
 * the window changes and on Refresh. The console shows it once
 * `backend/ai.ts` re-exports `getCosts`.
 *
 * Internal: the console's tab, built on `useAiCosts`.
 *
 * @internal
 */
import { busyAttributes } from '../../a11y'
import { useCostsTab } from './admin-costs-tab'

const tab = useCostsTab()
const { t, errorMessage, costs, data } = tab
</script>

<template>
  <section
    data-admin="costs"
    :aria-busy="costs.isLoading.value || undefined"
  >
    <p
      v-if="costs.isRefused.value"
      data-admin="refused"
      role="status"
    >
      {{ t('costs.refused') }}
    </p>
    <template v-else-if="data">
      <div data-admin="costs-controls">
        <label data-admin="costs-window">
          {{ t('costs.window') }}
          <select v-model.number="costs.days.value">
            <option
              v-for="days in tab.windows"
              :key="days"
              :value="days"
            >
              {{ t('costs.days', { count: days }) }}
            </option>
          </select>
        </label>
        <button
          data-admin="refresh"
          type="button"
          v-bind="busyAttributes(costs.isLoading.value)"
          @click="costs.refresh"
        >
          {{ t('costs.refresh') }}
        </button>
      </div>
      <p data-admin="costs-total">
        {{ t('costs.total', { usd: tab.money(data.usd), count: data.runs }) }}
      </p>
      <p data-admin="costs-source">
        {{ t('costs.source') }}
      </p>
      <p
        v-if="data.truncated"
        data-admin="costs-truncated"
        role="status"
      >
        {{ t('costs.truncated') }}
      </p>
      <p
        v-if="!data.people.length"
        data-admin="costs-empty"
        role="status"
      >
        {{ t('costs.empty') }}
      </p>
      <table
        v-else
        data-admin="costs-people"
        :aria-describedby="`${tab.id}-source`"
      >
        <caption :id="`${tab.id}-source`">
          {{ t('costs.caption') }}
        </caption>
        <thead>
          <tr>
            <th scope="col">
              {{ t('costs.person') }}
            </th>
            <th scope="col">
              {{ t('costs.cost') }}
            </th>
            <th scope="col">
              {{ t('costs.runs') }}
            </th>
            <th scope="col">
              {{ t('costs.tokens') }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="person in data.people"
            :key="person.who"
            data-admin="costs-person"
            :data-state="person.who === 'guest' ? 'guest' : undefined"
          >
            <th scope="row">
              {{ tab.who(person) }}
            </th>
            <td>{{ tab.money(person.usd) }}</td>
            <td>{{ tab.count(person.runs) }}</td>
            <td>{{ tab.tokens(person) }}</td>
          </tr>
        </tbody>
      </table>
    </template>
    <p
      v-else-if="costs.error.value"
      data-admin="error"
      role="alert"
    >
      {{ errorMessage(costs.error.value) }}
    </p>
    <p
      v-else-if="costs.isLoading.value"
      data-admin="loading"
      role="status"
      aria-live="polite"
    >
      {{ t('loading') }}
    </p>
  </section>
</template>
