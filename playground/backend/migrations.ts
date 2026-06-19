import { setupMigrations } from 'nuxt-backend/convex/migrations'
import { components } from './_generated/api'
import schema from './schema'
import { messagesCount } from './aggregates'

// Online, batched schema migrations. Passing the schema gives migrateOne typed
// table access. Define migrations with migrations.define({ table, migrateOne }),
// then run them from the CLI/dashboard through the `run` runner:
//   npx convex run migrations:run '{ "fn": "migrations:backfillMessagesCount" }'
export const { migrations, run } = setupMigrations(components.migrations, { schema })

// Backfill the messages aggregate for rows that predate its trigger. An
// aggregate only tracks writes made *after* its trigger is registered, so a
// table that already had data needs a one-time backfill to be accurate.
// `insertIfDoesNotExist` makes this idempotent — safe to run (and re-run).
export const backfillMessagesCount = migrations.define({
  table: 'messages',
  migrateOne: (ctx, message) => messagesCount.insertIfDoesNotExist(ctx, message),
})
