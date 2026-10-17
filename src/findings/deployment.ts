import type { FindingEntries } from './types'

/**
 * Where the app finds its backend, whether the deployment can be read at all,
 * and whether a new preview deployment starts with the env its first push needs.
 */
export const DEPLOYMENT_FINDINGS = {
  'backend-site-url': { title: 'Backend site URL' },
  'deployment-env': { title: 'Deployment env' },
  'env-defaults': { title: 'Preview env defaults' },
} as const satisfies FindingEntries
