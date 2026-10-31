/// <reference types="vite/client" />
import { afterEach, describe, expect, test, vi } from 'vitest'
import { defineSchema, defineTable, internalMutationGeneric, makeFunctionReference } from 'convex/server'
import { v } from 'convex/values'
import { defineBackendTestApp } from '../../src/convex/test'
import { defineRetention } from '../../src/convex/integrations/retention'
import { DAY } from '../../src/convex/integrations/rate-limit'

// defineRetention over a real Convex schema: the rows a pass deletes, the
// batches it schedules itself, and what a failing batch leaves behind.

const schema = defineSchema({
  strips: defineTable({
    workspaceId: v.string(),
    title: v.string(),
    status: v.string(),
    updatedAt: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
  })
    .index('by_status_and_updatedAt', ['status', 'updatedAt'])
    .index('by_expiresAt', ['expiresAt']),
  released: defineTable({ title: v.string() }),
})

const released: string[] = []

const pruneDrafts = defineRetention(internalMutationGeneric, {
  fn: 'retention:pruneDrafts',
  table: 'strips',
  index: 'by_status_and_updatedAt',
  match: { status: 'draft' },
  ttl: 30 * DAY,
  batch: 2,
  onDelete: async (ctx, strip) => {
    released.push(strip.title)
    await ctx.db.insert('released', { title: strip.title })
  },
})
const pruneExpired = defineRetention(internalMutationGeneric, {
  fn: 'retention:pruneExpired',
  table: 'strips',
  index: 'by_expiresAt',
  ttl: 0,
})
const pruneOld = defineRetention(internalMutationGeneric, {
  fn: 'retention:pruneOld',
  table: 'strips',
  index: 'by_creation_time',
  ttl: 1000,
})
const pruneStubborn = defineRetention(internalMutationGeneric, {
  fn: 'retention:pruneStubborn',
  table: 'strips',
  index: 'by_status_and_updatedAt',
  match: { status: 'failed' },
  ttl: DAY,
  onDelete: (_ctx, strip) => {
    if (strip.title === 'stuck') throw new Error('storage is down')
  },
})

const testApp = defineBackendTestApp(schema, {
  './_generated/api.js': () => Promise.resolve({}),
  './retention.js': () => Promise.resolve({ pruneDrafts, pruneExpired, pruneOld, pruneStubborn }),
})
const refs = {
  pruneDrafts: makeFunctionReference<'mutation'>('retention:pruneDrafts'),
  pruneExpired: makeFunctionReference<'mutation'>('retention:pruneExpired'),
  pruneOld: makeFunctionReference<'mutation'>('retention:pruneOld'),
  pruneStubborn: makeFunctionReference<'mutation'>('retention:pruneStubborn'),
}

type App = ReturnType<typeof testApp>
const strip = (title: string, status: string, updatedAt?: number, expiresAt?: number) =>
  ({ workspaceId: 'w', title, status, ...(updatedAt === undefined ? {} : { updatedAt }), ...(expiresAt === undefined ? {} : { expiresAt }) })
const titles = async (t: App) => (await t.run(ctx => ctx.db.query('strips').collect())).map(row => row.title).sort()

