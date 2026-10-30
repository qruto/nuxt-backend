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
 * Whether a billing event refreshes the entity's cached entitlements: one of
 * {@link REFRESH_EVENTS}, or any subscription event (the pause and resume ones
 * too: each carries the subscription's scheduled changes).
 */
export function refreshesEntitlements(type: string): boolean {
  return (REFRESH_EVENTS as readonly string[]).includes(type) || type.startsWith('subscription.')
}

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

/**
 * The note the billing webhook route writes on a delivery about a free
 * plan, which DevTools folds into one row a run of them: the free plan's
 * renewals arrive every cycle for every billing entity.
 */
export const FREE_PLAN_NOTE = 'free plan'

/** A field of an event's data, in the SDK's spelling or the wire's. */
function field(data: Record<string, unknown>, camel: string, snake: string): unknown {
  return data[camel] ?? data[snake]
}

/**
 * Whether a billing event is about a free plan's lifecycle rather than a
 * charge: a subscription at $0 (the free plan's start, its renewals, its
 * upgrade away and its end), or a subscription's order that charged
 * nothing (a free cycle). Read off the event as the SDK parses it or as the
 * provider sends it. The billing route marks such a delivery for DevTools
 * to fold, and the shared event path records none of them
 * ({@link webhookActivity}).
 *
 * @internal
 */
export function isFreePlanEvent(event: { type?: unknown, data?: unknown }): boolean {
  const type = typeof event.type === 'string' ? event.type : ''
  const data = (event.data && typeof event.data === 'object' ? event.data : {}) as Record<string, unknown>
  if (type.startsWith('subscription.')) return data.amount === 0
  if (type.startsWith('order.')) return field(data, 'totalAmount', 'total_amount') === 0 && field(data, 'subscriptionId', 'subscription_id') != null
  return false
}

/** The kinds a billing webhook records on the shared event path, by the provider's event name. */
export const WEBHOOK_ACTIVITY = {
  'subscription.created': 'billing.subscription_created',
  'subscription.updated': 'billing.subscription_updated',
  'subscription.canceled': 'billing.subscription_canceled',
  'subscription.revoked': 'billing.subscription_revoked',
  'subscription.past_due': 'billing.subscription_past_due',
  'order.paid': 'billing.order_paid',
  'order.refunded': 'billing.order_refunded',
  'benefit_grant.created': 'billing.benefit_granted',
  'benefit_grant.revoked': 'billing.benefit_revoked',
} as const satisfies Partial<Record<(typeof ALL_BILLING_EVENTS)[number], string>>

/** What a webhook records: the kind, the thing it is about, and the kind's fields. */
export type WebhookActivity
  = | { type: 'billing.subscription_created', targetId: string, data: { productId: string, interval?: string, trialEndsAt?: number, trialDays?: number } }
    | { type: 'billing.subscription_revoked' | 'billing.subscription_past_due', targetId: string, data: { productId: string } }
    | { type: 'billing.subscription_canceled', targetId: string, data: { productId: string, reason?: string } }
    | { type: 'billing.subscription_updated', targetId: string, data: { productId: string, status: string } }
    | { type: 'billing.order_paid' | 'billing.order_refunded', targetId: string, data: { amount: number, currency: string, interval?: string, promotion?: string } }
    | { type: 'billing.benefit_granted' | 'billing.benefit_revoked', targetId: string, data: { benefitType: string } }

/** A string field of an event's data, in the SDK's spelling or the wire's; `undefined` for anything else. */
function stringField(data: Record<string, unknown>, camel: string, snake = camel): string | undefined {
  const value = field(data, camel, snake)
  return typeof value === 'string' && value !== '' ? value : undefined
}

/** A number field of an event's data, in the SDK's spelling or the wire's. */
function numberField(data: Record<string, unknown>, camel: string, snake: string): number | undefined {
  const value = field(data, camel, snake)
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/** A benefit grant's activity: the benefit, and its type. */
function benefitActivity(kind: WebhookActivity['type'], data: Record<string, unknown>): WebhookActivity | null {
  const benefitId = stringField(data, 'benefitId', 'benefit_id')
  const benefit = (data.benefit && typeof data.benefit === 'object' ? data.benefit : {}) as Record<string, unknown>
  return benefitId ? { type: kind as 'billing.benefit_granted', targetId: benefitId, data: { benefitType: stringField(benefit, 'type') ?? 'unknown' } } : null
}

/** A subscription's activity: the subscription, its product, and for an update its status. */
function subscriptionActivity(kind: WebhookActivity['type'], id: string, data: Record<string, unknown>): WebhookActivity {
  const productId = stringField(data, 'productId', 'product_id') ?? 'unknown'
  if (kind === 'billing.subscription_updated') return { type: kind, targetId: id, data: { productId, status: stringField(data, 'status') ?? 'unknown' } }
  // The customer's own reason goes with a cancellation: the win-back email reads it.
  const reason = kind === 'billing.subscription_canceled' ? stringField(data, 'customerCancellationReason', 'customer_cancellation_reason') : undefined
  if (kind === 'billing.subscription_canceled') return { type: kind, targetId: id, data: { productId, ...(reason ? { reason } : {}) } }
  if (kind !== 'billing.subscription_created') return { type: kind as 'billing.subscription_revoked', targetId: id, data: { productId } }
  return { type: kind, targetId: id, data: { productId, ...periodOf(data) } }
}

/** A date field, in the SDK's `Date` or the wire's ISO string, as epoch ms. */
function timeField(data: Record<string, unknown>, camel: string, snake: string): number | undefined {
  const value = field(data, camel, snake)
  const at = value instanceof Date ? value.getTime() : typeof value === 'string' ? Date.parse(value) : Number.NaN
  return Number.isFinite(at) ? at : undefined
}

/** A new subscription's billing period, and its trial when it starts with one: what the lifecycle email reads (the trial's end, the yearly switch). */
function periodOf(data: Record<string, unknown>): { interval?: string, trialEndsAt?: number, trialDays?: number } {
  const interval = stringField(data, 'recurringInterval', 'recurring_interval')
  const trialStart = timeField(data, 'trialStart', 'trial_start')
  const trialEndsAt = timeField(data, 'trialEnd', 'trial_end')
  const trial = trialEndsAt !== undefined && trialStart !== undefined && trialEndsAt > trialStart
    ? { trialEndsAt, trialDays: Math.round((trialEndsAt - trialStart) / 86_400_000) }
    : {}
  return { ...(interval ? { interval } : {}), ...trial }
}

/** An order's activity: what it charged, or refunded; `null` for one that charged nothing. */
function orderActivity(kind: WebhookActivity['type'], id: string, data: Record<string, unknown>): WebhookActivity | null {
  const amount = kind === 'billing.order_refunded'
    ? numberField(data, 'refundedAmount', 'refunded_amount')
    : numberField(data, 'netAmount', 'net_amount') ?? numberField(data, 'totalAmount', 'total_amount')
  if (amount === undefined || amount <= 0) return null
  const subscription = (data.subscription && typeof data.subscription === 'object' ? data.subscription : {}) as Record<string, unknown>
  const interval = stringField(subscription, 'recurringInterval', 'recurring_interval')
  const promotion = kind === 'billing.order_paid' ? promotionOf(data) : undefined
  return { type: kind as 'billing.order_paid', targetId: id, data: { amount, currency: stringField(data, 'currency') ?? 'unknown', ...(interval && kind === 'billing.order_paid' ? { interval } : {}), ...(promotion ? { promotion } : {}) } }
}

/**
 * The catalog key of the discount an order was bought with: `billing sync`
 * tags each discount it makes with `managedBy` and its `key`. `undefined`
 * for no discount, and for one made elsewhere (its id would name nothing
 * the funnel can show).
 */
function promotionOf(data: Record<string, unknown>): string | undefined {
  const discount = (data.discount && typeof data.discount === 'object' ? data.discount : {}) as Record<string, unknown>
  const metadata = (discount.metadata && typeof discount.metadata === 'object' ? discount.metadata : {}) as Record<string, unknown>
  return metadata.managedBy === 'nuxt-backend' && typeof metadata.key === 'string' && metadata.key ? metadata.key.slice(0, 64) : undefined
}

/**
 * What a verified billing webhook records on the shared event path, or
 * `null` for nothing: an event no kind stands for, one that names nothing
 * to record it about, a free plan's own lifecycle ({@link isFreePlanEvent}),
 * and an order that charged nothing (a gift's claim, a fully discounted
 * pack). A benefit grant of the free plan is told apart by the caller,
 * which reads the subscription that granted it.
 *
 * @internal
 */
export function webhookActivity(event: { type?: unknown, data?: unknown }): WebhookActivity | null {
  const type = typeof event.type === 'string' ? event.type : ''
  if (!Object.hasOwn(WEBHOOK_ACTIVITY, type) || isFreePlanEvent(event)) return null
  const data = (event.data && typeof event.data === 'object' ? event.data : {}) as Record<string, unknown>
  const kind = WEBHOOK_ACTIVITY[type as keyof typeof WEBHOOK_ACTIVITY]
  if (type.startsWith('benefit_grant.')) return benefitActivity(kind, data)
  const id = stringField(data, 'id')
  if (!id) return null
  return type.startsWith('subscription.') ? subscriptionActivity(kind, id, data) : orderActivity(kind, id, data)
}
