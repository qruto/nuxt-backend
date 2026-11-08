import { type FunctionReference, type GenericActionCtx, type GenericDataModel, paginationOptsValidator, queryGeneric } from 'convex/server'
import { v } from 'convex/values'
import { DEFAULT_ADMIN_ROLES } from '../../constants.js'
import { logBackend } from '../../log.js'
import { type AdapterFindOne, type Administrators, createAccessReads, isAdministratorNow } from '../access.js'
import type { AiApi, AiComponents, AiCosts } from './config.js'
import { type ModerationFlag, type ModerationStatement, withheldFromUploader } from './moderation.js'
import type { ModelCall } from './models.js'

// What AI costs per person: every run's model calls are recorded in the
// backend component (`costs.ts` there) against who made it and the entity
// that paid, as the job queue's steps are, and `getCosts` reads them back
// for the admin console's Costs tab.

/**
 * What a run's model calls used and cost: the ones that reached a model,
 * finished or broken after they started (both were paid for). `usd` is the
 * sum the gateway reported, absent when no call reported one. `undefined`
 * when no call reached a model.
 */
export function usageOf(calls: readonly ModelCall[]) {
  const finished = calls.filter(call => call.state === 'finished' || call.state === 'failed')
  if (finished.length === 0) return undefined
  const priced = finished.filter(call => call.usd !== undefined)
  return {
    ...(priced.length > 0 ? { usd: priced.reduce((sum, call) => sum + call.usd!, 0) } : {}),
    input: finished.reduce((sum, call) => sum + call.usage.input, 0),
    output: finished.reduce((sum, call) => sum + call.usage.output, 0),
    cached: finished.reduce((sum, call) => sum + (call.usage.cachedInput ?? 0), 0),
    models: [...new Set(finished.map(call => call.model))],
  }
}

/** A context that can run the component's mutation: any action's. */
type RecordCtx = Pick<GenericActionCtx<GenericDataModel>, 'runMutation'>

/**
 * Record a run's cost once it ended, done or failed, as the job queue
 * records a step's: what its calls cost the app, against the person who
 * made it, and checks the day against the app's `spendLimit` when it has
 * one. A run whose calls never reached a model records nothing. A record
 * that fails is logged and never fails the run: the work is done, and the
 * person has their result.
 */
export function costRecorder(costs: AiComponents['backend']['costs'], spendLimitUsd?: number) {
  /** `run`: who made it (absent for the app's own) and the billing entity that paid, or `app`. */
  return async (ctx: RecordCtx, run: { userId?: string, owner: string }, calls: readonly ModelCall[]): Promise<void> => {
    const usage = usageOf(calls)
    if (!usage) return
    const { models: _models, ...spent } = usage
    try {
      await ctx.runMutation(costs.record, { ...(run.userId ? { userId: run.userId } : {}), owner: run.owner, usage: spent, ...(spendLimitUsd === undefined ? {} : { spendLimitUsd }) })
    }
    catch (error) {
      logBackend('warn', 'ai.cost_unrecorded', 'What a run\'s model calls cost could not be recorded: the Costs tab and the AI spend alert miss it.', error)
    }
  }
}

/** Records a run's cost (see {@link costRecorder}). */
export type RecordCost = ReturnType<typeof costRecorder>

/**
 * `getCosts`: what AI cost per person over a window, for administrators,
 * whose role is read fresh; `null` for anyone else, an administrator
 * acting as someone included.
 */
export function costsApi(components: AiComponents): AiApi {
  const administrators: Administrators = { roles: DEFAULT_ADMIN_ROLES, userIds: [] }
  // Made on the first read: setupAi itself touches no auth table.
  let reads: ReturnType<typeof createAccessReads> | undefined
  const getCosts = queryGeneric({
    args: { since: v.number() },
    handler: async (ctx, { since }): Promise<AiCosts | null> => {
      reads ??= createAccessReads(components.backend.adapter.findOne as AdapterFindOne)
      if (!await isAdministratorNow(ctx as never, reads, administrators, 'getCosts')) return null
      return await ctx.runQuery(components.backend.costs.summary, { since })
    },
  })
  // What the safety classifier flagged: the Moderation tab's page, for administrators.
  const listModerationFlags = queryGeneric({
    args: { paginationOpts: paginationOptsValidator, escalated: v.optional(v.boolean()) },
    handler: async (ctx, { paginationOpts, escalated }) => {
      reads ??= createAccessReads(components.backend.adapter.findOne as AdapterFindOne)
      const flags = (components.backend as unknown as { moderation?: { list: FunctionReference<'query', 'internal'> } }).moderation
      if (!await isAdministratorNow(ctx as never, reads, administrators, 'listModerationFlags')) return null
      if (!flags) return { page: [], isDone: true, continueCursor: '' }
      return await ctx.runQuery(flags.list, { paginationOpts, ...(escalated ? { escalated } : {}) })
    },
  })
  // A decision's statement of reasons (DSA Art. 17), for the person it was about or an administrator.
  const getModerationStatement = queryGeneric({
    args: { flagId: v.string() },
    handler: async (ctx, { flagId }): Promise<ModerationStatement | null> => {
      const identity = await ctx.auth.getUserIdentity()
      const flags = (components.backend as unknown as { moderation?: { get: FunctionReference<'query', 'internal'> } }).moderation
      if (!identity || !flags) return null
      const flag = await ctx.runQuery(flags.get, { id: flagId }) as ModerationFlag | null
      if (!flag) return null
      reads ??= createAccessReads(components.backend.adapter.findOne as AdapterFindOne)
      const administrator = await isAdministratorNow(ctx as never, reads, administrators, 'getModerationStatement')
      // Suspected child sexual abuse material goes to the authorities, never back to who uploaded it.
      if (!administrator && (flag.userId !== identity.subject || withheldFromUploader(flag))) return null
      return statementOf(flag)
    },
  })
  return { getCosts, listModerationFlags, getModerationStatement } as unknown as AiApi
}

/** A recorded decision as its statement of reasons: what was decided, on what grounds, by what means and under which policy. */
function statementOf(flag: ModerationFlag): ModerationStatement {
  return {
    id: flag.id,
    at: flag.at,
    decision: flag.blocked ? 'blocked' : 'flagged',
    automated: flag.automated ?? true,
    categories: flag.categories,
    providers: flag.providers ?? [flag.model],
    ...(flag.policyVersion ? { policyVersion: flag.policyVersion } : {}),
    ...(flag.subject ? { subject: flag.subject } : {}),
    ...(flag.stage ? { stage: flag.stage } : {}),
  }
}
