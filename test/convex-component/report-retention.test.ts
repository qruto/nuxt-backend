/// <reference types="vite/client" />

import { beforeEach, describe, expect, test } from 'vitest'
import { convexTest } from 'convex-test'
import component from '../../src/convex/test'
import schema from '../../src/convex/components/backend/schema'
import { APPEAL_WINDOW_MS } from '../../src/convex/constants'
import { MAINTENANCE_TASKS, REPORT_RETENTION_MS } from '../../src/convex/components/backend/maintenance'
import { ACCOUNT_DATA_SOURCES } from '../../src/convex/account-data'

// The content duties' retention (LEGAL): the maintenance pass deletes a
// closed report or notice, and a decision with its appeal, 548 days after
// it was closed or made. A decision whose appeal is still open waits for
// its answer; the hash of an image it removed stays, without it; its
// subject's record goes with it, unless something is open on it again.

const DAY = 24 * 60 * 60 * 1000
const NOW = Date.UTC(2026, 9, 28, 12)
/** Old enough to go. */
const OLD = NOW - REPORT_RETENTION_MS - DAY
/** Still inside the window. */
const RECENT = NOW - REPORT_RETENTION_MS + DAY

let t: ReturnType<typeof convexTest>

beforeEach(() => {
  t = convexTest(schema, component.modules)
})

/** A decided subject: its closed notice, its decision, and an appeal in `appeal` state (none when absent). */
async function decided(at: number, options: { appeal?: 'open' | 'upheld', status?: 'hidden' | 'open', blocked?: boolean } = {}) {
  return t.run(async (ctx) => {
    const subject = await ctx.db.insert('reportSubjects', { table: 'strips', subjectId: `strip-${at}-${options.appeal ?? 'none'}`, status: options.status ?? 'hidden', open: options.status === 'open' ? 1 : 0, updatedAt: at, crime: { at, by: 'root' } })
    const notice = await ctx.db.insert('reports', { subject, kind: 'notice', reason: 'illegal', details: 'It shows my address.', notifier: { name: 'Grace Hopper', email: 'grace@example.com' }, status: 'closed', outcome: 'hidden', createdAt: at - DAY, closedAt: at })
    const decision = await ctx.db.insert('reportDecisions', { subject, action: 'hidden', reason: 'Doxxing.', ground: 'terms', by: 'root', at, authorId: 'ada', appealTokenHash: `hash-${at}-${options.appeal ?? 'none'}` })
    await ctx.db.patch('reportSubjects', subject, { decisionId: decision })
    const appeal = options.appeal ? await ctx.db.insert('reportAppeals', { decision, text: 'It is mine.', status: options.appeal, createdAt: at + DAY, ...(options.appeal === 'open' ? {} : { closedAt: at + 2 * DAY, by: 'root', reason: 'Kept.' }) }) : null
    const blocked = options.blocked ? await ctx.db.insert('blockedFiles', { sha256: 'ab'.repeat(32), decision, at }) : null
    return { subject, notice, decision, appeal, blocked }
  })
}

/** Run both report tasks as one pass starting `NOW`. */
async function prune() {
  await t.run(ctx => MAINTENANCE_TASKS.reports(ctx, NOW))
  return t.run(ctx => MAINTENANCE_TASKS.reportDecisions(ctx, NOW))
}

describe('the content duties\' retention', () => {
  test('is the appeal window and a year after it', () => {
    expect(REPORT_RETENTION_MS).toBe(APPEAL_WINDOW_MS + 365 * DAY)
    // The data map says it in words.
    expect(ACCOUNT_DATA_SOURCES.reports.retention).toContain('548 days')
  })

  test('deletes a decision, its appeal, its notice and its subject\'s record once old enough, and keeps the recent ones', async () => {
    const old = await decided(OLD, { appeal: 'upheld' })
    const recent = await decided(RECENT)
    expect(await prune()).toEqual({ pruned: 1, done: true })
    await t.run(async (ctx) => {
      expect(await ctx.db.get(old.decision)).toBeNull()
      expect(await ctx.db.get(old.appeal!)).toBeNull()
      expect(await ctx.db.get(old.notice)).toBeNull()
      expect(await ctx.db.get(old.subject)).toBeNull()
      expect(await ctx.db.get(recent.decision)).not.toBeNull()
      expect(await ctx.db.get(recent.notice)).not.toBeNull()
      expect(await ctx.db.get(recent.subject)).not.toBeNull()
    })
  })

  test('keeps a decision whose appeal is still open, until it is answered', async () => {
    const waiting = await decided(OLD, { appeal: 'open' })
    expect(await prune()).toEqual({ pruned: 0, done: true })
    await t.run(async (ctx) => {
      expect(await ctx.db.get(waiting.decision)).not.toBeNull()
      expect(await ctx.db.get(waiting.appeal!)).not.toBeNull()
      // The notice it rests on goes by its own window: what the decision says stays with the decision.
      expect(await ctx.db.get(waiting.notice)).toBeNull()
      await ctx.db.patch(waiting.appeal!, { status: 'upheld', closedAt: NOW - DAY })
    })
    expect(await prune()).toEqual({ pruned: 1, done: true })
    await t.run(async (ctx) => {
      expect(await ctx.db.get(waiting.decision)).toBeNull()
    })
  })

  test('keeps a removed image\'s hash without its decision, and a subject reported again without the old decision', async () => {
    const hidden = await decided(OLD, { blocked: true })
    const reopened = await decided(OLD - DAY, { status: 'open' })
    await prune()
    await t.run(async (ctx) => {
      const blocked = await ctx.db.get(hidden.blocked!)
      expect(blocked).toMatchObject({ sha256: 'ab'.repeat(32) })
      expect(blocked!.decision).toBeUndefined()
      const subject = await ctx.db.get(reopened.subject)
      expect(subject).toMatchObject({ status: 'open', open: 1 })
      expect(subject!.decisionId).toBeUndefined()
    })
  })

  test('leaves open reports alone, however old', async () => {
    const open = await t.run(ctx => ctx.db.insert('reports', { kind: 'report', reason: 'abuse', reporterId: 'ada', status: 'open', createdAt: OLD - 30 * DAY }))
    await prune()
    await t.run(async (ctx) => {
      expect(await ctx.db.get(open)).not.toBeNull()
    })
  })
})
