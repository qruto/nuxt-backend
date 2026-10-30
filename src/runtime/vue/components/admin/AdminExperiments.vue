<script setup lang="ts">
/**
 * The Analytics tab's Experiments view: every flag with variants, with its
 * status, how long it has run, and per variant the people exposed, how
 * many reached the goal with the rate and its 95% interval, each guardrail
 * (marked when it is worse than the control's) and the promotion a price
 * test shows. It says when there are too few people to tell, and picks a
 * winner for everyone, after a recent sign-in through the view's own
 * `<ReauthenticateDialog>`. Live. Shown once `backend/flags.ts` re-exports
 * `getExperiments`.
 *
 * Internal: the console's view, built on `useExperimentResults`.
 *
 * @internal
 */
import { busyAttributes } from '../../a11y'
import { useExperimentsTab } from './admin-experiments-tab'

const tab = useExperimentsTab()
const { t, errorMessage, results, experiments } = tab
</script>

<template>
  <section
    data-admin="experiments"
    :aria-busy="results.isLoading.value || tab.picking.value !== null || undefined"
  >
    <p
      v-if="results.error.value || tab.failure.value"
      data-admin="error"
      role="alert"
    >
      {{ errorMessage(results.error.value ?? tab.failure.value) }}
    </p>
    <p
      v-if="results.isLoading.value && !results.experiments.value && !results.error.value"
      data-admin="loading"
      role="status"
      aria-live="polite"
    >
      {{ t('loading') }}
    </p>
    <p
      v-else-if="results.experiments.value && !experiments.length"
      data-admin="empty"
      role="status"
    >
      {{ t('experiments.empty') }}
    </p>
    <article
      v-for="experiment in experiments"
      :key="experiment.key"
      data-admin="experiment"
      :data-key="experiment.key"
      :data-state="experiment.winner ? 'decided' : experiment.running ? 'running' : 'stopped'"
      :aria-labelledby="`experiment-${experiment.key}`"
    >
      <h3
        :id="`experiment-${experiment.key}`"
        data-admin="experiment-title"
      >
        <code>{{ experiment.key }}</code>
        <span data-admin="experiment-status">{{ experiment.status }}</span>
      </h3>
      <p data-admin="experiment-description">
        {{ experiment.description }}
      </p>
      <p data-admin="experiment-meta">
        {{ experiment.started }}
        ·
        {{ experiment.goal ? t('experiments.goal', { kind: experiment.goal }) : t('experiments.noGoal') }}
      </p>
      <div data-admin="experiment-scroll">
        <table data-admin="experiment-variants">
          <caption data-admin="visually-hidden">
            {{ experiment.key }}
          </caption>
          <thead>
            <tr>
              <th scope="col">
                {{ t('experiments.variant') }}
              </th>
              <th scope="col">
                {{ t('experiments.share') }}
              </th>
              <th scope="col">
                {{ t('experiments.exposed') }}
              </th>
              <th scope="col">
                {{ t('experiments.converted') }}
              </th>
              <th scope="col">
                {{ t('experiments.rate') }}
              </th>
              <th
                v-for="kind in experiment.guardrails"
                :key="kind"
                scope="col"
              >
                {{ t('experiments.guardrail', { kind }) }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in experiment.rows"
              :key="row.name"
              data-admin="experiment-variant"
              :data-variant="row.name"
            >
              <th scope="row">
                {{ row.label }}
                <span
                  v-if="row.discount"
                  data-admin="experiment-discount"
                >{{ t('experiments.discount', { discount: row.discount }) }}</span>
              </th>
              <td>{{ row.shareText }}</td>
              <td>{{ row.exposedText }}</td>
              <td>{{ row.convertedText }}</td>
              <td>{{ row.rateText }}</td>
              <td
                v-for="cell in row.guardrailCells"
                :key="cell.kind"
                data-admin="experiment-guardrail"
                :data-state="cell.worse ? 'worse' : undefined"
              >
                {{ cell.text }}
                <span
                  v-if="cell.worse"
                  data-admin="experiment-worse"
                >{{ t('experiments.worse') }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p
        data-admin="experiment-verdict"
        :data-verdict="experiment.verdict.kind"
      >
        {{ experiment.verdictText }}
      </p>
      <div
        data-admin="experiment-actions"
        role="group"
        :aria-labelledby="`experiment-${experiment.key}`"
      >
        <template v-if="experiment.winner === null">
          <button
            v-for="row in experiment.rows"
            :key="row.name"
            data-admin="experiment-pick"
            type="button"
            v-bind="busyAttributes(tab.picking.value === `${experiment.key}:${row.name}`)"
            @click="tab.pick(experiment, row.name)"
          >
            {{ tab.picking.value === `${experiment.key}:${row.name}` ? t('experiments.picking') : t('experiments.pick', { variant: row.name }) }}
          </button>
        </template>
        <button
          v-else
          data-admin="experiment-resume"
          type="button"
          v-bind="busyAttributes(tab.picking.value === `${experiment.key}:null`)"
          @click="tab.pick(experiment, null)"
        >
          {{ tab.picking.value === `${experiment.key}:null` ? t('experiments.picking') : t('experiments.resume') }}
        </button>
      </div>
    </article>
    <ReauthenticateDialog />
  </section>
</template>
