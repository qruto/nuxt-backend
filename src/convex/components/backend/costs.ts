import { v } from 'convex/values'
import { PAUSE_FLAGS } from '../../flags.js'
import { logBackend } from '../../log.js'
import { internal } from './_generated/api.js'
import type { Doc } from './_generated/dataModel.js'
import { internalMutation, internalQuery, mutation, type MutationCtx, query, type QueryCtx } from './_generated/server.js'

/**
 * What AI cost, per person per UTC day (`aiCosts`), and for the whole app
 * per day (`aiCostDays`): the job queue's steps add theirs in the mutation
 * that records a step's usage on its job, so the two never drift; metered
 * actions, streams, chat replies and knowledge embeddings add theirs as
 * each run ends (`record`). The admin console's Costs tab reads both, and
 * the AI spend alert (`alerts.ts`) reads the day totals. Polar's Cost
 * Insights holds the job queue's costs per customer, beside revenue; this
 * is the per-person view the app keeps itself.
 */

/** A day in milliseconds. */
export const DAY_MS = 24 * 60 * 60 * 1000

/** How long a day's costs are kept: the Costs tab reads at most this far back. */
export const AI_COST_RETENTION_MS = 90 * 24 * 60 * 60 * 1000

/** The UTC day a moment falls on, as its first millisecond. */
export function dayOf(at: number): number {
  return at - (at % DAY_MS)
}

/** How many rows a day's visitor costs spread over, and the whole app's day total too. */
const COST_SHARDS = 8

/** A text's row among {@link COST_SHARDS}: the same text, the same row. */
function shardOf(text: string): number {
  let hash = 0
  for (const char of text) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return hash % COST_SHARDS
}

/** Who made a run, and the billing entity it was paid by. */
export interface CostRun {
  /** The member who made the calls; absent for a visitor's job, or a run of the app's own. */
  userId?: string
  /** The billing entity that paid: a workspace, an account, `app`, or `guest:<visitor>`. */
  owner: string
}

/**
 * Who a run's costs count against: who made it, else its owner. A
 * visitor's count against `guest`, kept in one of a few rows a day
 * (`guest:3`) picked by the visitor, which the summary adds up again.
 */
export function costOwnerOf(run: CostRun): string {
  if (run.userId) return run.userId
  if (!run.owner.startsWith('guest:')) return run.owner
  return `guest:${shardOf(run.owner)}`
}

/** The person a cost row lists under: every visitor row is `guest`. */
const personOf = (who: string): string => (who === 'guest' || who.startsWith('guest:') ? 'guest' : who)

/** What a run's model calls used: US dollars when the gateway reported them, and tokens. */
const vCostUsage = v.object({ usd: v.optional(v.number()), input: v.number(), output: v.number(), cached: v.number() })

type Usage = { usd?: number, input: number, output: number, cached: number }

/** The figures a row sums. */
type CostSums = Pick<Doc<'aiCosts'>, 'usd' | 'input' | 'output' | 'cached' | 'runs'>

const NO_COST: CostSums = { usd: 0, input: 0, output: 0, cached: 0, runs: 0 }

/** Two sets of figures added up. */
function addSums(a: CostSums, b: CostSums): CostSums {
  return { usd: a.usd + b.usd, input: a.input + b.input, output: a.output + b.output, cached: a.cached + b.cached, runs: a.runs + b.runs }
}

/**
 * Add a run's usage, or its end (`ended`), to its person's row for the day
 * and to the app's total for the day. Each person's day is its own row, and
 * the day's total is split over a few rows picked by the person, so runs of
 * different people rarely write the same document.
 */
export async function addAiCost(ctx: MutationCtx, run: CostRun, at: number, change: { usage?: Usage, ended?: boolean, spendLimitUsd?: number }): Promise<void> {
  const { usage, ended, spendLimitUsd } = change
  if (!usage && !ended) return
  const day = dayOf(at)
  const who = costOwnerOf(run)
  const added = { ...NO_COST, ...usage && { usd: usage.usd ?? 0, input: usage.input, output: usage.output, cached: usage.cached }, runs: ended ? 1 : 0 }
  const row = await ctx.db.query('aiCosts').withIndex('by_day_and_who', q => q.eq('day', day).eq('who', who)).unique()
  if (row) await ctx.db.patch('aiCosts', row._id, { ...addSums(row, added), owner: run.owner })
  else await ctx.db.insert('aiCosts', { day, who, owner: run.owner, ...added })
  const shard = shardOf(who)
  const total = await ctx.db.query('aiCostDays').withIndex('by_day_and_shard', q => q.eq('day', day).eq('shard', shard)).unique()
  if (total) await ctx.db.patch('aiCostDays', total._id, addSums(total, added))
  else await ctx.db.insert('aiCostDays', { day, shard, ...added })
  // The daily limit is checked apart, so runs of different people never read each other's day rows.
  if (spendLimitUsd !== undefined && (usage?.usd ?? 0) > 0) await ctx.scheduler.runAfter(0, internal.costs.checkSpendLimit, { day, limitUsd: spendLimitUsd })
}

