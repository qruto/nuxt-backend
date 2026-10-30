import type { DevtoolsPanelId } from '../../src/devtools/rpc-types'

/**
 * The panel's tabs, in order: the ids `DEVTOOLS_PANELS` lists, which the
 * capability registry names a capability's tab by. One page, so no vue-router in the
 * bundle: a tab switches the component `app.vue` renders. The DevTools docs
 * page has a section per tab, in this order (the docs contract checks it).
 */
export const PANEL_TABS = [
  { id: 'overview', label: 'Overview', icon: 'carbon-dashboard' },
  { id: 'account', label: 'Account', icon: 'carbon-user-avatar' },
  { id: 'billing', label: 'Billing', icon: 'carbon-purchase' },
  { id: 'email', label: 'Email', icon: 'carbon-email' },
  { id: 'webhooks', label: 'Webhooks', icon: 'carbon-webhook' },
  { id: 'monitoring', label: 'Monitoring', icon: 'carbon-debug' },
  { id: 'activity', label: 'Activity', icon: 'carbon-activity' },
  { id: 'bundles', label: 'Bundles', icon: 'carbon-chart-treemap' },
] as const satisfies ReadonlyArray<{ id: DevtoolsPanelId, label: string, icon: string }>
