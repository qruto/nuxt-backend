/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { DirectAggregate } from '@convex-dev/aggregate'
import { componentsGeneric, defineSchema, makeFunctionReference, mutationGeneric } from 'convex/server'
import { v } from 'convex/values'
import { asUser, defineBackendTestApp, seedWorkspace } from '../../src/convex/test'
import type { ComponentApi } from '../../src/convex/components/backend/_generated/component'
import { getBackendError } from '../../src/convex/errors'
import { type FunnelReport, weekOf } from '../../src/convex/funnel-rules'
import { setupAdmin } from '../../src/convex/integrations/admin'
import { type AuditPage, setupAudit, type SourceView } from '../../src/convex/integrations/audit'
import { lifecycleSettings } from '../../src/convex/integrations/email-lifecycle'
import { defineFlags, type ExperimentResult, type FlagOverride, type FlagValues, setupFlags } from '../../src/convex/integrations/flags'

// The growth funnel over the mounted component: every event the app's
// audit instance records is counted inside the deployment (sign-up,
// activation, trial, paid, the waitlist's joins and admissions), each
// person step broken down by invite, campaign, referral, promotion and the
// answer to "How did you hear about us?", each sign-up week's retention,
// and the experiments: a variant per person, its exposure on first read,
// and its goal and guardrails counted for the variant it saw. An erasure
// keeps every count and drops who it was.

const components = componentsGeneric() as unknown as { backend: ComponentApi<'backend'> }
const audit = setupAudit(components as never, { activation: 'app.strip_published' })
// The same app before it named its activation: an account's first `app.*` event counts.
const unnamed = setupAudit(components as never)
const admin = setupAdmin(components as never)
const flags = setupFlags(components as never, {
  flags: defineFlags({
    pricingHeadline: {
      default: false,
      description: 'Pricing page headline: the plan list, or a finished strip.',
      variants: ['plans', 'strip'],
      goal: 'billing.subscription_created',
      guardrails: ['billing.order_refunded'],
    },
    annualOffer: {
      default: false,
      description: 'Yearly plan at 20% off for half of new visitors.',
      variants: ['list', 'discount20'],
      discounts: { discount20: 'annual20' },
      goal: 'billing.subscription_created',
    },
    boardsTest: { default: false, description: 'Boards for half the workspaces.', variants: ['off', 'on'], by: 'workspace', goal: 'app.board_made' },
    tips: { default: true, description: 'The hints.' },
  }),
  audit,
})

/** Record any event as the caller, through the app's audit instance (the named or the unnamed one). */
const record = mutationGeneric({
  args: { event: v.any(), unnamed: v.optional(v.boolean()) },
  handler: async (ctx, { event, unnamed: plain }) => (plain ? unnamed : audit).recordBackendEvent(ctx, event),
})
/** Record a row as the event path stores it, with an administrator's visit on it. */
const recordRow = mutationGeneric({
  args: { event: v.any() },
  handler: async (ctx, { event }) => ctx.runMutation(components.backend.audit.record, { event }),
})
/** The app's own mutation that reads an experiment's variant on the server. */
const reminder = mutationGeneric({ args: {}, handler: async ctx => (await flags.variant(ctx, 'pricingHeadline')) ?? null })
/** An account's erasure, as the auth layer runs it once the account is deleted. */
const erase = mutationGeneric({ args: { userId: v.string() }, handler: async (ctx, { userId }) => ctx.runMutation(components.backend.account.forget, { userId }) })

const testApp = defineBackendTestApp(defineSchema({}), {
  './_generated/api.js': () => Promise.resolve({}),
  './audit.js': () => Promise.resolve(audit.api),
  './admin.js': () => Promise.resolve(admin.api),
  './flags.js': () => Promise.resolve(flags.api),
  './app.js': () => Promise.resolve({ record, recordRow, reminder, erase }),
})
type App = ReturnType<typeof testApp>
type Caller = Awaited<ReturnType<typeof asUser>>

