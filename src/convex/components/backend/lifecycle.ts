import { v } from 'convex/values'
import { Resend } from 'resend'
import { undeliverableReason } from '../../delivery.js'
import { DAY_MS, vResolvedCaps } from '../../email-preferences.js'
import { ANNUAL_SWITCH_AFTER_PAYMENTS, type FlowSettings, TRIAL_ENDING_MIN_DAYS, vFlowSettings } from '../../lifecycle-flows.js'
import { logBackend } from '../../log.js'
import { normalizeEmail } from '../../tokens.js'
import { internal } from './_generated/api.js'
import type { Doc, Id } from './_generated/dataModel.js'
import { env, internalAction, internalMutation, mutation, type MutationCtx, query } from './_generated/server.js'
import { contactFor, decideSend, inTopic, queueProviderSync } from './preferences.js'

/**
 * Lifecycle email: the component's half of `setupEmail({ lifecycle })` and
 * `email.automations.track`. Each flow's email is a template and an
 * automation at the email provider, started by an event the package sends
 * it; here each person's run of a flow waits for its step, is checked
 * against their topic and the sending rules when it is due (never when it
 * starts), and is stopped by the event that makes it moot. The flows'
 * settings come from `email sync`, so a flow starts only once its template
 * and automation exist.
 */

type Run = Doc<'lifecycleRuns'>
type Settings = Doc<'lifecycleSettings'>

/** The most due runs one sweep takes; the sweep comes back for the rest. */
const SWEEP_BATCH = 50

/** How many times an event the provider rate-limited is sent before it is given up on. */
const SEND_ATTEMPTS = 5

/**
 * Whether the provider surely took nothing of an event and asks for it
 * later: a rate limit. Any other failure may come after it took the event
 * (a timeout, a lost answer, a server error), and a second try would start
 * its automation twice, so it is not tried again.
 */
function rateLimited(error: { statusCode?: number | null, name?: string }): boolean {
  return error.statusCode === 429 || error.name === 'rate_limit_exceeded'
}

/** Log why a step was skipped: the rule and the flow, never the address. */
function logSkipped(reason: 'unsubscribed' | 'capped' | 'sunset', flow: string): void {
  if (reason === 'unsubscribed') logBackend('info', 'email.skipped_unsubscribed', `A ${flow} lifecycle email was not sent: its recipient is not in the topic.`)
  else if (reason === 'capped') logBackend('info', 'email.skipped_capped', `A ${flow} lifecycle email was not sent: its recipient reached the weekly cap.`)
  else logBackend('info', 'email.skipped_sunset', `A ${flow} lifecycle email was not sent: its recipient has not engaged for the sunset period.`)
}

/** How long a finished run of a flow sent more than once is kept. */
export const LIFECYCLE_RUN_RETENTION_MS = 90 * DAY_MS

/** What reaches the flows: a sign-up, the app's own event, a billing event, as the activity trail records it. */
export interface LifecycleSignal {
  /** `signed-up`, a billing event (`billing.credits_low`), or the app's own event's name. */
  type: string
  userId?: string
  email?: string
  /** The billing entity a billing event is about. */
  entityId?: string
  data?: Record<string, unknown>
}

async function settingsOf(ctx: { db: MutationCtx['db'] }): Promise<Settings | null> {
  return ctx.db.query('lifecycleSettings').first()
}

/** `email sync` keeps the flows' settings here once their templates and automations exist. */
export const configure = mutation({
  args: { flows: v.array(vFlowSettings), caps: vResolvedCaps },
  returns: v.null(),
  handler: async (ctx, { flows, caps }) => {
    const row = await settingsOf(ctx)
    if (row) await ctx.db.patch('lifecycleSettings', row._id, { flows, caps, syncedAt: Date.now() })
    else await ctx.db.insert('lifecycleSettings', { flows, caps, syncedAt: Date.now() })
    return null
  },
})

/** The flows' settings as `email sync` last kept them: what `doctor` compares the code with. */
export const settings = query({
  args: {},
  returns: v.union(v.null(), v.object({ flows: v.array(vFlowSettings), caps: vResolvedCaps, syncedAt: v.number() })),
  handler: async (ctx) => {
    const row = await ctx.db.query('lifecycleSettings').first()
    return row ? { flows: row.flows, caps: row.caps, syncedAt: row.syncedAt } : null
  },
})

