import type { WebhookEventHandlers } from '@convex-dev/polar'

/** Webhook events that signal a customer's plans / benefits / credits may have changed. */
export const REFRESH_EVENTS = [
  'customer.state_changed',
  'order.created',
  'order.paid',
  'order.refunded',
  'subscription.created',
  'subscription.updated',
  'subscription.active',
  'subscription.canceled',
  'subscription.uncanceled',
  'subscription.past_due',
  'subscription.revoked',
  'refund.created',
  'refund.updated',
  'benefit_grant.created',
  'benefit_grant.updated',
  'benefit_grant.cycled',
  'benefit_grant.revoked',
] as const satisfies ReadonlyArray<keyof WebhookEventHandlers>

/**
 * The provider's full webhook catalog. The composed handler map covers every
 * one of these, so any verified delivery gets logging, dedupe, and consumer
 * dispatch — events outside it (a newer provider than this package) land in
 * `onUnknownEvent` with a 202 instead of an error loop.
 */
export const ALL_BILLING_EVENTS = [
  'checkout.created',
  'checkout.updated',
  'checkout.expired',
  'customer.created',
  'customer.updated',
  'customer.deleted',
  'customer.state_changed',
  'customer_seat.assigned',
  'customer_seat.claimed',
  'customer_seat.revoked',
  'member.created',
  'member.updated',
  'member.deleted',
  'order.created',
  'order.updated',
  'order.paid',
  'order.refunded',
  'subscription.created',
  'subscription.updated',
  'subscription.active',
  'subscription.canceled',
  'subscription.uncanceled',
  'subscription.revoked',
  'subscription.past_due',
  'refund.created',
  'refund.updated',
  'product.created',
  'product.updated',
  'benefit.created',
  'benefit.updated',
  'benefit_grant.created',
  'benefit_grant.cycled',
  'benefit_grant.updated',
  'benefit_grant.revoked',
  'organization.updated',
  // SDK-known, not yet live on the provider API — composed into the handler
  // map (harmless) but excluded from the provisioning list.
  'subscription.paused',
  'subscription.resumed',
] as const
