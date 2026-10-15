import type { FindingEntries } from './types'

/** Where the app finds its backend, and whether the deployment can be read at all. */
export const DEPLOYMENT_FINDINGS = {
  'backend-site-url': { title: 'Backend site URL' },
  'deployment-env': { title: 'Deployment env' },
} as const satisfies FindingEntries
