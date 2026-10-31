import { describe, expect, it } from 'vitest'
import {
  admits,
  bucketOf,
  checkQueuePolicy,
  dedicatedInEffect,
  type PickJob,
  pickStarts,
  type QueuePolicy,
  resolveTiers,
  retryDelay,
  standingOf,
  succeeded,
  throttled,
  windowStartOf,
} from '../../src/convex/jobs-policy'
import { classifyStepError, retryAfterOf } from '../../src/convex/integrations/ai/job-errors'
import { backendError } from '../../src/convex/errors'

// The queue's policy as plain functions: the define-time checks, the
// dedicated slots in effect, the pick, the place in line, the adaptive model
// limits, the retry waits and the step error classification.

const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE

/** The priority page's queue: 6 slots, 2 kept for front, 1 for priority. */
const policy: QueuePolicy = {
  concurrency: 6,
  perOwner: 1,
  stallAfter: 5 * MINUTE,
  tiers: [
    { name: 'front', feature: 'front_of_line', headStart: 10 * MINUTE, perOwner: 3, dedicated: 2 },
    { name: 'priority', feature: 'priority_queue', headStart: 4 * MINUTE, perOwner: 2, dedicated: 1, budget: { units: 600, period: DAY } },
    { name: 'standard', budget: { units: 60, period: DAY } },
  ],
}
const tiers = resolveTiers(policy)
const job = (id: string, owner: string, rank: number): PickJob => ({ id, owner, rank })

describe('checkQueuePolicy', () => {
  it('takes the priority page\'s queue', () => {
    expect(() => checkQueuePolicy(policy)).not.toThrow()
  })

  it.each([
    ['a catch-all tier that is not last', { tiers: [{ name: 'all' }, { name: 'paid', feature: 'x' }] }, /must come last/],
    ['dedicated slots on the catch-all tier', { tiers: [{ name: 'all', dedicated: 1 }] }, /keeps no `dedicated`/],
    ['a perOwner of 0', { perOwner: 0 }, /perOwner/],
    ['dedicated slots that leave none shared', { concurrency: 3, tiers: [{ name: 'a', feature: 'a', dedicated: 2 }, { name: 'b', feature: 'b', dedicated: 1 }] }, /no shared one/],
    ['budgets on two periods', { tiers: [{ name: 'a', feature: 'a', budget: { units: 1, period: DAY } }, { name: 'b', budget: { units: 1, period: 60 * MINUTE } }] }, /same `period`/],
  ])('refuses %s', (_name, change, message) => {
    expect(() => checkQueuePolicy({ ...policy, ...change } as QueuePolicy)).toThrow(message)
  })
})

describe('the dedicated slots', () => {
  it('trims from the worst-listed paid tier up, until one slot stays shared', () => {
    expect(dedicatedInEffect(tiers, 6)).toEqual([2, 1, 0])
    expect(dedicatedInEffect(tiers, 3)).toEqual([2, 0, 0])
    expect(dedicatedInEffect(tiers, 2)).toEqual([1, 0, 0])
    expect(dedicatedInEffect(tiers, 0)).toEqual([0, 0, 0])
  })

  it('admit a job only while the free slots still cover what better tiers keep', () => {
    // Nothing runs: a free job must leave 3 kept slots free.
    expect(admits(2, 4, [2, 1, 0], [0, 0, 0])).toBe(true)
    expect(admits(2, 3, [2, 1, 0], [0, 0, 0])).toBe(false)
    // A front job takes its own slot whatever is free.
    expect(admits(0, 1, [2, 1, 0], [0, 0, 0])).toBe(true)
  })

  it('play the busy afternoon of the priority page', () => {
    const running = [job('s1', 'f1', 2), job('s2', 'f2', 2), job('s3', 'f3', 2)]
    const state = { concurrency: 6, paused: false, tiers, perOwner: 1, running, waiting: [] as PickJob[] }
    // A Studio strip joins: it starts in front's slot.
    expect(pickStarts({ ...state, waiting: [job('studio', 'S', 0), job('free', 'f4', 2)] })).toEqual(['studio'])
    // A Pro strip joins: it starts in priority's slot; the next Pro one waits.
    const busier = { ...state, running: [...running, job('studio', 'S', 0)] }
    expect(pickStarts({ ...busier, waiting: [job('pro1', 'P1', 1), job('pro2', 'P2', 1)] })).toEqual(['pro1'])
  })

  it('skip an owner at its perOwner, and still try the jobs behind it', () => {
    const state = { concurrency: 2, paused: false, tiers: resolveTiers({ ...policy, concurrency: 2, tiers: [] }), perOwner: 1, running: [job('a', 'A', 0)] }
    expect(pickStarts({ ...state, waiting: [job('a2', 'A', 0), job('b', 'B', 0)] })).toEqual(['b'])
  })

  it('start nothing while paused', () => {
    expect(pickStarts({ concurrency: 6, paused: true, tiers, perOwner: 1, running: [], waiting: [job('a', 'A', 0)] })).toEqual([])
  })
})

