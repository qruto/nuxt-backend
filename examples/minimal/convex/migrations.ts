import { setupMigrations } from 'nuxt-backend/convex/migrations'
import { components } from './_generated/api'

// Online, batched schema migrations. Pass your schema for typed migrateOne:
//   import schema from './schema'
//   setupMigrations(components, { schema })
export const { migrations, run } = setupMigrations(components)

// Define migrations with migrations.define({ table, migrateOne }), then:
//   npx convex run migrations:run '{ "fn": "migrations:yourMigration" }'
