import { DirectAggregate } from '@convex-dev/aggregate'
import type { FunctionHandle } from 'convex/server'
import { v } from 'convex/values'
import { components } from './_generated/api.js'
import type { Doc, Id } from './_generated/dataModel.js'
import { mutation, type MutationCtx, query, type QueryCtx } from './_generated/server.js'
import { onLifecycleSignal } from './lifecycle.js'
import { vCampaignTouch, vSourceView as vSource } from './schema.js'
import { logBackend } from '../../log.js'
import {
  campaignOf,
  FIRST_TOUCH_WINDOW_MS,
  FUNNEL_DIMENSIONS,
  FUNNEL_DIRECT,
  FUNNEL_OTHER,
  FUNNEL_STEPS,
  FUNNEL_VALUES_MAX,
  FUNNEL_WEEKS_MAX,
  type FunnelDimension,
  type FunnelStep,
  funnelValue,
  isSourceAnswer,
  PERSON_STEPS,
  type PersonStep,
  SOURCE_DETAIL_MAX,
  WEEK_MS,
  weekOf,
} from '../../funnel-rules.js'

/**
 * The growth funnel and the experiments' results: the component's half.
 *
 * Every event the shared event path records passes through
 * {@link countEvent}, which counts the funnel's steps (waitlist, admitted,
 * sign-up, activation, trial, paid) into the nested `funnelCounts`
 * aggregate, marks the account active for its cohort's retention, records
 * the account's activation once, and counts an experiment's goal and
 * guardrails for the variant the account (or its workspace) was exposed to.
 *
 * Counts are keyed `[dimension, value, sign-up week]` per step namespace
 * (`signup`, `activation`, …), `['all', 'all', week]` for the whole step,
 * under ids made from a row id here (never an account id), so an erasure
 * that deletes an account's `funnelPeople` row and its exposures leaves
 * every count as it was. Nothing here leaves the deployment.
 */

/** A count's key: the dimension (`all` for the whole step), its value, and the week. */
type CountKey = [string, string, number]

const counts = new DirectAggregate<{ Key: CountKey, Id: string, Namespace: string }>(components.funnelCounts)

/** The namespace an experiment's counts live in. */
const experimentNamespace = (key: string): string => `experiment:${key}`

/** The namespace a cohort's weeks of activity live in. */
const RETENTION = 'retention'

/** The dimension a whole step counts under. */
const ALL = 'all'

type Person = Doc<'funnelPeople'>

/** An event as the path recorded it, with its row's id and time. */
interface CountedEvent {
  id: string
  type: string
  at: number
  actorId?: string
  impersonatorId?: string
  subjectId?: string
  entityId?: string
  data?: Record<string, unknown>
}

/** What the app's audit setup tells the path about counting. */
export interface FunnelOptions {
  /** The kind that counts as activation; without one, the account's first `app.*` event. */
  activation?: string
  /** The app's `onEvent` handle, which hears of `account.activated` too. */
  forward?: string
}

// ── People ──────────────────────────────────────────────────────────────

/** The account's row, by its id. */
function personOf(ctx: QueryCtx, userId: string): Promise<Person | null> {
  return ctx.db.query('funnelPeople').withIndex('userId', q => q.eq('userId', userId)).unique()
}

/**
 * The account's row, made the first time the funnel hears of an account it
 * has not counted (one older than the funnel, or made outside the sign-up
 * path): its sign-up counted in the week the account was created. `null`
 * for an id that is no account (an erased one's pseudonym).
 */
async function ensurePerson(ctx: MutationCtx, userId: string): Promise<Person | null> {
  const known = await personOf(ctx, userId)
  if (known) return known
  const id = ctx.db.normalizeId('user', userId)
  const user = id ? await ctx.db.get('user', id) : null
  if (!user) return null
  const rowId = await ctx.db.insert('funnelPeople', { userId, signedUpAt: user.createdAt, week: weekOf(user.createdAt) })
  const person = (await ctx.db.get('funnelPeople', rowId))!
  await countStep(ctx, person, 'signup')
  return person
}

/** The account a billing entity's event is about: the event's subject, else the workspace's first owner. */
async function accountOf(ctx: QueryCtx, event: CountedEvent): Promise<string | null> {
  if (event.subjectId) return event.subjectId
  if (!event.entityId) return null
  const owner = await ctx.db.query('member').withIndex('organizationId_role', q => q.eq('organizationId', event.entityId!).eq('role', 'owner')).first()
  return owner?.userId ?? null
}