/** The accounts a billing entity's lifecycle email goes to: the account itself, or the workspace's owners. */
async function billingRecipients(ctx: MutationCtx, entityId: string): Promise<Array<{ userId: string, email: string }>> {
  const userId = ctx.db.normalizeId('user', entityId)
  const user = userId ? await ctx.db.get('user', userId) : null
  if (user) return [{ userId: user._id, email: user.email }]
  const owners: Array<{ userId: string, email: string }> = []
  for (const member of await ctx.db.query('member').withIndex('organizationId', q => q.eq('organizationId', entityId)).take(50)) {
    if (!member.role.split(',').map(role => role.trim()).includes('owner')) continue
    const id = ctx.db.normalizeId('user', member.userId)
    const owner = id ? await ctx.db.get('user', id) : null
    if (owner) owners.push({ userId: owner._id, email: owner.email })
  }
  return owners
}

/** Who a signal is about: a billing entity's accounts, else the account it names. */
async function recipientsOf(ctx: MutationCtx, signal: LifecycleSignal): Promise<Array<{ userId: string, email: string }>> {
  if (signal.entityId && signal.type.startsWith('billing.')) return billingRecipients(ctx, signal.entityId)
  if (!signal.userId) return []
  const id = ctx.db.normalizeId('user', signal.userId)
  const user = id ? await ctx.db.get('user', id) : null
  const email = user?.email ?? signal.email
  return email ? [{ userId: signal.userId, email: normalizeEmail(email) }] : []
}

/** Stop a person's waiting runs of a flow. */
async function stopRuns(ctx: MutationCtx, userId: string, flow: string, reason: string): Promise<void> {
  for (const run of await ctx.db.query('lifecycleRuns').withIndex('userId_flow', q => q.eq('userId', userId).eq('flow', flow)).take(20)) {
    if (run.state === 'waiting' || run.state === 'held') await ctx.db.patch('lifecycleRuns', run._id, { state: 'stopped', reason })
  }
}

/** When a flow's emails are due for this signal, or `null` when the signal does not start it (a short trial, a payment other than the third monthly one). */
async function dueTimes(ctx: MutationCtx, flow: FlowSettings, signal: LifecycleSignal, now: number): Promise<number[] | null> {
  if (flow.flow === 'trialEnding') {
    const endsAt = signal.data?.trialEndsAt
    const days = signal.data?.trialDays
    if (typeof endsAt !== 'number' || typeof days !== 'number' || days < TRIAL_ENDING_MIN_DAYS) return null
    const at = endsAt - flow.delays[0]!
    return at > now ? [at] : null
  }
  if (flow.flow === 'annualSwitch') {
    if (signal.data?.interval !== 'month' || !signal.entityId) return null
    const paid = await ctx.db.query('auditEvents').withIndex('entityId_at', q => q.eq('entityId', signal.entityId!)).order('desc').take(200)
    const monthly = paid.filter(row => row.type === 'billing.order_paid' && row.data?.interval === 'month').length
    if (monthly !== ANNUAL_SWITCH_AFTER_PAYMENTS) return null
  }
  return flow.delays.map(delay => now + delay)
}

/**
 * What a flow's event carries to its automation, for its conditions and its
 * template: a win-back's cancellation `reason`, from the entity's
 * `billing.subscription_canceled` since its last subscription began.
 */
async function eventData(ctx: MutationCtx, flow: FlowSettings, signal: LifecycleSignal): Promise<Record<string, string> | undefined> {
  const entityId = signal.entityId
  if (flow.flow !== 'winBack' || !entityId) return undefined
  const latest = (type: string) => ctx.db.query('auditEvents').withIndex('type_entityId', q => q.eq('type', type).eq('entityId', entityId)).order('desc').first()
  const canceled = await latest('billing.subscription_canceled')
  const created = await latest('billing.subscription_created')
  const reason = canceled && (!created || created.at <= canceled.at) ? canceled.data?.reason : undefined
  return typeof reason === 'string' && reason ? { reason } : undefined
}

/** Start one person's run of a flow: a step per email, the due ones fired at once. A flow sent once starts once; another run of the flow takes the place of a waiting one. */
async function startRun(ctx: MutationCtx, flow: FlowSettings, recipient: { userId: string, email: string }, times: number[], data: Record<string, string> | undefined): Promise<void> {
  const earlier = await ctx.db.query('lifecycleRuns').withIndex('userId_flow', q => q.eq('userId', recipient.userId).eq('flow', flow.flow)).first()
  if (earlier && flow.once) return
  if (earlier) await stopRuns(ctx, recipient.userId, flow.flow, 'restarted')
  const now = Date.now()
  for (const [step, dueAt] of times.entries()) {
    const id = await ctx.db.insert('lifecycleRuns', { userId: recipient.userId, email: recipient.email, flow: flow.flow, step, dueAt, state: 'waiting', once: flow.once, ...(data ? { data } : {}) })
    if (dueAt <= now) await ctx.scheduler.runAfter(0, internal.lifecycle.fire, { runId: id })
  }
}

