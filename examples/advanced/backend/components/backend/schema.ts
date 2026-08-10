import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'
import { billingTables, tables } from './generated-schema'

// CUSTOMIZATION: the locally installed component owns its schema, so it can be
// extended. Here the component gains an extra table of its own beside the
// packaged auth/billing tables. To change the auth tables themselves, replace
// an entry of `tables` wholesale with your own `defineTable(...)` (start from
// the package source: nuxt-backend/component/schema).
const customTables = {
  ...tables,
  // An extra component-owned table.
  loginAudit: defineTable({
    userId: v.string(),
    at: v.number(),
    userAgent: v.optional(v.string()),
  }).index('userId', ['userId']),
}

// The Better Auth adapter validates against the auth tables.
export const authSchema = defineSchema(customTables)

export default defineSchema({
  ...customTables,
  ...billingTables,
})