/** A dimension's value of a person; {@link FUNNEL_DIRECT} when it has none. */
const valueOf = (person: Person, dimension: FunnelDimension): string => person[dimension] ?? FUNNEL_DIRECT

/** The steps a person has reached. */
function stepsOf(person: Person): PersonStep[] {
  return PERSON_STEPS.filter(step => step === 'signup' || (step === 'activation' && person.activatedAt !== undefined) || (step === 'trial' && person.trialAt !== undefined) || (step === 'paid' && person.paidAt !== undefined))
}

/**
 * Note one more person attributed to a dimension's value. Every value is
 * counted under its own key; the report lists the {@link FUNNEL_VALUES_MAX}
 * with the most people and folds the rest into {@link FUNNEL_OTHER}, so a
 * value takes a place by the people it brought, never by arriving first:
 * throwaway accounts each naming a new campaign never crowd out a real one.
 */
async function noteValue(ctx: MutationCtx, dimension: FunnelDimension, value: string): Promise<void> {
  if (value === FUNNEL_DIRECT || value === FUNNEL_OTHER) return
  const known = await ctx.db.query('funnelValues').withIndex('dimension_value', q => q.eq('dimension', dimension).eq('value', value)).unique()
  if (known) await ctx.db.patch('funnelValues', known._id, { people: (known.people ?? 0) + 1 })
  else await ctx.db.insert('funnelValues', { dimension, value, people: 1 })
}

/** Count a step a person reached, under every dimension: once, however often it is counted. */
async function countStep(ctx: MutationCtx, person: Person, step: PersonStep): Promise<void> {
  await counts.insertIfDoesNotExist(ctx, { namespace: step, key: [ALL, ALL, person.week], id: `${person._id}:${ALL}`, sumValue: 1 })
  for (const dimension of FUNNEL_DIMENSIONS) {
    await counts.insertIfDoesNotExist(ctx, { namespace: step, key: [dimension, valueOf(person, dimension), person.week], id: `${person._id}:${dimension}`, sumValue: 1 })
  }
}

/**
 * Attribute a person on one dimension: the steps it reached move from the
 * value they were counted under to the new one. The first value stays for
 * `campaign`, `referral` and `promotion` (first touch); `invite` and
 * `answer` are set once by their own paths.
 */
async function attribute(ctx: MutationCtx, person: Person, dimension: FunnelDimension, raw: string): Promise<Person> {
  if (person[dimension] !== undefined) return person
  const value = funnelValue(raw)
  if (value === FUNNEL_DIRECT) return person
  await noteValue(ctx, dimension, value)
  for (const step of stepsOf(person)) {
    await counts.replaceOrInsert(ctx, { namespace: step, key: [dimension, FUNNEL_DIRECT, person.week], id: `${person._id}:${dimension}` }, { namespace: step, key: [dimension, value, person.week], sumValue: 1 })
  }
  await ctx.db.patch('funnelPeople', person._id, { [dimension]: value })
  return { ...person, [dimension]: value }
}

/** Mark a person active in the week of `at`, for its cohort's retention: once a week. */
async function markActive(ctx: MutationCtx, person: Person, at: number): Promise<void> {
  const week = weekOf(at)
  if (person.activeWeek !== undefined && person.activeWeek >= week) return
  if (week < person.week) return
  await counts.insertIfDoesNotExist(ctx, { namespace: RETENTION, key: [String(person.week), 'active', week], id: `${person._id}:${week}`, sumValue: 1 })
  await ctx.db.patch('funnelPeople', person._id, { activeWeek: week })
}

// ── The event path ──────────────────────────────────────────────────────

/** Count a step no account is known for yet: a waitlist join, an admission of `count` people. */
async function countAnonymous(ctx: MutationCtx, step: 'waitlist' | 'admitted', event: CountedEvent, amount: number): Promise<void> {
  if (amount <= 0) return
  await counts.insertIfDoesNotExist(ctx, { namespace: step, key: [ALL, ALL, weekOf(event.at)], id: event.id, sumValue: amount })
}

