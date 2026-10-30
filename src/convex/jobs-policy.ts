// The job queue's policy, as plain functions over plain data: the tiers and
// their checks, the dedicated slots in effect, the pick, the place in line,
// the model limits that adapt to throttling, the retry waits and the budget
// windows. No Convex runtime and no imports of its own, so the backend
// component (which stores the queue), `defineJobQueue` (which runs it) and
// the tests read one copy.

const MINUTE = 60_000

/** One tier of the queue, as `defineJobQueue({ tiers })` declares it. */
export interface JobTier {
  /** The plan feature that puts a job in this tier. The last tier may leave it out and catch everyone else. */
  feature?: string
  /** How far up the line its jobs score, in ms. Default `0`. */
  headStart?: number
  /** Running jobs one owner of this tier may have. Default: the queue's `perOwner`. */
  perOwner?: number
  /** Slots of `concurrency` kept for this tier and the tiers listed above it. Default `0`. */
  dedicated?: number
  /** Credits of jobs one owner may queue per window. Default none. */
  budget?: { units: number, period: number }
}

/** An administrator's retune of a tier, over what the code says (`setQueue({ tier })`). */
export interface TierOverride {
  perOwner?: number
  dedicated?: number
  budgetUnits?: number
}

/** A tier as the queue applies it now: the code with the overrides on top. */
export interface ResolvedTier {
  name: string
  feature?: string
  headStart: number
  perOwner: number
  dedicated: number
  budget?: { units: number, period: number }
}

/** What the queue runs on: its settings in code, and the administrator's on top. */
export interface QueuePolicy {
  concurrency: number
  perOwner: number
  stallAfter: number
  tiers: Array<{ name: string } & JobTier>
}

export const DEFAULT_CONCURRENCY = 3
export const MAX_CONCURRENCY = 20
export const DEFAULT_STALL_AFTER = 5 * MINUTE

/** The largest number of starts the place in line works out. */
export const POSITION_HORIZON = 100

const wholeAtLeast = (value: unknown, least: number): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= least

/**
 * Refuse a queue `defineJobQueue` cannot run, where it is defined (so at
 * push): a catch-all tier that is not last or keeps slots, a `perOwner`
 * that is no whole number of 1 or more, dedicated slots that leave no
 * shared one, or budgets on different periods.
 */
export function checkQueuePolicy(policy: QueuePolicy): void {
  const fail = (why: string): never => {
    throw new Error(`[nuxt-backend] defineJobQueue: ${why}`)
  }
  if (!wholeAtLeast(policy.concurrency, 0) || policy.concurrency > MAX_CONCURRENCY) fail(`\`concurrency\` is a whole number from 0 to ${MAX_CONCURRENCY} — got ${String(policy.concurrency)}.`)
  if (!wholeAtLeast(policy.perOwner, 1)) fail(`\`perOwner\` is a whole number of 1 or more — got ${String(policy.perOwner)}.`)
  if (!(typeof policy.stallAfter === 'number' && policy.stallAfter >= 10_000)) fail(`\`stallAfter\` is at least 10 seconds, in ms — got ${String(policy.stallAfter)}.`)
  policy.tiers.forEach((tier, index) => checkTier(tier, index === policy.tiers.length - 1, fail))
  const periods = new Set(policy.tiers.flatMap(tier => tier.budget ? [tier.budget.period] : []))
  if (periods.size > 1) fail('every tier\'s budget uses the same `period`: an owner has one window, shared by every tier.')
  const dedicated = policy.tiers.reduce((sum, tier) => sum + (tier.dedicated ?? 0), 0)
  if (dedicated > 0 && dedicated > policy.concurrency - 1) fail(`the tiers keep ${dedicated} dedicated slots, which leaves no shared one at a \`concurrency\` of ${policy.concurrency}: at least one slot stays shared.`)
}

/** One tier's own rules: the catch-all comes last and keeps no slots, its numbers are whole and its budget positive. */
function checkTier(tier: { name: string } & JobTier, last: boolean, fail: (why: string) => never): void {
  const named = `tier \`${tier.name}\``
  if (!tier.feature && !last) fail(`${named} names no \`feature\`, so it catches everyone: it must come last.`)
  if (tier.headStart !== undefined && !(Number.isFinite(tier.headStart) && tier.headStart >= 0)) fail(`${named}'s \`headStart\` is a number of ms of 0 or more.`)
  if (tier.perOwner !== undefined && !wholeAtLeast(tier.perOwner, 1)) fail(`${named}'s \`perOwner\` is a whole number of 1 or more — got ${String(tier.perOwner)}.`)
  if (tier.dedicated !== undefined && !wholeAtLeast(tier.dedicated, 0)) fail(`${named}'s \`dedicated\` is a whole number of 0 or more — got ${String(tier.dedicated)}.`)
  if (!tier.feature && (tier.dedicated ?? 0) > 0) fail(`${named} catches everyone, so it keeps no \`dedicated\` slots.`)
  if (tier.budget) checkBudget(named, tier.budget, fail)
}

