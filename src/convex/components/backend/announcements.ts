import { v } from 'convex/values'
import { vAnnouncementInput, vAnnouncementLink as vLink, vBroadcastDraft, vBroadcastState } from '../../announcements.js'
import type { Doc, Id } from './_generated/dataModel.js'
import { mutation, type MutationCtx, query } from './_generated/server.js'

/**
 * Announcements: the component's half of the admin console's Announcements
 * tab. An announcement is a notice every signed-in person sees until it
 * expires, an administrator ends it, or they dismiss it; a broadcast may go
 * with it, which the provider holds. Its id is kept here once the provider
 * made it, so a retried send sends that one broadcast and never a second.
 *
 * Every function trusts its caller, the app's `setupEmail`, which checks
 * the administrator and the deployment before it calls.
 */

type Announcement = Doc<'announcements'>

/** The most live announcements a person is shown at once: the newest. */
export const LIVE_ANNOUNCEMENTS_MAX = 3

/** The most announcements the console lists, newest first. */
const CONSOLE_ANNOUNCEMENTS_MAX = 50

/** How long a `creating` claim holds before another send may take it: a crashed send's claim lapses. */
const CLAIM_TTL_MS = 2 * 60_000

/** How long an announcement and its dismissals are kept after it expired or ended. */
export const ANNOUNCEMENT_RETENTION_MS = 90 * 24 * 60 * 60_000

/** One live announcement, as the notice shows it. */
const vLive = v.object({ id: v.string(), message: v.string(), link: v.optional(vLink), expiresAt: v.number(), publishedAt: v.number() })

/** One announcement as the console lists it. */
const vConsoleRow = v.object({
  id: v.string(),
  message: v.string(),
  link: v.optional(vLink),
  publishedAt: v.number(),
  expiresAt: v.number(),
  endedAt: v.optional(v.number()),
  broadcast: v.optional(v.object({ ...vBroadcastDraft.fields, state: vBroadcastState, sendAt: v.optional(v.number()) })),
})

/** Whether an announcement shows now. */
const isLive = (row: Announcement, now: number) => row.endedAt === undefined && row.expiresAt > now

/** Publish an announcement: its notice shows at once; its broadcast, if any, waits as a draft for an administrator to send it. */
export const publish = mutation({
  args: { ...vAnnouncementInput, publishedBy: v.string() },
  returns: v.string(),
  handler: async (ctx, { broadcast, ...fields }) => ctx.db.insert('announcements', {
    ...fields,
    ...(broadcast ? { broadcast: { ...broadcast, state: 'draft' as const } } : {}),
  }),
})

/** Take an announcement down before it expires: whether it was live. Its broadcast is not touched. */
export const end = mutation({
  args: { id: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { id }) => {
    const row = await announcementOf(ctx, id)
    if (!row || !isLive(row, Date.now())) return false
    await ctx.db.patch('announcements', row._id, { endedAt: Date.now() })
    return true
  },
})

/** The announcements a person sees now: live, not dismissed, the newest first. */
export const live = query({
  args: { userId: v.string() },
  returns: v.array(vLive),
  handler: async (ctx, { userId }) => {
    const now = Date.now()
    const shown: Array<typeof vLive.type> = []
    // The live ones are the ones that expire after now; there are few.
    const rows = await ctx.db.query('announcements').withIndex('expiresAt', q => q.gt('expiresAt', now)).take(100)
    for (const row of rows.filter(row => row.endedAt === undefined).sort((a, b) => b._creationTime - a._creationTime)) {
      const dismissed = await ctx.db.query('announcementDismissals').withIndex('userId_announcementId', q => q.eq('userId', userId).eq('announcementId', row._id)).first()
      if (dismissed) continue
      shown.push({ id: row._id, message: row.message, ...(row.link ? { link: row.link } : {}), expiresAt: row.expiresAt, publishedAt: row._creationTime })
      if (shown.length >= LIVE_ANNOUNCEMENTS_MAX) break
    }
    return shown
  },
})

