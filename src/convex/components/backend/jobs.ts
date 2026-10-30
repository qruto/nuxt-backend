import { type FunctionHandle, paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'
import { featureKeyOf } from '../../catalog.js'
import {
  DEFAULT_MODEL_LIMIT,
  dedicatedInEffect,
  erred,
  type ModelLimit,
  pickStarts,
  type PickState,
  POSITION_HORIZON,
  type QueuePolicy,
  rankOf,
  refundInFlight,
  resolveTiers,
  type ResolvedTier,
  scoreOf,
  standingOf,
  succeeded,
  throttled,
  tierFor,
} from '../../jobs-policy.js'
import type { Doc, Id } from './_generated/dataModel.js'
import { internalMutation, type MutationCtx, mutation, type QueryCtx, query } from './_generated/server.js'
import { addAiCost } from './costs.js'
import { vJobHold, vJobUsage } from './schema.js'
import { fileOwnerOf, reown } from './storage.js'

/**
 * The generation queue's rows (`defineJobQueue`, `nuxt-backend/ai`): the
 * line, its pick, each job's lease and outcome, the budget windows, the
 * model limits and the administrator's retunes. The app's queue calls these
 * with its policy from `backend/jobs.ts`; the work runs on the app's
 * Workflow component. Public component functions, reachable only through
 * the parent app (the `email.send` pattern).
 */

/** The policy `backend/jobs.ts` declares, as the app passes it on each call. */
const vPolicy = v.object({
  concurrency: v.number(),
  perOwner: v.number(),
  stallAfter: v.number(),
  tiers: v.array(v.object({
    name: v.string(),
    feature: v.optional(v.string()),
    headStart: v.optional(v.number()),
    perOwner: v.optional(v.number()),
    dedicated: v.optional(v.number()),
    budget: v.optional(v.object({ units: v.number(), period: v.number() })),
  })),
})

/** How many waiting jobs a pick or a place in line reads, from the front of the line. */
const LINE_WINDOW = 400

/**
 * How many queued rows that read walks at most. It passes over an owner's
 * jobs past what the pick could start for them, so one owner's backlog
 * never hides everyone else's jobs behind it.
 */
const LINE_SCAN = 2000

/** The finished jobs the average length leans on: each new one weighs this much. */
const AVERAGE_WEIGHT = 0.2

async function queueRow(ctx: QueryCtx): Promise<Doc<'jobQueue'> | null> {
  return await ctx.db.query('jobQueue').first()
}

async function writableQueue(ctx: MutationCtx): Promise<Doc<'jobQueue'>> {
  const row = await queueRow(ctx)
  if (row) return row
  const id = await ctx.db.insert('jobQueue', { paused: false, tiers: {} })
  return (await ctx.db.get('jobQueue', id))!
}

/** The concurrency in effect: the administrator's, else the code's. */
const concurrencyOf = (policy: QueuePolicy, row: Doc<'jobQueue'> | null): number => row?.concurrency ?? policy.concurrency

/** The features an owner's plan grants now, read from the entitlement cache with each benefit's metadata live. */
async function featuresOf(ctx: QueryCtx, owner: string): Promise<Set<string>> {
  const row = await ctx.db.query('billingEntitlements').withIndex('userId', q => q.eq('userId', owner)).unique()
  const features = new Set<string>()
  for (const benefit of row?.benefits ?? []) {
    const live = await ctx.db.query('billingBenefitMetadata').withIndex('benefitId', q => q.eq('benefitId', benefit.benefitId)).unique()
    features.add(featureKeyOf({ benefitId: benefit.benefitId, metadata: live?.metadata ?? benefit.metadata }))
  }
  return features
}

/** The tier an owner's plan puts a job in now, and its rank. */
async function ownerTier(ctx: QueryCtx, tiers: readonly { name: string, feature?: string }[], owner: string): Promise<{ tier?: string, rank: number }> {
  const features = await featuresOf(ctx, owner)
  const tier = tierFor(tiers, feature => features.has(feature))
  return { ...(tier === undefined ? {} : { tier }), rank: rankOf(tiers, tier) }
}

/** A job by its id as the app passes it, or `null`. */
async function jobOf(ctx: QueryCtx, jobId: string): Promise<Doc<'jobs'> | null> {
  const id = ctx.db.normalizeId('jobs', jobId)
  return id ? await ctx.db.get('jobs', id) : null
}

/** The fields that are set, for a patch that leaves the rest alone. */
function defined<T extends Record<string, unknown>>(fields: T): Partial<T> {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)) as Partial<T>
}

type JobUsage = NonNullable<Doc<'jobs'>['usage']>

/** A job's usage with one attempt's added: tokens summed, cost summed where any was reported. */
function addUsage(sum: JobUsage | undefined, usage: JobUsage): JobUsage {
  const usd = sum?.usd === undefined && usage.usd === undefined ? undefined : (sum?.usd ?? 0) + (usage.usd ?? 0)
  return {
    ...(usd === undefined ? {} : { usd }),
    input: (sum?.input ?? 0) + usage.input,
    output: (sum?.output ?? 0) + usage.output,
    cached: (sum?.cached ?? 0) + usage.cached,
    models: [...new Set([...(sum?.models ?? []), ...usage.models])],
  }
}

