import type { BackendEventType } from '../../events.js'
import { logBackend } from '../../log.js'
import { type Audit, type AuditCtx, type BackendEventActor, type BackendEventData, setupAudit } from '../audit.js'
import type { RunWriteCtx } from './types/base.js'
import type { BillingComponents } from './types/setup.js'

// Billing's write points on the shared event path: what a billing webhook,
// a checkout, a change to the plan, a refund, a gift and a credit balance
// crossing its mark record on the audit trail, for the billing entity they
// concern. Recording never fails what it records: a failure is logged, and
// the webhook, the checkout or the spend stands. An entity an account's
// erasure is deleting records nothing: the provider's webhooks that follow
// its customer's deletion would name it again once the trail forgot it.

/** Records events through the shared event path: the app's `setupAudit` instance, or the component's own. */
export type BillingAudit = Pick<Audit, 'recordBackendEvent'>

/** One billing event, for the entity it concerns. */
export interface BillingActivity<T extends BackendEventType> {
  type: T
  /** Who acted: left out, the caller's identity; `null` for the app itself (a webhook, a job). */
  actor?: BackendEventActor | null
  /** The thing acted on: a subscription, an order, a gift, a benefit. Never an address. */
  targetId?: string
  data?: BackendEventData<T>
}

/** Record a billing event for one entity, never failing the caller. */
export type RecordBillingEvent = <T extends BackendEventType>(ctx: RunWriteCtx & Partial<Pick<AuditCtx, 'auth'>>, entityId: string, event: BillingActivity<T>) => Promise<void>

/**
 * The audit trail billing records on: the app's instance (`setupBilling({
 * audit })`), else the component's own when the component has its audit
 * module, else none (a component built before it).
 */
function trailOf(components: BillingComponents, audit: BillingAudit | undefined): BillingAudit | undefined {
  if (audit) return audit
  const backend = components.backend as { audit?: unknown, adapter?: unknown }
  return backend.audit && backend.adapter ? setupAudit(components) : undefined
}

/**
 * The recorder of one `setupBilling` call. An entity is a workspace with
 * `billTo: 'workspace'`, so its events name it as their workspace; with
 * `billTo: 'user'` it is an account, which the events are about.
 */
export function createBillingActivity(
  components: BillingComponents,
  billTo: 'workspace' | 'user',
  audit: BillingAudit | undefined,
  entityDeleting: (ctx: RunWriteCtx, entityId: string) => Promise<boolean>,
): RecordBillingEvent {
  const trail = trailOf(components, audit)
  return async (ctx, entityId, event) => {
    if (!trail || !entityId) return
    try {
      if (await entityDeleting(ctx, entityId)) return
      await trail.recordBackendEvent(ctx as AuditCtx, {
        type: event.type,
        ...(event.actor === undefined ? {} : { actor: event.actor }),
        ...(billTo === 'workspace' ? { entityId } : { subjectId: entityId }),
        ...(event.targetId ? { targetId: event.targetId } : {}),
        ...(event.data ? { data: event.data } : {}),
      } as never)
    }
    catch (error) {
      logBackend('warn', 'audit.record_failed', `A ${event.type} event was not recorded; what it records went through.`, error)
    }
  }
}
