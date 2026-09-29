/** The panel's pages, in order. The DevTools docs page and the homepage drawing list the same six. */
export const PANEL_PAGES = [
  { to: '/', label: 'Overview', icon: 'carbon-dashboard' },
  { to: '/account', label: 'Account', icon: 'carbon-user-avatar' },
  { to: '/billing', label: 'Billing', icon: 'carbon-purchase' },
  { to: '/email', label: 'Email', icon: 'carbon-email' },
  { to: '/webhooks', label: 'Webhooks', icon: 'carbon-webhook' },
  { to: '/agents', label: 'Agents', icon: 'carbon-bot' },
] as const
