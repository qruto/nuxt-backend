import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'
import { isSandboxIdentity } from '../utils/testEmail'
import { components, internal } from './_generated/api'
import type { MutationCtx } from './_generated/server'
import { internalMutation } from './aggregates'

// Retention for the public playground's app data. A sandbox account left
// alone for a week loses what it wrote here; the account itself stays until
// the package can erase one completely (its member, passkey and OAuth rows
// included), so nothing is left pointing at a deleted user.

/** An account nobody has used for this long is idle. */
const IDLE_AFTER_MS = 7 * 24 * 60 * 60 * 1000

/** Rows one mutation deletes before it hands the rest to a follow-up run. */
const BATCH = 500

/**
 * Delete up to `budget` rows of one user's app data — todos, messages,
 * counters, logs, saved files (with their stored blobs) and the sent-email
 * feed. `done` is false while rows remain. Messages must go through a
 * trigger-wrapped ctx (aggregates.ts), so the message counts stay right.
 */
export async function clearAppData(ctx: MutationCtx, userId: string, budget = BATCH): Promise<{ deleted: number, done: boolean }> {
  let left = budget
  const take = async <T extends { _id: string }>(rows: Promise<T[]>, remove: (row: T) => Promise<void>) => {
    for (const row of await rows) {
      await remove(row)
      left--
    }
  }
  await take(ctx.db.query('todos').withIndex('userId', q => q.eq('userId', userId)).take(left), row => ctx.db.delete(row._id))
  await take(ctx.db.query('messages').withIndex('userId', q => q.eq('userId', userId)).take(left), row => ctx.db.delete(row._id))
  await take(ctx.db.query('counters').withIndex('userId_name', q => q.eq('userId', userId)).take(left), row => ctx.db.delete(row._id))
  await take(ctx.db.query('logs').withIndex('userId', q => q.eq('userId', userId)).take(left), row => ctx.db.delete(row._id))
  await take(ctx.db.query('files').withIndex('userId', q => q.eq('userId', userId)).take(left), async (row) => {
    await ctx.storage.delete(row.storageId)
    await ctx.db.delete(row._id)
  })
  await take(ctx.db.query('sentEmails').withIndex('userId', q => q.eq('userId', userId)).take(left), row => ctx.db.delete(row._id))
  return { deleted: budget - left, done: left > 0 }
}

/** Clear one user's app data, a batch per run, until none is left. */
export const clearUser = internalMutation({
  args: { userId: v.string() },
  returns: v.null(),
  handler: async (ctx, { userId }) => {
    const { done } = await clearAppData(ctx, userId)
    if (!done) await ctx.scheduler.runAfter(0, internal.retention.clearUser, { userId })
    return null
  },
})

interface UserRow { _id: string, email: string, role?: string | null, createdAt: number, updatedAt: number }

/** Whether the admin plugin's role field (comma-separated) grants `admin`. */
function isAdmin(user: UserRow): boolean {
  return (user.role ?? '').split(',').some(role => role.trim() === 'admin')
}

/** When the account was last used: its latest session refresh, else its own last update. */
async function lastActive(ctx: MutationCtx, user: UserRow): Promise<number> {
  const sessions = await ctx.runQuery(components.backend.adapter.findMany, {
    model: 'session',
    where: [{ field: 'userId', value: user._id }],
    sortBy: { field: 'expiresAt', direction: 'desc' },
    paginationOpts: { numItems: 1, cursor: null },
  }) as { page: Array<{ updatedAt: number }> }
  return sessions.page[0]?.updatedAt ?? user.updatedAt ?? user.createdAt
}

/**
 * Walk every account a page at a time and clear the app data of sandbox
 * accounts idle for a week. Admins and non-sandbox accounts are skipped. The
 * daily cron in crons.ts starts it; each page schedules the next.
 */
export const clearIdleAccounts = internalMutation({
  // `cutoff` is fixed by the first page and carried along, like the cursor.
  args: { paginationOpts: paginationOptsValidator, cutoff: v.optional(v.number()) },
  returns: v.null(),
  handler: async (ctx, { paginationOpts, cutoff = Date.now() - IDLE_AFTER_MS }) => {
    const users = await ctx.runQuery(components.backend.adapter.findMany, {
      model: 'user',
      paginationOpts,
    }) as { page: UserRow[], isDone: boolean, continueCursor: string }
    for (const user of users.page) {
      if (isAdmin(user) || !isSandboxIdentity(user.email)) continue
      if (await lastActive(ctx, user) < cutoff) {
        await ctx.scheduler.runAfter(0, internal.retention.clearUser, { userId: user._id })
      }
    }
    if (!users.isDone) {
      await ctx.scheduler.runAfter(0, internal.retention.clearIdleAccounts, {
        paginationOpts: { numItems: paginationOpts.numItems, cursor: users.continueCursor },
        cutoff,
      })
    }
    return null
  },
})
