import type { FindingEntries } from './types'

/** The email transport, its sender and test mode, and delivery events. */
export const EMAIL_FINDINGS = {
  'email-transport': { title: 'Email transport', prod: 'fail', fixable: true },
  'email-webhook-secret': { title: 'Email webhooks', prod: 'fail', fixable: true },
  'deployment-email-api-key': { title: 'Deployment EMAIL_API_KEY', prod: 'fail', fixable: true },
  'deployment-email-from': { title: 'Deployment EMAIL_FROM', fixable: true },
  'deployment-email-test-mode': { title: 'Deployment EMAIL_TEST_MODE', fixable: true },
  'deployment-email-webhook-secret': { title: 'Deployment EMAIL_WEBHOOK_SECRET', prod: 'fail', fixable: true },
  'email-webhook-route': { title: 'Email webhook route', prod: 'fail' },
} as const satisfies FindingEntries
