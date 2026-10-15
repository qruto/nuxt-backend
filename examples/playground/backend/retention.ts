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

/**
 * Whether the account was used since `cutoff`: a session refreshed, the
 * account updated (signing in and signing out stamp it, utils/activity.ts), or
 * app data written. The rows cover an account whose session outlived its
 * sign-in by more than a week and then ended without a sign-out.
 */
async function activeSince(ctx: MutationCtx, user: UserRow, cutoff: number): Promise<boolean> {
  const sessions = await ctx.runQuery(components.backend.adapter.findMany, {
    model: 'session',
    where: [{ field: 'userId', value: user._id }],
    sortBy: { field: 'expiresAt', direction: 'desc' },
    paginationOpts: { numItems: 1, cursor: null },
  }) as { page: Array<{ updatedAt: number }> }
  if (Math.max(sessions.page[0]?.updatedAt ?? 0, user.updatedAt ?? 0, user.createdAt) >= cutoff) return true
  for (const table of ['todos', 'messages', 'logs', 'files', 'sentEmails'] as const) {
    const newest = await ctx.db.query(table).withIndex('userId', q => q.eq('userId', user._id)).order('desc').first()
    if (newest && newest._creationTime >= cutoff) return true
  }
  return false
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
      if (!(await activeSince(ctx, user, cutoff))) {
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