/**
 * Whether an event is its subject's own: done by the person, or by the app
 * for them (a job, a webhook, no actor), never by someone else acting on
 * them (an administrator's grant) and never during an administrator's
 * visit. Only such an event activates an account, marks it active for its
 * cohort, or counts toward an experiment.
 */
function ownEvent(event: CountedEvent): boolean {
  if (event.impersonatorId !== undefined) return false
  return event.actorId === undefined || event.subjectId === undefined || event.actorId === event.subjectId
}

/** Whether an event counts as the person's activation: its kind, and the person's own ({@link ownEvent}). */
function activates(event: CountedEvent, options: FunnelOptions): boolean {
  if (!ownEvent(event)) return false
  return options.activation ? event.type === options.activation : event.type.startsWith('app.')
}

/**
 * Record a person's activation: its step, its `account.activated` row, its
 * `reviewAsk` start and the app's `onEvent`. `activatedAt` is written last,
 * once the count and the row are: the event path swallows a failure here
 * without rolling back what was written, so a failed count leaves the
 * account unmarked and a later event activates it (the count is idempotent).
 */
async function activate(ctx: MutationCtx, person: Person, event: CountedEvent, forward: string | undefined): Promise<void> {
  const at = event.at
  await countStep(ctx, { ...person, activatedAt: at }, 'activation')
  const row = { type: 'account.activated', actorId: person.userId, subjectId: person.userId, data: { kind: event.type } }
  const id = await ctx.db.insert('auditEvents', { ...row, at })
  await ctx.db.patch('funnelPeople', person._id, { activatedAt: at })
  logBackend('info', 'audit.recorded', `account.activated ${id}`)
  try {
    await onLifecycleSignal(ctx, { type: 'account.activated', userId: person.userId })
  }
  catch (error) {
    logBackend('warn', 'email.lifecycle_failed', `The lifecycle flows did not hear of account.activated ${id}; the event is recorded.`, error)
  }
  if (forward) {
    try {
      await ctx.scheduler.runAfter(0, forward as FunctionHandle<'action'>, { event: { ...row, id, at } })
    }
    catch (error) {
      logBackend('warn', 'audit.forward_failed', `The app's onEvent action could not be scheduled for account.activated ${id}; the event is recorded.`, error)
    }
  }
}

/** The person a step of a billing entity's event moves, once. */
async function billingStep(ctx: MutationCtx, event: CountedEvent, step: 'trial' | 'paid'): Promise<void> {
  const userId = await accountOf(ctx, event)
  let person = userId ? await ensurePerson(ctx, userId) : null
  if (!person) return
  const field = step === 'trial' ? 'trialAt' : 'paidAt'
  if (person[field] !== undefined) return
  if (step === 'paid' && typeof event.data?.promotion === 'string') person = await attribute(ctx, person, 'promotion', event.data.promotion)
  await ctx.db.patch('funnelPeople', person._id, { [field]: event.at })
  await countStep(ctx, { ...person, [field]: event.at }, step)
}

/** Count the goal and guardrails of every experiment that counts this kind, for the variant its subject saw first. */
async function countExperiments(ctx: MutationCtx, event: CountedEvent): Promise<void> {
  if (!ownEvent(event)) return
  const kinds = await ctx.db.query('experimentKinds').withIndex('kind', q => q.eq('kind', event.type)).take(EXPERIMENTS_PER_KIND)
  for (const { experiment } of kinds) {
    const row = await ctx.db.query('experiments').withIndex('key', q => q.eq('key', experiment)).unique()
    if (!row) continue
    const subject = row.by === 'workspace' ? event.entityId : await accountOf(ctx, event)
    if (!subject) continue
    const exposure = await ctx.db.query('experimentExposures').withIndex('experiment_subject', q => q.eq('experiment', experiment).eq('subject', subject)).unique()
    if (!exposure || exposure.at > event.at) continue
    await counts.insertIfDoesNotExist(ctx, { namespace: experimentNamespace(experiment), key: [event.type, exposure.variant, 0], id: `${exposure._id}:${event.type}`, sumValue: 1 })
  }
}

/** The invite an event names: a sign-up's, or the ticket that admitted it (its label, else its kind). */
function inviteOf(event: CountedEvent): string | undefined {
  const data = event.data ?? {}
  if (event.type === 'account.created') return typeof data.invite === 'string' ? data.invite : undefined
  if (event.type !== 'access.ticket_used') return undefined
  return typeof data.label === 'string' && data.label ? data.label : typeof data.ticket === 'string' ? data.ticket : undefined
}

