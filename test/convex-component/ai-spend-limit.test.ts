/// <reference types="vite/client" />

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { convexTest } from 'convex-test'
import resendComponent from '@convex-dev/resend/test'
import component from '../../src/convex/test'
import schema from '../../src/convex/components/backend/schema'
import { api, internal } from '../../src/convex/components/backend/_generated/api'
import { DAY_MS } from '../../src/convex/components/backend/costs'
import { costRecorder } from '../../src/convex/integrations/ai/costs'

// The daily AI spend limit (`setupAi({ spendLimit })`): every cost recorded
// with the limit checks the UTC day's total apart, and once it reaches the
// limit the app turns `pause_ai` on, marked as its own, records
// `ai.spend_limit_reached` and raises the `ai_spend_limit` alert. The next
// UTC day lifts the pause, but only one the limit set: an administrator's
// stays. The component runs as the root app, on fake time.

const NOW = Date.UTC(2026, 9, 27, 15)
const DSN = 'https://public-key@o7.ingest.monitor.test/42'

let t: ReturnType<typeof convexTest>
let fetchMock: ReturnType<typeof vi.fn>
let warn: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] })
  vi.setSystemTime(NOW)
  t = convexTest(schema, component.modules)
  resendComponent.register(t, 'resend')
  fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  delete process.env.MONITORING_DSN
})

/** Run what is due now: the limit's check, then the alert it raises. Nothing scheduled for later. */
async function settle() {
  for (let round = 0; round < 3; round++) {
    vi.advanceTimersByTime(1)
    await t.finishInProgressScheduledFunctions()
  }
}

/** One run's cost, recorded with the limit as the app's side records it. */
async function spend(usd: number, limitUsd: number | null = 10, who = 'user-1') {
  await t.mutation(api.costs.record, { userId: who, owner: 'workspace-1', usage: { usd, input: 10, output: 5, cached: 0 }, ...(limitUsd === null ? {} : { spendLimitUsd: limitUsd }) })
  await settle()
}

const pauseRow = () => t.query(api.flags.get, { key: 'pause_ai' })
const events = () => t.run(ctx => ctx.db.query('auditEvents').collect())
const alerts = () => t.run(ctx => ctx.db.query('monitoringAlerts').collect())

