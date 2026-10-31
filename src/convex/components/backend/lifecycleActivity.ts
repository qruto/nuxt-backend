import { DAY_MS } from '../../email-preferences.js'
import type { Doc } from './_generated/dataModel.js'
import type { MutationCtx } from './_generated/server.js'

// The `stalled` lifecycle flow's clock, apart from the rest of the flows
// (lifecycle.ts) so the sending rules' own write (preferences.ts), which
// moves it, imports nothing the flows import back. Named in camel case: a
// Convex module path takes letters, digits, underscores and periods only.

/**
 * Activity in the app (at most hourly, from the sending rules' own write):
 * an account that came back after its first day gets a `stalled` email
 * once it has been away 14 days; each visit moves that day on.
 */
export async function armStalled(ctx: MutationCtx, contact: Doc<'emailContacts'>): Promise<void> {
  if (!contact.userId) return
  const row = await ctx.db.query('lifecycleSettings').first()
  const flow = row?.flows.find(entry => entry.flow === 'stalled')
  if (!flow) return
  const now = Date.now()
  const userId = ctx.db.normalizeId('user', contact.userId)
  const user = userId ? await ctx.db.get('user', userId) : null
  // Active means back after the day of sign-up.
  if (!user || now - (user.createdAt ?? user._creationTime) < DAY_MS) return
  const dueAt = now + flow.delays[0]!
  const waiting = (await ctx.db.query('lifecycleRuns').withIndex('userId_flow', q => q.eq('userId', contact.userId!).eq('flow', 'stalled')).take(20)).find(run => run.state === 'waiting')
  if (waiting) await ctx.db.patch('lifecycleRuns', waiting._id, { dueAt })
  else await ctx.db.insert('lifecycleRuns', { userId: contact.userId, email: contact.email, flow: 'stalled', step: 0, dueAt, state: 'waiting', once: false })
}