/** The most experiments one kind is counted for. */
const EXPERIMENTS_PER_KIND = 20

/**
 * Count one event of the path into the funnel and the experiments: the
 * step it is (if any), the account's week of activity, its activation, and
 * the experiments that count its kind. Runs in the transaction that records
 * the event; the caller keeps a failure here from failing the event.
 */
export async function countEvent(ctx: MutationCtx, event: CountedEvent, options: FunnelOptions = {}): Promise<void> {
  await countStepEvent(ctx, event)
  await countPerson(ctx, event, options)
  await countExperiments(ctx, event)
}

/** Count the step an event is, when it is one no account's first event decides: the waitlist's, an admission, a trial, a payment. */
async function countStepEvent(ctx: MutationCtx, event: CountedEvent): Promise<void> {
  switch (event.type) {
    case 'waitlist.joined':
      await countAnonymous(ctx, 'waitlist', event, 1)
      break
    case 'waitlist.admitted':
    case 'access.admitted':
      await countAnonymous(ctx, 'admitted', event, typeof event.data?.count === 'number' ? event.data.count : 0)
      break
    case 'billing.subscription_created':
      if (typeof event.data?.trialDays === 'number' && event.data.trialDays > 0) await billingStep(ctx, event, 'trial')
      break
    case 'billing.trial_pass_started':
      await billingStep(ctx, event, 'trial')
      break
    case 'billing.order_paid':
      await billingStep(ctx, event, 'paid')
      break
  }
}

/**
 * The account an event is about, counted from its sign-up on: its invite,
 * its week of activity, its activation. Never on an administrator's visit;
 * someone else acting on the account counts no activity for it.
 */
async function countPerson(ctx: MutationCtx, event: CountedEvent, options: FunnelOptions): Promise<void> {
  const userId = event.impersonatorId === undefined ? event.subjectId : undefined
  let person = userId ? await ensurePerson(ctx, userId) : null
  if (!person) return
  const invite = inviteOf(event)
  if (invite) person = await attribute(ctx, person, 'invite', invite)
  if (!ownEvent(event)) return
  await markActive(ctx, person, event.at)
  if (person.activatedAt === undefined && activates(event, options)) await activate(ctx, person, event, options.forward)
}

// ── Attribution ─────────────────────────────────────────────────────────

/** Attribute an account's referral (its claim): the code it claimed. */
export async function attributeReferral(ctx: MutationCtx, userId: string, code: string): Promise<void> {
  const person = await ensurePerson(ctx, userId)
  if (person) await attribute(ctx, person, 'referral', code)
}

/** Keep a person's one answer (`null` for a skip), with an "Other" answer's own words. */
async function keepAnswer(ctx: MutationCtx, person: Person, answer: string | null, detail: string | undefined, now: number): Promise<Person> {
  const named = answer !== null && isSourceAnswer(answer) ? answer : null
  const answered = named ? await attribute(ctx, person, 'answer', named) : person
  const words = named === 'other' ? detail?.trim().slice(0, SOURCE_DETAIL_MAX) : undefined
  await ctx.db.patch('funnelPeople', answered._id, { answeredAt: now, ...(words ? { detail: words } : {}) })
  return { ...answered, answeredAt: now }
}

/** Whether the account answered (or skipped) the question, and its answer and first campaign. */
export const source = query({
  args: { userId: v.string() },
  returns: vSource,
  handler: async (ctx, { userId }) => {
    const person = await personOf(ctx, userId)
    return { asked: person?.answeredAt !== undefined, answer: person?.answer ?? null, campaign: person?.campaign ?? null }
  },
})

/**
 * Record what an account says about how it found the app, and the first
 * campaign link it arrived through:
 * - `touch`: the link's UTM values, kept only as the account's first, and
 *   only within {@link FIRST_TOUCH_WINDOW_MS} of its sign-up;
 * - `answer`: the answer's name, or `null` for "Skip"; asked once, so a
 *   second answer is ignored. `detail` is an "Other" answer's own words.
 * Returns where the account stands now.
 */
