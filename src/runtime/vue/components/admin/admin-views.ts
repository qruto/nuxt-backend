import { type Component, defineComponent, h } from 'vue'
import { useApiNamespace } from '../../utils/namespace'

// What the console's tabs read off the app: whether it has the backend
// file and the function a tab or a view needs, and the views of a tab that
// holds several (the Analytics tab). Apart from `admin-tabs.ts`, so a tab's
// panel can read its views without importing the list that loads it.

/** One view of a tab that holds several (the Analytics tab's Revenue and Growth), shown while the app has what it reads. */
export interface AdminTabView {
  /** Its key: its `data-admin-view` hook and its label, `admin.views.<key>`. */
  key: string
  /** The backend file it reads (`backend/<needs>.ts`). */
  needs: string
  /** A function of that file it calls, re-exported from its setup. */
  has: string
  /** Its panel, loaded the first time it shows. */
  panel: () => Promise<Component | { default: Component }>
}

/**
 * The Analytics tab's views, in the order it lists them: each shows once
 * the app re-exports what it reads, and the tab with the first of them.
 */
export const ANALYTICS_VIEWS: readonly AdminTabView[] = [
  // The billing provider's live metrics, once backend/billing.ts re-exports `getRevenue`.
  { key: 'revenue', needs: 'billing', has: 'getRevenue', panel: () => import('./AdminRevenue.vue') },
  // The growth funnel, counted inside the deployment, once backend/admin.ts re-exports `getFunnel`.
  { key: 'growth', needs: 'admin', has: 'getFunnel', panel: () => import('./AdminGrowth.vue') },
  // Each experiment's results per variant, once backend/flags.ts re-exports `getExperiments`.
  { key: 'experiments', needs: 'flags', has: 'getExperiments', panel: () => import('./AdminExperiments.vue') },
]

/**
 * Whether the app has what a tab or a view reads: the backend file it
 * `needs` and the function of it it calls (`has`), or any of its views
 * (`anyOf`). Call it in a component's setup: it reads the provided `api`.
 */
export function hasBackend(entry: { needs?: string, has?: string, anyOf?: readonly AdminTabView[] }): boolean {
  if (entry.anyOf) return entry.anyOf.some(view => hasBackend(view))
  if (!entry.needs) return true
  const namespace = useApiNamespace(entry.needs)
  return namespace !== undefined && (!entry.has || namespace[entry.has] !== undefined)
}

/**
 * What a panel shows while its code loads, the first time its tab or view
 * opens: the console's loading note, worded by `text` (`admin.loading`).
 */
export function panelLoading(text: () => string): Component {
  return defineComponent({
    name: 'AdminPanelLoading',
    setup: () => () => h('p', { 'data-admin': 'loading', 'role': 'status', 'aria-live': 'polite' }, text()),
  })
}
