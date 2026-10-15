import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

// App-level tables. The auth, billing, gift, AI and webhook tables live inside
// the backend component, which owns its schema; join to them by id.
export default defineSchema({
  orders: defineTable({
    orderId: v.string(),
    at: v.number(),
  }),
})