export const recordSource = mutation({
  args: {
    userId: v.string(),
    touch: v.optional(vCampaignTouch),
    answer: v.optional(v.union(v.string(), v.null())),
    detail: v.optional(v.string()),
  },
  returns: vSource,
  handler: async (ctx, { userId, touch, answer, detail }) => {
    let person = await ensurePerson(ctx, userId)
    if (!person) return { asked: false, answer: null, campaign: null }
    const now = Date.now()
    const campaign = campaignOf(touch)
    if (campaign && now - person.signedUpAt <= FIRST_TOUCH_WINDOW_MS) person = await attribute(ctx, person, 'campaign', campaign)
    if (answer !== undefined && person.answeredAt === undefined) person = await keepAnswer(ctx, person, answer, detail, now)
    return { asked: person.answeredAt !== undefined, answer: person.answer ?? null, campaign: person.campaign ?? null }
  },
})

// ── The report ──────────────────────────────────────────────────────────

/** The most "Other" answers the report lists. */
const OTHER_ANSWERS_MAX = 20

const vStepCounts = v.object({ signup: v.number(), activation: v.number(), trial: v.number(), paid: v.number() })

/** One value of a dimension, with the people of each step counted under it; a referral code with its owner's name while the owner has an account. */
const vBreakdown = v.array(v.object({ value: v.string(), label: v.optional(v.string()), counts: vStepCounts }))

/** The funnel over a run of weeks, as the Growth view reads it. */
export const vFunnelReport = v.object({
  weeks: v.number(),
  since: v.number(),
  until: v.number(),
  waitlist: v.number(),
  admitted: v.number(),
  signup: v.number(),
  activation: v.number(),
  trial: v.number(),
  paid: v.number(),
  breakdowns: v.object({ invite: vBreakdown, campaign: vBreakdown, referral: vBreakdown, promotion: vBreakdown, answer: vBreakdown }),
  cohorts: v.array(v.object({ week: v.number(), size: v.number(), active: v.array(v.number()) })),
  otherAnswers: v.array(v.string()),
})

/** One sum of the report: a step's (or retention's) items between two keys. */
interface Sum {
  namespace: string
  lower: CountKey
  upper: CountKey
}

/** The bounds of a sum. */
const boundsOf = ({ namespace, lower, upper }: Sum) => lower[2] === upper[2]
  ? { namespace, bounds: { eq: lower } }
  : { namespace, bounds: { lower: { key: lower, inclusive: true }, upper: { key: upper, inclusive: true } } }

/** The name of the account a referral code is, while it has one; never an address. */
async function referrerName(ctx: QueryCtx, value: string): Promise<string | undefined> {
  if (value === FUNNEL_DIRECT || value === FUNNEL_OTHER) return undefined
  const code = await ctx.db.query('referralCodes').withIndex('code', q => q.eq('code', value.toUpperCase())).first()
  if (!code || code.ownerKind !== 'user') return undefined
  const id = ctx.db.normalizeId('user', code.ownerId)
  const user = id ? await ctx.db.get('user', id) : null
  return user?.name || undefined
}

/** A dimension's values the report lists apart: the {@link FUNNEL_VALUES_MAX} with the most people, most first. */
async function listedValues(ctx: QueryCtx, dimension: FunnelDimension): Promise<string[]> {
  const rows = await ctx.db.query('funnelValues').withIndex('dimension_people', q => q.eq('dimension', dimension)).order('desc').take(FUNNEL_VALUES_MAX)
  return rows.map(row => row.value)
}

/** The newest week any step was counted in; `null` before anything was. */
async function latestWeek(ctx: QueryCtx): Promise<number | null> {
  let latest: number | null = null
  for (const step of ['waitlist', 'admitted', 'signup'] as const) {
    const item = await counts.max(ctx, { namespace: step, bounds: { prefix: [ALL, ALL] } })
    if (item && (latest === null || item.key[2] > latest)) latest = item.key[2]
  }
  return latest
}

/**
 * The funnel over the `weeks` up to `until` (the week it falls in; default:
 * the newest week anything was counted in, so the read stays a pure
 * function of the data): each step's count, each person step broken down
 * by every dimension, each cohort's size and the people of it active in
 * each week after, and the latest "Other" answers. The caller decides who
 * may read it.
 */