/** A finished job's length folded into the queue's average. */
async function recordLength(ctx: MutationCtx, length: number): Promise<void> {
  const row = await writableQueue(ctx)
  await ctx.db.patch('jobQueue', row._id, { averageMs: row.averageMs === undefined ? length : Math.round(row.averageMs * (1 - AVERAGE_WEIGHT) + length * AVERAGE_WEIGHT) })
}

/** A tier's overrides with a change applied: `null` drops a field, and a tier left with none drops out. */
function retuned(tiers: Doc<'jobQueue'>['tiers'], change: { name: string, perOwner?: number | null, dedicated?: number | null, budgetUnits?: number | null }): Doc<'jobQueue'>['tiers'] {
  const { name, ...fields } = change
  const merged = Object.fromEntries(Object.entries({ ...tiers[name], ...fields }).filter(([, value]) => value !== null && value !== undefined))
  const others = Object.entries(tiers).filter(([key]) => key !== name)
  return Object.fromEntries(Object.keys(merged).length > 0 ? [...others, [name, merged]] : others)
}

/** Running jobs, all of them: never more than the concurrency, at most twenty. */
async function runningJobs(ctx: QueryCtx): Promise<Doc<'jobs'>[]> {
  return await ctx.db.query('jobs').withIndex('by_status_and_score', q => q.eq('status', 'running')).take(100)
}

/**
 * The front of the line, in score order: at most `perOwner` jobs of each
 * owner, the rest of theirs passed over, so the window holds every owner
 * a free slot could start.
 */
async function waitingJobs(ctx: QueryCtx, perOwner = Number.POSITIVE_INFINITY): Promise<Doc<'jobs'>[]> {
  const front: Doc<'jobs'>[] = []
  const byOwner = new Map<string, number>()
  let scanned = 0
  for await (const job of ctx.db.query('jobs').withIndex('by_status_and_score', q => q.eq('status', 'queued'))) {
    if (++scanned > LINE_SCAN || front.length >= LINE_WINDOW) break
    const owner = lineOwner(job)
    const count = byOwner.get(owner) ?? 0
    if (count >= perOwner) continue
    byOwner.set(owner, count + 1)
    front.push(job)
  }
  return front
}

/** The most running jobs any owner may have: as many of each owner's waiting jobs as a pick could start. */
const pickWindow = (policy: QueuePolicy, tiers: readonly ResolvedTier[]): number =>
  Math.max(1, policy.perOwner, ...tiers.map(tier => tier.perOwner ?? 0))

/** Whether a job's credits go back as it ends: charged, not refunded, and failed or canceled with a refund. */
const owesRefund = (job: Doc<'jobs'>, status: Doc<'jobs'>['status'], refund: boolean): boolean =>
  refund && job.charged && !job.refunded && (status === 'failed' || status === 'canceled')

/** A guest job: one a signed-out visitor started, claimed at sign-up or not. */
const isGuest = (job: Doc<'jobs'>): boolean => job.visitor !== undefined

/** What a guest job's owner reads until a sign-up claims it. */
const guestOwner = (visitor: string): string => `guest:${visitor}`

/** Whose count a job is in the line: a guest job its visitor's, also once claimed, never the workspace's that claimed it. */
const lineOwner = (job: Doc<'jobs'>): string => job.visitor === undefined ? job.owner : guestOwner(job.visitor)

/** A job as the pick weighs it. */
const pickJob = (job: Doc<'jobs'>) => ({ id: job._id as string, owner: lineOwner(job), rank: job.rank, guest: isGuest(job) })

function pickState(policy: QueuePolicy, row: Doc<'jobQueue'> | null, tiers: ResolvedTier[], running: Doc<'jobs'>[], waiting: Doc<'jobs'>[], pausedAi: boolean): PickState {
  return {
    concurrency: concurrencyOf(policy, row),
    paused: pausedAi || row?.paused === true,
    tiers,
    perOwner: policy.perOwner,
    running: running.map(pickJob),
    waiting: waiting.map(pickJob),
  }
}

/** Give a job's budget back to the window it counted in. */
async function giveBack(ctx: MutationCtx, job: Doc<'jobs'>): Promise<void> {
  if (job.budgetWindow === undefined || job.budgetCounted <= 0) return
  const window = await ctx.db.query('jobBudgets')
    .withIndex('by_owner_and_windowStart', q => q.eq('owner', job.owner).eq('windowStart', job.budgetWindow!))
    .unique()
  if (window) await ctx.db.patch('jobBudgets', window._id, { used: Math.max(0, window.used - job.budgetCounted) })
  await ctx.db.patch('jobs', job._id, { budgetCounted: 0 })
}

/**
 * Count a job's cost in its owner's budget window, when it fits `units`
 * (none: always). Counted here, at the door, in the transaction that holds
 * its credits, so two members enqueueing at once never overshoot it.
 */
export const countBudget = mutation({
  args: { owner: v.string(), windowStart: v.number(), cost: v.number(), units: v.optional(v.number()), force: v.optional(v.boolean()) },
  returns: v.object({ ok: v.boolean(), used: v.number() }),
  handler: async (ctx, { owner, windowStart, cost, units, force }) => {
    const window = await ctx.db.query('jobBudgets')
      .withIndex('by_owner_and_windowStart', q => q.eq('owner', owner).eq('windowStart', windowStart))
      .unique()
    const used = window?.used ?? 0
    if (!force && units !== undefined && used + cost > units) return { ok: false, used }
    if (window) await ctx.db.patch('jobBudgets', window._id, { used: used + cost })
    else await ctx.db.insert('jobBudgets', { owner, windowStart, used: cost })
    return { ok: true, used: used + cost }
  },
})

