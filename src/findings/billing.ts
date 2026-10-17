import type { FindingEntries } from './types'

/** Billing access and events, and the catalog against the provider's settings. */
export const BILLING_FINDINGS = {
  'billing-access': { title: 'Billing access', prod: 'fail', fixable: true },
  'billing-webhook-secret': { title: 'Billing webhooks', prod: 'fail', fixable: true },
  'deployment-billing-access-token': { title: 'Deployment BILLING_ACCESS_TOKEN', prod: 'fail', fixable: true },
  'deployment-billing-webhook-secret': { title: 'Deployment BILLING_WEBHOOK_SECRET', prod: 'fail', fixable: true },
  'deployment-billing-environment': { title: 'Deployment BILLING_ENVIRONMENT', fixable: true },
  'billing-webhook-route': { title: 'Billing webhook route', prod: 'fail' },
  'billing-meter-usage': { title: 'Billing meters' },
  'billing-organization': { title: 'Billing organization' },
  'billing-multiple-subscriptions': { title: 'Multiple subscriptions' },
  'billing-proration': { title: 'Plan change proration' },
  'billing-benefit-grace': { title: 'Benefit revocation' },
  'billing-trial-abuse': { title: 'Trial abuse prevention' },
  'billing-portal': { title: 'Customer portal' },
  'billing-team-customers': { title: 'Team customers' },
  'billing-gift-twins': { title: 'Gift products' },
  'billing-feature-benefits': { title: 'Feature benefits' },
} as const satisfies FindingEntries
