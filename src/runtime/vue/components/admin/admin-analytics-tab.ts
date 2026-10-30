import { type Component, computed, defineAsyncComponent, ref } from 'vue'
import { useLabels } from '../../composables/use-labels'
import { ANALYTICS_VIEWS, hasBackend, panelLoading } from './admin-views'

// The Analytics tab's state, headless: `AdminAnalytics.vue` renders it. The
// views the app has (`ANALYTICS_VIEWS`: the billing provider's revenue,
// then the growth funnel), the one shown, and each view's panel, loaded the
// first time it shows.

/**
 * The Analytics tab, as state.
 *
 * @internal
 */
export function useAnalyticsTab() {
  const { t } = useLabels('admin')
  const loadingComponent = panelLoading(() => t('loading'))
  // Read once, in setup: the app's backend files do not change while it runs.
  const views = ANALYTICS_VIEWS.filter(view => hasBackend(view)).map(view => ({
    key: view.key,
    label: t(`views.${view.key}` as Parameters<typeof t>[0]),
    panel: defineAsyncComponent({ loader: view.panel as () => Promise<Component>, loadingComponent }),
  }))
  const chosen = ref(views[0]?.key ?? null)
  return {
    t,
    views,
    chosen,
    current: computed(() => views.find(view => view.key === chosen.value) ?? views[0] ?? null),
  }
}