/**
 * What an owner used in a window, the tier their plan puts them in now, and
 * each tier's budget units in effect (an administrator's retune applied).
 */
export const ownerState = query({
  args: { owner: v.string(), windowStart: v.optional(v.number()), policy: vPolicy },
  returns: v.object({
    used: v.number(),
    tier: v.optional(v.string()),
    rank: v.number(),
    tiers: v.array(v.object({ name: v.string(), feature: v.optional(v.string()), units: v.optional(v.number()) })),
  }),
  handler: async (ctx, { owner, windowStart, policy }) => {
    const window = windowStart === undefined
      ? null
      : await ctx.db.query('jobBudgets').withIndex('by_owner_and_windowStart', q => q.eq('owner', owner).eq('windowStart', windowStart)).unique()
    const tiers = resolveTiers(policy, (await queueRow(ctx))?.tiers)
    return {
      used: window?.used ?? 0,
      ...await ownerTier(ctx, tiers, owner),
      tiers: tiers.map(tier => ({ name: tier.name, ...(tier.feature ? { feature: tier.feature } : {}), ...(tier.budget ? { units: tier.budget.units } : {}) })),
    }
  },
})

/** Put a job in line, under its owner's tier now. */
export const join = mutation({
  args: {
    kind: v.string(),
    args: v.any(),
    owner: v.string(),
    userId: v.optional(v.string()),
    /** A guest job's visitor: it ranks after every tier, and its owner is `guest:<visitor>`. */
    visitor: v.optional(v.string()),
    cost: v.number(),
    meter: v.optional(v.string()),
    hold: v.optional(vJobHold),
    budgetWindow: v.optional(v.number()),
    budgetCounted: v.number(),
    policy: vPolicy,
    /** The app's queue, by a handle: what a guest's claim at sign-up wakes. */
    wake: v.optional(v.string()),
  },
  returns: v.string(),
  handler: async (ctx, { policy, wake, ...job }) => {
    const row = wake ? await writableQueue(ctx) : await queueRow(ctx)
    if (row && wake && wake !== row.wake) await ctx.db.patch('jobQueue', row._id, { wake })
    const tiers = resolveTiers(policy, row?.tiers)
    const placed = job.visitor !== undefined ? { rank: tiers.length } : await ownerTier(ctx, tiers, job.owner)
    const joinedAt = Date.now()
    const tier = tiers.find(entry => entry.name === (placed as { tier?: string }).tier)
    return await ctx.db.insert('jobs', {
      ...job,
      status: 'queued',
      ...(tier ? { tier: tier.name } : {}),
      rank: placed.rank,
      score: scoreOf(joinedAt, tier),
      joinedAt,
      charged: false,
      refunded: false,
      attempts: 0,
      retries: 0,
    })
  },
})

/** How many of a visitor's jobs of one status a claim or a count reads: a visitor gets a handful of tries at most. */
const VISITOR_JOBS = 100

/** A visitor's jobs of some statuses, read by status, so no number of others hides them. */
async function visitorJobsIn(ctx: QueryCtx, visitor: string, statuses: ReadonlyArray<Doc<'jobs'>['status']>): Promise<Doc<'jobs'>[]> {
  const pages = await Promise.all(statuses.map(status => ctx.db.query('jobs').withIndex('by_visitor_and_status', q => q.eq('visitor', visitor).eq('status', status)).take(VISITOR_JOBS)))
  return pages.flat()
}

/** How long a browser's used tries are kept after its last: the visitor cookie's year. */
export const GUEST_TRIES_RETENTION_MS = 365 * 24 * 60 * 60 * 1000

/** A browser's count of used tries, if it has one. */
async function triesOf(ctx: QueryCtx, visitor: string): Promise<Doc<'guestTries'> | null> {
  return await ctx.db.query('guestTries').withIndex('by_visitor', q => q.eq('visitor', visitor)).unique()
}

/** A job ended done: its length joins the queue's average, and a guest job's try is used. */
async function countDone(ctx: MutationCtx, job: Doc<'jobs'>, now: number): Promise<void> {
  if (job.startedAt !== undefined) await recordLength(ctx, now - job.startedAt)
  await useTry(ctx, job, now)
}

/** A guest job ended done: its browser's try is used, for the cookie's year, whatever becomes of the job's record. */
async function useTry(ctx: MutationCtx, job: Doc<'jobs'>, now: number): Promise<void> {
  if (job.visitor === undefined) return
  const row = await triesOf(ctx, job.visitor)
  if (row) await ctx.db.patch('guestTries', row._id, { done: row.done + 1, lastAt: now })
  else await ctx.db.insert('guestTries', { visitor: job.visitor, done: 1, lastAt: now, ...(job.userId === undefined ? {} : { userId: job.userId }) })
}

/**
 * How many jobs a visitor has started that count against `perVisitor`:
 * waiting, running or done. A failed or canceled one gave its try back. A
 * done one stays counted after the prune deletes its record: the count
 * kept in `guestTries` lasts the visitor cookie's year.
 */
