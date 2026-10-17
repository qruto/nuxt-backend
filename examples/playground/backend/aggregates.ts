import { TableAggregate, Triggers, withTriggers } from 'nuxt-backend/aggregate'
import { components } from './_generated/api'
import { internalMutation as rawInternalMutation, mutation as rawMutation, query } from './_generated/server'
import type { DataModel } from './_generated/dataModel'

// A live count of all messages, kept in sync by a trigger on the messages table.
export const messagesCount = new TableAggregate<{ Key: null, DataModel: DataModel, TableName: 'messages' }>(
  components.aggregate,
  { sortKey: () => null },
)

// A live sum — total characters across all messages. Shows `useAggregate`
// reading a sum, not only a count.
//
// Its own namespace, on the same component mount. An aggregate's entries are
// (key, document id), one B-tree per namespace: sharing messagesCount's tree,
// both triggers inserted the same (null, id) pair and the second insert threw
// "key … already exists" — every message insert failed. A namespace is a
// separate tree, so the two never meet (the alternative, a second mount,
// would take this app's convex.config.ts off the scaffold template it proves).
const SIZE = 'size' as const
export const messagesSize = new TableAggregate<{ Namespace: typeof SIZE, Key: null, DataModel: DataModel, TableName: 'messages' }>(
  components.aggregate,
  { namespace: () => SIZE, sortKey: () => null, sumValue: message => message.text.length },
)

// Idempotent: messages seeded before seed.ts used the trigger-wrapped
// builder were never counted, and a plain trigger throws DELETE_MISSING_KEY
// on one, rolling back the whole delete (Reset data, the idle sweep).
const triggers = new Triggers<DataModel>()
triggers.register('messages', messagesCount.idempotentTrigger())
triggers.register('messages', messagesSize.idempotentTrigger())

// Use these trigger-wrapped builders for any table covered by an aggregate so
// inserts/deletes stay in sync automatically (messages.ts imports `mutation`,
// retention.ts `internalMutation`).
export const mutation = withTriggers(rawMutation, triggers)
export const internalMutation = withTriggers(rawInternalMutation, triggers)

export const countMessages = query({
  args: {},
  handler: ctx => messagesCount.count(ctx),
})

export const totalCharacters = query({
  args: {},
  handler: ctx => messagesSize.sum(ctx, { namespace: SIZE }),
})
