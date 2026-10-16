import type { FindingEntries } from './types'

/** The auth secret, the app origin, and the pages auth emails link to. */
export const AUTH_FINDINGS = {
  'auth-secret': { title: 'Auth secret', fixable: true },
  'site-url': { title: 'App site URL', fixable: true },
  'deployment-auth-secret': { title: 'Deployment AUTH_SECRET', fixable: true },
  'deployment-site-url': { title: 'Deployment SITE_URL', fixable: true },
  'deployment-auth-trust-local-origins': { title: 'Deployment AUTH_TRUST_LOCAL_ORIGINS', prod: 'fail' },
  'invitation-path': { title: 'Invitation route' },
} as const satisfies FindingEntries
