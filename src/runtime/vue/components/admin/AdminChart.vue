<script setup lang="ts">
/**
 * One bar chart of the admin console, drawn from the package's tokens: a
 * bar per period, scaled to the largest, its value read out in words. The
 * Revenue view draws its series with it; a chart with nothing in it still
 * shows its periods.
 *
 * Internal: the Analytics tab's chart.
 *
 * @internal
 */
import type { ChartSeries } from './admin-revenue-tab'

defineProps<{
  /** The chart's title. */
  label: string
  series: ChartSeries
  /** A second tone for a chart that is a count of losses (churn). */
  tone?: 'loss'
}>()
</script>

<template>
  <figure
    data-admin="chart"
    :data-tone="tone"
  >
    <figcaption>
      <span data-admin="chart-label">{{ label }}</span>
      <span data-admin="chart-total">{{ series.total }}</span>
    </figcaption>
    <ol data-admin="chart-bars">
      <li
        v-for="point in series.points"
        :key="point.at"
        data-admin="chart-bar"
        :data-state="point.value > 0 ? undefined : 'empty'"
        :style="{ '--admin-chart-value': series.max > 0 ? point.value / series.max : 0 }"
        :title="point.label"
      >
        <span data-admin="visually-hidden">{{ point.label }}</span>
      </li>
    </ol>
  </figure>
</template>