export const visitorJobs = query({
  args: { visitor: v.string() },
  returns: v.number(),
  handler: async (ctx, { visitor }) => {
    const [jobs, tries] = await Promise.all([visitorJobsIn(ctx, visitor, ['queued', 'running', 'done']), triesOf(ctx, visitor)])
    const live = jobs.filter(job => job.status !== 'done').length
    return live + Math.max(tries?.done ?? 0, jobs.length - live)
  },
})

/**
 * The claim at sign-up, first half: an account created in the browser of
 * `visitor` (its signed cookie, read on the auth request) takes the
 * visitor's guest jobs that no account claimed yet. The first sign-up
 * claims them; a later one in the same browser claims nothing. Wakes the
 * app's queue to move them to the account's billing entity, which the
 * account's first session makes. Answers how many it took.
 */
export const claimVisitor = mutation({
  args: { visitor: v.string(), userId: v.string() },
  returns: v.number(),
  handler: async (ctx, { visitor, userId }) => {
    const jobs = await visitorJobsIn(ctx, visitor, ['queued', 'running', 'done', 'failed', 'canceled'])
    const unclaimed = jobs.filter(job => job.userId === undefined)
    for (const job of unclaimed) await ctx.db.patch('jobs', job._id, { userId })
    // The browser's used tries are the claiming account's from now: its erasure removes them.
    const tries = unclaimed.length > 0 ? await triesOf(ctx, visitor) : null
    if (tries && tries.userId === undefined) await ctx.db.patch('guestTries', tries._id, { userId })
    const wake = (await queueRow(ctx))?.wake
    if (unclaimed.length > 0 && wake) {
      await ctx.scheduler.runAfter(0, wake as FunctionHandle<'mutation', { op: 'claim', userId: string }>, { op: 'claim', userId })
    }
    return unclaimed.length
  },
})

/**
 * The claim at sign-up, second half: the account's claimed guest jobs that
 * still name their visitor as owner move to `owner`, the account's billing
 * entity. Each keeps its visitor, so a waiting one still runs as a guest
 * job. Answers the ids it moved.
 */
export const moveClaimed = mutation({
  args: { userId: v.string(), owner: v.string() },
  returns: v.array(v.string()),
  handler: async (ctx, { userId, owner }) => {
    const jobs = await ctx.db.query('jobs').withIndex('by_userId', q => q.eq('userId', userId)).take(500)
    const moved: string[] = []
    for (const job of jobs) {
      if (job.visitor === undefined || job.owner !== guestOwner(job.visitor)) continue
      await ctx.db.patch('jobs', job._id, { owner })
      // What its steps stored moves with it: the images, their owner records and their count.
      const fileOwner = await fileOwnerOf(ctx, owner, userId)
      for (const record of await ctx.db.query('aiProvenance').withIndex('jobId', q => q.eq('jobId', job._id)).take(100)) {
        await ctx.db.patch('aiProvenance', record._id, { owner })
        await reown(ctx, record.storageId, fileOwner, owner)
      }
      moved.push(job._id)
    }
    return moved
  },
})

/**
 * Fill the free slots: mark every job the pick starts as running, with its
 * lease, and keep the tiers in code so a plan change can re-tier waiting
 * jobs. A job whose tier left the code moves to its owner's tier now.
 */
export const pick = mutation({
  args: { policy: vPolicy, pausedAi: v.boolean(), wake: v.optional(v.string()) },
  returns: v.object({
    started: v.array(v.object({ jobId: v.string(), kind: v.string(), args: v.any() })),
    waiting: v.number(),
    running: v.number(),
  }),
  handler: async (ctx, { policy, pausedAi, wake }) => {
    const row = await writableQueue(ctx)
    const plan = policy.tiers.map(tier => ({ name: tier.name, ...(tier.feature ? { feature: tier.feature } : {}), headStart: tier.headStart ?? 0 }))
    if (JSON.stringify(plan) !== JSON.stringify(row.plan ?? null)) await ctx.db.patch('jobQueue', row._id, { plan })
    if (wake && wake !== row.wake) await ctx.db.patch('jobQueue', row._id, { wake })
    const tiers = resolveTiers(policy, row.tiers)
    const running = await runningJobs(ctx)
    const waiting = await waitingJobs(ctx, pickWindow(policy, tiers))
    for (const job of waiting) {
      if (isGuest(job) || job.tier === undefined || tiers.some(tier => tier.name === job.tier)) continue
      const placed = await ownerTier(ctx, tiers, job.owner)
      const tier = tiers.find(entry => entry.name === placed.tier)
      await ctx.db.patch('jobs', job._id, { tier: placed.tier, rank: placed.rank, score: scoreOf(job.joinedAt, tier) })
      Object.assign(job, { tier: placed.tier, rank: placed.rank })
    }
    const starts = pickStarts(pickState(policy, row, tiers, running, waiting, pausedAi))
    const now = Date.now()
    const started = []
    for (const id of starts) {
      const job = waiting.find(entry => entry._id === id)!
      await ctx.db.patch('jobs', job._id, { status: 'running', startedAt: now, leaseUntil: now + policy.stallAfter })
      started.push({ jobId: id, kind: job.kind, args: job.args })
    }
    return { started, waiting: waiting.length - started.length, running: running.length + started.length }
  },
})

