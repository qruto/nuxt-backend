import { type FunctionReference, type GenericActionCtx, type GenericDataModel, internalActionGeneric, makeFunctionReference } from 'convex/server'
import { type Infer, v } from 'convex/values'
import { RESYNC_ENTITLEMENTS_FUNCTION } from '../../constants.js'
import { logBackend } from '../../log.js'
import type { BillingContext } from './context.js'
import type { BillingEntitlements } from './entitlements.js'
import { pageBillingEntities } from './free-plan.js'
import { providerRateLimit } from './rate-limit.js'
import type { RunWriteCtx } from './types/base.js'

// `nuxt-backend billing resync`: every billing entity's entitlements read
// again from the provider into the component's cache, the way one entity's
// are by `syncEntitlements`. What heals a cache that missed webhooks (an
// endpoint that was off, a secret that changed, a deployment restored from a
// backup), or that a catalog change left stale. It pages the entities as the
// free plan's backfill does, and reads them in turn, paced under the
// provider's rate limit (the sandbox's is 100 requests a minute, shared with
// the app's own): a refused read waits as long as the provider's
// `Retry-After` asks, and one that gives up is logged with its id
// (`billing.resync_failed`). Each run carries the sweep's tally to the next,
// and the last one logs it (`billing.resync_done`). An app that bills
// entities of its own (`billTo: 'user'` with its own `resolveEntity`, a
// team in its own tables) has none the backend can page: the sweep says so,
// and each entity is read again by its id.

/**
 * What one run answers: a page queued (and whether more follow), one
 * entity read again, gone or given up on, or `custom_entities` for a sweep
 * of an app whose entities are its own, which only it can name.
 */
export type ResyncOutcome = { queued: number, more: boolean } | 'synced' | 'gone' | 'failed' | 'custom_entities'

/** The least time between two entities' reads: at most sixty a minute, under the sandbox's hundred requests. */
const RESYNC_SPACING_MS = 1000

/** How long one run reads before it hands the rest of its page to the next: well inside an action's ten minutes. */
const RUN_BUDGET_MS = 4 * 60_000

/** How many times an entity is read while the provider's rate limit refuses it, and after any other refusal. */
const RATE_LIMIT_ATTEMPTS = 8
const ERROR_ATTEMPTS = 3

/** The wait before another try with no `Retry-After` to go by: two seconds, doubling, at most a minute. */
const backoffMs = (attempt: number): number => Math.min(2000 * 2 ** (attempt - 1), 60_000)

/** The most entity ids the closing line names; the rest are counted. */
const FAILED_IDS_SHOWN = 50

const tallyValidator = v.object({ synced: v.number(), gone: v.number(), failed: v.number(), failedIds: v.array(v.string()) })

/** A sweep's running count, carried from run to run: read again, gone, given up on, and the ids given up on. */
type Tally = Infer<typeof tallyValidator>

/** What a run takes: one entity; or a sweep's start, its next page (`cursor`), or the rest of a page (`pending`). */
type ResyncArgs = { entityId?: string, cursor?: string, pending?: string[], last?: boolean, tally?: Tally }

const wait = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

/** An entity given up on after `attempt` tries, logged by id with the way to try it alone. */
function gaveUp(entityId: string, attempt: number, rateLimited: boolean): 'failed' {
  logBackend('warn', 'billing.resync_failed', `Billing entity ${entityId}'s entitlements were not read again after ${attempt} tries (${rateLimited ? 'the provider\'s rate limit' : 'the provider refused it'}); run billing resync --entity ${entityId} to try it alone.`)
  return 'failed'
}

