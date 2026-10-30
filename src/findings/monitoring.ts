import type { FindingEntries } from './types'

/**
 * Error reports and cron check-ins: the DSN on the deployment, where the app reads a DSN, the source maps
 * a deploy uploads, and the backend's own exception reporting, which only
 * its dashboard turns on; under `--prod`, the live health endpoint and
 * production's usage-limit warnings.
 */
export const MONITORING_FINDINGS = {
  'deployment-monitoring-dsn': { title: 'Deployment MONITORING_DSN', fixable: true },
  'monitoring-app': { title: 'App error reports' },
  'monitoring-source-maps': { title: 'Source maps' },
  'monitoring-backend-exceptions': { title: 'Backend exception reporting' },
  // --prod only: probed on the live site.
  'monitoring-health': { title: 'Health endpoint' },
  // --prod only: production's usage limits, read with the Convex CLI.
  'monitoring-usage-alerts': { title: 'Usage alerts' },
} as const satisfies FindingEntries
