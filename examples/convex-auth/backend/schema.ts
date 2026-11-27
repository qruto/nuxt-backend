import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

// The app's own users. Convex Auth keeps sessions, passwords and usernames in
// its components, and stores only the id `users.create` returns.
export default defineSchema({
  users: defineTable({
    createdAt: v.number(),
  }),
})