export const report = query({
  args: { weeks: v.number(), until: v.optional(v.number()) },
  returns: vFunnelReport,
  handler: async (ctx, args) => {
    const weeks = Math.max(1, Math.min(FUNNEL_WEEKS_MAX, Math.floor(args.weeks) || 1))
    const until = args.until !== undefined ? weekOf(args.until) : await latestWeek(ctx) ?? 0
    const since = until - (weeks - 1) * WEEK_MS
    const plan: Sum[] = FUNNEL_STEPS.map(step => ({ namespace: step, lower: [ALL, ALL, since], upper: [ALL, ALL, until] }))
    // Each dimension's listed values; "Everything else" is the whole step less them.
    const values = new Map<FunnelDimension, string[]>()
    for (const dimension of FUNNEL_DIMENSIONS) {
      const list = [FUNNEL_DIRECT, ...await listedValues(ctx, dimension)]
      values.set(dimension, list)
      for (const value of list) for (const step of PERSON_STEPS) plan.push({ namespace: step, lower: [dimension, value, since], upper: [dimension, value, until] })
    }
    const cohortWeeks = Array.from({ length: weeks }, (_, index) => since + index * WEEK_MS)
    for (const week of cohortWeeks) {
      plan.push({ namespace: 'signup', lower: [ALL, ALL, week], upper: [ALL, ALL, week] })
      for (let active = week; active <= until; active += WEEK_MS) plan.push({ namespace: RETENTION, lower: [String(week), 'active', active], upper: [String(week), 'active', active] })
    }
    const sums = await counts.sumBatch(ctx, plan.map(boundsOf))
    let at = 0
    const next = () => sums[at++] ?? 0
    const totals = Object.fromEntries(FUNNEL_STEPS.map(step => [step, next()])) as Record<FunnelStep, number>
    const breakdowns = Object.fromEntries(FUNNEL_DIMENSIONS.map((dimension) => {
      const rows = values.get(dimension)!.map((value) => {
        const stepCounts = Object.fromEntries(PERSON_STEPS.map(step => [step, next()])) as Record<PersonStep, number>
        return { value, counts: stepCounts }
      })
      const rest = Object.fromEntries(PERSON_STEPS.map(step => [step, Math.max(0, totals[step] - rows.reduce((sum, row) => sum + row.counts[step], 0))])) as Record<PersonStep, number>
      return [dimension, [...rows, { value: FUNNEL_OTHER, counts: rest }].filter(row => row.counts.signup > 0 || row.counts.paid > 0)]
    })) as Record<FunnelDimension, Array<{ value: string, label?: string, counts: Record<PersonStep, number> }>>
    const cohorts = cohortWeeks.map((week) => {
      const size = next()
      const active: number[] = []
      for (let week2 = week; week2 <= until; week2 += WEEK_MS) active.push(next())
      return { week, size, active }
    })
    for (const row of breakdowns.referral) {
      const label = await referrerName(ctx, row.value)
      if (label) Object.assign(row, { label })
    }
    const others = await ctx.db.query('funnelPeople').withIndex('answer_answeredAt', q => q.eq('answer', 'other')).order('desc').take(OTHER_ANSWERS_MAX)
    return {
      weeks,
      since,
      until,
      ...totals,
      breakdowns,
      cohorts,
      otherAnswers: others.flatMap(row => (row.detail ? [row.detail] : [])),
    }
  },
})

// ── Experiments ─────────────────────────────────────────────────────────

const vBy = v.union(v.literal('user'), v.literal('workspace'))

/** Keep an experiment's row and the kinds it counts as the code declares them now. */
async function keepExperiment(ctx: MutationCtx, args: { experiment: string, variants: string[], by: 'user' | 'workspace', goal?: string, guardrails: string[] }, at: number): Promise<void> {
  const row = await ctx.db.query('experiments').withIndex('key', q => q.eq('key', args.experiment)).unique()
  const shape = { variants: args.variants, by: args.by, guardrails: args.guardrails, ...(args.goal ? { goal: args.goal } : {}) }
  const kinds = [...new Set([...(args.goal ? [args.goal] : []), ...args.guardrails])]
  if (row && JSON.stringify([row.variants, row.by, row.goal, row.guardrails]) === JSON.stringify([shape.variants, shape.by, shape.goal, shape.guardrails])) return
  if (row) await ctx.db.replace('experiments', row._id, { key: args.experiment, startedAt: row.startedAt, ...shape })
  else await ctx.db.insert('experiments', { key: args.experiment, startedAt: at, ...shape })
  for (const kind of await ctx.db.query('experimentKinds').withIndex('experiment', q => q.eq('experiment', args.experiment)).take(EXPERIMENT_KINDS_MAX)) await ctx.db.delete('experimentKinds', kind._id)
  for (const kind of kinds) await ctx.db.insert('experimentKinds', { kind, experiment: args.experiment })
}

