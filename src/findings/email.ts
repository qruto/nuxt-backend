import type { FindingEntries } from './types'

/**
 * The email transport, its sender, and delivery events; under
 * `--prod`, what the provider says of the sender's domain, the last week's
 * bounces and complaints, and the quota used; and, read by the deployment's
 * email sync, the key's reach, the topics, the webhook's events and the
 * postal address marketing email carries.
 */
export const EMAIL_FINDINGS = {
  'email-transport': { title: 'Email transport', prod: 'fail', fixable: true },
  'email-webhook-secret': { title: 'Email webhooks', prod: 'fail', fixable: true },
  'deployment-email-api-key': { title: 'Deployment EMAIL_API_KEY', prod: 'fail', fixable: true },
  'deployment-email-from': { title: 'Deployment EMAIL_FROM', fixable: true },
  'deployment-email-webhook-secret': { title: 'Deployment EMAIL_WEBHOOK_SECRET', prod: 'fail', fixable: true },
  'email-webhook-route': { title: 'Email webhook route', prod: 'fail' },
  // The dev inbox's page reader: opted into outside production, and never left set on production.
  'deployment-email-dev-inbox': { title: 'Deployment EMAIL_DEV_INBOX' },
  // --prod only: read by the deployment with its own key (posture:email).
  'email-sender-domain': { title: 'Sending domain' },
  'email-reputation': { title: 'Bounces and complaints' },
  'email-quota': { title: 'Sending quota' },
  // Read by the deployment's own email sync, as a dry run (email:syncEmail).
  'email-key-permission': { title: 'Email key permission', fixable: true },
  'email-topics': { title: 'Email topics', fixable: true },
  'email-flows': { title: 'Lifecycle email flows', fixable: true },
  'email-webhook-events': { title: 'Email webhook events', fixable: true },
  'email-webhook-enabled': { title: 'Email webhook endpoint', prod: 'fail', fixable: true },
  'email-postal-address': { title: 'Postal address' },
  'email-marketing-from': { title: 'Marketing sender' },
  // EMAIL_REGION against the sending domain's region at the provider.
  'email-region': { title: 'Sending region' },
} as const satisfies FindingEntries
