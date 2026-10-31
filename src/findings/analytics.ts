import type { FindingEntries } from './types'

/**
 * The admin console's revenue metrics: the billing access token reads the
 * provider's metrics (its `metrics:read` scope), which the Revenue view
 * asks for each time it opens. And the growth funnel's activation: the kind
 * `setupAudit({ activation })` names is one the app records.
 */
export const ANALYTICS_FINDINGS = {
  'analytics-metrics': { title: 'Billing metrics' },
  'analytics-activation': { title: 'Activation event' },
} as const satisfies FindingEntries
