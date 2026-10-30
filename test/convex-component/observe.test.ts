/// <reference types="vite/client" />

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { convexTest } from 'convex-test'
import resendComponent from '@convex-dev/resend/test'
import component from '../../src/convex/test'
import schema from '../../src/convex/components/backend/schema'
import { api, internal } from '../../src/convex/components/backend/_generated/api'
import { aiSpendAlert, emailQuotaAlerts } from '../../src/convex/components/backend/alerts'
import { addAiCost, AI_COST_RETENTION_MS, DAY_MS, dayOf } from '../../src/convex/components/backend/costs'
import { MAINTENANCE_TASKS } from '../../src/convex/components/backend/maintenance'

// What AI costs per person, and the backend's alerts: a job step's usage is
// added to its starter's day in the same mutation that records it on the
// job, the job's end counts it, any other run records its usage as it ends,
// and each write adds to the app's day total too. The Costs tab's summary
// reads the day totals and the costliest people. Every hour, a deployment that checks in
// compares the email plan's usage with its quota and the day's AI spend with
// the week before, and raises each alert once per period: a log line, and an
// event to the monitoring service. A stubbed fetch stands in for the email
// provider and the monitoring service.

const DSN = 'https://public-key@o7.ingest.monitor.test/42'
const NOW = Date.UTC(2026, 9, 27, 15)

let t: ReturnType<typeof convexTest>
let fetchMock: ReturnType<typeof vi.fn>
let usage: { daily: { used: number, limit: number | null }, monthly: { used: number, limit: number } }

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] })
  vi.setSystemTime(NOW)
  t = convexTest(schema, component.modules)
  resendComponent.register(t, 'resend')
  usage = { daily: { used: 10, limit: 100 }, monthly: { used: 100, limit: 3000 } }
  fetchMock = vi.fn(async (url: string) => {
    if (String(url).endsWith('/usage')) {
      const window = (w: { used: number, limit: number | null }) => ({ ...w, sent: w.used, received: 0, resets_at: '2026-10-28T00:00:00Z' })
      return Response.json({ object: 'usage', emails: { daily: window(usage.daily), monthly: window(usage.monthly) } })
    }
    return new Response('{}', { status: 200 })
  })
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  delete process.env.MONITORING_DSN
  delete process.env.BACKEND_ENVIRONMENT
  delete process.env.EMAIL_API_KEY
})

/** A running job of `userId` for `owner`, as the queue keeps it. */
async function runningJob(userId: string | undefined, owner = 'workspace-1'): Promise<string> {
  return t.run(ctx => ctx.db.insert('jobs', {
    kind: 'strips:render',
    args: {},
    owner,
    ...(userId ? { userId } : {}),
    status: 'running',
    rank: 0,
    score: 0,
    joinedAt: NOW - 1000,
    startedAt: NOW - 500,
    leaseUntil: NOW + 60_000,
    cost: 1,
    budgetCounted: 0,
    charged: true,
    refunded: false,
    attempts: 0,
    retries: 0,
  }))
}

const step = (usd: number | undefined) => ({ ...(usd === undefined ? {} : { usd }), input: 100, output: 50, cached: 0, models: ['openai/gpt-image-1'] })

/** The alert events posted to the monitoring service, each its payload. */
function alertEvents(): Array<Record<string, unknown>> {
  return fetchMock.mock.calls
    .filter(([url]) => String(url).includes('/envelope/'))
    .map(([, init]) => JSON.parse(((init as RequestInit).body as string).trimEnd().split('\n')[2]!) as Record<string, unknown>)
}