const ref = <K extends 'query' | 'mutation'>(_kind: K, name: string) => makeFunctionReference<K>(name)
const getFunnel = makeFunctionReference<'query', { weeks: number, until?: number }, FunnelReport>('admin:getFunnel')
const getSource = makeFunctionReference<'query', Record<string, never>, SourceView | null>('audit:getSource')
const recordSource = makeFunctionReference<'mutation', Record<string, unknown>, SourceView>('audit:recordSource')
const listActivity = makeFunctionReference<'query', { paginationOpts: { numItems: number, cursor: string | null } }, AuditPage | null>('audit:listActivity')
const listAllActivity = makeFunctionReference<'query', { paginationOpts: { numItems: number, cursor: string | null } }, AuditPage | null>('audit:listAllActivity')
const getFlags = makeFunctionReference<'query', Record<string, never>, FlagValues>('flags:getFlags')
const setFlag = makeFunctionReference<'mutation', { key: string, override: FlagOverride | null }, null>('flags:setFlag')
const exposeExperiment = makeFunctionReference<'mutation', { key: string }, { variant: string } | null>('flags:exposeExperiment')
const getExperiments = makeFunctionReference<'query', Record<string, never>, ExperimentResult[]>('flags:getExperiments')

let t: App

beforeEach(() => {
  t = testApp()
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'NotPermitted' }, { status: 403 })))
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** Record an event as `caller`. */
const recordAs = (caller: Caller | App, event: Record<string, unknown>, plain = false) =>
  (caller as Pick<Caller, 'mutation'>).mutation(ref('mutation', 'app:record'), { event, ...(plain ? { unnamed: true } : {}) })

/** The funnel over the last weeks, as an administrator reads it. */
async function funnel(weeks = 4): Promise<FunnelReport> {
  const root = await asUser(t, { role: 'admin' })
  return root.query(getFunnel, { weeks, until: Date.now() })
}

/** The refusal a call threw, as the client reads it. */
async function refusalOf(call: Promise<unknown>) {
  try {
    await call
  }
  catch (error) {
    return getBackendError(error)
  }
  return null
}