/** A budget's units above 0, and a period of a minute or more. */
function checkBudget(named: string, budget: { units: number, period: number }, fail: (why: string) => never): void {
  if (!(Number.isFinite(budget.units) && budget.units > 0)) fail(`${named}'s budget \`units\` is a number above 0.`)
  if (!(Number.isFinite(budget.period) && budget.period >= MINUTE)) fail(`${named}'s budget \`period\` is at least a minute, in ms.`)
}

/** The tiers with an administrator's overrides applied. */
export function resolveTiers(policy: QueuePolicy, overrides: Readonly<Record<string, TierOverride>> = {}): ResolvedTier[] {
  return policy.tiers.map((tier) => {
    const override = overrides[tier.name] ?? {}
    const budget = tier.budget ? { units: override.budgetUnits ?? tier.budget.units, period: tier.budget.period } : undefined
    return {
      name: tier.name,
      ...(tier.feature ? { feature: tier.feature } : {}),
      headStart: tier.headStart ?? 0,
      perOwner: override.perOwner ?? tier.perOwner ?? policy.perOwner,
      dedicated: tier.feature ? (override.dedicated ?? tier.dedicated ?? 0) : 0,
      ...(budget ? { budget } : {}),
    }
  })
}

/** The one budget period of the queue, when any tier has a budget. */
export function budgetPeriod(policy: QueuePolicy): number | undefined {
  return policy.tiers.find(tier => tier.budget)?.budget?.period
}

/**
 * The dedicated slots each tier keeps at this concurrency: as configured
 * while they leave one slot shared, else trimmed from the worst-listed paid
 * tier up until one does. No slot at all at a concurrency of 0.
 */
export function dedicatedInEffect(tiers: readonly ResolvedTier[], concurrency: number): number[] {
  const counts = tiers.map(tier => tier.dedicated)
  let excess = counts.reduce((sum, count) => sum + count, 0) - Math.max(0, concurrency - 1)
  for (let index = counts.length - 1; index >= 0 && excess > 0; index--) {
    const cut = Math.min(counts[index]!, excess)
    counts[index]! -= cut
    excess -= cut
  }
  return counts
}

/** A job's rank: its tier's place in the list, best first; a job of no tier, and a guest's, rank after every tier. */
export function rankOf(tiers: readonly { name: string }[], tier: string | undefined): number {
  const index = tier === undefined ? -1 : tiers.findIndex(entry => entry.name === tier)
  return index === -1 ? tiers.length : index
}

/** The first tier, in the order listed, whose feature the owner has; the catch-all tier otherwise; none without one. */
export function tierFor(tiers: readonly { name: string, feature?: string }[], has: (feature: string) => boolean): string | undefined {
  return tiers.find(tier => (tier.feature ? has(tier.feature) : true))?.name
}

/** The score a job waits with: when it joined, less its tier's head start. Lowest goes first. */
export function scoreOf(joinedAt: number, tier: ResolvedTier | undefined): number {
  return joinedAt - (tier?.headStart ?? 0)
}

/** A job the pick weighs. */
export interface PickJob {
  id: string
  owner: string
  rank: number
  /** Guest jobs count against their visitor, and take no dedicated slot. */
  guest?: boolean
}

/** What the pick sees: the slots, the tiers, and the jobs running and waiting (in score order). */
export interface PickState {
  concurrency: number
  paused: boolean
  tiers: readonly ResolvedTier[]
  /** The queue's `perOwner`: for a job of no tier, and a guest's. */
  perOwner: number
  running: readonly PickJob[]
  waiting: readonly PickJob[]
}

/** The running jobs one owner may have, by the tier of the job about to start. */
export function perOwnerOf(state: Pick<PickState, 'tiers' | 'perOwner'>, job: PickJob): number {
  return job.guest ? state.perOwner : (state.tiers[job.rank]?.perOwner ?? state.perOwner)
}

