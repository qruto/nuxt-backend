<script setup lang="ts">
/**
 * The admin console's Analytics tab: the views the app has, each once its
 * backend file re-exports what it reads. Revenue reads the billing
 * provider's live metrics (`getRevenue`); the growth funnel joins it. With
 * one view the tab is that view; with several, a switch picks one.
 *
 * Internal: the console's tab, built on `ANALYTICS_VIEWS`.
 *
 * @internal
 */
import { useAnalyticsTab } from './admin-analytics-tab'

const { t, views, chosen, current } = useAnalyticsTab()
</script>

<template>
  <section
    data-admin="analytics"
    :data-admin-view="current?.key"
  >
    <div
      v-if="views.length > 1"
      data-admin="analytics-views"
      role="group"
      :aria-label="t('views.label')"
    >
      <button
        v-for="view in views"
        :key="view.key"
        data-admin="analytics-view"
        :data-admin-view="view.key"
        type="button"
        :aria-pressed="view.key === current?.key"
        @click="chosen = view.key"
      >
        {{ view.label }}
      </button>
    </div>
    <component
      :is="current.panel"
      v-if="current"
    />
  </section>
</template>