describe('the funnel', () => {
  test('a published strip counts as activation', async () => {
    const ada = await asUser(t)
    await recordAs(ada, { type: 'app.strip_published' })
    const report = await funnel(1)
    expect(report).toMatchObject({ signup: 1, activation: 1, trial: 0, paid: 0 })
  })

  test('counts each person\'s activation once, as `account.activated`, and only their own', async () => {
    const ada = await asUser(t)
    const root = await asUser(t, { role: 'admin' })
    // An administrator acting on Ada, and Grace's session opened by an administrator, count for nothing.
    await recordAs(root, { type: 'app.strip_published', subjectId: ada.userId })
    const visit = await asUser(t, { impersonatedBy: root.userId })
    await recordAs(visit, { type: 'app.strip_published' })
    expect((await funnel()).activation).toBe(0)
    await recordAs(ada, { type: 'app.strip_published' })
    await recordAs(ada, { type: 'app.strip_published' })
    expect((await funnel()).activation).toBe(1)
    const activity = (await ada.query(listActivity, { paginationOpts: { numItems: 20, cursor: null } }))!.page
    expect(activity.filter(entry => entry.type === 'account.activated')).toEqual([expect.objectContaining({ data: { kind: 'app.strip_published' } })])
  })

  test('leaves an account whose activation count failed unmarked, and activates it on a later event', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const insert = DirectAggregate.prototype.insertIfDoesNotExist
    const failing = vi.spyOn(DirectAggregate.prototype, 'insertIfDoesNotExist').mockImplementation(async function (this: DirectAggregate<never>, ctx, args) {
      if ((args as { namespace?: string }).namespace === 'activation') throw new Error('the count failed')
      return insert.call(this, ctx, args)
    })
    const ada = await asUser(t)
    await recordAs(ada, { type: 'app.strip_published' })
    failing.mockRestore()
    expect((await funnel()).activation).toBe(0)
    await recordAs(ada, { type: 'app.strip_published' })
    expect((await funnel()).activation).toBe(1)
    const activity = (await ada.query(listActivity, { paginationOpts: { numItems: 20, cursor: null } }))!.page
    expect(activity.filter(entry => entry.type === 'account.activated')).toHaveLength(1)
  })

  test('counts a person\'s first event of the app\'s own as activation until one is named', async () => {
    const ada = await asUser(t)
    await recordAs(ada, { type: 'app.photo_uploaded' }, true)
    expect((await funnel()).activation).toBe(1)
    // The named kind waits for its own event.
    const grace = await asUser(t)
    await recordAs(grace, { type: 'app.photo_uploaded' })
    expect((await funnel()).activation).toBe(1)
  })

  test('counts waitlist joins and admissions, which name no account', async () => {
    await recordAs(t, { type: 'waitlist.joined', actor: null, subjectId: null, data: { source: 'sign-in', referred: false, news: true } })
    await recordAs(t, { type: 'waitlist.joined', actor: null, subjectId: null, data: { source: 'sign-in', referred: true, news: false } })
    const root = await asUser(t, { role: 'admin' })
    await recordAs(root, { type: 'waitlist.admitted', subjectId: null, data: { count: 2 } })
    await recordAs(root, { type: 'access.admitted', subjectId: null, data: { count: 3 } })
    expect(await funnel()).toMatchObject({ waitlist: 2, admitted: 5 })
  })

  test('counts a workspace\'s trial and first payment for its owner, under the promotion it paid with', async () => {
    const ada = await asUser(t)
    const entity = ada.workspaceId!
    await recordAs(t, { type: 'billing.subscription_created', actor: null, subjectId: null, entityId: entity, targetId: 'sub_1', data: { productId: 'prod_pro', trialDays: 14, trialEndsAt: Date.now() + 14 * 86_400_000 } })
    await recordAs(t, { type: 'billing.order_paid', actor: null, subjectId: null, entityId: entity, targetId: 'ord_1', data: { amount: 900, currency: 'usd', promotion: 'launch' } })
    await recordAs(t, { type: 'billing.order_paid', actor: null, subjectId: null, entityId: entity, targetId: 'ord_2', data: { amount: 900, currency: 'usd' } })
    const report = await funnel()
    expect(report).toMatchObject({ signup: 1, trial: 1, paid: 1 })
    expect(report.breakdowns.promotion).toEqual([{ value: 'launch', counts: { signup: 1, activation: 0, trial: 1, paid: 1 } }])
  })

  test('breaks the sign-up down by the invite that admitted it', async () => {
    const ada = await asUser(t)
    await recordAs(ada, { type: 'account.created', data: { invite: 'Beta testers' } })
    const grace = await asUser(t)
    await recordAs(grace, { type: 'account.created', data: {} })
    const report = await funnel()
    expect(report.signup).toBe(2)
    expect(report.breakdowns.invite).toEqual([
      { value: 'direct', counts: { signup: 1, activation: 0, trial: 0, paid: 0 } },
      { value: 'beta testers', counts: { signup: 1, activation: 0, trial: 0, paid: 0 } },
    ])
  })

  test('counts no active week for an administrator acting on an account', async () => {
    const ada = await asUser(t)
    const root = await asUser(t, { role: 'admin' })
    await recordAs(ada, { type: 'account.created', data: {} })
    vi.useFakeTimers({ toFake: ['Date'], now: Date.now() + 7 * 24 * 60 * 60 * 1000 })
    try {
      await recordAs(root, { type: 'app.note_added', subjectId: ada.userId })
      const cohort = (await funnel(2)).cohorts.find(row => row.size === 1)!
      expect(cohort.active).toEqual([1, 0])
    }
    finally {
      vi.useRealTimers()
    }
  })

  test('counts each cohort\'s active weeks', async () => {
    const ada = await asUser(t)
    await recordAs(ada, { type: 'app.strip_published' })
    const report = await funnel(2)
    const cohort = report.cohorts.find(entry => entry.week === weekOf(Date.now()))
    expect(cohort).toEqual({ week: weekOf(Date.now()), size: 1, active: [1] })
    expect(report.cohorts).toHaveLength(2)
  })

  test('reads the newest week with anything counted when no week is named', async () => {
    const ada = await asUser(t)
    await recordAs(ada, { type: 'app.strip_published' })
    const root = await asUser(t, { role: 'admin' })
    expect(await root.query(getFunnel, { weeks: 1 })).toMatchObject({ until: weekOf(Date.now()), signup: 1, activation: 1 })
  })

  test('is for administrators in person', async () => {
    const ada = await asUser(t)
    expect(await refusalOf(ada.query(getFunnel, { weeks: 4 }))).toMatchObject({ code: 'forbidden', data: { reason: 'admin_only' } })
    expect(await refusalOf(t.query(getFunnel, { weeks: 4 }))).toMatchObject({ code: 'unauthenticated' })
    const root = await asUser(t, { role: 'admin' })
    const visit = await asUser(t, { role: 'admin', impersonatedBy: root.userId })
    expect(await refusalOf(visit.query(getFunnel, { weeks: 4 }))).toMatchObject({ code: 'forbidden', data: { reason: 'impersonating' } })
  })

  test('keeps every count when an account is erased, and nothing of who it was', async () => {
    const ada = await asUser(t)
    await recordAs(ada, { type: 'app.strip_published' })
    await ada.mutation(recordSource, { answer: 'other', detail: 'A comic shop in Lyon' })
    vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] })
    await t.mutation(ref('mutation', 'app:erase'), { userId: ada.userId })
    await t.finishAllScheduledFunctions(() => vi.runAllTimers())
    vi.useRealTimers()
    const report = await funnel()
    expect(report).toMatchObject({ signup: 1, activation: 1 })
    expect(report.otherAnswers).toEqual([])
    // Nothing of who it was: no answer, no campaign, no row to read them from.
    expect(await t.query(components.backend.funnel.source, { userId: ada.userId })).toEqual({ asked: false, answer: null, campaign: null })
  })
})