/** A person dismisses an announcement: it stays dismissed for them. An id that names none is fine. */
export const dismiss = mutation({
  args: { id: v.string(), userId: v.string() },
  returns: v.null(),
  handler: async (ctx, { id, userId }) => {
    const row = await announcementOf(ctx, id)
    if (!row) return null
    const done = await ctx.db.query('announcementDismissals').withIndex('userId_announcementId', q => q.eq('userId', userId).eq('announcementId', row._id)).first()
    if (!done) await ctx.db.insert('announcementDismissals', { announcementId: row._id, userId })
    return null
  },
})

/** The console's list: every announcement kept, the newest first. */
export const list = query({
  args: {},
  returns: v.array(vConsoleRow),
  handler: async (ctx) => {
    const rows = await ctx.db.query('announcements').order('desc').take(CONSOLE_ANNOUNCEMENTS_MAX)
    return rows.map(row => ({
      id: row._id,
      message: row.message,
      ...(row.link ? { link: row.link } : {}),
      publishedAt: row._creationTime,
      expiresAt: row.expiresAt,
      ...(row.endedAt !== undefined ? { endedAt: row.endedAt } : {}),
      ...(row.broadcast
        ? { broadcast: { audience: row.broadcast.audience, ...(row.broadcast.topic ? { topic: row.broadcast.topic } : {}), subject: row.broadcast.subject, body: row.broadcast.body, state: row.broadcast.state, ...(row.broadcast.sendAt !== undefined ? { sendAt: row.broadcast.sendAt } : {}) } }
        : {}),
    }))
  },
})

/** What a send of an announcement's broadcast does next. */
const vClaim = v.union(
  v.object({ next: v.literal('none') }),
  v.object({ next: v.literal('busy') }),
  v.object({ next: v.literal('done'), sendAt: v.optional(v.number()) }),
  v.object({ next: v.literal('create'), ...vBroadcastDraft.fields }),
  v.object({ next: v.literal('send'), providerId: v.string() }),
)

/**
 * Claim an announcement's broadcast for a send: `create` when the provider
 * has none yet (the claim holds it for a while, so two sends never both
 * create one), `send` with the id the provider gave it, `done` once it was
 * sent, `busy` while another send holds it, `none` without a broadcast.
 */
export const claimBroadcast = mutation({
  args: { id: v.string() },
  returns: vClaim,
  handler: async (ctx, { id }) => {
    const row = await announcementOf(ctx, id)
    const broadcast = row?.broadcast
    if (!row || !broadcast || broadcast.state === 'cancelled') return { next: 'none' as const }
    if (broadcast.state === 'sent') return { next: 'done' as const, ...(broadcast.sendAt !== undefined ? { sendAt: broadcast.sendAt } : {}) }
    if (broadcast.providerId) return { next: 'send' as const, providerId: broadcast.providerId }
    const now = Date.now()
    if (broadcast.state === 'creating' && now - (broadcast.claimedAt ?? 0) < CLAIM_TTL_MS) return { next: 'busy' as const }
    await ctx.db.patch('announcements', row._id, { broadcast: { ...broadcast, state: 'creating', claimedAt: now } })
    return { next: 'create' as const, audience: broadcast.audience, ...(broadcast.topic ? { topic: broadcast.topic } : {}), subject: broadcast.subject, body: broadcast.body }
  },
})

/** The provider made the broadcast: its id is kept, so every later send sends this one. */
export const broadcastCreated = mutation({
  args: { id: v.string(), providerId: v.string() },
  returns: v.null(),
  handler: async (ctx, { id, providerId }) => {
    const row = await announcementOf(ctx, id)
    if (row?.broadcast) await ctx.db.patch('announcements', row._id, { broadcast: { ...row.broadcast, state: 'created', providerId, claimedAt: undefined } })
    return null
  },
})

/** A claim that made nothing is let go, so the next send may try. */
export const releaseBroadcast = mutation({
  args: { id: v.string() },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const row = await announcementOf(ctx, id)
    if (row?.broadcast?.state === 'creating') await ctx.db.patch('announcements', row._id, { broadcast: { ...row.broadcast, state: 'draft', claimedAt: undefined } })
    return null
  },
})

/** The provider took the send: when it goes out, and who sent it. `false` for one cancelled meanwhile, which stays cancelled. */
export const broadcastSent = mutation({
  args: { id: v.string(), sentBy: v.string(), sendAt: v.number() },
  returns: v.boolean(),
  handler: async (ctx, { id, sentBy, sendAt }) => {
    const row = await announcementOf(ctx, id)
    if (!row?.broadcast || row.broadcast.state === 'cancelled') return false
    await ctx.db.patch('announcements', row._id, { broadcast: { ...row.broadcast, state: 'sent', sentBy, sendAt } })
    return true
  },
})

