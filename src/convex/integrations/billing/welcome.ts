import { getBackendError } from '../../errors.js'
import { logBackend } from '../../log.js'
import type { BillingContext } from './context.js'
import type { BillingCredits } from './credits.js'
import type { BillingEntitlements } from './entitlements.js'
import type { BillingFreePlan, QueueCtx, WelcomeGrant } from './free-plan.js'
import type { RunWriteCtx } from './types/base.js'

// Welcome credits (`credits: { meter, units, once: true }` on the free
// plan): granted once to every new billing entity, as its free plan first
// starts, after the reverse trial. The grant is a refund-shaped usage event
// keyed `welcome:<entityId>`: the provider drops a second event under the
// same key, so a retried grant, or a second start that raced the first,
// gives nothing more. It runs on the free plan's workpool, apart from the
// start, so a provider that refuses it retries the grant alone.

/** The provider event key of an entity's welcome credits: one per entity, ever. */
export function welcomeKey(entityId: string): string {
  return `welcome:${entityId}`
}

/** The welcome credits of one `setupBilling` call: queued after the first start, granted on the workpool. */
export function createWelcomeCredits(
  { catalogIds, accessToken, entityDeleting }: BillingContext,
  { refund }: Pick<BillingCredits, 'refund'>,
  { refreshEntitlements }: Pick<BillingEntitlements, 'refreshEntitlements'>,
  freePlan: Pick<BillingFreePlan, 'queueWelcome'>,
) {
  const grant = catalogIds?.welcome

  /**
   * Queue an entity's welcome credits, when the catalog grants some. Never
   * fails the start it follows: a queue that refuses is logged.
   */
  const queue = async (ctx: RunWriteCtx, entityId: string): Promise<void> => {
    if (!grant) return
    try {
      await freePlan.queueWelcome(ctx as QueueCtx, entityId)
    }
    catch (error) {
      logBackend('error', 'billing.welcome_credits_unqueued', 'A new billing entity started on the free plan, but its welcome credits could not be queued.', error)
    }
  }

  /**
   * Grant an entity's welcome credits: the event, then a fresh read of its
   * balance (the provider made the meter for the event), so they show at
   * once. A refusal of the provider throws, for the workpool to retry; an
   * entity whose customer is gone answers `gone` and is not retried.
   */
  const run = async (ctx: RunWriteCtx, entityId: string): Promise<WelcomeGrant> => {
    if (!grant) return 'none'
    if (!accessToken) return 'not_configured'
    if (await entityDeleting(ctx, entityId)) return 'gone'
    let fresh: boolean
    try {
      fresh = await refund(ctx, { userId: entityId, meter: grant.meter, value: grant.units, externalId: welcomeKey(entityId), metadata: { reason: 'welcome' } })
    }
    catch (error) {
      const refusal = getBackendError(error)
      if (refusal?.code === 'not_ready' && (refusal.data as { reason?: string }).reason === 'no_customer') return 'gone'
      throw error
    }
    try {
      await refreshEntitlements(ctx, entityId)
    }
    catch (error) {
      // The credits landed; the next sync shows them.
      logBackend('warn', 'billing.welcome_credits_unsynced', 'Welcome credits were granted, but the balance could not be read back yet.', error)
    }
    return fresh ? 'granted' : 'granted_before'
  }

  return { queue, run }
}
