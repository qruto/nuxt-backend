import { setupMigrations } from 'nuxt-backend/migrations'
import { v } from 'convex/values'
import { components, internal } from './_generated/api'
import { query } from './_generated/server'
import schema from './schema'
import { messagesCount, messagesSize } from './aggregates'
import { authed } from './functions'

// Online, batched schema migrations. Passing the schema gives migrateOne typed
// table access. Define migrations with migrations.define({ table, migrateOne }),
// then run them from the CLI/dashboard through the `run` runner:
//   npx convex run migrations:run '{ "fn": "migrations:backfillMessagesCount" }'
export const { migrations, run } = setupMigrations(components, { schema })

// Backfill the messages aggregate for rows that predate its trigger. An
// aggregate only tracks writes made *after* its trigger is registered, so a
// table that already had data needs a one-time backfill to be accurate.
// `insertIfDoesNotExist` makes this idempotent — safe to run (and re-run).
export const backfillMessagesCount = migrations.define({
  table: 'messages',
  migrateOne: (ctx, message) => messagesCount.insertIfDoesNotExist(ctx, message),
})

// Same idea for the character-sum aggregate (see aggregates.ts).
export const backfillMessagesSize = migrations.define({
  table: 'messages',
  migrateOne: (ctx, message) => messagesSize.insertIfDoesNotExist(ctx, message),
})

// Live status for the migrations playground page — reads the migration
// component's own state, so runs started from the CLI show up too.
export const status = query({
  args: {},
  handler: ctx => migrations.getStatus(ctx, { limit: 10 }),
})

/** Kick a backfill from the playground UI (CLI remains the ops path). */
export const runBackfill = authed.action({
  args: { name: v.union(v.literal('backfillMessagesCount'), v.literal('backfillMessagesSize')), dryRun: v.optional(v.boolean()) },
  handler: async (ctx, { name, dryRun }) => {
    await migrations.runOne(ctx, internal.migrations[name], { dryRun: dryRun ?? false })
  },
})