/**
 * The component's own sweep (crons.ts), every minute: wake the app's queue
 * when a running job's lease ran out, or when jobs wait beside a free slot
 * (a switch turned back on, a plan that changed). It reads and returns
 * otherwise, and does nothing in an app with no queue.
 */
export const sweep = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const row = await queueRow(ctx)
    if (!row?.wake || row.paused) return null
    const now = Date.now()
    const running = await runningJobs(ctx)
    const stalled = running.some(job => job.leaseUntil !== undefined && job.leaseUntil < now)
    const waiting = await ctx.db.query('jobs').withIndex('by_status_and_score', q => q.eq('status', 'queued')).first()
    const free = (row.concurrency ?? Number.POSITIVE_INFINITY) > running.length
    if (stalled || (waiting && free)) await ctx.scheduler.runAfter(0, row.wake as FunctionHandle<'mutation', { op: 'pick' }>, { op: 'pick' })
    return null
  },
})

/** The workflow a started job runs on. */
export const attachWorkflow = mutation({
  args: { jobId: v.string(), workflowId: v.string() },
  returns: v.null(),
  handler: async (ctx, { jobId, workflowId }) => {
    const id = ctx.db.normalizeId('jobs', jobId)
    if (id) await ctx.db.patch('jobs', id, { workflowId })
    return null
  },
})

/**
 * A sign of life from a running job: its lease, and what its last attempt
 * did. `attempt` counts one attempt of a step; `usage` adds what its model
 * calls used; `lastError` keeps the provider's own text for administrators.
 */
export const touch = mutation({
  args: {
    jobId: v.string(),
    until: v.number(),
    attempt: v.optional(v.boolean()),
    lastError: v.optional(v.string()),
    usage: v.optional(vJobUsage),
    progress: v.optional(v.object({ done: v.number(), total: v.number(), label: v.optional(v.string()) })),
    /** The app's daily AI spend limit, in US dollars (`setupAi({ spendLimit })`), checked once the usage is added. */
    spendLimitUsd: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, { jobId, until, attempt, lastError, usage, progress, spendLimitUsd }) => {
    const job = await jobOf(ctx, jobId)
    if (job?.status !== 'running') return null
    await ctx.db.patch('jobs', job._id, defined({
      leaseUntil: Math.max(job.leaseUntil ?? 0, until),
      attempts: attempt ? job.attempts + 1 : undefined,
      lastError: lastError?.slice(0, 500),
      usage: usage && addUsage(job.usage, usage),
      progress,
    }))
    if (usage) await addAiCost(ctx, job, Date.now(), { usage, ...(spendLimitUsd === undefined ? {} : { spendLimitUsd }) })
    return null
  },
})

/** Record why a running job is about to fail, before its workflow does: what the person sees. */
export const recordError = mutation({
  args: { jobId: v.string(), error: v.any(), lastError: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { jobId, error, lastError }) => {
    const id = ctx.db.normalizeId('jobs', jobId)
    const job = id ? await ctx.db.get('jobs', id) : null
    if (!job || job.error !== undefined) return null
    await ctx.db.patch('jobs', job._id, { error, ...(lastError === undefined ? {} : { lastError: lastError.slice(0, 500) }) })
    return null
  },
})

/** A job as the app reads it back. */
const vJobDoc = v.any()

/**
 * End a job: done, failed or canceled, once. A failed job becomes a dead
 * letter and gives its budget back; so does a running job an administrator
 * canceled with a refund. A done job updates the average length the place
 * in line works with. Answers the job as it ended, or `null` when it had
 * already ended.
 */
export const finish = mutation({
  args: {
    jobId: v.string(),
    outcome: v.union(v.literal('done'), v.literal('failed'), v.literal('canceled')),
    result: v.optional(v.any()),
    error: v.optional(v.any()),
  },
  returns: vJobDoc,
  handler: async (ctx, { jobId, outcome, result, error }) => {
    const job = await jobOf(ctx, jobId)
    if (job?.status !== 'running' && job?.status !== 'queued') return null
    const now = Date.now()
    // A cancel that raced a failure, or an administrator's refund, ends as asked.
    const status = job.cancel && outcome === 'failed' ? 'canceled' : outcome
    const failed = status === 'failed'
    await ctx.db.patch('jobs', job._id, {
      status,
      endedAt: now,
      leaseUntil: undefined,
      result: status === 'done' ? result : undefined,
      error: failed ? job.error ?? error : job.error,
      deadLetter: failed || undefined,
    })
    const refunded = failed || (status === 'canceled' && job.cancel?.refund === true)
    if (refunded) await giveBack(ctx, job)
    if (owesRefund(job, status, refunded)) await ctx.db.patch('jobs', job._id, { refundOwed: 'pending', refundAt: now })
    if (status === 'done') await countDone(ctx, job, now)
    if (job.startedAt !== undefined) await addAiCost(ctx, job, now, { ended: true })
    return { ...(await ctx.db.get('jobs', job._id))!, refund: refunded }
  },
})

/**
 * Cancel a job. A waiting job leaves the line at once and gives its budget
 * back (the app releases its hold); a running one is marked, and stops after
 * its current step when the app cancels its workflow.
 */