/**
 * Record what one run's model calls cost, once it ended: a metered action,
 * a stream, a chat reply or a knowledge embedding, done or failed. The app's
 * side calls it with the run's usage; a run whose calls never reached a
 * model has none, and records nothing.
 */
export const record = mutation({
  args: { userId: v.optional(v.string()), owner: v.string(), usage: vCostUsage, spendLimitUsd: v.optional(v.number()) },
  returns: v.null(),
  handler: async (ctx, { userId, owner, usage, spendLimitUsd }) => {
    await addAiCost(ctx, { ...(userId ? { userId } : {}), owner }, Date.now(), { usage, ended: true, ...(spendLimitUsd === undefined ? {} : { spendLimitUsd }) })
    return null
  },
})

/** The days a read of day totals covers at most: every day kept, and the one being pruned. */
const KEPT_DAYS = AI_COST_RETENTION_MS / DAY_MS + 2

/**
 * Each UTC day's totals from `first` on, to `last` when given (first
 * milliseconds of a day), by day: a few rows a day, the newest first, never
 * more than the days kept.
 */
async function dayTotals(ctx: QueryCtx, first: number, last?: number): Promise<Map<number, CostSums>> {
  const rows = await ctx.db.query('aiCostDays')
    .withIndex('by_day_and_shard', q => (last === undefined ? q.gte('day', first) : q.gte('day', first).lte('day', last)))
    .order('desc')
    .take(KEPT_DAYS * COST_SHARDS)
  const days = new Map<number, CostSums>()
  for (const row of rows) days.set(row.day, addSums(days.get(row.day) ?? NO_COST, row))
  return days
}

/** The person rows a summary reads at most: about a hundred people a day for the longest window. */
const SUMMARY_ROWS = 10_000

/** How many people a summary lists, the costliest first. */
const SUMMARY_PEOPLE = 100

/** One person's costs over the window, as the Costs tab lists them. */
const vPersonCost = v.object({
  /** An account id, `guest` for visitors, or the billing entity a run was paid by without a member (`app` for the app's own). */
  who: v.string(),
  /** The account's name and address while it exists; absent for guests, workspaces and deleted accounts. */
  name: v.optional(v.string()),
  email: v.optional(v.string()),
  usd: v.number(),
  input: v.number(),
  output: v.number(),
  runs: v.number(),
})

const vSummary = v.object({
  since: v.number(),
  usd: v.number(),
  runs: v.number(),
  /** Day by day, oldest first: what the whole app's AI cost. A day without any is absent. */
  days: v.array(v.object({ day: v.number(), usd: v.number(), runs: v.number() })),
  people: v.array(vPersonCost),
  /** `true` when the window held more person rows than one read takes: the people cover its newest days. The totals are whole. */
  truncated: v.boolean(),
})

/** The person rows of the days from `since` on, newest first, at most `limit`. */
async function rowsSince(ctx: QueryCtx, since: number, limit: number): Promise<Doc<'aiCosts'>[]> {
  return await ctx.db.query('aiCosts').withIndex('by_day_and_who', q => q.gte('day', dayOf(since))).order('desc').take(limit)
}

/** The account a cost row names, when it is one that still exists. */
async function accountOf(ctx: QueryCtx, who: string): Promise<{ name?: string, email?: string }> {
  const id = ctx.db.normalizeId('user', who)
  const user = id ? await ctx.db.get('user', id) : null
  return user ? { name: user.name || undefined, email: user.email } : {}
}

/**
 * What AI cost from `since` (a moment; its UTC day counts whole): the total
 * and each day's, from the day totals, and the costliest people with their
 * tokens and runs, from their rows. The Costs tab reads it once rather than
 * live: every run that ends would make it read the people's rows again.
 */
export const summary = query({
  args: { since: v.number() },
  returns: vSummary,
  handler: async (ctx, { since }) => {
    const days = [...(await dayTotals(ctx, dayOf(since))).entries()].sort(([a], [b]) => a - b)
    const rows = await rowsSince(ctx, since, SUMMARY_ROWS)
    const people = new Map<string, Omit<CostSums, 'cached'>>()
    for (const row of rows) {
      const who = personOf(row.who)
      const person = people.get(who) ?? { usd: 0, input: 0, output: 0, runs: 0 }
      people.set(who, { usd: person.usd + row.usd, input: person.input + row.input, output: person.output + row.output, runs: person.runs + row.runs })
    }
    const costliest = [...people.entries()].sort(([, a], [, b]) => b.usd - a.usd || b.runs - a.runs).slice(0, SUMMARY_PEOPLE)
    return {
      since: dayOf(since),
      usd: days.reduce((sum, [, day]) => sum + day.usd, 0),
      runs: days.reduce((sum, [, day]) => sum + day.runs, 0),
      days: days.map(([day, { usd, runs }]) => ({ day, usd, runs })),
      people: await Promise.all(costliest.map(async ([who, totals]) => ({ who, ...await accountOf(ctx, who), ...totals }))),
      truncated: rows.length === SUMMARY_ROWS,
    }
  },
})