/** The most kinds one experiment counts: its goal and its guardrails. */
const EXPERIMENT_KINDS_MAX = 16

/**
 * Record that a subject saw a variant of an experiment, the first time
 * only: its exposure row and its count. `exposed` says whether this call
 * was the first; `variant` is the one the subject was counted under.
 */
export const expose = mutation({
  args: {
    experiment: v.string(),
    subject: v.string(),
    userId: v.string(),
    variant: v.string(),
    variants: v.array(v.string()),
    by: vBy,
    goal: v.optional(v.string()),
    guardrails: v.array(v.string()),
  },
  returns: v.object({ exposed: v.boolean(), variant: v.string() }),
  handler: async (ctx, args) => {
    const known = await ctx.db.query('experimentExposures').withIndex('experiment_subject', q => q.eq('experiment', args.experiment).eq('subject', args.subject)).unique()
    if (known) return { exposed: false, variant: known.variant }
    const at = Date.now()
    await keepExperiment(ctx, args, at)
    const id: Id<'experimentExposures'> = await ctx.db.insert('experimentExposures', { experiment: args.experiment, subject: args.subject, userId: args.userId, variant: args.variant, at })
    await counts.insertIfDoesNotExist(ctx, { namespace: experimentNamespace(args.experiment), key: ['exposed', args.variant, 0], id, sumValue: 1 })
    return { exposed: true, variant: args.variant }
  },
})

/**
 * An experiment's counts: per variant, the subjects exposed and how many of
 * them reached each kind; and when it first exposed someone (`null` before).
 */
export const experimentCounts = query({
  args: { experiment: v.string(), variants: v.array(v.string()), kinds: v.array(v.string()) },
  returns: v.object({
    startedAt: v.union(v.number(), v.null()),
    variants: v.array(v.object({ name: v.string(), exposed: v.number(), kinds: v.record(v.string(), v.number()) })),
  }),
  handler: async (ctx, { experiment, variants, kinds }) => {
    const row = await ctx.db.query('experiments').withIndex('key', q => q.eq('key', experiment)).unique()
    const namespace = experimentNamespace(experiment)
    const wanted = variants.slice(0, 8).flatMap(variant => ['exposed', ...kinds.slice(0, EXPERIMENT_KINDS_MAX)].map(kind => ({ variant, kind })))
    const sums = await counts.sumBatch(ctx, wanted.map(({ variant, kind }) => ({ namespace, bounds: { prefix: [kind, variant] as [string, string] } })))
    return {
      startedAt: row?.startedAt ?? null,
      variants: variants.slice(0, 8).map(name => ({
        name,
        exposed: sums[wanted.findIndex(entry => entry.variant === name && entry.kind === 'exposed')] ?? 0,
        kinds: Object.fromEntries(kinds.slice(0, EXPERIMENT_KINDS_MAX).map(kind => [kind, sums[wanted.findIndex(entry => entry.variant === name && entry.kind === kind)] ?? 0])),
      })),
    }
  },
})

// ── Erasure ─────────────────────────────────────────────────────────────

/**
 * The funnel's part of an account's erasure: its row goes (who it was,
 * its answer, its attribution), its own exposures go, and it leaves the
 * workspace exposures it saw. Every count stays: no count is keyed by the
 * account. Returns whether rows may be left.
 */
export async function forgetFunnel(ctx: MutationCtx, userId: string, batch: number): Promise<boolean> {
  let left = batch
  const person = await personOf(ctx, userId)
  if (person) {
    await ctx.db.delete('funnelPeople', person._id)
    left--
  }
  for (const row of await ctx.db.query('experimentExposures').withIndex('subject', q => q.eq('subject', userId)).take(Math.max(0, left))) {
    await ctx.db.delete('experimentExposures', row._id)
    left--
  }
  for (const row of await ctx.db.query('experimentExposures').withIndex('userId', q => q.eq('userId', userId)).take(Math.max(0, left))) {
    await ctx.db.patch('experimentExposures', row._id, { userId: undefined })
    left--
  }
  return left <= 0
}