export const cancel = mutation({
  args: { jobId: v.string(), by: v.string(), refund: v.boolean() },
  returns: vJobDoc,
  handler: async (ctx, { jobId, by, refund }) => {
    const id = ctx.db.normalizeId('jobs', jobId)
    const job = id ? await ctx.db.get('jobs', id) : null
    if (!job) return null
    if (job.status === 'queued') {
      const now = Date.now()
      // A retried job that carries its first run's charge gets it back: it never started.
      const owed = owesRefund(job, 'canceled', true)
      await ctx.db.patch('jobs', job._id, { status: 'canceled', endedAt: now, cancel: { by, refund }, ...(owed ? { refundOwed: 'pending' as const, refundAt: now } : {}) })
      await giveBack(ctx, job)
      return { ...job, was: 'queued', refundOwed: owed ? 'pending' : undefined }
    }
    if (job.status === 'running' && !job.cancel) await ctx.db.patch('jobs', job._id, { cancel: { by, refund } })
    return { ...job, was: job.status }
  },
})

/**
 * Begin a job's charge: `claimed` while it still runs and nobody canceled
 * it, `charged` when a retried job carries its first run's charge (or an
 * earlier attempt landed), else `ended`. From the claim on, the job's end
 * leaves the hold to the charge.
 */
export const claimCharge = mutation({
  args: { jobId: v.string() },
  returns: v.union(v.literal('claimed'), v.literal('charged'), v.literal('ended')),
  handler: async (ctx, { jobId }) => {
    const job = await jobOf(ctx, jobId)
    if (job?.charged) return 'charged' as const
    if (job?.status !== 'running' || job.cancel) return 'ended' as const
    if (job.charging === undefined) await ctx.db.patch('jobs', job._id, { charging: Date.now() })
    return 'claimed' as const
  },
})

/**
 * Note that a job's credits were charged. A job that ended while its charge
 * was on its way, failed or canceled with a refund, owes them back at once:
 * `refund` says so.
 */
export const mark = mutation({
  args: { jobId: v.string(), charged: v.literal(true) },
  returns: v.object({ refund: v.boolean() }),
  handler: async (ctx, { jobId }) => {
    const job = await jobOf(ctx, jobId)
    if (!job || job.charged) return { refund: false }
    const now = Date.now()
    const owed = job.status !== 'running' && owesRefund({ ...job, charged: true }, job.status, job.status === 'failed' || job.cancel?.refund === true)
    await ctx.db.patch('jobs', job._id, { charged: true, ...(owed ? { refundOwed: 'pending' as const, refundAt: now } : {}) })
    return { refund: owed }
  },
})

/**
 * How a refund's try went: `refunded` clears what the job owes; `retry`
 * keeps it owed, the next try due at `at`; `given_up` keeps it owed with
 * no try left. Answers whether the job still owed one, so a try that lost
 * a race with a retry does nothing.
 */
export const refundTried = mutation({
  args: { jobId: v.string(), outcome: v.union(v.literal('refunded'), v.literal('retry'), v.literal('given_up')), at: v.optional(v.number()) },
  returns: v.boolean(),
  handler: async (ctx, { jobId, outcome, at }) => {
    const job = await jobOf(ctx, jobId)
    if (job?.refundOwed !== 'pending') return false
    if (outcome === 'refunded') await ctx.db.patch('jobs', job._id, { refunded: true, refundOwed: undefined, refundAt: undefined })
    else if (outcome === 'retry') await ctx.db.patch('jobs', job._id, { refundAt: at ?? Date.now() })
    else await ctx.db.patch('jobs', job._id, { refundOwed: 'given_up' })
    return true
  },
})

/** One job, or `null`. */
export const get = query({
  args: { jobId: v.string() },
  returns: vJobDoc,
  handler: async (ctx, { jobId }) => {
    const id = ctx.db.normalizeId('jobs', jobId)
    return id ? await ctx.db.get('jobs', id) : null
  },
})

/** A waiting job's standing: what holds it, its place in line and its wait. */
export const standing = query({
  args: { jobId: v.string(), policy: vPolicy, pausedAi: v.boolean(), now: v.number() },
  returns: v.union(v.null(), v.object({ waitingOn: v.string(), position: v.union(v.number(), v.null()), estimatedWait: v.optional(v.number()) })),
  handler: async (ctx, { jobId, policy, pausedAi, now }) => {
    const row = await queueRow(ctx)
    const tiers = resolveTiers(policy, row?.tiers)
    const running = await runningJobs(ctx)
    const waiting = await waitingJobs(ctx, POSITION_HORIZON)
    if (!waiting.some(job => job._id === jobId)) {
      // Past the window read here: far back in the line.
      return { waitingOn: row?.paused || pausedAi ? 'paused' : 'line', position: null }
    }
    const standing = standingOf({
      ...pickState(policy, row, tiers, running, waiting, pausedAi),
      now,
      averageMs: row?.averageMs,
      startedAt: Object.fromEntries(running.map(job => [job._id, job.startedAt ?? now])),
    }, jobId)
    if (!standing) return null
    return { waitingOn: standing.waitingOn, position: standing.position, ...(standing.estimatedWait === undefined ? {} : { estimatedWait: standing.estimatedWait }) }
  },
})

