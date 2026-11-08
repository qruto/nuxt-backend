import { PENDING_CREDIT_TTL_MS } from '../../constants.js'
import { getBackendError } from '../../errors.js'
import { logBackend } from '../../log.js'
import { sha256Hex } from '../../tokens.js'
import type { BillingContext } from './context.js'
import type { BillingCredits } from './credits.js'
import type { BillingEntitlements } from './entitlements.js'
import type { BillingFreePlan, QueueCtx, WelcomeGrant, WelcomeRun } from './free-plan.js'
import { trialAddress } from './lifecycle.js'
import type { RunWriteCtx } from './types/base.js'

// Welcome credits (`credits: { meter, units, once: true }` on the free
// plan): granted once per person, as the first workspace of an owner (or an
// account, with `billTo: 'user'`) first starts on the free plan, as soon as
// the reverse trial begins, not when it ends. The person is their address,
// tags and dots taken out, kept as a hash, as the reverse trial keys it: a
// second workspace of the same owner, or an account made again, gets none.
// The grant is a refund-shaped usage event keyed `welcome:<entityId>`: the
// provider drops a second event under the same key, so a retried grant, or a
// second start that raced the first, gives nothing more. It runs on the free
// plan's workpool, apart from the start, so a provider that refuses it
// retries the grant alone.

/** How long after the grant its balance is read back: past the window the cache keeps the credit in, by half a minute. */
const WELCOME_CHECK_DELAY_MS = PENDING_CREDIT_TTL_MS + 30_000

/** The provider event key of an entity's welcome credits: one per entity, ever. */
export function welcomeKey(entityId: string): string {
  return `welcome:${entityId}`
}

/** The welcome credits of one `setupBilling` call: claimed per person, queued after the first start, granted on the workpool. */
export function createWelcomeCredits(
  { catalogIds, accessToken, entityDeleting, cache }: Pick<BillingContext, 'catalogIds' | 'accessToken' | 'entityDeleting' | 'cache'>,
  { refund }: Pick<BillingCredits, 'refund'>,
  { refreshEntitlements }: Pick<BillingEntitlements, 'refreshEntitlements'>,
  freePlan: Pick<BillingFreePlan, 'queueWelcome' | 'checkWelcome'>,
) {
  const grant = catalogIds?.welcome

  /**
   * Queue an entity's welcome credits for its owner, when the catalog grants
   * some and the owner's address has none yet (another entity of theirs
   * took them): the claim is the person's one grant, and is refused for an
   * entity an erasure is deleting. Never fails the start it follows: a claim
   * or a queue that refuses is logged.
   */
  const queue = async (ctx: RunWriteCtx, entityId: string, owner: { userId: string, email: string }): Promise<void> => {
    // An owner with no address is no person to count once, as the reverse trial skips one.
    if (!grant || !owner.email) return
    try {
      const address = await sha256Hex(trialAddress(owner.email))
      if (!await ctx.runMutation(cache.claimWelcome, { address, entityId })) return
      await freePlan.queueWelcome(ctx as QueueCtx, entityId)
    }
    catch (error) {
      logBackend('error', 'billing.welcome_credits_unqueued', 'A new billing entity started on the free plan, but its welcome credits could not be queued.', error)
    }
  }

  /**
   * Grant an entity's welcome credits (`run: true`): the event, and the
   * cache's credit, which a provider read that does not count the event yet
   * cannot take back for a few minutes. The check (`run: 'check'`), scheduled
   * past that window, reads the balance back. A refusal of the provider
   * throws, for the workpool to retry; an entity whose customer is gone
   * answers `gone` and is not retried.
   */
  const run = async (ctx: RunWriteCtx, entityId: string, mode: WelcomeRun = true): Promise<WelcomeGrant> => {
    if (!grant) return 'none'
    if (!accessToken) return 'not_configured'
    if (await entityDeleting(ctx, entityId)) return 'gone'
    if (mode === 'check') {
      try {
        await refreshEntitlements(ctx, entityId)
      }
      catch (error) {
        // The credits landed; the next sync shows them.
        logBackend('warn', 'billing.welcome_credits_unsynced', 'Welcome credits were granted, but the balance could not be read back yet.', error)
      }
      return 'granted_before'
    }
    // A grant that runs before the first sync has no cached row to hold its credit: the refund reads the provider first.
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
      await freePlan.checkWelcome(ctx as QueueCtx, entityId, WELCOME_CHECK_DELAY_MS)
    }
    catch (error) {
      logBackend('warn', 'billing.welcome_credits_unsynced', 'Welcome credits were granted, but the balance could not be read back yet.', error)
    }
    return fresh ? 'granted' : 'granted_before'
  }

  return { queue, run }
}