/**
 * What one signal does to the flows: it stops the waiting runs it makes
 * moot, then starts the flows it starts, for each account it is about.
 * Answers whether the welcome flow sends the welcome, so the packaged one
 * is not sent too.
 */
export async function onLifecycleSignal(ctx: MutationCtx, signal: LifecycleSignal): Promise<{ welcome: boolean }> {
  const row = await settingsOf(ctx)
  if (!row) return { welcome: false }
  const relevant = row.flows.filter(flow => flow.start === signal.type || flow.stopOn.includes(signal.type))
  if (relevant.length === 0) return { welcome: false }
  const now = Date.now()
  let welcome = false
  for (const recipient of await recipientsOf(ctx, signal)) {
    for (const flow of relevant.filter(flow => flow.stopOn.includes(signal.type))) await stopRuns(ctx, recipient.userId, flow.flow, signal.type)
    for (const flow of relevant.filter(flow => flow.start === signal.type)) {
      const times = await dueTimes(ctx, flow, signal, now)
      if (!times) continue
      await startRun(ctx, flow, recipient, times, await eventData(ctx, flow, signal))
      if (flow.flow === 'welcome') welcome = true
    }
  }
  return { welcome }
}

const vSignal = v.object({ type: v.string(), userId: v.optional(v.string()), email: v.optional(v.string()), entityId: v.optional(v.string()), data: v.optional(v.record(v.string(), v.any())) })

/** A sign-up or another event the app's setup reports: the flows it starts and stops. */
export const signal = mutation({
  args: vSignal,
  returns: v.object({ welcome: v.boolean() }),
  handler: async (ctx, args) => onLifecycleSignal(ctx, args),
})

/**
 * Send one event of the app's own to the email provider for an address's
 * contact (`email.automations.track`): the contact is made when the
 * deployment has none, and the provider gets the event by a job right
 * after, so the call returns at once. The flows it starts and stops follow.
 */
export const track = mutation({
  args: { event: v.string(), email: v.string(), userId: v.optional(v.string()), payload: v.optional(v.record(v.string(), v.any())) },
  returns: v.null(),
  handler: async (ctx, { event, email, userId, payload }) => {
    const contact = await contactFor(ctx, email, userId)
    if (contact.pendingSync !== false) await queueProviderSync(ctx, contact._id)
    await ctx.scheduler.runAfter(0, internal.lifecycle.sendEvent, { event, email: contact.email, ...(payload ? { payload } : {}), attempt: 1 })
    if (userId) await onLifecycleSignal(ctx, { type: event, userId, email: contact.email })
    return null
  },
})

/** One event to the provider; a rate limit is waited out with backoff, a few times, and any other failure is not tried again. */
export const sendEvent = internalAction({
  args: { event: v.string(), email: v.string(), payload: v.optional(v.record(v.string(), v.any())), attempt: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const key = env.EMAIL_API_KEY
    if (!key) return null
    const { error } = await new Resend(key).events.send({ event: args.event, email: args.email, ...(args.payload ? { payload: args.payload } : {}) })
    if (!error) return null
    if (!rateLimited(error) || args.attempt >= SEND_ATTEMPTS) {
      logBackend('warn', 'email.event_unsent', `The ${args.event} event failed at the email provider; it is not sent again, so the automations listening for it start at most once.`, error)
      return null
    }
    await ctx.scheduler.runAfter(2 ** args.attempt * 1000, internal.lifecycle.sendEvent, { ...args, attempt: args.attempt + 1 })
    return null
  },
})

/**
 * What the sending rules make of a lifecycle or marketing step as it comes
 * due: skipped, held to the quiet hours' end, or `null` when it goes. A
 * held step was counted already: as it goes it asks only the topic again,
 * so a person who left it meanwhile gets nothing.
 */
async function holdOrSkip(ctx: MutationCtx, run: Run, flow: Settings['flows'][number], caps: Settings['caps'], email: string): Promise<Partial<Run> | null> {
  if (flow.kind === 'transactional') return null
  if (run.state === 'held') {
    if (!flow.topic || await inTopic(ctx, (await contactFor(ctx, email, run.userId))._id, flow.topic, flow.explicit)) return null
    logSkipped('unsubscribed', flow.flow)
    return { state: 'skipped', reason: 'unsubscribed' }
  }
  const decision = await decideSend(ctx, { email, userId: run.userId, ...(flow.topic ? { topic: flow.topic } : {}), caps, explicit: flow.explicit })
  if (decision.outcome === 'skipped') {
    logSkipped(decision.reason, flow.flow)
    return { state: 'skipped', reason: decision.reason }
  }
  return decision.at !== null && decision.at > Date.now() ? { state: 'held', dueAt: decision.at } : null
}

