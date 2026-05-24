import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export default defineSchema({
  todos: defineTable({
    text: v.string(),
    completed: v.boolean(),
    userId: v.string(),
  }).index('userId', ['userId']),

  messages: defineTable({
    userId: v.string(),
    author: v.string(),
    text: v.string(),
  }).index('userId', ['userId']),

  counters: defineTable({
    userId: v.string(),
    name: v.string(),
    value: v.number(),
  }).index('userId_name', ['userId', 'name']),

  logs: defineTable({
    userId: v.string(),
    level: v.union(v.literal('info'), v.literal('warn'), v.literal('error')),
    message: v.string(),
  }).index('userId', ['userId']),
})
