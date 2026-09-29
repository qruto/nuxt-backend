// Denormalized counts/sums via the Aggregate component (mounted as
// `components.aggregate`). Uncomment and adapt to a table in your schema —
// here, a live count of rows in a `messages` table kept in sync by triggers:
//
// import { TableAggregate, Triggers, withTriggers } from 'nuxt-backend/aggregate'
// import { components } from './_generated/api'
// import { mutation as rawMutation, query } from './_generated/server'
// import type { DataModel } from './_generated/dataModel'
//
// export const messagesCount = new TableAggregate<{ Key: null, DataModel: DataModel, TableName: 'messages' }>(
//   components.aggregate,
//   { sortKey: () => null },
// )
//
// const triggers = new Triggers<DataModel>()
// triggers.register('messages', messagesCount.trigger())
// export const mutation = withTriggers(rawMutation, triggers)
//
// export const countMessages = query({
//   args: {},
//   handler: (ctx) => messagesCount.count(ctx),
// })
export {}
