import { v } from 'convex/values'
import type { Doc, Id } from './_generated/dataModel.js'
import { internalQuery, mutation, type MutationCtx, query, type QueryCtx } from './_generated/server.js'
import type { AccessTicket, InviteStatus } from '../../access-tickets.js'
import { accountExists, forgetWaitlist, markJoined } from './waitlist.js'

/**
 * Launch access: the component's half. The phase an administrator set (one
 * row, absent until the first change), the invite codes and access links
 * (each a keyed hash computed in the app, which holds the auth secret), the
 * invitations by address, and the redemption ledger. `admission` is the one
 * read that decides a sign-up: the phase and every ticket an address holds,
 * the workspace invitations and gifts included, in one transaction. `redeem`
 * takes the ticket in one transaction too, so two sign-ups racing for a
 * code's last use cannot both have it.
 *
 * Reachable only through the app (`setupAccess` and `setupAuth` in
 * `src/convex/integrations/launch.ts` and `src/convex/client/`).
 */

/** The most rows a console list returns: the newest first. */
const CONSOLE_ROWS = 200

const vTicket = v.object({ kind: v.string(), label: v.optional(v.string()) })
const vInviteStatus = v.union(v.literal('valid'), v.literal('expired'), v.literal('used-up'), v.literal('revoked'), v.literal('unknown'))

/** A code's or link's state now. */
function statusOf(invite: Doc<'accessInvites'> | null, now: number): InviteStatus {
  if (!invite) return 'unknown'
  if (invite.revokedAt !== undefined) return 'revoked'
  if (invite.expiresAt !== undefined && invite.expiresAt <= now) return 'expired'
  return invite.uses >= invite.maxUses ? 'used-up' : 'valid'
}

const inviteByHash = (ctx: QueryCtx, tokenHash: string) =>
  ctx.db.query('accessInvites').withIndex('tokenHash', q => q.eq('tokenHash', tokenHash)).first()

/** The address's unused, unexpired invitation by address, the newest. */
async function liveAdmission(ctx: QueryCtx, email: string, now: number): Promise<Doc<'accessAdmissions'> | null> {
  const rows = await ctx.db.query('accessAdmissions').withIndex('email', q => q.eq('email', email)).order('desc').take(20)
  return rows.find(row => row.usedAt === undefined && row.expiresAt > now) ?? null
}

/** How many new addresses one account's workspace invitations admit in a closed phase, unless `setupAccess` says otherwise. */
const WORKSPACE_INVITATIONS_DEFAULT = 10

/**
 * The inviter of a pending, unexpired workspace invitation to the address
 * that still admits someone, or `null`. An inviter admits at most
 * `perInviter` new addresses, and an account a workspace invitation
 * admitted admits nobody by its own: one admitted account can't open the
 * closed phase to a chain of others.
 */
async function workspaceInviter(ctx: QueryCtx, email: string, now: number, perInviter: number): Promise<string | null> {
  if (perInviter < 1) return null
  const rows = await ctx.db.query('invitation').withIndex('email', q => q.eq('email', email)).take(50)
  for (const row of rows) {
    if (row.status !== 'pending' || row.expiresAt <= now) continue
    const own = await ctx.db.query('accessRedemptions').withIndex('userId', q => q.eq('userId', row.inviterId)).order('desc').first()
    if (own?.ticket === 'workspace-invitation') continue
    const admitted = await ctx.db.query('accessRedemptions').withIndex('inviterId', q => q.eq('inviterId', row.inviterId)).take(perInviter)
    if (admitted.length < perInviter) return row.inviterId
  }
  return null
}

/** Whether a paid gift waits for the address, unclaimed. */
async function giftWaiting(ctx: QueryCtx, email: string): Promise<boolean> {
  // Only a gift that has been delivered: one the purchaser dated for later admits nobody yet.
  for await (const gift of ctx.db.query('billingGifts').withIndex('recipientEmail_status', q => q.eq('recipientEmail', email).eq('status', 'paid'))) {
    if (gift.deliveredAt !== undefined || gift.deliverAt === undefined) return true
  }
  return false
}

