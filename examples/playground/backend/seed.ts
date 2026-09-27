import { v } from 'convex/values'
import { components } from './_generated/api'
import { type MutationCtx, internalMutation } from './_generated/server'

/**
 * Self-seeding: give a fresh account something to look at, so every playground
 * page renders live data before the visitor lifts a finger. Called (via the
 * scheduler) from the `onUserCreated` hook in auth.ts, and manually re-runnable
 * with `pnpm run db:seed` after a `db:reset`.
 *
 * Every concern is individually idempotent — existing rows are never touched,
 * so re-running against a lived-in account is a no-op.
 */

const DEMO_TODOS = [
  { text: 'Sign in with an email code', completed: true },
  { text: 'Open a second tab and watch queries sync', completed: false },
  { text: 'Subscribe to a plan on the Pricing page', completed: false },
  { text: 'Stream a metered AI response on Credits', completed: false },
]

const DEMO_MESSAGES = [
  'Welcome to the playground — this chat is a live Convex query.',
  'Every row you see was seeded on your first sign-in.',
  'Type below and it lands in the messages table instantly.',
]

const DEMO_LOGS: Array<{ level: 'info' | 'warn' | 'error', message: string }> = [
  { level: 'info', message: 'Account created — demo data seeded' },
  { level: 'info', message: 'Personal workspace activated' },
  { level: 'info', message: 'Convex query subscribed' },
  { level: 'warn', message: 'Rate limit warning approaching' },
  { level: 'info', message: 'Entitlement cache primed' },
  { level: 'error', message: 'Simulated failure for the log filters' },
  { level: 'info', message: 'WebSocket reconnect' },
  { level: 'info', message: 'Background job completed' },
]

/** The demo team's outgoing invitation — a row, not an email (nothing is sent). */
const DEMO_INVITE_EMAIL = 'teammate@example.com'

async function seedDemoTables(ctx: MutationCtx, userId: string, author: string): Promise<boolean> {
  let wrote = false

  const counter = await ctx.db
    .query('counters')
    .withIndex('userId_name', q => q.eq('userId', userId).eq('name', 'demo'))
    .unique()
  if (!counter) {
    await ctx.db.insert('counters', { userId, name: 'demo', value: 3 })
    wrote = true
  }

  const hasTodos = await ctx.db.query('todos').withIndex('userId', q => q.eq('userId', userId)).first()
  if (!hasTodos) {
    for (const todo of DEMO_TODOS) await ctx.db.insert('todos', { ...todo, userId })
    wrote = true
  }

  const hasMessages = await ctx.db.query('messages').withIndex('userId', q => q.eq('userId', userId)).first()
  if (!hasMessages) {
    for (const text of DEMO_MESSAGES) await ctx.db.insert('messages', { userId, author, text })
    wrote = true
  }

  const hasLogs = await ctx.db.query('logs').withIndex('userId', q => q.eq('userId', userId)).first()
  if (!hasLogs) {
    for (const log of DEMO_LOGS) await ctx.db.insert('logs', { ...log, userId })
    wrote = true
  }

  return wrote
}

/**
 * A second workspace ("Demo team") owned by the user, with one outgoing
 * pending invitation — so the Workspaces page demos switching, members, and
 * the invitation list without any manual setup. Rows go straight through the
 * auth component's adapter (the same tables Better Auth reads), keyed by a
 * deterministic slug for idempotency.
 */
async function seedDemoWorkspace(ctx: MutationCtx, userId: string): Promise<boolean> {
  const adapter = components.backend.adapter
  const slug = `demo-${userId.toLowerCase()}`
  const existing = await ctx.runQuery(adapter.findOne, {
    model: 'organization',
    where: [{ field: 'slug', value: slug }],
  }) as { _id: string } | null
  if (existing) return false

  const now = Date.now()
  const workspace = await ctx.runMutation(adapter.create, {
    input: {
      model: 'organization',
      data: { name: 'Demo team', slug, createdAt: now },
    },
  }) as { _id: string }
  await ctx.runMutation(adapter.create, {
    input: {
      model: 'member',
      data: { organizationId: workspace._id, userId, role: 'owner', createdAt: now },
    },
  })
  await ctx.runMutation(adapter.create, {
    input: {
      model: 'invitation',
      data: {
        organizationId: workspace._id,
        email: DEMO_INVITE_EMAIL,
        role: 'member',
        status: 'pending',
        inviterId: userId,
        expiresAt: now + 7 * 24 * 60 * 60 * 1000,
        createdAt: now,
      },
    },
  })
  return true
}

/**
 * Seed one user's demo data. Scheduled from `onUserCreated` with
 * `runAfter(0, …)` so it runs after the sign-up transaction commits — the
 * personal workspace is created by a session hook inside that transaction,
 * and seeding a workspace earlier would steal its "first membership" slot.
 */
export const seedForUser = internalMutation({
  args: { userId: v.string(), email: v.string(), name: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { userId, email, name }) => {
    await seedDemoTables(ctx, userId, name || email)
    await seedDemoWorkspace(ctx, userId)
    return null
  },
})

/**
 * Seed every existing user (`pnpm run db:seed`) — e.g. to refill accounts
 * created before self-seeding existed. Idempotent per user.
 */
export const seedAll = internalMutation({
  args: {},
  returns: v.object({ users: v.number(), seeded: v.number() }),
  handler: async (ctx) => {
    let users = 0
    let seeded = 0
    let cursor: string | null = null
    // Page through the auth component's user table (bounded — a playground
    // deployment holds nowhere near the cap).
    for (let page = 0; page < 10; page++) {
      const result = await ctx.runQuery(components.backend.adapter.findMany, {
        model: 'user',
        paginationOpts: { numItems: 100, cursor },
      }) as { page: Array<{ _id: string, email: string, name?: string }>, isDone: boolean, continueCursor: string }
      for (const user of result.page) {
        users++
        const wroteTables = await seedDemoTables(ctx, user._id, user.name || user.email)
        const wroteWorkspace = await seedDemoWorkspace(ctx, user._id)
        if (wroteTables || wroteWorkspace) seeded++
      }
      if (result.isDone) break
      cursor = result.continueCursor
    }
    return { users, seeded }
  },
})
