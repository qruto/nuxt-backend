import type { MutationCtx } from './_generated/server.js'

/**
 * Keep the handle a component's sweep wakes the app by, in the one-row table
 * a sweep owns. Idempotent: the same handle writes nothing.
 *
 * @internal
 */
export async function keepWake(ctx: MutationCtx, table: 'billingGiftSweep' | 'referralSweep', wake: string): Promise<void> {
  const row = await ctx.db.query(table).first()
  if (!row) await ctx.db.insert(table, { wake, updatedAt: Date.now() })
  else if (row.wake !== wake) await ctx.db.patch(table, row._id, { wake, updatedAt: Date.now() })
}