/**
 * Cancel an announcement's broadcast: a draft at once, so it never goes.
 * One the provider holds (made, or scheduled) is stopped there first: this
 * answers its id and changes nothing, and `broadcastCancelled` cancels it
 * here once the provider confirms. Refused (`false` in `cancelled`, no
 * id) once it went.
 */
export const cancelBroadcast = mutation({
  args: { id: v.string() },
  returns: v.object({ cancelled: v.boolean(), providerId: v.union(v.string(), v.null()) }),
  handler: async (ctx, { id }) => {
    const row = await announcementOf(ctx, id)
    const broadcast = row?.broadcast
    if (!row || !broadcast || broadcast.state === 'cancelled') return { cancelled: false, providerId: null }
    // One that went out already cannot be called back.
    if (broadcast.state === 'sent' && (broadcast.sendAt ?? 0) <= Date.now()) return { cancelled: false, providerId: null }
    if (broadcast.providerId) return { cancelled: false, providerId: broadcast.providerId }
    await ctx.db.patch('announcements', row._id, { broadcast: { ...broadcast, state: 'cancelled', claimedAt: undefined } })
    return { cancelled: true, providerId: null }
  },
})

/** The provider deleted the broadcast unsent: it is cancelled here. `false` when it was already. */
export const broadcastCancelled = mutation({
  args: { id: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { id }) => {
    const row = await announcementOf(ctx, id)
    if (!row?.broadcast || row.broadcast.state === 'cancelled') return false
    await ctx.db.patch('announcements', row._id, { broadcast: { ...row.broadcast, state: 'cancelled', claimedAt: undefined } })
    return true
  },
})

async function announcementOf(ctx: { db: MutationCtx['db'] }, id: string): Promise<Announcement | null> {
  const normalized = ctx.db.normalizeId('announcements', id)
  return normalized ? await ctx.db.get('announcements', normalized) : null
}

/**
 * An account's part of an erasure, one batch: its dismissals go, and the
 * announcements it published or sent name its pseudonym. `true` while rows
 * are left.
 */
export async function eraseAnnouncements(ctx: MutationCtx, { userId, alias }: { userId?: string, alias: string }, budget: number): Promise<boolean> {
  if (!userId) return false
  let left = budget
  for (const row of await ctx.db.query('announcementDismissals').withIndex('userId_announcementId', q => q.eq('userId', userId)).take(left)) {
    await ctx.db.delete('announcementDismissals', row._id)
    left--
  }
  if (left <= 0) return true
  // The console keeps 50 and retention prunes the rest: a short table, read whole.
  for (const row of await ctx.db.query('announcements').take(500)) {
    const broadcast = row.broadcast?.sentBy === userId ? { ...row.broadcast, sentBy: alias } : row.broadcast
    if (row.publishedBy === userId || broadcast !== row.broadcast) await ctx.db.patch('announcements', row._id, { publishedBy: row.publishedBy === userId ? alias : row.publishedBy, ...(broadcast ? { broadcast } : {}) })
  }
  return false
}

/**
 * Retention, one batch: an announcement 90 days after it expired or ended
 * goes, its dismissals first. `done` once nothing that old is left.
 */
export async function pruneAnnouncements(ctx: MutationCtx, before: number, batch: number): Promise<{ pruned: number, done: boolean }> {
  let pruned = 0
  const rows = await ctx.db.query('announcements').withIndex('expiresAt', q => q.lt('expiresAt', before)).take(5)
  for (const row of rows) {
    const dismissals = await ctx.db.query('announcementDismissals').withIndex('announcementId', q => q.eq('announcementId', row._id as Id<'announcements'>)).take(batch - pruned)
    for (const dismissal of dismissals) await ctx.db.delete('announcementDismissals', dismissal._id)
    pruned += dismissals.length
    if (pruned >= batch) return { pruned, done: false }
    await ctx.db.delete('announcements', row._id)
    pruned++
  }
  return { pruned, done: rows.length < 5 }
}
