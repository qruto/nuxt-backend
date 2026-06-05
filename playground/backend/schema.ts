import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

/**
 * Log levels defined as value (source of truth).
 * Type and validator are *derived* from it per TS best practices
 * (see https://github.com/AllThingsSmitty/typescript-tips-everyone-should-know#derive-types-from-values-instead-of-duplicating-them).
 * This avoids duplicating the 'info' | 'warn' | 'error' list in the table schema,
 * the logs mutation args, and demo UI types.
 */
export const LOG_LEVELS = ['info', 'warn', 'error'] as const
export type LogLevel = (typeof LOG_LEVELS)[number]
export const logLevelValidator = v.union(
  v.literal(LOG_LEVELS[0]),
  v.literal(LOG_LEVELS[1]),
  v.literal(LOG_LEVELS[2]),
)

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
    level: logLevelValidator,
    message: v.string(),
  }).index('userId', ['userId']),
})
