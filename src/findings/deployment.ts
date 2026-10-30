import type { FindingEntries } from './types'

/**
 * Where the app finds its backend, whether the deployment can be read at all,
 * what kind of deployment it is (`BACKEND_ENVIRONMENT`), whether a variable
 * 0.2.0 removed is still set on it, and whether a new preview deployment
 * starts with the env its first push needs.
 */
export const DEPLOYMENT_FINDINGS = {
  'backend-site-url': { title: 'Backend site URL' },
  'deployment-env': { title: 'Deployment env' },
  // Unset, `development` and `preview` fail under --prod; `sandbox` is a deliberate warning.
  'deployment-backend-environment': { title: 'Deployment BACKEND_ENVIRONMENT', prod: 'fail', fixable: true },
  'deployment-removed-env': { title: 'Removed variables' },
  'env-defaults': { title: 'Preview env defaults' },
} as const satisfies FindingEntries
