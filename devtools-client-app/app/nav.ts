/**
 * The panel's tabs, in order. One page, so no vue-router in the bundle: a tab
 * switches the component `app.vue` renders. The DevTools docs page and the
 * homepage drawing list the same tabs (the docs contract checks both).
 */
export const PANEL_TABS = [
  { id: 'overview', label: 'Overview', icon: 'carbon-dashboard' },
  { id: 'account', label: 'Account', icon: 'carbon-user-avatar' },
  { id: 'billing', label: 'Billing', icon: 'carbon-purchase' },
  { id: 'email', label: 'Email', icon: 'carbon-email' },
  { id: 'webhooks', label: 'Webhooks', icon: 'carbon-webhook' },
  { id: 'agents', label: 'Agents', icon: 'carbon-bot' },
  { id: 'activity', label: 'Activity', icon: 'carbon-activity' },
] as const

export type PanelTabId = (typeof PANEL_TABS)[number]['id']
