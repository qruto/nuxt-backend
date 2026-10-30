import type { FindingEntries } from './types'

/** Billing access and events, and the catalog against the provider's settings. */
export const BILLING_FINDINGS = {
  'billing-access': { title: 'Billing access', prod: 'fail', fixable: true },
  // `billing sync` sets the secret, and `doctor --fix` never runs it.
  'billing-webhook-secret': { title: 'Billing webhooks', prod: 'fail' },
  'deployment-billing-access-token': { title: 'Deployment BILLING_ACCESS_TOKEN', prod: 'fail', fixable: true },
  'deployment-billing-webhook-secret': { title: 'Deployment BILLING_WEBHOOK_SECRET', prod: 'fail' },
  'billing-webhook-route': { title: 'Billing webhook route', prod: 'fail' },
  // The provider's endpoint for the deployment: still delivering, and subscribed to every event the package handles.
  'billing-webhook-enabled': { title: 'Billing webhook endpoint', prod: 'fail', fixable: true },
  'billing-webhook-events': { title: 'Billing webhook events', fixable: true },
  'billing-meter-usage': { title: 'Billing meters' },
  'billing-organization': { title: 'Billing organization' },
  'billing-multiple-subscriptions': { title: 'Multiple subscriptions' },
  'billing-proration': { title: 'Plan change proration' },
  'billing-benefit-grace': { title: 'Benefit revocation' },
  // `doctor --fix` turns these on at the provider, after you confirm; never off.
  'billing-trial-abuse': { title: 'Trial abuse prevention', fixable: true },
  'billing-portal': { title: 'Customer portal' },
  'billing-customer-emails': { title: 'Customer emails', fixable: true },
  'billing-team-customers': { title: 'Team customers' },
  'billing-gift-twins': { title: 'Gift products' },
  'billing-pass-products': { title: 'Plan pass products' },
  'billing-feature-benefits': { title: 'Feature benefits' },
  'billing-promotion-limits': { title: 'Promotion limits' },
  'billing-promotion-portal': { title: 'Promotions and plan changes' },
  'billing-provider-sdk': { title: 'Billing provider SDK' },
  // --prod only: the catalog against the production ids billing sync wrote.
  'billing-catalog-production': { title: 'Production catalog' },
} as const satisfies FindingEntries