/** A ticket the address holds without typing anything: the order a sign-up takes them in. */
async function addressTicket(ctx: QueryCtx, email: string, now: number, perInviter: number): Promise<{ kind: AccessTicket, label?: string, admission?: Doc<'accessAdmissions'>, inviterId?: string } | null> {
  const admission = await liveAdmission(ctx, email, now)
  if (admission) return { kind: admission.source, ...(admission.label ? { label: admission.label } : {}), admission }
  const inviterId = await workspaceInviter(ctx, email, now, perInviter)
  if (inviterId) return { kind: 'workspace-invitation', inviterId }
  if (await giftWaiting(ctx, email)) return { kind: 'gift' }
  return null
}

/** The phase an administrator stored, or `null` while the app's first phase holds. */
export const getPhase = query({
  args: {},
  returns: v.union(v.null(), v.string()),
  handler: async ctx => (await ctx.db.query('accessSettings').first())?.phase ?? null,
})

/** Store the phase; answers the one stored before (`null` for none). */
export const setPhase = mutation({
  args: { phase: v.string() },
  returns: v.union(v.null(), v.string()),
  handler: async (ctx, { phase }) => {
    const row = await ctx.db.query('accessSettings').first()
    if (row) {
      await ctx.db.patch('accessSettings', row._id, { phase, updatedAt: Date.now() })
      return row.phase
    }
    await ctx.db.insert('accessSettings', { phase, updatedAt: Date.now() })
    return null
  },
})

/**
 * The one read behind a sign-up and an invite check: the stored phase,
 * the ticket the address holds (an invitation by address, an admitted
 * waitlist entry, a workspace invitation, a gift), and the state of the
 * code or link given. Writes nothing.
 */
export const admission = query({
  args: { email: v.optional(v.string()), tokenHash: v.optional(v.string()), workspaceInvitations: v.optional(v.number()) },
  returns: v.object({
    phase: v.union(v.null(), v.string()),
    ticket: v.union(v.null(), vTicket),
    invite: v.union(v.null(), v.object({ status: vInviteStatus, kind: v.optional(v.union(v.literal('code'), v.literal('link'))), label: v.optional(v.string()) })),
  }),
  handler: async (ctx, { email, tokenHash, workspaceInvitations }) => {
    const now = Date.now()
    const phase = (await ctx.db.query('accessSettings').first())?.phase ?? null
    const held = email ? await addressTicket(ctx, email, now, workspaceInvitations ?? WORKSPACE_INVITATIONS_DEFAULT) : null
    const invite = tokenHash ? await inviteByHash(ctx, tokenHash) : null
    return {
      phase,
      ticket: held ? { kind: held.kind, ...(held.label ? { label: held.label } : {}) } : null,
      invite: invite ? { status: statusOf(invite, now), kind: invite.kind, label: invite.label } : (tokenHash ? { status: 'unknown' as const } : null),
    }
  },
})

/**
 * Take a ticket for a new account, in one transaction: the address's own
 * first (so a typed code is not spent when the address needed none), then
 * the code or link given, counting its use. Records the ledger row, keyed
 * by the address until `attachUser` names the account. Answers the ticket,
 * or why the code admits nobody (`unknown` when none was given).
 */
export const redeem = mutation({
  args: { email: v.string(), tokenHash: v.optional(v.string()), workspaceInvitations: v.optional(v.number()) },
  returns: v.union(
    v.object({ ticket: v.string(), label: v.optional(v.string()) }),
    v.object({ refused: vInviteStatus }),
  ),
  handler: async (ctx, { email, tokenHash, workspaceInvitations }) => {
    const now = Date.now()
    const record = async (ticket: AccessTicket, label?: string, ids: { inviteId?: Id<'accessInvites'>, inviterId?: string } = {}) => {
      await ctx.db.insert('accessRedemptions', { email, ticket, ...(label ? { label } : {}), ...ids, at: now })
      return { ticket, ...(label ? { label } : {}) }
    }
    const held = await addressTicket(ctx, email, now, workspaceInvitations ?? WORKSPACE_INVITATIONS_DEFAULT)
    if (held) {
      if (held.admission) await ctx.db.patch('accessAdmissions', held.admission._id, { usedAt: now })
      if (held.kind === 'waitlist') await markJoined(ctx, email)
      return await record(held.kind, held.label, held.inviterId ? { inviterId: held.inviterId } : {})
    }
    const invite = tokenHash ? await inviteByHash(ctx, tokenHash) : null
    const status = statusOf(invite, now)
    if (!invite || status !== 'valid') return { refused: status }
    await ctx.db.patch('accessInvites', invite._id, { uses: invite.uses + 1 })
    return await record(invite.kind === 'code' ? 'invite-code' : 'access-link', invite.label, { inviteId: invite._id })
  },
})