/**
 * Whether a job of `rank` may take a free slot: the free slots left after it
 * must still cover every slot kept for a better tier and not in use
 * (free − 1 ≥ max over i < rank of (P_i − R_i), P and R counted
 * cumulatively from the best tier). Guests rank after every tier.
 */
export function admits(rank: number, free: number, dedicated: readonly number[], runningByRank: readonly number[]): boolean {
  if (free <= 0) return false
  let kept = 0
  let reserved = 0
  let running = 0
  for (let index = 0; index < Math.min(rank, dedicated.length); index++) {
    reserved += dedicated[index]!
    running += runningByRank[index] ?? 0
    kept = Math.max(kept, reserved - running)
  }
  return free - 1 >= kept
}

/**
 * Run the pick once: every waiting job, in score order, that a free slot
 * allows. An owner at its `perOwner` is skipped, and so is a job that would
 * take a slot kept for a better tier; each keeps its place, and the jobs
 * behind it are still tried.
 */
export function pickStarts(state: PickState): string[] {
  if (state.paused || state.concurrency <= 0) return []
  const dedicated = dedicatedInEffect(state.tiers, state.concurrency)
  const byOwner = new Map<string, number>()
  const byRank: number[] = Array.from({ length: state.tiers.length + 1 }, () => 0)
  for (const job of state.running) {
    byOwner.set(job.owner, (byOwner.get(job.owner) ?? 0) + 1)
    byRank[Math.min(job.rank, state.tiers.length)]!++
  }
  let free = state.concurrency - state.running.length
  const started: string[] = []
  for (const job of state.waiting) {
    if (free <= 0) break
    if ((byOwner.get(job.owner) ?? 0) >= perOwnerOf(state, job)) continue
    const rank = job.guest ? state.tiers.length : job.rank
    if (!admits(rank, free, dedicated, byRank)) continue
    started.push(job.id)
    byOwner.set(job.owner, (byOwner.get(job.owner) ?? 0) + 1)
    byRank[Math.min(rank, state.tiers.length)]!++
    free--
  }
  return started
}

/** What holds a waiting job: a slot, its owner's other jobs, or a paused queue. */
export type WaitingOn = 'line' | 'owner' | 'paused'

/** Where a waiting job stands: what holds it, about how many start before it, and when it starts. */
export interface Standing {
  waitingOn: WaitingOn
  /** `1` starts next; `null` while 'owner' or 'paused', or past the horizon. */
  position: number | null
  /** ms until it starts; `undefined` while paused, and without an average job length. */
  estimatedWait: number | undefined
}

/**
 * Where a waiting job stands, from one forward run of the pick: each running
 * job ends the average length after it started, the earliest frees its slot
 * and its owner's count first, and the pick runs after each. A job held by
 * its owner's `perOwner` counts once its owner may start it. Only the first
 * {@link POSITION_HORIZON} starts are worked out.
 */
export function standingOf(
  state: PickState & { now: number, averageMs: number | undefined, startedAt: Readonly<Record<string, number>> },
  jobId: string,
): Standing | null {
  const target = state.waiting.find(job => job.id === jobId)
  if (!target) return null
  if (state.paused || state.concurrency <= 0) return { waitingOn: 'paused', position: null, estimatedWait: undefined }
  const ownerRunning = state.running.filter(job => job.owner === target.owner).length
  const waitingOn: WaitingOn = ownerRunning >= perOwnerOf(state, target) ? 'owner' : 'line'
  const start = simulateStart(state, jobId)
  return {
    waitingOn,
    position: waitingOn === 'line' && start ? start.order : null,
    estimatedWait: start && state.averageMs !== undefined ? start.at - state.now : undefined,
  }
}

/**
 * Run the pick ahead, from now: each running job ends the average length
 * (a minute without one) after it started, the earliest frees its slot and
 * its owner's count first, and the pick runs after each. When, and as which
 * start, the job starts; `null` past the horizon.
 */
function simulateStart(state: PickState & { now: number, averageMs: number | undefined, startedAt: Readonly<Record<string, number>> }, jobId: string): { order: number, at: number } | null {
  const length = state.averageMs ?? MINUTE
  let running = state.running.map(job => ({ ...job, endsAt: Math.max(state.now, (state.startedAt[job.id] ?? state.now) + length) }))
  let waiting = [...state.waiting]
  let at = state.now
  let order = 0
  while (order < POSITION_HORIZON) {
    const starts = pickStarts({ ...state, running, waiting })
    const index = starts.indexOf(jobId)
    if (index !== -1) return { order: order + index + 1, at }
    order += starts.length
    const started = new Set(starts)
    running = [...running, ...waiting.filter(job => started.has(job.id)).map(job => ({ ...job, endsAt: at + length }))]
    waiting = waiting.filter(job => !started.has(job.id))
    if (running.length === 0) return null
    // The earliest end frees its slot and its owner's count.
    const next = running.reduce((soonest, job) => (job.endsAt < soonest.endsAt ? job : soonest))
    at = next.endsAt
    running = running.filter(job => job !== next)
  }
  return null
}

