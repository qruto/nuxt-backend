import { internalMutation } from './_generated/server'
import { messagesCount, messagesSize } from './aggregates'

/**
 * The part of `pnpm db:reset` an empty table import cannot do. The reset
 * clears the app tables with `convex import --replace`, which bypasses the
 * triggers that keep the message aggregates in step, so they are emptied here
 * through the aggregate's own `clear`.
 */
export const run = internalMutation({
  args: {},
  handler: async (ctx) => {
    await messagesCount.clear(ctx)
    await messagesSize.clear(ctx, { namespace: 'size' })
    return null
  },
})
