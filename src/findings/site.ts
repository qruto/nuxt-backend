import type { FindingEntries } from './types'

/**
 * The app's live origin, as `doctor --prod` probes it at production's
 * `SITE_URL`: HTTPS with HSTS, the security headers' content security
 * policy, the backend the served app talks to, and the docs it serves coding
 * agents (`/llms.txt`).
 */
export const SITE_FINDINGS = {
  'site-https': { title: 'HTTPS and HSTS' },
  'site-csp': { title: 'Content security policy' },
  'site-backend-url': { title: 'Backend the site uses' },
  'agent-docs': { title: 'Docs for agents' },
} as const satisfies FindingEntries