/** Record a ticket that needs no row of its own (a domain, an administrator's creation) in the ledger. */
export const recordTicket = mutation({
  args: { email: v.string(), ticket: v.string() },
  returns: v.null(),
  handler: async (ctx, { email, ticket }) => {
    await ctx.db.insert('accessRedemptions', { email, ticket, at: Date.now() })
    return null
  },
})

/** Name the account a sign-up made on the ledger rows its address left: the address leaves them. */
export const attachUser = mutation({
  args: { email: v.string(), userId: v.string() },
  returns: v.union(v.null(), v.object({ ticket: v.string(), label: v.optional(v.string()) })),
  handler: async (ctx, { email, userId }) => {
    const rows = await ctx.db.query('accessRedemptions').withIndex('email', q => q.eq('email', email)).take(20)
    for (const row of rows) await ctx.db.patch('accessRedemptions', row._id, { userId, email: undefined })
    // A waiting person who signs up in a public phase, or with a code, has joined.
    await markJoined(ctx, email, userId)
    const last = rows.at(-1)
    return last ? { ticket: last.ticket, ...(last.label ? { label: last.label } : {}) } : null
  },
})

/** The ticket that admitted an account, for the Users tab: `null` for an account that needed none. */
export const ticketOf = query({
  args: { userId: v.string() },
  returns: v.union(v.null(), vTicket),
  handler: async (ctx, { userId }) => {
    const row = await ctx.db.query('accessRedemptions').withIndex('userId', q => q.eq('userId', userId)).order('desc').first()
    return row ? { kind: row.ticket, ...(row.label ? { label: row.label } : {}) } : null
  },
})

/** Store a new code or link by its hash. */
export const createInvite = mutation({
  args: {
    kind: v.union(v.literal('code'), v.literal('link')),
    tokenHash: v.string(),
    label: v.string(),
    maxUses: v.number(),
    expiresAt: v.optional(v.number()),
    createdBy: v.optional(v.string()),
    keyVersion: v.optional(v.number()),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const id = await ctx.db.insert('accessInvites', { ...args, uses: 0, createdAt: Date.now() })
    return id as string
  },
})

/**
 * Store a code or link under a new hash: the one the current auth secret
 * makes, once a lookup found it under a rotation's previous secret. The
 * code keeps working after that secret retires. Answers whether a row moved;
 * none does when no row holds `from` or one holds `to` already.
 */
export const rekeyInvite = mutation({
  args: { from: v.string(), to: v.string(), keyVersion: v.optional(v.number()) },
  returns: v.boolean(),
  handler: async (ctx, { from, to, keyVersion }) => {
    const invite = await inviteByHash(ctx, from)
    if (!invite || from === to || await inviteByHash(ctx, to)) return false
    await ctx.db.patch('accessInvites', invite._id, { tokenHash: to, ...(keyVersion === undefined ? {} : { keyVersion }) })
    return true
  },
})

/** The most unrevoked rows {@link staleInvites} reads. */
const STALE_SCAN_MAX = 1000

/**
 * How many open codes and links (unrevoked, unexpired, uses left) are still
 * hashed under an `AUTH_SECRET` older than `keyVersion`, the current entry's:
 * the ones that stop working when the older secret retires. What
 * `nuxt-backend env rotate AUTH_SECRET` warns of before retiring, through
 * `convex run --component backend`; no app code calls it. Reads the
 * unrevoked rows under older versions alone, at most {@link STALE_SCAN_MAX}:
 * `more` says the count stopped there.
 */