describe('how people heard about the app', () => {
  test('keeps one answer, with an "Other" answer\'s words, and never asks twice', async () => {
    const ada = await asUser(t)
    expect(await ada.query(getSource, {})).toEqual({ asked: false, answer: null, campaign: null })
    expect(await ada.mutation(recordSource, { answer: 'ai-assistant' })).toEqual({ asked: true, answer: 'ai-assistant', campaign: null })
    // A second answer is ignored.
    expect(await ada.mutation(recordSource, { answer: 'podcast' })).toMatchObject({ answer: 'ai-assistant' })
    const grace = await asUser(t)
    await grace.mutation(recordSource, { answer: 'other', detail: '  A comic shop  ' })
    const report = await funnel()
    expect(report.breakdowns.answer).toEqual(expect.arrayContaining([
      { value: 'ai-assistant', counts: { signup: 1, activation: 0, trial: 0, paid: 0 } },
      { value: 'other', counts: { signup: 1, activation: 0, trial: 0, paid: 0 } },
    ]))
    expect(report.otherAnswers).toEqual(['A comic shop'])
  })

  test('a skip is remembered and counts under "Direct or unknown"', async () => {
    const ada = await asUser(t)
    expect(await ada.mutation(recordSource, { answer: null })).toEqual({ asked: true, answer: null, campaign: null })
    expect((await funnel()).breakdowns.answer).toEqual([{ value: 'direct', counts: { signup: 1, activation: 0, trial: 0, paid: 0 } }])
  })

  test('keeps the first campaign within a day of the sign-up, and moves the steps already counted', async () => {
    const ada = await asUser(t)
    await recordAs(ada, { type: 'app.strip_published' })
    await ada.mutation(recordSource, { touch: { source: 'newsletter', campaign: 'Autumn' } })
    await ada.mutation(recordSource, { touch: { campaign: 'winter' } })
    expect(await ada.query(getSource, {})).toEqual({ asked: false, answer: null, campaign: 'autumn' })
    // An account older than a day is past first touch.
    const grace = await asUser(t)
    await t.mutation(components.backend.adapter.updateOne, { input: { model: 'user', where: [{ field: '_id', value: grace.userId }], update: { createdAt: Date.now() - 2 * 86_400_000 } } } as never)
    await grace.mutation(recordSource, { touch: { campaign: 'autumn' } })
    const report = await funnel()
    expect(report.breakdowns.campaign).toEqual(expect.arrayContaining([
      { value: 'autumn', counts: { signup: 1, activation: 1, trial: 0, paid: 0 } },
      { value: 'direct', counts: { signup: 1, activation: 0, trial: 0, paid: 0 } },
    ]))
  })

  test('lists the campaigns that brought the most people, never the first to arrive', async () => {
    // Throwaway accounts, each naming a campaign of its own, arrive first.
    for (let index = 0; index < 25; index++) {
      const junk = await asUser(t)
      await junk.mutation(recordSource, { touch: { campaign: `junk-${index}` } })
    }
    for (let index = 0; index < 3; index++) {
      const person = await asUser(t)
      await person.mutation(recordSource, { touch: { campaign: 'autumn' } })
    }
    const { campaign } = (await funnel()).breakdowns
    expect(campaign[0]).toEqual({ value: 'autumn', counts: { signup: 3, activation: 0, trial: 0, paid: 0 } })
    // Twenty values apart, the rest folded: every sign-up is counted once.
    expect(campaign.filter(row => row.value !== 'other')).toHaveLength(20)
    expect(campaign.find(row => row.value === 'other')).toEqual({ value: 'other', counts: { signup: 6, activation: 0, trial: 0, paid: 0 } })
    expect(campaign.reduce((sum, row) => sum + row.counts.signup, 0)).toBe(28)
  })

  test('hands the account its funnel row and the variants it saw in its data export', async () => {
    const root = await asUser(t, { role: 'admin' })
    const ada = await asUser(t)
    await ada.mutation(recordSource, { touch: { campaign: 'Autumn' }, answer: 'other', detail: 'A zine at the library' })
    await recordAs(ada, { type: 'app.strip_published' })
    await root.mutation(setFlag, { key: 'pricingHeadline', override: { enabled: true } })
    const { variant } = (await ada.mutation(exposeExperiment, { key: 'pricingHeadline' }))!
    const data = await t.query(components.backend.account.exportData, { userId: ada.userId }) as { funnel: Record<string, unknown>, experiments: unknown[] }
    expect(data.funnel).toMatchObject({ userId: ada.userId, campaign: 'autumn', answer: 'other', detail: 'A zine at the library', activatedAt: expect.any(Number), week: expect.any(Number) })
    expect(data.funnel).not.toHaveProperty('_id')
    expect(data.experiments).toEqual([{ experiment: 'pricingHeadline', variant, at: expect.any(Number) }])
    const grace = await asUser(t)
    expect(await t.query(components.backend.account.exportData, { userId: grace.userId })).toMatchObject({ funnel: null, experiments: [] })
  })

  test('is the person\'s own: refused signed out and to a visit', async () => {
    expect(await t.query(getSource, {})).toBeNull()
    expect(await refusalOf(t.mutation(recordSource, { answer: 'friend' }))).toMatchObject({ code: 'unauthenticated' })
    const root = await asUser(t, { role: 'admin' })
    const visit = await asUser(t, { impersonatedBy: root.userId })
    expect(await refusalOf(visit.mutation(recordSource, { answer: 'friend' }))).toMatchObject({ code: 'forbidden', data: { reason: 'impersonating' } })
  })
})

