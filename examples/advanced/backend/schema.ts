import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

// App-level tables (the auth/billing/gift tables live inside the backend
// component — see convex/components/backend/schema.ts for its customization).
export default defineSchema({
  orders: defineTable({
    orderId: v.string(),
    at: v.number(),
  }),
})