/**
 * The whole app's AI spend in US dollars on each UTC day from `since` to
 * `until` (moments; their UTC days count whole), oldest first, a day
 * without any at zero: what the AI spend alert compares. It reads the day
 * totals, a few rows a day however many people spent, so no day of the
 * baseline is ever cut short.
 */
export const dailySpend = internalQuery({
  args: { since: v.number(), until: v.number() },
  returns: v.array(v.object({ day: v.number(), usd: v.number() })),
  handler: async (ctx, { since, until }) => {
    const last = dayOf(until)
    const first = Math.max(dayOf(since), last - (KEPT_DAYS - 1) * DAY_MS)
    const totals = await dayTotals(ctx, first, last)
    const days: Array<{ day: number, usd: number }> = []
    for (let day = first; day <= last; day += DAY_MS) days.push({ day, usd: totals.get(day)?.usd ?? 0 })
    return days
  },
})

// ── The daily spend limit ───────────────────────────────────────────────

/** Who set the `pause_ai` override the limit turns on: its row says so, and only its own reset clears it. */
const SPEND_LIMIT = 'spend_limit'

/** Dollars as an alert writes them. */
const dollars = (value: number) => `$${value.toFixed(2)}`

/**
 * Hold the whole app to its daily AI spend limit (`setupAi({ spendLimit })`):
 * once the UTC day's spend reaches `limitUsd`, turn the `pause_ai` kill
 * switch on, marked as the limit's, record `ai.spend_limit_reached` and
 * raise the `ai_spend_limit` alert, and lift it again when the next UTC day
 * begins. A day already over, a `pause_ai` the limit already turned on,
 * and any override of `pause_ai` an administrator set are left as they
 * are: an administrator who paused AI, targeted a pause, or resumed AI
 * (`enabled: false`) after the limit tripped keeps that decision, and the
 * limit records and schedules nothing over it. Scheduled by the mutation
 * that recorded a cost, so it alone reads every row of the day.
 */
export const checkSpendLimit = internalMutation({
  args: { day: v.number(), limitUsd: v.number() },
  returns: v.null(),
  handler: async (ctx, { day, limitUsd }) => {
    const now = Date.now()
    if (day !== dayOf(now)) return null
    const usd = (await dayTotals(ctx, day, day)).get(day)?.usd ?? 0
    if (usd < limitUsd) return null
    const key = PAUSE_FLAGS.ai
    const row = await ctx.db.query('flagOverrides').withIndex('key', q => q.eq('key', key)).unique()
    // An administrator's override, whatever it says, is theirs; the limit's own is already on.
    if (row) return null
    await ctx.db.insert('flagOverrides', { key, override: { enabled: true }, updatedAt: now, setBy: SPEND_LIMIT })
    const figures = { usd: Number(usd.toFixed(4)), limit: limitUsd }
    // On the activity trail, by the app: no one signed in turned it on.
    await ctx.db.insert('auditEvents', { type: 'ai.spend_limit_reached', data: figures, at: now })
    const message = `AI calls cost ${dollars(usd)} today (UTC), reaching the daily limit of ${dollars(limitUsd)}: pause_ai is on until the day ends.`
    logBackend('warn', 'ai.spend_limit_reached', message)
    await ctx.scheduler.runAfter(0, internal.alerts.raise, {
      alert: { kind: 'ai_spend_limit', key: 'ai_spend_limit', period: new Date(now).toISOString().slice(0, 10), level: 'error', message, data: figures },
    })
    await ctx.scheduler.runAt(day + DAY_MS, internal.costs.resetSpendLimit, {})
    return null
  },
})

/**
 * Lift the `pause_ai` the spend limit turned on, once its day is over: only
 * an override the limit set, never one an administrator set or changed
 * since. Answers whether it lifted one.
 */
export const resetSpendLimit = internalMutation({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    const row = await ctx.db.query('flagOverrides').withIndex('key', q => q.eq('key', PAUSE_FLAGS.ai)).unique()
    if (row?.setBy !== SPEND_LIMIT || dayOf(row.updatedAt) >= dayOf(Date.now())) return false
    await ctx.db.delete('flagOverrides', row._id)
    logBackend('info', 'ai.spend_limit_reset', 'A new UTC day began: the pause_ai the AI spend limit turned on is off again.')
    return true
  },
})