/** The queue at a glance, for the admin console's Queue tab. */
export const overview = query({
  args: { policy: vPolicy, models: v.array(v.object({ model: v.string(), perMinute: v.number(), min: v.number(), max: v.number() })) },
  returns: v.any(),
  handler: async (ctx, { policy, models }) => {
    const row = await queueRow(ctx)
    const tiers = resolveTiers(policy, row?.tiers)
    const concurrency = concurrencyOf(policy, row)
    const inEffect = dedicatedInEffect(tiers, concurrency)
    const running = await runningJobs(ctx)
    const waiting = await waitingJobs(ctx)
    const count = (jobs: Doc<'jobs'>[], rank: number) => jobs.filter(job => !isGuest(job) && job.rank === rank).length
    const guests = (jobs: Doc<'jobs'>[]) => jobs.filter(isGuest).length
    const stored = await ctx.db.query('jobModels').take(200)
    const known = new Map(stored.map(model => [model.model, model]))
    for (const model of models) {
      if (!known.has(model.model)) known.set(model.model, { ...model, cleanStreak: 0, count429: 0 } as never)
    }
    return {
      paused: row?.paused === true,
      concurrency,
      configuredConcurrency: policy.concurrency,
      shared: Math.max(0, concurrency - inEffect.reduce((sum, slots) => sum + slots, 0)),
      averageMs: row?.averageMs ?? null,
      running: running.length,
      waiting: waiting.length,
      // Guest jobs, claimed or not: they run after every tier and count against none.
      guests: { running: guests(running), waiting: guests(waiting) },
      trimmed: inEffect.some((slots, index) => slots < tiers[index]!.dedicated),
      tiers: tiers.map((tier, index) => ({
        name: tier.name,
        feature: tier.feature ?? null,
        headStart: tier.headStart,
        perOwner: tier.perOwner,
        dedicated: tier.dedicated,
        dedicatedInEffect: inEffect[index]!,
        budget: tier.budget ?? null,
        overridden: Object.keys(row?.tiers[tier.name] ?? {}),
        running: count(running, index),
        waiting: count(waiting, index),
      })),
      models: [...known.values()].map(model => ({
        model: model.model,
        perMinute: model.perMinute,
        min: model.min,
        max: model.max,
        count429: model.count429,
        last429At: model.last429At ?? null,
      })),
    }
  },
})

/** The jobs, newest first: every one, or the dead letters only. */
export const list = query({
  args: { paginationOpts: paginationOptsValidator, deadLetters: v.optional(v.boolean()) },
  returns: v.any(),
  handler: async (ctx, { paginationOpts, deadLetters }) => {
    const query = deadLetters
      ? ctx.db.query('jobs').withIndex('by_deadLetter_and_endedAt', q => q.eq('deadLetter', true)).order('desc')
      : ctx.db.query('jobs').order('desc')
    return await query.paginate(paginationOpts)
  },
})

/**
 * An administrator's change: pause or resume, the concurrency, a tier's
 * `perOwner`, `dedicated` or budget units (`null`: back to the code), or a
 * model's limit. The app checks each value first.
 */
export const setQueue = mutation({
  args: {
    paused: v.optional(v.boolean()),
    concurrency: v.optional(v.union(v.number(), v.null())),
    tier: v.optional(v.object({
      name: v.string(),
      perOwner: v.optional(v.union(v.number(), v.null())),
      dedicated: v.optional(v.union(v.number(), v.null())),
      budgetUnits: v.optional(v.union(v.number(), v.null())),
    })),
    model: v.optional(v.object({
      model: v.string(),
      perMinute: v.number(),
      min: v.number(),
      max: v.number(),
    })),
  },
  returns: v.null(),
  handler: async (ctx, { paused, concurrency, tier, model }) => {
    const row = await writableQueue(ctx)
    await ctx.db.patch('jobQueue', row._id, {
      ...defined({ paused, tiers: tier && retuned(row.tiers, tier) }),
      // `null`: back to backend/jobs.ts.
      ...(concurrency === undefined ? {} : { concurrency: concurrency ?? undefined }),
    })
    if (model) {
      const stored = await ctx.db.query('jobModels').withIndex('by_model', q => q.eq('model', model.model)).unique()
      if (stored) await ctx.db.patch('jobModels', stored._id, { perMinute: model.perMinute, min: model.min, max: model.max })
      else await ctx.db.insert('jobModels', { ...model, cleanStreak: 0, count429: 0 })
    }
    return null
  },
})

const vModelDefaults = v.object({ perMinute: v.number(), min: v.number(), max: v.number() })

/** A model's limit as the queue learned it, or where it starts. */
export const modelLimit = query({
  args: { model: v.string(), defaults: v.optional(vModelDefaults) },
  returns: v.object({ perMinute: v.number(), min: v.number(), max: v.number() }),
  handler: async (ctx, { model, defaults }) => {
    const stored = await ctx.db.query('jobModels').withIndex('by_model', q => q.eq('model', model)).unique()
    const start = defaults ?? DEFAULT_MODEL_LIMIT
    return stored ? { perMinute: stored.perMinute, min: stored.min, max: stored.max } : { perMinute: start.perMinute, min: start.min, max: start.max }
  },
})