/** A model's limit, as the queue keeps it: the rate it learned and the range it moves in. */
export interface ModelLimit {
  perMinute: number
  min: number
  max: number
  /** When the last `429` came back. */
  last429At?: number
  /** When the rate last grew. */
  grewAt?: number
  /** Calls in a row that succeeded since the last error. */
  cleanStreak: number
  count429: number
}

/** Where a model the queue does not list starts: 6 calls a minute, between 1 and 30. */
export const DEFAULT_MODEL_LIMIT = { perMinute: 6, min: 1, max: 30 } as const

/** Clean calls in a row before the rate may grow. */
const GROW_AFTER = 5

/** A model's limit after a `429`: halved at once, never below `min`, at most once a minute. */
export function throttled(limit: ModelLimit, now: number): ModelLimit {
  const halve = limit.last429At === undefined || now - limit.last429At >= MINUTE
  return {
    ...limit,
    perMinute: halve ? Math.max(limit.min, Math.floor(limit.perMinute / 2)) : limit.perMinute,
    last429At: halve ? now : limit.last429At,
    cleanStreak: 0,
    count429: limit.count429 + 1,
  }
}

/** A model's limit after a call that succeeded: after five in a row, a minute past the last `429` and the last growth, one call a minute more, never above `max`. */
export function succeeded(limit: ModelLimit, now: number): ModelLimit {
  const streak = limit.cleanStreak + 1
  const calm = (limit.last429At === undefined || now - limit.last429At >= MINUTE) && (limit.grewAt === undefined || now - limit.grewAt >= MINUTE)
  if (streak >= GROW_AFTER && calm && limit.perMinute < limit.max) {
    return { ...limit, perMinute: Math.min(limit.max, limit.perMinute + 1), cleanStreak: 0, grewAt: now }
  }
  return { ...limit, cleanStreak: streak }
}

/** A model's limit after any other error: the rate stays, the run of clean calls starts over. */
export function erred(limit: ModelLimit): ModelLimit {
  return { ...limit, cleanStreak: 0 }
}

/** The token bucket a model's limit runs on: its rate a minute, a burst of a third of it, one call at least. */
export function bucketOf(perMinute: number): { kind: 'token bucket', rate: number, period: number, capacity: number } {
  return { kind: 'token bucket', rate: perMinute, period: MINUTE, capacity: Math.max(1, Math.floor(perMinute / 3)) }
}

/** How many times `job.run` tries a step, a throttled attempt included. */
export const STEP_ATTEMPTS = 4

/** The longest a provider's `Retry-After` is honored, in ms. */
const MAX_RETRY_AFTER = 5 * MINUTE

/** A stable number for a string, for jitter that is the same on every replay. */
function hashOf(text: string): number {
  let hash = 2166136261
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

/**
 * How long to wait before the next attempt of a step: the provider's
 * `Retry-After` (5 minutes at most), else 5 seconds doubled on each attempt,
 * plus up to 2 seconds of jitter that is the same for the same job, step and
 * attempt.
 */
export function retryDelay(attempt: number, retryAfter: number | undefined, seed: string): number {
  const base = retryAfter !== undefined && retryAfter >= 0 ? Math.min(retryAfter, MAX_RETRY_AFTER) : 5000 * 2 ** Math.max(0, attempt - 1)
  return base + (hashOf(`${seed}:${attempt}`) % 2000)
}

/** Where an owner's budget window starts: aligned to the Unix epoch, so `DAY` resets at 00:00 UTC. */
export function windowStartOf(now: number, period: number): number {
  return Math.floor(now / period) * period
}

/** How long a refund's try may stay unanswered before a retry treats it as given up. */
const REFUND_STALE_MS = 60 * 60 * 1000

/** Whether a failed job's refund is being tried now: a retry waits for it, so it never runs on credits about to go back. */
export function refundInFlight(job: { refundOwed?: 'pending' | 'given_up', refundAt?: number }, now = Date.now()): boolean {
  return job.refundOwed === 'pending' && (job.refundAt ?? 0) > now - REFUND_STALE_MS
}