export const staleInvites = internalQuery({
  args: { keyVersion: v.number(), now: v.number() },
  returns: v.object({ count: v.number(), more: v.boolean() }),
  handler: async (ctx, { keyVersion, now }) => {
    const rows = await ctx.db
      .query('accessInvites')
      .withIndex('revokedAt_keyVersion', q => q.eq('revokedAt', undefined).lt('keyVersion', keyVersion))
      .take(STALE_SCAN_MAX + 1)
    const count = rows.slice(0, STALE_SCAN_MAX).filter(row => statusOf(row, now) === 'valid').length
    return { count, more: rows.length > STALE_SCAN_MAX }
  },
})

/**
 * Close a code or a link at once, or delete an unused invitation by
 * address. Answers what it found: `invite`, `admission`, `used` for an
 * invitation an account already signed up with (it stays), or `null`.
 */
export const revoke = mutation({
  args: { id: v.string() },
  returns: v.union(v.null(), v.literal('invite'), v.literal('admission'), v.literal('used')),
  handler: async (ctx, { id }) => {
    const inviteId = ctx.db.normalizeId('accessInvites', id)
    const invite = inviteId ? await ctx.db.get('accessInvites', inviteId) : null
    if (invite) {
      if (invite.revokedAt === undefined) await ctx.db.patch('accessInvites', invite._id, { revokedAt: Date.now() })
      return 'invite'
    }
    const admissionId = ctx.db.normalizeId('accessAdmissions', id)
    const admission = admissionId ? await ctx.db.get('accessAdmissions', admissionId) : null
    if (!admission) return null
    if (admission.usedAt !== undefined) return 'used'
    await ctx.db.delete('accessAdmissions', admission._id)
    return 'admission'
  },
})

/**
 * Admit addresses (already cleaned and lower-cased by the app): one
 * invitation by address each, valid until `expiresAt`. An address with an
 * account is skipped (`account`); one already admitted and unused gets the
 * later expiry and counts as admitted.
 */
export const admit = mutation({
  args: {
    emails: v.array(v.string()),
    source: v.union(v.literal('invitation'), v.literal('waitlist')),
    label: v.optional(v.string()),
    expiresAt: v.number(),
    createdBy: v.optional(v.string()),
  },
  returns: v.object({ admitted: v.array(v.string()), ids: v.array(v.string()), skipped: v.array(v.object({ email: v.string(), reason: v.string() })) }),
  handler: async (ctx, { emails, source, label, expiresAt, createdBy }) => {
    const now = Date.now()
    const admitted: string[] = []
    const ids: string[] = []
    const skipped: Array<{ email: string, reason: string }> = []
    for (const email of new Set(emails)) {
      if (await accountExists(ctx, email)) {
        skipped.push({ email, reason: 'account' })
        continue
      }
      const waiting = await liveAdmission(ctx, email, now)
      if (waiting) await ctx.db.patch('accessAdmissions', waiting._id, { expiresAt: Math.max(waiting.expiresAt, expiresAt), ...(label ? { label } : {}) })
      const id = waiting?._id ?? await ctx.db.insert('accessAdmissions', { email, source, ...(label ? { label } : {}), expiresAt, ...(createdBy ? { createdBy } : {}), createdAt: now })
      admitted.push(email)
      ids.push(id as string)
    }
    return { admitted, ids, skipped }
  },
})

/** How far apart invitation emails go: about a hundred an hour, so a wave never crowds out sign-in codes. */
export const INVITATION_EMAIL_GAP_MS = 36 * 1000

/** The addresses of invitations by address still waiting to be used, by id: what "Email them" writes to. A used, expired or revoked one is left out. */
export const admissionEmails = query({
  args: { ids: v.array(v.string()) },
  returns: v.array(v.object({ id: v.string(), email: v.string() })),
  handler: async (ctx, { ids }) => {
    const now = Date.now()
    const rows = await Promise.all(ids.slice(0, 500).map(async (raw) => {
      const id = ctx.db.normalizeId('accessAdmissions', raw)
      const row = id ? await ctx.db.get('accessAdmissions', id) : null
      return row && row.usedAt === undefined && row.expiresAt > now ? [{ id: raw, email: row.email }] : []
    }))
    return rows.flat()
  },
})

/**
 * Book the times `count` invitation emails go at: one every
 * {@link INVITATION_EMAIL_GAP_MS}, after the ones booked before, whoever
 * booked them. Answers the first time; the rest follow at the gap.
 */
