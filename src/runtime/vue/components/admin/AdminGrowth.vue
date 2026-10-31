<script setup lang="ts">
/**
 * The Analytics tab's Growth view: the funnel from waitlist to paid over
 * the last 4, 12 or 26 weeks, counted inside the deployment as events are
 * recorded. Each step with its share of the step before; the person steps
 * broken down by invite, campaign, referral, promotion or the answer to
 * "How did you hear about us?"; what people wrote under "Somewhere else";
 * and each sign-up week's retention. Live. Shown once `backend/admin.ts`
 * re-exports `getFunnel`.
 *
 * Internal: the console's view, built on `useFunnel`.
 *
 * @internal
 */
import { useGrowthTab } from './admin-growth-tab'

const tab = useGrowthTab()
const { t, errorMessage, funnel, report, steps, breakdown, cohorts } = tab
</script>

<template>
  <section
    data-admin="growth"
    :aria-busy="funnel.isLoading.value || undefined"
  >
    <div data-admin="growth-controls">
      <label data-admin="growth-window">
        {{ t('growth.window') }}
        <select v-model.number="funnel.weeks.value">
          <option
            v-for="weeks in tab.windows"
            :key="weeks"
            :value="weeks"
          >
            {{ t('growth.weeks', { count: weeks }) }}
          </option>
        </select>
      </label>
    </div>
    <p
      v-if="funnel.error.value"
      data-admin="error"
      role="alert"
    >
      {{ errorMessage(funnel.error.value) }}
    </p>
    <p
      v-else-if="funnel.isLoading.value && !report"
      data-admin="loading"
      role="status"
      aria-live="polite"
    >
      {{ t('loading') }}
    </p>
    <template v-if="report && steps">
      <p data-admin="growth-source">
        {{ t('growth.source') }}
      </p>
      <p
        v-if="tab.isEmpty.value"
        data-admin="empty"
        role="status"
      >
        {{ t('growth.empty') }}
      </p>
      <h3
        :id="`${tab.id}-steps`"
        data-admin="growth-heading"
      >
        {{ t('growth.steps') }}
      </h3>
      <ol
        data-admin="growth-steps"
        :aria-labelledby="`${tab.id}-steps`"
      >
        <li
          v-for="row in steps.rows"
          :key="row.step"
          data-admin="growth-step"
          :data-step="row.step"
          :style="{ '--admin-growth-value': steps.max > 0 ? row.value / steps.max : 0 }"
        >
          <span data-admin="growth-step-label">{{ row.label }}</span>
          <span data-admin="growth-step-count">{{ row.text }}</span>
          <span
            v-if="row.ofPrevious"
            data-admin="growth-step-rate"
          >{{ row.ofPrevious }}</span>
        </li>
      </ol>
      <h3 data-admin="growth-heading">
        <label :for="`${tab.id}-dimension`">{{ t('growth.breakdown') }}</label>
      </h3>
      <select
        :id="`${tab.id}-dimension`"
        v-model="tab.dimension.value"
        data-admin="growth-dimension"
      >
        <option
          v-for="name in tab.dimensions"
          :key="name"
          :value="name"
        >
          {{ t(`growth.dimension.${name}`) }}
        </option>
      </select>
      <table
        v-if="breakdown.length"
        data-admin="growth-breakdown"
      >
        <caption data-admin="visually-hidden">
          {{ t(`growth.dimension.${tab.dimension.value}`) }}
        </caption>
        <thead>
          <tr>
            <th scope="col">
              {{ t('growth.value') }}
            </th>
            <th
              v-for="step in tab.personSteps"
              :key="step"
              scope="col"
            >
              {{ t(`growth.step.${step}`) }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in breakdown"
            :key="row.value"
            data-admin="growth-row"
            :data-value="row.value"
          >
            <th scope="row">
              {{ row.label }}
            </th>
            <td
              v-for="cell in row.cells"
              :key="cell.step"
            >
              {{ cell.text }}
            </td>
          </tr>
        </tbody>
      </table>
      <p
        v-else
        data-admin="growth-no-breakdown"
      >
        {{ t('growth.noBreakdown') }}
      </p>
      <template v-if="tab.dimension.value === 'answer' && report.otherAnswers.length">
        <h4 data-admin="growth-heading">
          {{ t('growth.otherAnswers') }}
        </h4>
        <ul data-admin="growth-other-answers">
          <li
            v-for="(answer, index) in report.otherAnswers"
            :key="index"
          >
            {{ answer }}
          </li>
        </ul>
      </template>
      <h3
        :id="`${tab.id}-cohorts`"
        data-admin="growth-heading"
      >
        {{ t('growth.cohorts') }}
      </h3>
      <div data-admin="growth-cohorts-scroll">
        <table
          data-admin="growth-cohorts"
          :aria-labelledby="`${tab.id}-cohorts`"
        >
          <thead>
            <tr>
              <th scope="col">
                {{ t('growth.cohortWeek') }}
              </th>
              <th scope="col">
                {{ t('growth.cohortSize') }}
              </th>
              <th
                v-for="offset in tab.weeksAfter.value"
                :key="offset"
                scope="col"
              >
                {{ t('growth.weekAfter', { count: offset }) }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="cohort in cohorts"
              :key="cohort.week"
              data-admin="growth-cohort"
            >
              <th scope="row">
                {{ cohort.label }}
              </th>
              <td>{{ cohort.size }}</td>
              <td
                v-for="cell in cohort.cells"
                :key="cell.offset"
                data-admin="growth-cell"
                :style="{ '--admin-growth-value': cell.value }"
              >
                {{ cell.text }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </section>
</template>