describe('the daily spend limit', () => {
  test('turns pause_ai on once the day reaches it, records it and raises the alert, once', async () => {
    process.env.MONITORING_DSN = DSN
    await spend(4)
    await spend(5, 10, 'user-2')
    expect(await pauseRow()).toBeNull()
    expect(await events()).toEqual([])

    await spend(1.5)
    expect(await pauseRow()).toMatchObject({ override: { enabled: true } })
    expect(await t.run(ctx => ctx.db.query('flagOverrides').unique())).toMatchObject({ setBy: 'spend_limit' })
    expect(await events()).toMatchObject([{ type: 'ai.spend_limit_reached', data: { usd: 10.5, limit: 10 } }])
    expect(await alerts()).toMatchObject([{ alert: 'ai_spend_limit', period: '2026-10-27' }])
    expect(warn.mock.calls.flat().join('\n')).toMatch(/monitoring\.alert.*\$10\.50.*\$10\.00/)
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/envelope/'))).toHaveLength(1)

    // A later cost the same day changes nothing more.
    await spend(3)
    expect(await events()).toHaveLength(1)
    expect(await alerts()).toHaveLength(1)
  })

  test('checks nothing for a cost recorded without a limit, or with no dollars', async () => {
    await spend(50, null)
    await spend(0, 1)
    expect(await pauseRow()).toBeNull()
  })

  test('counts a job step\'s usage with the limit, as a run\'s', async () => {
    const jobId = await t.run(ctx => ctx.db.insert('jobs', {
      kind: 'strips:render', args: {}, owner: 'workspace-1', userId: 'user-1', status: 'running', rank: 0, score: 0,
      joinedAt: NOW - 1000, startedAt: NOW - 500, leaseUntil: NOW + 60_000, cost: 1, budgetCounted: 0, charged: true, refunded: false, attempts: 0, retries: 0,
    }))
    await t.mutation(api.jobs.touch, { jobId, until: NOW + 60_000, usage: { usd: 12, input: 1, output: 1, cached: 0, models: ['openai/gpt-image-1'] }, spendLimitUsd: 10 })
    await settle()
    expect(await pauseRow()).toMatchObject({ override: { enabled: true } })
  })

  test('lifts its own pause when the next UTC day begins', async () => {
    await spend(11)
    expect(await pauseRow()).toMatchObject({ override: { enabled: true } })
    await t.finishAllScheduledFunctions(() => vi.runAllTimers())
    expect(Date.now()).toBeGreaterThanOrEqual(Date.UTC(2026, 9, 28))
    expect(await pauseRow()).toBeNull()
  })

  test('never lifts a pause an administrator set, before the limit or after it', async () => {
    // Set before: the limit leaves it, records nothing and schedules no lift.
    await t.mutation(api.flags.set, { key: 'pause_ai', override: { enabled: true } })
    await spend(11)
    expect(await events()).toEqual([])
    vi.setSystemTime(NOW + DAY_MS)
    expect(await t.mutation(internal.costs.resetSpendLimit, {})).toBe(false)
    expect(await pauseRow()).toMatchObject({ override: { enabled: true } })

    // Set after: an administrator's write makes the pause theirs.
    await t.mutation(api.flags.set, { key: 'pause_ai', override: null })
    await spend(11)
    expect(await t.run(ctx => ctx.db.query('flagOverrides').unique())).toMatchObject({ setBy: 'spend_limit' })
    await t.mutation(api.flags.set, { key: 'pause_ai', override: { enabled: true, message: 'Holding AI for the review.' } })
    expect(await t.run(ctx => ctx.db.query('flagOverrides').unique())).not.toHaveProperty('setBy')
    vi.setSystemTime(NOW + 2 * DAY_MS)
    expect(await t.mutation(internal.costs.resetSpendLimit, {})).toBe(false)
    expect(await pauseRow()).toMatchObject({ override: { enabled: true, message: 'Holding AI for the review.' } })
  })

  test('never overwrites an administrator\'s resume or targeted pause, and the lift leaves both', async () => {
    // The limit trips, and an administrator resumes AI for the rest of the day.
    await spend(11)
    await t.mutation(api.flags.set, { key: 'pause_ai', override: { enabled: false, message: 'Resumed for the launch.' } })
    await spend(2)
    expect(await t.run(ctx => ctx.db.query('flagOverrides').unique())).toMatchObject({ override: { enabled: false, message: 'Resumed for the launch.' } })
    expect(await t.run(ctx => ctx.db.query('flagOverrides').unique())).not.toHaveProperty('setBy')
    expect(await events()).toHaveLength(1)
    await t.finishAllScheduledFunctions(() => vi.runAllTimers())
    expect(await pauseRow()).toMatchObject({ override: { enabled: false, message: 'Resumed for the launch.' } })

    // A pause an administrator aimed at some workspaces keeps its fields when the limit is reached.
    await t.mutation(api.flags.set, { key: 'pause_ai', override: { workspaces: ['workspace-9'], message: 'Paused for one team.' } })
    await spend(11)
    expect(await pauseRow()).toMatchObject({ override: { workspaces: ['workspace-9'], message: 'Paused for one team.' } })
    expect((await pauseRow())!.override).not.toHaveProperty('enabled')
    vi.setSystemTime(Date.now() + DAY_MS)
    expect(await t.mutation(internal.costs.resetSpendLimit, {})).toBe(false)
    expect(await pauseRow()).toMatchObject({ override: { workspaces: ['workspace-9'] } })
  })

  test('the hourly check lifts a pause the limit left on past its day', async () => {
    await spend(11)
    vi.setSystemTime(NOW + DAY_MS)
    await t.action(internal.alerts.check, {})
    expect(await pauseRow()).toBeNull()
  })

  test('keeps the pause through the day it was reached', async () => {
    await spend(11)
    expect(await t.mutation(internal.costs.resetSpendLimit, {})).toBe(false)
    expect(await pauseRow()).toMatchObject({ override: { enabled: true } })
  })
})

describe('the app\'s cost record', () => {
  test('carries the limit to the component, and nothing without one', async () => {
    const runMutation = vi.fn(async () => null)
    const calls = [{ state: 'finished', model: 'openai/gpt-5-mini', usd: 0.5, usage: { input: 10, output: 5 } }] as never
    await costRecorder({ record: 'ref:record' } as never, 20)({ runMutation } as never, { userId: 'u1', owner: 'w1' }, calls)
    await costRecorder({ record: 'ref:record' } as never)({ runMutation } as never, { userId: 'u1', owner: 'w1' }, calls)
    expect(runMutation.mock.calls).toEqual([
      ['ref:record', { userId: 'u1', owner: 'w1', usage: { usd: 0.5, input: 10, output: 5, cached: 0 }, spendLimitUsd: 20 }],
      ['ref:record', { userId: 'u1', owner: 'w1', usage: { usd: 0.5, input: 10, output: 5, cached: 0 } }],
    ])
  })
})