/** Adapt a model's limit to how a call went: halved on a `429`, grown after clean calls. */
export const recordModel = mutation({
  args: { model: v.string(), defaults: v.optional(vModelDefaults), outcome: v.union(v.literal('ok'), v.literal('throttled'), v.literal('error')) },
  returns: v.null(),
  handler: async (ctx, { model, defaults, outcome }) => {
    const stored = await ctx.db.query('jobModels').withIndex('by_model', q => q.eq('model', model)).unique()
    const start = defaults ?? DEFAULT_MODEL_LIMIT
    const limit: ModelLimit = stored ?? { perMinute: start.perMinute, min: start.min, max: start.max, cleanStreak: 0, count429: 0 }
    const now = Date.now()
    const next = outcome === 'ok' ? succeeded(limit, now) : outcome === 'throttled' ? throttled(limit, now) : erred(limit)
    const fields = {
      perMinute: next.perMinute,
      min: next.min,
      max: next.max,
      cleanStreak: next.cleanStreak,
      count429: next.count429,
      ...(next.last429At === undefined ? {} : { last429At: next.last429At }),
      ...(next.grewAt === undefined ? {} : { grewAt: next.grewAt }),
    }
    if (stored) await ctx.db.patch('jobModels', stored._id, fields)
    else await ctx.db.insert('jobModels', { model, ...fields })
    return null
  },
})

/**
 * Put a dead letter back in line, under its owner, with a new hold: it
 * counts in the owner's current window (never refused) and joins at the
 * back of its tier's line.
 */
export const requeue = mutation({
  args: {
    jobId: v.string(),
    hold: v.optional(vJobHold),
    /** Run again on the first run's charge, which was never refunded: no new hold, and no second charge. */
    carry: v.optional(v.boolean()),
    budgetWindow: v.optional(v.number()),
    budgetCounted: v.number(),
    policy: vPolicy,
  },
  returns: vJobDoc,
  handler: async (ctx, { jobId, hold, carry, budgetWindow, budgetCounted, policy }) => {
    const id = ctx.db.normalizeId('jobs', jobId)
    const job = id ? await ctx.db.get('jobs', id) : null
    if (!job || job.status !== 'failed' || !job.deadLetter) return null
    if (refundInFlight(job)) return null
    const carried = carry === true && job.charged && !job.refunded
    const row = await queueRow(ctx)
    const tiers = resolveTiers(policy, row?.tiers)
    const placed = isGuest(job) ? { rank: tiers.length } : await ownerTier(ctx, tiers, job.owner)
    const tier = tiers.find(entry => entry.name === (placed as { tier?: string }).tier)
    const now = Date.now()
    await ctx.db.patch('jobs', job._id, {
      status: 'queued',
      tier: tier?.name,
      rank: placed.rank,
      score: scoreOf(now, tier),
      joinedAt: now,
      startedAt: undefined,
      endedAt: undefined,
      leaseUntil: undefined,
      hold: carried ? job.hold : hold,
      budgetWindow,
      budgetCounted,
      charged: carried,
      refunded: false,
      charging: undefined,
      refundOwed: undefined,
      refundAt: undefined,
      error: undefined,
      deadLetter: undefined,
      cancel: undefined,
      progress: undefined,
      retries: job.retries + 1,
    })
    return await ctx.db.get('jobs', job._id)
  },
})

/** Take a dead letter out of the view for good; its rows stay. */
export const discard = mutation({
  args: { jobId: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { jobId }) => {
    const id = ctx.db.normalizeId('jobs', jobId)
    const job = id ? await ctx.db.get('jobs', id) : null
    if (!job?.deadLetter) return false
    await ctx.db.patch('jobs', job._id, { deadLetter: undefined })
    return true
  },
})

/** Running jobs whose lease ran out: the stall sweep fails them. */
export const stalled = query({
  args: { now: v.number() },
  returns: v.array(v.object({ jobId: v.string(), workflowId: v.optional(v.string()) })),
  handler: async (ctx, { now }) => {
    const running = await runningJobs(ctx)
    return running
      .filter(job => job.leaseUntil !== undefined && job.leaseUntil < now)
      .map(job => ({ jobId: job._id as string, ...(job.workflowId ? { workflowId: job.workflowId } : {}) }))
  },
})

/**
 * After an owner's plan changed (the entitlement cache's refresh): the
 * better of each waiting job's tier and the owner's tier now, with the score
 * it gives. Upgrades help waiting jobs at the next pick; a downgrade never
 * worsens one. Guest jobs keep their rank.
 */
export async function retierOwner(ctx: MutationCtx, owner: string): Promise<void> {
  const waiting = await ctx.db.query('jobs').withIndex('by_owner_and_status', q => q.eq('owner', owner).eq('status', 'queued')).take(500)
  if (waiting.length === 0) return
  const row = await queueRow(ctx)
  const plan = row?.plan
  if (!plan) return
  const placed = await ownerTier(ctx, plan, owner)
  for (const job of waiting) {
    // A claimed guest job keeps the guest rank until it starts.
    if (isGuest(job) || placed.rank >= job.rank) continue
    const tier = plan[placed.rank]!
    await ctx.db.patch('jobs', job._id as Id<'jobs'>, { tier: tier.name, rank: placed.rank, score: job.joinedAt - tier.headStart })
  }
}

/** How long a finished job's row is kept: 30 days, dead letters included. */
export const JOB_RETENTION_MS = 30 * 24 * 60 * 60 * 1000