export const bookInvitationEmails = mutation({
  args: { count: v.number() },
  returns: v.object({ start: v.number(), gapMs: v.number() }),
  handler: async (ctx, { count }) => {
    const now = Date.now()
    const pace = await ctx.db.query('accessEmailPace').first()
    const start = Math.max(now, pace?.nextAt ?? 0)
    const nextAt = start + Math.max(0, Math.floor(count)) * INVITATION_EMAIL_GAP_MS
    if (pace) await ctx.db.patch('accessEmailPace', pace._id, { nextAt })
    else await ctx.db.insert('accessEmailPace', { nextAt })
    return { start, gapMs: INVITATION_EMAIL_GAP_MS }
  },
})

const vConsoleInvite = v.object({
  id: v.string(),
  kind: v.union(v.literal('code'), v.literal('link')),
  label: v.string(),
  maxUses: v.number(),
  uses: v.number(),
  status: vInviteStatus,
  expiresAt: v.union(v.null(), v.number()),
  createdAt: v.number(),
})

const vConsoleAdmission = v.object({
  id: v.string(),
  email: v.string(),
  source: v.union(v.literal('invitation'), v.literal('waitlist')),
  label: v.union(v.null(), v.string()),
  expiresAt: v.number(),
  usedAt: v.union(v.null(), v.number()),
  createdAt: v.number(),
})

/** The Access tab's rows: the newest codes and links (never a code), and the newest invitations by address. */
export const consoleRows = query({
  args: {},
  returns: v.object({ invites: v.array(vConsoleInvite), admissions: v.array(vConsoleAdmission) }),
  handler: async (ctx) => {
    const now = Date.now()
    const invites = await ctx.db.query('accessInvites').withIndex('createdAt').order('desc').take(CONSOLE_ROWS)
    const admissions = await ctx.db.query('accessAdmissions').withIndex('createdAt').order('desc').take(CONSOLE_ROWS)
    return {
      invites: invites.map(row => ({
        id: row._id as string,
        kind: row.kind,
        label: row.label,
        maxUses: row.maxUses,
        uses: row.uses,
        status: statusOf(row, now),
        expiresAt: row.expiresAt ?? null,
        createdAt: row.createdAt,
      })),
      admissions: admissions.map(row => ({
        id: row._id as string,
        email: row.email,
        source: row.source,
        label: row.label ?? null,
        expiresAt: row.expiresAt,
        usedAt: row.usedAt ?? null,
        createdAt: row.createdAt,
      })),
    }
  },
})

/** At most this many rows an erasure batch touches. */
const FORGET_BATCH = 200

/**
 * Launch access's part of an account's erasure: the invitations by address
 * waiting for it, the ledger rows that name it, and its name on the codes
 * and links it made as an administrator. `true` while rows are left.
 */
export async function forgetAccess(ctx: MutationCtx, { userId, email }: { userId?: string, email?: string }): Promise<boolean> {
  let left = FORGET_BATCH
  const drop = async <T extends 'accessAdmissions' | 'accessRedemptions'>(table: T, rows: Array<Doc<T>>) => {
    for (const row of rows) await ctx.db.delete(table, row._id)
    left -= rows.length
  }
  if (email) {
    await forgetWaitlist(ctx, email)
    await drop('accessAdmissions', await ctx.db.query('accessAdmissions').withIndex('email', q => q.eq('email', email)).take(left))
    await drop('accessRedemptions', await ctx.db.query('accessRedemptions').withIndex('email', q => q.eq('email', email)).take(left))
  }
  if (userId) {
    await drop('accessRedemptions', await ctx.db.query('accessRedemptions').withIndex('userId', q => q.eq('userId', userId)).take(left))
    for (const row of await ctx.db.query('accessInvites').withIndex('createdBy', q => q.eq('createdBy', userId)).take(left)) {
      await ctx.db.patch('accessInvites', row._id, { createdBy: undefined })
      left--
    }
    for (const row of await ctx.db.query('accessAdmissions').withIndex('createdBy', q => q.eq('createdBy', userId)).take(left)) {
      await ctx.db.patch('accessAdmissions', row._id, { createdBy: undefined })
      left--
    }
  }
  return left <= 0
}
