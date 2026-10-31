import type { FindingEntries } from './types'

/** The notifications capability's own checks: the web push key pair, and the installable app web push on iPhone and iPad needs. */
export const NOTIFICATIONS_FINDINGS = {
  // The web push key pair env push generates: unset, the inbox works and push does not.
  'deployment-push-public-key': { title: 'Deployment PUSH_PUBLIC_KEY', fixable: true },
  'deployment-push-private-key': { title: 'Deployment PUSH_PRIVATE_KEY', fixable: true },
  // The manifest the module serves from the brand and two icons in public/.
  'installable': { title: 'Installable app' },
} as const satisfies FindingEntries