/**
 * One due step of a run: transactional email goes; lifecycle and marketing
 * email passes the person's topic, the sunset rule, the weekly cap and the
 * quiet hours first, as it stands now. A send the quiet hours hold waits,
 * counted already, for their end, and asks the topic again then.
 */
async function processRun(ctx: MutationCtx, run: Run, row: Settings | null): Promise<void> {
  const flow = row?.flows.find(entry => entry.flow === run.flow)
  if (!row || !flow) return void await ctx.db.patch('lifecycleRuns', run._id, { state: 'stopped', reason: 'flow_off' })
  // The account's address now; a deleted account is written to no more.
  const userId = ctx.db.normalizeId('user', run.userId)
  const user = userId ? await ctx.db.get('user', userId) : null
  if (!user) return void await ctx.db.patch('lifecycleRuns', run._id, { state: 'stopped', reason: 'no_account' })
  const email = normalizeEmail(user.email)
  const held = await holdOrSkip(ctx, run, flow, row.caps, email)
  if (held) return void await ctx.db.patch('lifecycleRuns', run._id, held)
  await ctx.db.patch('lifecycleRuns', run._id, { state: 'sent', email })
  await ctx.scheduler.runAfter(0, internal.lifecycle.deliver, { event: flow.eventName, email, ...(run.data ? { payload: run.data } : {}), attempt: 1 })
}

/** A step due at once: fired as it starts. */
export const fire = internalMutation({
  args: { runId: v.id('lifecycleRuns') },
  returns: v.null(),
  handler: async (ctx, { runId }) => {
    const run = await ctx.db.get('lifecycleRuns', runId)
    if (run && (run.state === 'waiting' || run.state === 'held') && run.dueAt <= Date.now()) await processRun(ctx, run, await settingsOf(ctx))
    return null
  },
})

/** The component's schedule: every step that came due, a batch at a time. */
export const sweep = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now()
    const row = await settingsOf(ctx)
    let taken = 0
    for (const state of ['waiting', 'held'] as const) {
      for (const run of await ctx.db.query('lifecycleRuns').withIndex('state_dueAt', q => q.eq('state', state).lte('dueAt', now)).take(SWEEP_BATCH - taken)) {
        await processRun(ctx, run, row)
        taken++
      }
    }
    if (taken >= SWEEP_BATCH) await ctx.scheduler.runAfter(0, internal.lifecycle.sweep, {})
    return null
  },
})

/** Start a flow's automation for one address, with what its event carries: the provider sends the flow's email. Test mode keeps it to test addresses. Sent at most once, as `sendEvent`. */
export const deliver = internalAction({
  args: { event: v.string(), email: v.string(), payload: v.optional(v.record(v.string(), v.string())), attempt: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const reason = undeliverableReason(args.email)
    if (reason) {
      logBackend('warn', 'email.undeliverable', `A lifecycle email (${args.event}) was not sent: ${reason}.`)
      return null
    }
    const { error } = await new Resend(env.EMAIL_API_KEY).events.send({ event: args.event, email: args.email, ...(args.payload ? { payload: args.payload } : {}) })
    if (!error) return null
    if (!rateLimited(error) || args.attempt >= SEND_ATTEMPTS) {
      logBackend('warn', 'email.event_unsent', `The ${args.event} event failed at the email provider; it is not sent again, so its lifecycle email goes at most once.`, error)
      return null
    }
    await ctx.scheduler.runAfter(2 ** args.attempt * 1000, internal.lifecycle.deliver, { ...args, attempt: args.attempt + 1 })
    return null
  },
})

/** An account's part of an erasure, one batch: every run of it goes. `true` while rows are left. */
export async function eraseLifecycle(ctx: MutationCtx, userId: string | undefined, budget: number): Promise<boolean> {
  if (!userId) return false
  const runs = await ctx.db.query('lifecycleRuns').withIndex('userId_flow', q => q.eq('userId', userId)).take(budget)
  for (const run of runs) await ctx.db.delete('lifecycleRuns', run._id)
  return runs.length >= budget
}

/** Retention, one batch: a finished run of a flow that may run again, 90 days after it was due. A flow sent once keeps its row, which says it was. */
export async function pruneLifecycleRuns(ctx: MutationCtx, before: number, batch: number): Promise<{ pruned: number, done: boolean }> {
  let pruned = 0
  for (const state of ['sent', 'skipped', 'stopped'] as const) {
    const rows = await ctx.db.query('lifecycleRuns').withIndex('once_state_dueAt', q => q.eq('once', false).eq('state', state).lt('dueAt', before)).take(batch - pruned)
    for (const run of rows) {
      await ctx.db.delete('lifecycleRuns', run._id as Id<'lifecycleRuns'>)
      pruned++
    }
    if (rows.length >= batch) return { pruned, done: false }
  }
  return { pruned, done: true }
}