/** The entitlement resync of one `setupBilling` call. */
export function createResync(
  { components, config, billTo, entityDeleting, requireProviderAccess }: BillingContext,
  { refreshEntitlements }: Pick<BillingEntitlements, 'refreshEntitlements'>,
) {
  // The scaffold's `resyncEntitlements`, by its module name: what each run of a sweep schedules next.
  const reference = makeFunctionReference<'action', ResyncArgs>(RESYNC_ENTITLEMENTS_FUNCTION) as unknown as FunctionReference<'action', 'internal', ResyncArgs>

  /**
   * One entity read again, tried again while the provider refuses it: after
   * the wait its rate limit names, else a backoff. One an erasure is
   * deleting is left alone. One that gives up is logged with its id.
   */
  const readOnce = async (ctx: RunWriteCtx, entityId: string): Promise<'synced' | 'gone'> => {
    if (await entityDeleting(ctx, entityId)) return 'gone'
    await refreshEntitlements(ctx, entityId)
    return 'synced'
  }
  const readEntity = async (ctx: RunWriteCtx, entityId: string): Promise<'synced' | 'gone' | 'failed'> => {
    for (let attempt = 1; ; attempt++) {
      const read = await readOnce(ctx, entityId).catch((error: unknown) => ({ limit: providerRateLimit(error) }))
      if (typeof read === 'string') return read
      if (attempt >= (read.limit ? RATE_LIMIT_ATTEMPTS : ERROR_ATTEMPTS)) return gaveUp(entityId, attempt, read.limit !== undefined)
      await wait(read.limit?.waitMs ?? backoffMs(attempt))
    }
  }

  /**
   * Read `ids` in turn, one a second at most, until the run's time is up:
   * the tally after them, and the ids left for the next run.
   */
  const readPaced = async (ctx: RunWriteCtx, ids: readonly string[], tally: Tally): Promise<{ left: string[], tally: Tally }> => {
    const started = Date.now()
    const next = { ...tally, failedIds: [...tally.failedIds] }
    for (const [index, id] of ids.entries()) {
      if (Date.now() - started > RUN_BUDGET_MS) return { left: ids.slice(index), tally: next }
      const begun = Date.now()
      const outcome = await readEntity(ctx, id)
      next[outcome]++
      if (outcome === 'failed' && next.failedIds.length < FAILED_IDS_SHOWN) next.failedIds.push(id)
      if (index < ids.length - 1) await wait(Math.max(0, begun + RESYNC_SPACING_MS - Date.now()))
    }
    return { left: [], tally: next }
  }

  /** A run of a started sweep: its page read in turn, then the rest handed on, or the sweep's tally logged. */
  const continueSweep = async (ctx: GenericActionCtx<GenericDataModel>, args: ResyncArgs & { tally: Tally }): Promise<ResyncOutcome> => {
    let { pending, cursor, last } = args
    if (pending === undefined) {
      const page = await pageBillingEntities(ctx, { components, billTo }, cursor ?? null, RESYNC_ENTITLEMENTS_FUNCTION)
      pending = page.ids
      cursor = page.continueCursor
      last = page.isDone
    }
    const { left, tally } = await readPaced(ctx, pending, args.tally)
    if (left.length > 0 || !last) {
      await ctx.scheduler.runAfter(0, reference, left.length > 0 ? { pending: left, cursor, last, tally } : { cursor, tally })
      return { queued: left.length, more: true }
    }
    const failed = tally.failed > 0 ? ` Given up on: ${tally.failedIds.join(', ')}${tally.failed > tally.failedIds.length ? ` and ${tally.failed - tally.failedIds.length} more` : ''}; run billing resync --entity with them to try again.` : ''
    logBackend('info', 'billing.resync_done', `Billing resync finished: ${tally.synced} read again, ${tally.gone} left to an erasure, ${tally.failed} given up on.${failed}`)
    return { queued: 0, more: false }
  }

  // Internal, as `startFreePlan` is: without `entityId` it starts a sweep of
  // every existing billing entity (`npx convex run billing:resyncEntitlements
  // '{}'`), answering how many the first page holds, and each later run reads
  // a page in turn and schedules the next; with one, it reads that entity's
  // state again. With `billTo: 'workspace'` a resolver of the app's own
  // still returns workspaces (every call checks membership in one), so the
  // sweep pages them; with `billTo: 'user'` it may return anything, and the
  // accounts are not the entities.
  const resyncEntitlements = internalActionGeneric({
    args: { entityId: v.optional(v.string()), cursor: v.optional(v.string()), pending: v.optional(v.array(v.string())), last: v.optional(v.boolean()), tally: v.optional(tallyValidator) },
    returns: v.union(v.object({ queued: v.number(), more: v.boolean() }), v.literal('synced'), v.literal('gone'), v.literal('failed'), v.literal('custom_entities')),
    handler: async (ctx, args): Promise<ResyncOutcome> => {
      requireProviderAccess('entitlement resync')
      if (args.entityId !== undefined) return await readEntity(ctx, args.entityId)
      if (billTo === 'user' && config.resolveEntity) return 'custom_entities'
      if (args.tally !== undefined) return await continueSweep(ctx, { ...args, tally: args.tally })
      // The start: the first page counted, and handed to the paced runs, so the caller is answered at once.
      const page = await pageBillingEntities(ctx, { components, billTo }, null, RESYNC_ENTITLEMENTS_FUNCTION)
      await ctx.scheduler.runAfter(0, reference, { pending: page.ids, cursor: page.continueCursor, last: page.isDone, tally: { synced: 0, gone: 0, failed: 0, failedIds: [] } })
      return { queued: page.ids.length, more: !page.isDone }
    },
  })

  return { resyncEntitlements }
}
