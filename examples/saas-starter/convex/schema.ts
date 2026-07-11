import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

// App tables only — auth, billing, and email state live inside the bundled
// `backend` component, so this schema stays yours.
export default defineSchema({
  projects: defineTable({
    name: v.string(),
    organizationId: v.string(),
    createdBy: v.string(),
  }).index('organizationId', ['organizationId']),
})
