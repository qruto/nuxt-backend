/// <reference types="vite/client" />

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { convexTest } from 'convex-test'
import resendComponent from '@convex-dev/resend/test'
import component from '../../src/convex/test'
import schema from '../../src/convex/components/backend/schema'
import { api } from '../../src/convex/components/backend/_generated/api'

// The queue's rows on their own, as the component keeps them: the line a
// pick reads past one owner's backlog, and a job's charge as it lands
// around a failure and an administrator's retry. The app's half runs end
// to end in jobs.test.ts.

const MINUTE = 60_000
const NOW = Date.UTC(2026, 9, 27, 15)
const POLICY = { concurrency: 4, perOwner: 1, stallAfter: 10 * MINUTE, tiers: [] }

let t: ReturnType<typeof convexTest>

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] })
  vi.setSystemTime(NOW)
  t = convexTest(schema, component.modules)
  resendComponent.register(t, 'resend')
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

/** A job row of `owner`, as `join` writes it, with the fields given. */
function job(owner: string, score: number, fields: Record<string, unknown> = {}) {
  return { kind: 'strips:render', args: {}, owner, status: 'queued' as const, rank: 0, score, joinedAt: score, cost: 1, budgetCounted: 0, charged: false, refunded: false, attempts: 0, retries: 0, ...fields }
}

describe('the line', () => {
  test('one owner\'s backlog past the scan never hides another owner\'s job from the pick or its place in line', async () => {
    const other = await t.run(async (ctx) => {
      for (let index = 0; index < 2100; index++) await ctx.db.insert('jobs', job('workspace-busy', NOW - 100_000 + index))
      return await ctx.db.insert('jobs', job('workspace-quiet', NOW))
    })
    const standing = await t.query(api.jobs.standing, { jobId: other, policy: POLICY, pausedAi: false, now: NOW })
    expect(standing?.position).not.toBeNull()
    const { started } = await t.mutation(api.jobs.pick, { policy: POLICY, pausedAi: false })
    expect(started.map(entry => entry.jobId)).toContain(other)
    expect(started).toHaveLength(2)
  })
})

describe('the charge', () => {
  test('a charge that lands after a failed try leaves no error on the job', async () => {
    const jobId = await t.run(ctx => ctx.db.insert('jobs', job('workspace-1', NOW, { status: 'running', startedAt: NOW, leaseUntil: NOW + MINUTE })))
    expect(await t.mutation(api.jobs.claimCharge, { jobId })).toBe('claimed')
    await t.mutation(api.jobs.recordError, { jobId, error: { code: 'provider_refused' }, lastError: 'The billing provider answered 503.' })
    expect(await t.mutation(api.jobs.mark, { jobId, charged: true })).toEqual({ refund: false })
    const ended = await t.mutation(api.jobs.finish, { jobId, outcome: 'done', result: { ok: true } })
    expect(ended).not.toHaveProperty('error')
    // A later failure reads as itself, not as the charge's first try.
    const other = await t.run(ctx => ctx.db.insert('jobs', job('workspace-1', NOW, { status: 'running', startedAt: NOW, leaseUntil: NOW + MINUTE })))
    await t.mutation(api.jobs.claimCharge, { jobId: other })
    await t.mutation(api.jobs.recordError, { jobId: other, error: { code: 'provider_refused' } })
    await t.mutation(api.jobs.mark, { jobId: other, charged: true })
    expect(await t.mutation(api.jobs.finish, { jobId: other, outcome: 'failed', error: { code: 'model_failed' } })).toMatchObject({ error: { code: 'model_failed' } })
  })

  test('a dead letter whose charge may still land goes back in line only once it no longer can', async () => {
    const jobId = await t.run(ctx => ctx.db.insert('jobs', job('workspace-1', NOW, { status: 'running', startedAt: NOW, leaseUntil: NOW + MINUTE, hold: { externalId: 'hold-1', reserved: true, value: 1 } })))
    expect(await t.mutation(api.jobs.claimCharge, { jobId })).toBe('claimed')
    // The stall sweep fails it while its charge is on its way.
    await t.mutation(api.jobs.finish, { jobId, outcome: 'failed', error: { code: 'stalled' } })
    const retry = { jobId, hold: { externalId: 'hold-2', reserved: true, value: 1 }, budgetCounted: 0, policy: POLICY }
    expect(await t.mutation(api.jobs.requeue, retry)).toBeNull()
    vi.setSystemTime(NOW + 16 * MINUTE)
    expect(await t.mutation(api.jobs.requeue, retry)).toMatchObject({ status: 'queued', hold: { externalId: 'hold-2' } })
  })
})