describe('what AI costs', () => {
  test('a step\'s usage joins its starter\'s day, and the job\'s end counts it', async () => {
    const user = await t.run(ctx => ctx.db.insert('user', { name: 'Ada', email: 'ada@example.com', emailVerified: true, createdAt: NOW, updatedAt: NOW }))
    const jobId = await runningJob(user)
    await t.mutation(api.jobs.touch, { jobId, until: NOW + 60_000, usage: step(0.25) })
    await t.mutation(api.jobs.touch, { jobId, until: NOW + 60_000, usage: step(0.5) })
    await t.mutation(api.jobs.finish, { jobId, outcome: 'done' })
    const guestJob = await runningJob(undefined, 'guest:visitor-1')
    await t.mutation(api.jobs.touch, { jobId: guestJob, until: NOW + 60_000, usage: step(undefined) })

    const summary = await t.query(api.costs.summary, { since: NOW - 6 * DAY_MS })
    expect(summary).toMatchObject({ since: dayOf(NOW - 6 * DAY_MS), usd: 0.75, runs: 1, truncated: false, days: [{ day: dayOf(NOW), usd: 0.75, runs: 1 }] })
    expect(summary.people).toEqual([
      { who: user, name: 'Ada', email: 'ada@example.com', usd: 0.75, input: 200, output: 100, runs: 1 },
      { who: 'guest', usd: 0, input: 100, output: 50, runs: 0 },
    ])
  })

  test('visitors\' jobs spread over a few rows a day, which the summary lists as one guest', async () => {
    for (let visitor = 0; visitor < 12; visitor++) {
      const jobId = await runningJob(undefined, `guest:visitor-${visitor}`)
      await t.mutation(api.jobs.touch, { jobId, until: NOW + 60_000, usage: step(0.1) })
    }
    const rows = await t.run(ctx => ctx.db.query('aiCosts').collect())
    expect(new Set(rows.map(row => row.who)).size).toBeGreaterThan(1)
    expect(rows.every(row => /^guest:[0-7]$/.test(row.who))).toBe(true)
    const { people } = await t.query(api.costs.summary, { since: NOW })
    expect(people).toEqual([{ who: 'guest', usd: expect.closeTo(1.2), input: 1200, output: 600, runs: 0 }])
  })

  test('a run of any kind records its usage once, against who made it and the entity that paid', async () => {
    await t.mutation(api.costs.record, { userId: 'u1', owner: 'workspace-1', usage: { usd: 0.002, input: 30, output: 12, cached: 4 } })
    await t.mutation(api.costs.record, { userId: 'u1', owner: 'app', usage: { input: 8, output: 3, cached: 0 } })
    await t.mutation(api.costs.record, { owner: 'app', usage: { usd: 0.0001, input: 50, output: 0, cached: 0 } })
    const rows = await t.run(ctx => ctx.db.query('aiCosts').collect())
    expect(rows.map(({ who, owner, usd, input, runs }) => ({ who, owner, usd, input, runs }))).toEqual(expect.arrayContaining([
      { who: 'u1', owner: 'app', usd: 0.002, input: 38, runs: 2 },
      { who: 'app', owner: 'app', usd: 0.0001, input: 50, runs: 1 },
    ]))
    const summary = await t.query(api.costs.summary, { since: NOW })
    expect(summary).toMatchObject({ usd: expect.closeTo(0.0021), runs: 3, days: [{ day: dayOf(NOW), usd: expect.closeTo(0.0021), runs: 3 }] })
    expect(summary.people.map(person => person.who)).toEqual(['u1', 'app'])
  })

  test('the totals are whole however many people spent; only the people list is cut', async () => {
    // More person rows than one read takes, all on one day.
    await t.run(async (ctx) => {
      for (let person = 0; person < 10_010; person++) await ctx.db.insert('aiCosts', { day: dayOf(NOW), who: `u${person}`, owner: 'w', usd: 0.001, input: 1, output: 0, cached: 0, runs: 1 })
      await ctx.db.insert('aiCostDays', { day: dayOf(NOW), shard: 0, usd: 10.01, input: 10_010, output: 0, cached: 0, runs: 10_010 })
    })
    const summary = await t.query(api.costs.summary, { since: NOW })
    expect(summary).toMatchObject({ usd: 10.01, runs: 10_010, truncated: true })
    expect(summary.people).toHaveLength(100)
  }, 120_000)

  test('a day older than the window is left out, and maintenance prunes it after 90 days', async () => {
    const old = dayOf(NOW) - AI_COST_RETENTION_MS - DAY_MS
    await t.run(async (ctx) => {
      await ctx.db.insert('aiCosts', { day: dayOf(NOW) - 10 * DAY_MS, who: 'u1', owner: 'w', usd: 4, input: 0, output: 0, cached: 0, runs: 2 })
      await ctx.db.insert('aiCostDays', { day: dayOf(NOW) - 10 * DAY_MS, shard: 1, usd: 4, input: 0, output: 0, cached: 0, runs: 2 })
      await ctx.db.insert('aiCosts', { day: old, who: 'u1', owner: 'w', usd: 9, input: 0, output: 0, cached: 0, runs: 1 })
      await ctx.db.insert('aiCostDays', { day: old, shard: 1, usd: 9, input: 0, output: 0, cached: 0, runs: 1 })
    })
    expect((await t.query(api.costs.summary, { since: NOW - 6 * DAY_MS })).usd).toBe(0)
    expect((await t.query(api.costs.summary, { since: NOW - 30 * DAY_MS })).usd).toBe(4)
    await t.run(ctx => MAINTENANCE_TASKS.aiCosts(ctx, NOW))
    await t.run(ctx => MAINTENANCE_TASKS.aiCostDays(ctx, NOW))
    expect((await t.run(ctx => ctx.db.query('aiCosts').collect())).map(row => row.usd)).toEqual([4])
    expect((await t.run(ctx => ctx.db.query('aiCostDays').collect())).map(row => row.usd)).toEqual([4])
  })
})

