import type { FindingEntries } from './types'

/**
 * The auth secret and the app origin; under `--prod`, that origin's own, and
 * a gated page and the sign-in proxy probed on it; the first administrator;
 * and the paths the deployment links to, against the pages nuxt.config mounts.
 */
export const AUTH_FINDINGS = {
  'auth-secret': { title: 'Auth secret', fixable: true },
  'site-url': { title: 'App site URL', fixable: true },
  'deployment-auth-secret': { title: 'Deployment AUTH_SECRET', fixable: true },
  'deployment-site-url': { title: 'Deployment SITE_URL', fixable: true },
  // --prod only: production's SITE_URL, and the live site at it.
  'site-url-origin': { title: 'Production site URL' },
  'site-gated-page': { title: 'Gated pages' },
  'site-auth-proxy': { title: 'Sign-in proxy' },
  // --prod only: every required consent links its document.
  'consent-urls': { title: 'Consent documents' },
  // An account with the admin role, read off the deployment; --fix asks for its address.
  'admin-bootstrap': { title: 'First administrator', fixable: true },
  // The deployment's paths (auth:authConfig) against nuxt.config's: the auth route and the pages its emails link to.
  'page-paths': { title: 'Page paths' },
} as const satisfies FindingEntries
