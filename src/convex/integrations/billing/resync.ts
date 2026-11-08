import { internalActionGeneric, makeFunctionReference } from 'convex/server'
import { v } from 'convex/values'
import { RESYNC_ENTITLEMENTS_FUNCTION } from '../../constants.js'
import type { BillingContext } from './context.js'
import type { BillingEntitlements } from './entitlements.js'
import { type BillingFreePlan, type EntityFunction, pageBillingEntities, type QueueCtx } from './free-plan.js'

// `nuxt-backend billing resync`: every billing entity's entitlements read
// again from the provider into the component's cache, the way one entity's
// are by `syncEntitlements`. What heals a cache that missed webhooks (an
// endpoint that was off, a secret that changed, a deployment restored from a
// backup), or that a catalog change left stale. It pages the entities as the
// free plan's backfill does, and queues each one on the free plan's queue,
// which retries a request the provider's rate limit refused. An app that
// bills entities of its own (`billTo: 'user'` with its own `resolveEntity`,
// a team in its own tables) has none the backend can page: the sweep says
// so, and each entity is read again by its id.

/**
 * What one run answers: a page queued (and whether more follow), one
 * entity read again or gone, or `custom_entities` for a sweep of an app
 * whose entities are its own, which only it can name.
 */
export type ResyncOutcome = { queued: number, more: boolean } | 'synced' | 'gone' | 'custom_entities'

/** The entitlement resync of one `setupBilling` call. */
export function createResync(
  { components, config, billTo, entityDeleting, requireProviderAccess }: BillingContext,
  { refreshEntitlements }: Pick<BillingEntitlements, 'refreshEntitlements'>,
  { enqueue }: Pick<BillingFreePlan, 'enqueue'>,
) {
  // The scaffold's `resyncEntitlements`, by its module name: what each page and each entity run.
  const reference = makeFunctionReference<'action', { entityId?: string, cursor?: string }>(RESYNC_ENTITLEMENTS_FUNCTION) as unknown as EntityFunction

  // Internal, as `startFreePlan` is: without `entityId` it queues every
  // existing billing entity, a page at a time, each page scheduling the
  // next (`npx convex run billing:resyncEntitlements '{}'`); with one, it
  // reads that entity's state again. An entity an erasure is deleting is
  // left alone. With `billTo: 'workspace'` a resolver of the app's own
  // still returns workspaces (every call checks membership in one), so the
  // sweep pages them; with `billTo: 'user'` it may return anything, and the
  // accounts are not the entities.
  const resyncEntitlements = internalActionGeneric({
    args: { entityId: v.optional(v.string()), cursor: v.optional(v.string()) },
    returns: v.union(v.object({ queued: v.number(), more: v.boolean() }), v.literal('synced'), v.literal('gone'), v.literal('custom_entities')),
    handler: async (ctx, { entityId, cursor }): Promise<ResyncOutcome> => {
      requireProviderAccess('entitlement resync')
      if (entityId !== undefined) {
        if (await entityDeleting(ctx, entityId)) return 'gone'
        await refreshEntitlements(ctx, entityId)
        return 'synced'
      }
      if (billTo === 'user' && config.resolveEntity) return 'custom_entities'
      const page = await pageBillingEntities(ctx, { components, billTo }, cursor ?? null, RESYNC_ENTITLEMENTS_FUNCTION)
      for (const id of page.ids) await enqueue(ctx as QueueCtx, reference, id)
      if (!page.isDone) await ctx.scheduler.runAfter(0, reference, { cursor: page.continueCursor })
      return { queued: page.ids.length, more: !page.isDone }
    },
  })

  return { resyncEntitlements }
}