describe('the place in line', () => {
  const base = { concurrency: 2, paused: false, tiers: resolveTiers({ ...policy, concurrency: 2, tiers: [] }), perOwner: 1, now: 0, startedAt: {} }

  it('counts the starts ahead, and when this one starts', () => {
    const state = { ...base, averageMs: MINUTE, running: [job('r1', 'R1', 0), job('r2', 'R2', 0)], waiting: [job('w1', 'W1', 0), job('w2', 'W2', 0), job('w3', 'W3', 0)] }
    expect(standingOf(state, 'w1')).toEqual({ waitingOn: 'line', position: 1, estimatedWait: MINUTE })
    expect(standingOf(state, 'w3')).toEqual({ waitingOn: 'line', position: 3, estimatedWait: 2 * MINUTE })
  })

  it('says a job waits on its owner, with no position but a wait', () => {
    const state = { ...base, averageMs: MINUTE, running: [job('r1', 'A', 0)], waiting: [job('a2', 'A', 0)] }
    expect(standingOf(state, 'a2')).toEqual({ waitingOn: 'owner', position: null, estimatedWait: MINUTE })
  })

  it('has no wait before any job finished, and nothing but paused while paused', () => {
    expect(standingOf({ ...base, averageMs: undefined, running: [], waiting: [job('a', 'A', 0)] }, 'a')).toEqual({ waitingOn: 'line', position: 1, estimatedWait: undefined })
    expect(standingOf({ ...base, paused: true, averageMs: MINUTE, running: [], waiting: [job('a', 'A', 0)] }, 'a')).toEqual({ waitingOn: 'paused', position: null, estimatedWait: undefined })
  })
})

describe('a model\'s limit', () => {
  const limit = { perMinute: 20, min: 2, max: 25, cleanStreak: 0, count429: 0 }

  it('halves on a 429, once a minute, never below min', () => {
    const once = throttled(limit, 0)
    expect(once).toMatchObject({ perMinute: 10, count429: 1 })
    expect(throttled(once, 30_000)).toMatchObject({ perMinute: 10, count429: 2 })
    expect(throttled(throttled(once, MINUTE), 2 * MINUTE)).toMatchObject({ perMinute: 2 })
  })

  it('grows by one after five clean calls, a minute past the last 429, never above max', () => {
    let state = throttled(limit, 0)
    for (let call = 0; call < 5; call++) state = succeeded(state, 30_000)
    expect(state.perMinute).toBe(10)
    for (let call = 0; call < 5; call++) state = succeeded(state, MINUTE)
    expect(state.perMinute).toBe(11)
  })

  it('runs on a token bucket with a third of a minute as its burst', () => {
    expect(bucketOf(6)).toEqual({ kind: 'token bucket', rate: 6, period: MINUTE, capacity: 2 })
    expect(bucketOf(1).capacity).toBe(1)
  })
})

describe('retries and windows', () => {
  it('honors Retry-After up to 5 minutes, else backs off from 5 seconds, with the same jitter on a replay', () => {
    expect(retryDelay(1, undefined, 'job')).toBe(retryDelay(1, undefined, 'job'))
    expect(retryDelay(1, undefined, 'job')).toBeGreaterThanOrEqual(5000)
    expect(retryDelay(3, undefined, 'job')).toBeGreaterThanOrEqual(20_000)
    expect(retryDelay(1, 30 * MINUTE, 'job')).toBeLessThan(5 * MINUTE + 2000)
  })

  it('aligns a daily window to 00:00 UTC', () => {
    expect(windowStartOf(Date.UTC(2026, 9, 27, 23, 58), DAY)).toBe(Date.UTC(2026, 9, 27))
  })
})

describe('a step\'s error', () => {
  it('reads throttles, refusals, passing failures and catalog errors', () => {
    expect(classifyStepError(Object.assign(new Error('x'), { statusCode: 429, responseHeaders: { 'retry-after': '7' } }))).toEqual({ kind: 'throttled', retryAfter: 7000 })
    expect(classifyStepError(Object.assign(new Error('budget'), { statusCode: 402 }))).toEqual({ kind: 'refused' })
    expect(classifyStepError(new Error('wrapped', { cause: { type: 'quota_for_entity_exceeded' } }))).toEqual({ kind: 'refused' })
    expect(classifyStepError(Object.assign(new Error('bad gateway'), { statusCode: 502 }))).toEqual({ kind: 'retryable' })
    expect(classifyStepError(new Error('Request timed out'))).toEqual({ kind: 'retryable' })
    expect(classifyStepError(new TypeError('no image'), [{ model: 'm', state: 'finished', usage: { model: 'm', input: 1, output: 0 }, finishReason: 'content-filter' }])).toEqual({ kind: 'blocked' })
    expect(classifyStepError(backendError('invalid_input', { field: 'idea' }))).toEqual({ kind: 'catalog', payload: { code: 'invalid_input', field: 'idea' } })
    expect(classifyStepError(new Error('anything else'))).toEqual({ kind: 'fatal' })
  })

  it('reads Retry-After as an HTTP date too', () => {
    expect(retryAfterOf({ responseHeaders: { 'Retry-After': new Date(10_000).toUTCString() } }, 0)).toBe(10_000)
  })
})