afterEach(() => {
  released.length = 0
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('a pass', () => {
  test('deletes the rows past their age that match, and only those', async () => {
    const t = testApp()
    await t.run(async (ctx) => {
      await ctx.db.insert('strips', strip('old draft', 'draft', 0))
      await ctx.db.insert('strips', strip('new draft', 'draft', 20 * DAY))
      await ctx.db.insert('strips', strip('old failed', 'failed', 0))
    })
    const result = await t.mutation(refs.pruneDrafts, { now: 31 * DAY })
    expect(result).toEqual({ deleted: 1, more: false })
    expect(await titles(t)).toEqual(['new draft', 'old failed'])
  })

  test('keeps a row exactly as old as the ttl and deletes one a millisecond older', async () => {
    const t = testApp()
    await t.run(async (ctx) => {
      await ctx.db.insert('strips', strip('edge', 'draft', DAY))
      await ctx.db.insert('strips', strip('older', 'draft', DAY - 1))
    })
    await t.mutation(refs.pruneDrafts, { now: 31 * DAY })
    expect(await titles(t)).toEqual(['edge'])
  })

  test('runs onDelete for each row in the same transaction as its delete', async () => {
    const t = testApp()
    await t.run(async (ctx) => {
      await ctx.db.insert('strips', strip('a', 'draft', 0))
      await ctx.db.insert('strips', strip('b', 'draft', 0))
    })
    await t.mutation(refs.pruneDrafts, { now: 31 * DAY })
    expect(released.sort()).toEqual(['a', 'b'])
    expect((await t.run(ctx => ctx.db.query('released').collect())).length).toBe(2)
  })

  test('defaults the clock to now', async () => {
    const t = testApp()
    await t.run(ctx => ctx.db.insert('strips', strip('ancient', 'draft', 0)))
    await expect(t.mutation(refs.pruneDrafts, {})).resolves.toEqual({ deleted: 1, more: false })
  })

  test('deletes a row once its expiry has passed with a ttl of 0, and keeps one that has not', async () => {
    const t = testApp()
    await t.run(async (ctx) => {
      await ctx.db.insert('strips', strip('lapsed', 'draft', undefined, 1000))
      await ctx.db.insert('strips', strip('live', 'draft', undefined, 5000))
    })
    await expect(t.mutation(refs.pruneExpired, { now: 2000 })).resolves.toEqual({ deleted: 1, more: false })
    expect(await titles(t)).toEqual(['live'])
  })

  test('deletes a row whose time field is missing on the first pass', async () => {
    const t = testApp()
    await t.run(async (ctx) => {
      await ctx.db.insert('strips', strip('no expiry', 'draft'))
      await ctx.db.insert('strips', strip('live', 'draft', undefined, 5000))
    })
    await t.mutation(refs.pruneExpired, { now: 2000 })
    expect(await titles(t)).toEqual(['live'])
  })

  test('reads by_creation_time through _creationTime', async () => {
    const t = testApp()
    await t.run(ctx => ctx.db.insert('strips', strip('made just now', 'draft')))
    await expect(t.mutation(refs.pruneOld, { now: Date.now() })).resolves.toEqual({ deleted: 0, more: false })
    await expect(t.mutation(refs.pruneOld, { now: Date.now() + 5000 })).resolves.toEqual({ deleted: 1, more: false })
  })
})

describe('batches', () => {
  test('a batch that leaves rows behind schedules the next one with the same clock', async () => {
    vi.useFakeTimers()
    const t = testApp()
    await t.run(async (ctx) => {
      for (const title of ['a', 'b', 'c', 'd', 'e']) await ctx.db.insert('strips', strip(title, 'draft', 0))
    })
    const first = await t.mutation(refs.pruneDrafts, { now: 31 * DAY })
    expect(first).toEqual({ deleted: 2, more: true })
    expect(await titles(t)).toHaveLength(3)
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    expect(await titles(t)).toEqual([])
    expect(released).toHaveLength(5)
  })

  test('a batch that takes exactly the rows left does not schedule an empty one', async () => {
    const t = testApp()
    await t.run(async (ctx) => {
      await ctx.db.insert('strips', strip('a', 'draft', 0))
      await ctx.db.insert('strips', strip('b', 'draft', 0))
    })
    await expect(t.mutation(refs.pruneDrafts, { now: 31 * DAY })).resolves.toEqual({ deleted: 2, more: false })
  })

  test('a row made newer between batches is left alone: the cutoff is fixed', async () => {
    vi.useFakeTimers()
    const t = testApp()
    await t.run(async (ctx) => {
      for (const title of ['a', 'b', 'c']) await ctx.db.insert('strips', strip(title, 'draft', 0))
    })
    await t.mutation(refs.pruneDrafts, { now: 31 * DAY })
    const left = (await t.run(ctx => ctx.db.query('strips').collect()))[0]!
    await t.run(ctx => ctx.db.patch('strips', left._id, { updatedAt: 40 * DAY }))
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    expect(await titles(t)).toEqual([left.title])
  })
})

describe('a failing batch', () => {
  test('rolls back, logs retention.batch_failed with the table and the row, and throws', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const t = testApp()
    const ids = await t.run(async (ctx) => {
      const first = await ctx.db.insert('strips', strip('fine', 'failed', 0))
      const stuck = await ctx.db.insert('strips', strip('stuck', 'failed', 1))
      return { first, stuck }
    })
    await expect(t.mutation(refs.pruneStubborn, { now: 5 * DAY })).rejects.toThrow('storage is down')
    // Nothing was deleted: the good row went back with the batch.
    expect(await titles(t)).toEqual(['fine', 'stuck'])
    const line = error.mock.calls.flat().join('\n')
    expect(line).toContain('retention.batch_failed')
    expect(line).toContain('strips')
    expect(line).toContain(String(ids.stuck))
    expect(line).not.toContain('stuck"')
  })

  test('the next pass retries from the same rows', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const t = testApp()
    await t.run(ctx => ctx.db.insert('strips', strip('stuck', 'failed', 0)))
    await expect(t.mutation(refs.pruneStubborn, { now: 5 * DAY })).rejects.toThrow()
    await expect(t.mutation(refs.pruneStubborn, { now: 5 * DAY })).rejects.toThrow()
    await t.run(async (ctx) => {
      const row = (await ctx.db.query('strips').collect())[0]!
      await ctx.db.patch('strips', row._id, { title: 'fixed' })
    })
    await expect(t.mutation(refs.pruneStubborn, { now: 5 * DAY })).resolves.toEqual({ deleted: 1, more: false })
  })
})

describe('defining a rule', () => {
  const rule = (overrides: Record<string, unknown>) => () => defineRetention(internalMutationGeneric, {
    fn: 'retention:x',
    table: 'strips',
    index: 'by_expiresAt',
    ttl: 0,
    ...overrides,
  } as never)

  test('accepts the documented shapes', () => {
    expect(rule({})).not.toThrow()
    expect(rule({ batch: 1, ttl: 5 })).not.toThrow()
  })

  test.each([
    ['a function path with no module', { fn: 'pruneDrafts' }, /own function path/],
    ['a negative ttl', { ttl: -1 }, /"ttl"/],
    ['a ttl that is no number', { ttl: Number.NaN }, /"ttl"/],
    ['a batch of 0', { batch: 0 }, /"batch"/],
    ['a batch with a fraction', { batch: 1.5 }, /"batch"/],
    ['an index that is no by_ name', { index: 'expires' }, /Name the index by its fields/],
    ['a match that is not the index\'s leading fields', { index: 'by_status_and_updatedAt', match: { updatedAt: 1 } }, /leading fields/],
    ['a match that fills the whole index', { index: 'by_expiresAt', match: { expiresAt: 1 } }, /leading fields/],
  ])('refuses %s', (_name, overrides, message) => {
    expect(rule(overrides)).toThrow(message)
  })
})