describe('the email quota alert', () => {
  test('fires at 80% and again when used up, the highest threshold each window passed', () => {
    expect(emailQuotaAlerts({ daily: { used: 79, limit: 100 }, monthly: { used: 10, limit: 3000 } }, NOW)).toEqual([])
    expect(emailQuotaAlerts({ daily: { used: 85, limit: 100 }, monthly: { used: 3000, limit: 3000 } }, NOW)).toEqual([
      expect.objectContaining({ kind: 'email_quota', key: 'email_quota:daily:80', period: '2026-10-27', level: 'warning', message: 'The email plan\'s daily quota is 85% used: 85 of 100 emails.' }),
      expect.objectContaining({ key: 'email_quota:monthly:100', period: '2026-10', level: 'error' }),
    ])
    // A paid plan has no daily quota.
    expect(emailQuotaAlerts({ daily: { used: 900, limit: null }, monthly: { used: 900, limit: 50_000 } }, NOW)).toEqual([])
  })

  test('fires once per billing month, which a paid plan starts on its billing date', () => {
    const daily = { used: 0, limit: null }
    const monthly = { used: 2550, limit: 3000, resets_at: '2026-11-14T00:00:00.000Z' }
    const october = emailQuotaAlerts({ daily, monthly }, Date.UTC(2026, 9, 25))
    expect(october).toEqual([expect.objectContaining({ key: 'email_quota:monthly:80', period: 'until 2026-11-14' })])
    // The same window, read on the 1st: the same period, so no second alert.
    expect(emailQuotaAlerts({ daily, monthly }, Date.UTC(2026, 10, 1))[0]!.period).toBe(october[0]!.period)
    // The next window reaches 80% within the same calendar month, and alerts.
    expect(emailQuotaAlerts({ daily, monthly: { ...monthly, resets_at: '2026-12-14T00:00:00.000Z' } }, Date.UTC(2026, 10, 30))[0]).toMatchObject({ period: 'until 2026-12-14' })
  })

  test('is raised once per period, logged and posted to the monitoring service', async () => {
    process.env.MONITORING_DSN = DSN
    process.env.BACKEND_ENVIRONMENT = 'production'
    process.env.EMAIL_API_KEY = 're_test'
    usage.daily.used = 90
    expect(await t.action(internal.alerts.check, {})).toBe(1)
    expect(await t.action(internal.alerts.check, {})).toBe(0)
    expect(alertEvents()).toEqual([expect.objectContaining({
      level: 'warning',
      environment: 'production',
      fingerprint: ['nuxt-backend-alert', 'email_quota'],
      tags: { 'backend.alert': 'email_quota', 'backend.source': 'backend' },
      message: { formatted: 'The email plan\'s daily quota is 90% used: 90 of 100 emails.' },
    })])
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('monitoring.alert'))
  })

  test('a dev or a preview deployment checks nothing', async () => {
    process.env.MONITORING_DSN = DSN
    process.env.EMAIL_API_KEY = 're_test'
    usage.daily.used = 100
    for (const environment of ['development', 'preview']) {
      process.env.BACKEND_ENVIRONMENT = environment
      expect(await t.action(internal.alerts.check, {})).toBe(0)
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('without a DSN the alert is logged only', async () => {
    process.env.BACKEND_ENVIRONMENT = 'sandbox'
    process.env.EMAIL_API_KEY = 're_test'
    usage.monthly.used = 2500
    expect(await t.action(internal.alerts.check, {})).toBe(1)
    expect(alertEvents()).toEqual([])
  })
})

describe('the AI spend alert', () => {
  const today = dayOf(NOW)
  const week = (usd: number) => Array.from({ length: 7 }, (_, index) => ({ day: today - (index + 1) * DAY_MS, usd }))

  test('fires once the day passes twice the week\'s daily average, and $5', () => {
    expect(aiSpendAlert([...week(3), { day: today, usd: 5.5 }], NOW)).toBeNull()
    expect(aiSpendAlert([...week(3), { day: today, usd: 6.5 }], NOW)).toMatchObject({ key: 'ai_spend', period: '2026-10-27', message: 'AI calls cost $6.50 so far today (UTC), over 2 times the $3.00 a day of the 7 days before.' })
    expect(aiSpendAlert([{ day: today, usd: 4.99 }], NOW)).toBeNull()
    expect(aiSpendAlert([{ day: today, usd: 5 }], NOW)).not.toBeNull()
  })

  test('reads the recorded costs, a job\'s and any other run\'s', async () => {
    process.env.MONITORING_DSN = DSN
    process.env.BACKEND_ENVIRONMENT = 'production'
    const jobId = await runningJob('u1')
    await t.mutation(api.jobs.touch, { jobId, until: NOW + 60_000, usage: step(7) })
    await t.mutation(api.costs.record, { userId: 'u2', owner: 'w', usage: { usd: 5, input: 10, output: 10, cached: 0 } })
    expect(await t.query(internal.costs.dailySpend, { since: today - DAY_MS, until: NOW })).toEqual([{ day: today - DAY_MS, usd: 0 }, { day: today, usd: 12 }])
    expect(await t.action(internal.alerts.check, {})).toBe(1)
    expect(alertEvents()).toEqual([expect.objectContaining({ fingerprint: ['nuxt-backend-alert', 'ai_spend'], extra: { usd: 12, average: 0 } })])
  })

  test('counts every person of a busy week from the day totals, so its oldest days still weigh in the average', async () => {
    process.env.BACKEND_ENVIRONMENT = 'production'
    // 250 people a day for the week before, $5 a day in all: twice that is $10.
    await t.run(async (ctx) => {
      for (let back = 1; back <= 7; back++) {
        for (let person = 0; person < 250; person++) await addAiCost(ctx, { userId: `u${person}`, owner: 'w' }, today - back * DAY_MS, { usage: { usd: 0.02, input: 0, output: 0, cached: 0 }, ended: true })
      }
      await addAiCost(ctx, { userId: 'u0', owner: 'w' }, NOW, { usage: { usd: 9, input: 0, output: 0, cached: 0 }, ended: true })
    })
    // The alert reads a few rows a day, never the people's, so no day of the baseline is cut short.
    expect((await t.run(ctx => ctx.db.query('aiCostDays').collect())).length).toBeLessThanOrEqual(8 * 8)
    expect(await t.action(internal.alerts.check, {})).toBe(0)
  }, 120_000)
})
