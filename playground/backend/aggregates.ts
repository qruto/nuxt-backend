import { TableAggregate, Triggers, withTriggers } from 'nuxt-backend/convex/aggregate'
import { components } from './_generated/api'
import { mutation as rawMutation, query } from './_generated/server'
import type { DataModel } from './_generated/dataModel'

// A live count of all messages, kept in sync by a trigger on the messages table.
export const messagesCount = new TableAggregate<{ Key: null, DataModel: DataModel, TableName: 'messages' }>(
  components.aggregate,
  { sortKey: () => null },
)

const triggers = new Triggers<DataModel>()
triggers.register('messages', messagesCount.trigger())

// Use this trigger-wrapped `mutation` for any table covered by an aggregate so
// inserts/deletes stay in sync automatically (messages.ts imports it).
export const mutation = withTriggers(rawMutation, triggers)

export const countMessages = query({
  args: {},
  handler: ctx => messagesCount.count(ctx),
})