describe('experiments', () => {
  test('gives each person one variant, the control while the flag is off and signed out', async () => {
    const people = await Promise.all(Array.from({ length: 6 }, () => asUser(t)))
    for (const person of people) expect((await person.query(getFlags, {})).variants.pricingHeadline).toBe('plans')
    expect((await t.query(getFlags, {})).variants).toMatchObject({ pricingHeadline: 'plans', annualOffer: 'list' })
    const root = await asUser(t, { role: 'admin' })
    await root.mutation(setFlag, { key: 'pricingHeadline', override: { enabled: true } })
    const seen = new Set<string>()
    for (const person of people) {
      const first = await person.query(getFlags, {})
      const second = await person.query(getFlags, {})
      expect(first.variants.pricingHeadline).toBe(second.variants.pricingHeadline)
      expect(first.running).toContain('pricingHeadline')
      seen.add(first.variants.pricingHeadline!)
    }
    // Signed out: the control, and nothing runs.
    expect((await t.query(getFlags, {})).variants.pricingHeadline).toBe('plans')
    expect((await t.query(getFlags, {})).running).toEqual([])
    expect([...seen].every(name => ['plans', 'strip'].includes(name))).toBe(true)
  })

  test('records one exposure per person, on the first read of a running experiment, the same from page and server', async () => {
    const ada = await asUser(t)
    const root = await asUser(t, { role: 'admin' })
    // Off: the control, nothing recorded.
    expect(await ada.mutation(exposeExperiment, { key: 'pricingHeadline' })).toEqual({ variant: 'plans' })
    await root.mutation(setFlag, { key: 'pricingHeadline', override: { enabled: true } })
    const shown = (await ada.query(getFlags, {})).variants.pricingHeadline
    expect(await ada.mutation(exposeExperiment, { key: 'pricingHeadline' })).toEqual({ variant: shown })
    expect(await ada.mutation(ref('mutation', 'app:reminder'), {})).toBe(shown)
    expect(await ada.mutation(exposeExperiment, { key: 'tips' })).toBeNull()
    // The person's own activity never names their cohort; the administrators' trail does.
    const own = (await ada.query(listActivity, { paginationOpts: { numItems: 20, cursor: null } }))!.page
    expect(own.filter(entry => entry.type === 'experiment.exposed')).toEqual([])
    const all = (await root.query(listAllActivity, { paginationOpts: { numItems: 50, cursor: null } }))!.page
    expect(all.filter(entry => entry.type === 'experiment.exposed')).toEqual([expect.objectContaining({ data: { experiment: 'pricingHeadline', variant: shown } })])
    // An administrator's visit reads the variant and records nothing.
    const visit = await asUser(t, { impersonatedBy: root.userId })
    await visit.mutation(exposeExperiment, { key: 'pricingHeadline' })
    const results = (await root.query(getExperiments, {})).find(entry => entry.key === 'pricingHeadline')!
    expect(results.variants.reduce((sum, variant) => sum + variant.exposed, 0)).toBe(1)
  })

  test('counts the goal and guardrails for the variant each person saw first, and only after they saw it', async () => {
    const root = await asUser(t, { role: 'admin' })
    const ada = await asUser(t)
    const grace = await asUser(t)
    // Grace converts before the experiment shows her anything: it never counts.
    await recordAs(t, { type: 'billing.subscription_created', actor: null, subjectId: null, entityId: grace.workspaceId, targetId: 'sub_g', data: { productId: 'prod_pro' } })
    await root.mutation(setFlag, { key: 'pricingHeadline', override: { enabled: true } })
    const { variant } = (await ada.mutation(exposeExperiment, { key: 'pricingHeadline' }))!
    await grace.mutation(exposeExperiment, { key: 'pricingHeadline' })
    await recordAs(t, { type: 'billing.subscription_created', actor: null, subjectId: null, entityId: ada.workspaceId, targetId: 'sub_a', data: { productId: 'prod_pro' } })
    await recordAs(t, { type: 'billing.subscription_created', actor: null, subjectId: null, entityId: ada.workspaceId, targetId: 'sub_a2', data: { productId: 'prod_pro' } })
    await recordAs(t, { type: 'billing.order_refunded', actor: null, subjectId: null, entityId: ada.workspaceId, targetId: 'ord_a', data: { amount: 900, currency: 'usd' } })
    const results = (await root.query(getExperiments, {})).find(entry => entry.key === 'pricingHeadline')!
    expect(results).toMatchObject({ running: true, winner: null, goal: 'billing.subscription_created', guardrails: ['billing.order_refunded'], verdict: { kind: 'too_few' } })
    expect(results.startedAt).toEqual(expect.any(Number))
    const counted = Object.fromEntries(results.variants.map(entry => [entry.name, entry]))
    expect(counted[variant]).toMatchObject({ goal: { count: 1 }, guardrails: [expect.objectContaining({ kind: 'billing.order_refunded', count: 1 })] })
    expect(results.variants.reduce((sum, entry) => sum + entry.exposed, 0)).toBe(2)
    expect(results.variants.reduce((sum, entry) => sum + (entry.goal?.count ?? 0), 0)).toBe(1)
  })

  test('counts no goal for an administrator acting on a person, or visiting them', async () => {
    const root = await asUser(t, { role: 'admin' })
    const ada = await asUser(t)
    await root.mutation(setFlag, { key: 'pricingHeadline', override: { enabled: true } })
    await ada.mutation(exposeExperiment, { key: 'pricingHeadline' })
    await recordAs(root, { type: 'billing.subscription_created', subjectId: ada.userId, targetId: 'sub_admin', data: { productId: 'prod_pro' } })
    await t.mutation(ref('mutation', 'app:recordRow'), { event: { type: 'billing.subscription_created', actorId: ada.userId, impersonatorId: root.userId, subjectId: ada.userId, targetId: 'sub_visit', data: { productId: 'prod_pro' } } })
    const results = (await root.query(getExperiments, {})).find(entry => entry.key === 'pricingHeadline')!
    expect(results.variants.reduce((sum, entry) => sum + (entry.goal?.count ?? 0), 0)).toBe(0)
    await recordAs(t, { type: 'billing.subscription_created', actor: null, subjectId: ada.userId, targetId: 'sub_own', data: { productId: 'prod_pro' } })
    const after = (await root.query(getExperiments, {})).find(entry => entry.key === 'pricingHeadline')!
    expect(after.variants.reduce((sum, entry) => sum + (entry.goal?.count ?? 0), 0)).toBe(1)
  })

  test('shows a winner to everyone once it is picked, and records no more exposures', async () => {
    const root = await asUser(t, { role: 'admin' })
    await root.mutation(setFlag, { key: 'pricingHeadline', override: { enabled: true, winner: 'strip' } })
    const ada = await asUser(t)
    expect((await ada.query(getFlags, {})).variants.pricingHeadline).toBe('strip')
    expect((await ada.query(getFlags, {})).running).toEqual([])
    await ada.mutation(exposeExperiment, { key: 'pricingHeadline' })
    const results = (await root.query(getExperiments, {})).find(entry => entry.key === 'pricingHeadline')!
    expect(results).toMatchObject({ running: false, winner: 'strip', override: { enabled: true, winner: 'strip' } })
    expect(await refusalOf(root.mutation(setFlag, { key: 'pricingHeadline', override: { winner: 'banner' } }))).toMatchObject({ code: 'invalid_input', data: { field: 'winner' } })
    expect(await refusalOf(root.mutation(setFlag, { key: 'tips', override: { winner: 'plans' } }))).toMatchObject({ code: 'invalid_input', data: { field: 'winner' } })
  })

  test('runs a price test as the promotion of the variant, for the people in it', async () => {
    const root = await asUser(t, { role: 'admin' })
    await root.mutation(setFlag, { key: 'annualOffer', override: { enabled: true } })
    const people = await Promise.all(Array.from({ length: 8 }, () => asUser(t)))
    for (const person of people) {
      const values = await person.query(getFlags, {})
      expect(values.discounts).toEqual(values.variants.annualOffer === 'discount20' ? { annualOffer: 'annual20' } : {})
    }
    const results = (await root.query(getExperiments, {})).find(entry => entry.key === 'annualOffer')!
    expect(results.variants.map(entry => entry.discount)).toEqual([null, 'annual20'])
  })

  test('splits a workspace experiment by the workspace, its members seeing one variant', async () => {
    const root = await asUser(t, { role: 'admin' })
    await root.mutation(setFlag, { key: 'boardsTest', override: { enabled: true } })
    const acme = await seedWorkspace(t, { name: 'Acme' })
    const [ada, bob] = await Promise.all([asUser(t, { workspace: acme }), asUser(t, { workspace: acme })])
    const variant = (await ada.query(getFlags, {})).variants.boardsTest
    expect((await bob.query(getFlags, {})).variants.boardsTest).toBe(variant)
    await ada.mutation(exposeExperiment, { key: 'boardsTest' })
    await bob.mutation(exposeExperiment, { key: 'boardsTest' })
    await recordAs(bob, { type: 'app.board_made', entityId: acme })
    const results = (await root.query(getExperiments, {})).find(entry => entry.key === 'boardsTest')!
    expect(results.variants.find(entry => entry.name === variant)).toMatchObject({ exposed: 1, goal: { count: 1 } })
  })

  test('the results are for administrators in person', async () => {
    const ada = await asUser(t)
    expect(await refusalOf(ada.query(getExperiments, {}))).toMatchObject({ code: 'forbidden', data: { reason: 'admin_only' } })
  })

  test('an erased account\'s exposure goes, and its counts stay', async () => {
    const root = await asUser(t, { role: 'admin' })
    await root.mutation(setFlag, { key: 'pricingHeadline', override: { enabled: true } })
    const ada = await asUser(t)
    await ada.mutation(exposeExperiment, { key: 'pricingHeadline' })
    vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] })
    await t.mutation(ref('mutation', 'app:erase'), { userId: ada.userId })
    await t.finishAllScheduledFunctions(() => vi.runAllTimers())
    vi.useRealTimers()
    // Ada's exposure is gone: the same subject is exposed afresh.
    expect(await t.mutation(components.backend.funnel.expose, { experiment: 'pricingHeadline', subject: ada.userId, userId: ada.userId, variant: 'plans', variants: ['plans', 'strip'], by: 'user', guardrails: [] })).toEqual({ exposed: true, variant: 'plans' })
    const results = (await root.query(getExperiments, {})).find(entry => entry.key === 'pricingHeadline')!
    expect(results.variants.reduce((sum, entry) => sum + entry.exposed, 0)).toBe(2)
  })
})

describe('the reviewAsk email', () => {
  test('starts a week after the account\'s activation unless it names its own event', () => {
    const topics = { tips: { name: 'Tips', description: 'Tips.', subscribedByDefault: true } } as never
    expect(lifecycleSettings({ reviewAsk: { topic: 'tips' } }, topics)[0]).toMatchObject({ flow: 'reviewAsk', start: 'account.activated' })
    expect(lifecycleSettings({ reviewAsk: { topic: 'tips', event: 'app.strip_ready' } }, topics)[0]).toMatchObject({ start: 'app.strip_ready' })
  })
})
