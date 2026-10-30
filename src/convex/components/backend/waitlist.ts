import { DirectAggregate } from '@convex-dev/aggregate'
import { vOnCompleteArgs, Workpool } from '@convex-dev/workpool'
import { v } from 'convex/values'
import { Resend } from 'resend'
import { undeliverableReason } from '../../delivery.js'
import { backendError } from '../../errors.js'
import { LAUNCH_NEWS_KIND, LAUNCH_NEWS_VERSION } from '../../consent-rules.js'
import { logBackend } from '../../log.js'
import {
  domainOf,
  mailboxOf,
  queueKey,
  SOURCE_SIGN_IN,
  WAITLIST_CONSOLE_ROWS,
  WAITLIST_FILTER_SCAN,
  WAITLIST_NOTE_MAX,
  WAITLIST_STATUSES,
  type WaitlistStatus,
  waitlistEmail,
} from '../../waitlist-rules.js'
import { components, internal } from './_generated/api.js'
import type { Doc } from './_generated/dataModel.js'
import { recordForAddress } from './consents.js'
import { dropEntryCode, ensureCode, handCodeToAccount, ownerOfCode, peekOwnerCode } from './referrals.js'
import { type ActionCtx, env, internalAction, internalMutation, internalQuery, mutation, type MutationCtx, query, type QueryCtx } from './_generated/server.js'

/**
 * The waitlist: the component's half. One entry per address whose sign-in
 * code checked (`verify`), after a join that carried the person's answers
 * and their wish for launch news (`stage`, kept for a day at most). Waiting
 * entries stand in the nested `waitlistRank` aggregate, keyed by when they
 * were verified moved up by their boost; every write to it is queued and
 * every read is stale, so a burst of joins never contends on its root.
 * Admitting an entry gives its address a `waitlist` ticket (an invitation
 * by address, `access.ts`), and signing up turns it into `joined`.
 *
 * The people who ticked the launch-news box are mirrored to the email
 * provider as contacts of one segment, subscribed to one topic, by a job
 * on the nested `waitlistMirror` workpool: it retries with backoff, and an
 * entry whose contact could not be written is flagged `drift` until a
 * later pass writes it.
 *
 * Reachable only through the app (`setupWaitlist`, and the sign-in hooks
 * through `setupAccess`).
 */

const DAY_MS = 24 * 60 * 60 * 1000

/** A staged join is kept this long, waiting for its code. */
export const WAITLIST_JOIN_TTL_MS = DAY_MS

/** A contact left pending or drifting this long is written again by the maintenance pass. */
export const WAITLIST_MIRROR_RETRY_MS = 60 * 60 * 1000

/** How many contacts one maintenance pass writes again. */
const MIRROR_RETRY_BATCH = 50

/** How long an admission by waitlist lasts, matching an invitation by address: 30 days. */
const ADMISSION_TTL_MS = 30 * DAY_MS

/** The name of the segment and the topic the mirror finds or makes at the provider. */
const SEGMENT_NAME = 'Waitlist'
const TOPIC_NAME = 'Launch news'

const rank = new DirectAggregate<{ Key: number, Id: string }>(components.waitlistRank)

const pool = new Workpool(components.waitlistMirror, {
  // The provider allows ten requests a second across the team: two at a time stays far under it.
  maxParallelism: 2,
  retryActionsByDefault: true,
  defaultRetryBehavior: { maxAttempts: 6, initialBackoffMs: 2000, base: 2 },
})

const vStatus = v.union(v.literal('waiting'), v.literal('admitted'), v.literal('declined'), v.literal('joined'))
const vAnswers = v.record(v.string(), v.string())

type Entry = Doc<'waitlistEntries'>

// ── Counts and the queue ────────────────────────────────────────────────

/** Move a status's count. One row per status: a join contends only with other joins. */
async function adjust(ctx: MutationCtx, status: WaitlistStatus, delta: number): Promise<void> {
  const row = await ctx.db.query('waitlistStats').withIndex('status', q => q.eq('status', status)).first()
  if (row) await ctx.db.patch('waitlistStats', row._id, { count: Math.max(0, row.count + delta) })
  else if (delta > 0) await ctx.db.insert('waitlistStats', { status, count: delta })
}

/** Put a waiting entry in the queue, at its key. */
async function enterQueue(ctx: MutationCtx, entry: Entry, key: number): Promise<void> {
  await rank.replaceOrInsert(ctx, { key: entry.rankKey ?? key, id: entry._id }, { key }, { async: true })
  await ctx.db.patch('waitlistEntries', entry._id, { rankKey: key })
}

/** Take an entry out of the queue: it was admitted, declined, joined or removed. */
async function leaveQueue(ctx: MutationCtx, entry: Entry): Promise<void> {
  if (entry.rankKey === undefined) return
  await rank.deleteIfExists(ctx, { key: entry.rankKey, id: entry._id }, { async: true })
  await ctx.db.patch('waitlistEntries', entry._id, { rankKey: undefined })
}

/** Change an entry's status, keeping the counts. */
async function setStatus(ctx: MutationCtx, entry: Entry, status: WaitlistStatus, fields: Partial<Entry> = {}): Promise<void> {
  if (entry.status !== status) {
    await adjust(ctx, entry.status, -1)
    await adjust(ctx, status, 1)
  }
  await ctx.db.patch('waitlistEntries', entry._id, { status, ...fields })
}

/**
 * Take back what a friend's entry gave the entry that shared its link: one
 * friend off its boost, and its place in line moved back by what the
 * friend moved it up.
 */
async function reverseBoost(ctx: MutationCtx, friend: Entry): Promise<void> {
  if (!friend.referredBy) return
  const sharer = await ctx.db.get('waitlistEntries', friend.referredBy)
  if (!sharer) return
  const credited = friend.creditedMs ?? 0
  await ctx.db.patch('waitlistEntries', sharer._id, { boost: Math.max(0, sharer.boost - 1) })
  if (sharer.status === 'waiting' && sharer.rankKey !== undefined) await enterQueue(ctx, sharer, sharer.rankKey + credited)
  else if (sharer.rankKey !== undefined) await ctx.db.patch('waitlistEntries', sharer._id, { rankKey: sharer.rankKey + credited })
  await ctx.db.patch('waitlistEntries', friend._id, { referredBy: undefined, creditedMs: undefined })
}

/** Delete an entry for good: it left, or its address was erased. Its friends' credits stay; its own is taken back. */
async function removeEntry(ctx: MutationCtx, entry: Entry): Promise<void> {
  await leaveQueue(ctx, entry)
  await reverseBoost(ctx, entry)
  await adjust(ctx, entry.status, -1)
  await dropEntryCode(ctx, entry._id)
  await ctx.db.delete('waitlistEntries', entry._id)
}

// ── Joining ─────────────────────────────────────────────────────────────

/** How many staged joins one address keeps at once: the latest few, so a stranger's never pushes out the person's own. */
const STAGED_PER_ADDRESS = 5

/**
 * Keep what a join carries until its code checks, under the key the
 * browser that began it holds. Nothing is public until `verify`, and
 * `verify` applies only the join whose key the code check carries, so a
 * stranger who types someone else's address changes nothing about them,
 * even once the real owner signs in.
 */
export const stage = mutation({
  args: {
    email: v.string(),
    key: v.string(),
    answers: v.optional(vAnswers),
    launchNews: v.optional(v.object({ text: v.string() })),
    source: v.string(),
    ref: v.optional(v.string()),
    locale: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { email, ...join }) => {
    const address = waitlistEmail(email)
    const now = Date.now()
    const rows = await ctx.db.query('waitlistJoins').withIndex('email', q => q.eq('email', address)).order('desc').take(20)
    for (const [index, row] of rows.entries()) {
      if (index >= STAGED_PER_ADDRESS - 1 || now - row.createdAt >= WAITLIST_JOIN_TTL_MS) await ctx.db.delete('waitlistJoins', row._id)
    }
    await ctx.db.insert('waitlistJoins', { email: address, ...join, createdAt: now })
    return null
  },
})

/**
 * The sharer a staged `ref` names, when sharing is allowed: the program's
 * code of an entry (referral codes are program-wide, and the same mailbox
 * rule refuses a person's own), waiting or admitted, under its cap. A code
 * that is an account's moves nobody up the line.
 */
async function sharerFor(ctx: MutationCtx, ref: string | undefined, email: string, boost: { cap: number, days: number }): Promise<Entry | null> {
  const owner = ref && boost.cap >= 1 ? await ownerOfCode(ctx, ref) : null
  const entryId = owner?.ownerKind === 'entry' ? ctx.db.normalizeId('waitlistEntries', owner.ownerId) : null
  const sharer = entryId ? await ctx.db.get('waitlistEntries', entryId) : null
  if (!sharer || (sharer.status !== 'waiting' && sharer.status !== 'admitted')) return null
  if (mailboxOf(sharer.email) === mailboxOf(email) || sharer.boost >= boost.cap) return null
  return sharer
}

/** Ask the mirror to write an entry's contact (or write it again). */
async function enqueueMirror(ctx: MutationCtx, entry: Entry): Promise<void> {
  await ctx.db.patch('waitlistEntries', entry._id, { mirror: 'pending', mirrorError: undefined, mirrorAt: Date.now() })
  await pool.enqueueAction(ctx, internal.waitlist.mirrorOne, { entryId: entry._id }, { onComplete: internal.waitlist.mirrored, context: { entryId: entry._id } })
}

const vEntryRef = v.object({ id: v.string(), created: v.boolean(), status: vStatus, source: v.string(), referred: v.boolean(), news: v.boolean() })

type Join = Doc<'waitlistJoins'>
type Boost = { cap: number, days: number }

/**
 * The launch-news box ticked: a consent, kept on the ledger alone (by a
 * hash of the address, carried over to the account when it signs up), and
 * the contact the mirror writes. The entry keeps only the mirror's state.
 */
async function wantNews(ctx: MutationCtx, entry: Entry, text: string): Promise<void> {
  await recordForAddress(ctx, entry.email, [{ kind: LAUNCH_NEWS_KIND, version: LAUNCH_NEWS_VERSION, granted: true, source: 'waitlist', text }])
  await enqueueMirror(ctx, entry)
}

/** Whether an entry asked for launch news: its contact is mirrored, or on its way. */
const wantsNews = (entry: Entry): boolean => entry.mirror !== undefined

/** A person already on the list: what they add now is kept, their place is not touched. */
async function addToEntry(ctx: MutationCtx, existing: Entry, join: Join | undefined): Promise<void> {
  if (join?.answers) await ctx.db.patch('waitlistEntries', existing._id, { answers: { ...existing.answers, ...join.answers } })
  if (join?.launchNews && !wantsNews(existing)) await wantNews(ctx, (await ctx.db.get('waitlistEntries', existing._id))!, join.launchNews.text)
}

/** A friend joined through the sharer's link: the sharer moves up, and the friend remembers by how much. */
async function creditSharer(ctx: MutationCtx, friendId: Entry['_id'], sharer: Entry, boost: Boost): Promise<void> {
  const credited = boost.days * DAY_MS
  await ctx.db.patch('waitlistEntries', friendId, { referredBy: sharer._id, creditedMs: credited })
  await ctx.db.patch('waitlistEntries', sharer._id, { boost: sharer.boost + 1 })
  if (sharer.rankKey === undefined) return
  if (sharer.status === 'waiting') await enterQueue(ctx, sharer, sharer.rankKey - credited)
  else await ctx.db.patch('waitlistEntries', sharer._id, { rankKey: sharer.rankKey - credited })
}

/** A new entry: its row, its place in line, the friend credit and the contact for launch news. */
async function createEntry(ctx: MutationCtx, input: { address: string, join: Join | undefined, source: string | undefined, locale: string | undefined, now: number, boost: Boost }): Promise<Entry['_id']> {
  const { address, join, source, locale, now, boost } = input
  const sharer = await sharerFor(ctx, join?.ref, address, boost)
  const entryLocale = join?.locale ?? locale
  const id = await ctx.db.insert('waitlistEntries', {
    email: address,
    domain: domainOf(address),
    status: 'waiting',
    source: join?.source ?? source ?? SOURCE_SIGN_IN,
    ...(join?.answers ? { answers: join.answers } : {}),
    ...(entryLocale ? { locale: entryLocale } : {}),
    verifiedAt: now,
    boost: 0,
  })
  await ensureCode(ctx, 'entry', id)
  await adjust(ctx, 'waiting', 1)
  await enterQueue(ctx, (await ctx.db.get('waitlistEntries', id))!, queueKey(now, 0, boost.days))
  if (sharer) await creditSharer(ctx, id, sharer, boost)
  if (join?.launchNews) await wantNews(ctx, (await ctx.db.get('waitlistEntries', id))!, join.launchNews.text)
  return id
}

/**
 * The address's code checked: record the entry (once), with what its staged
 * join carried, its place in line, the friend credit when it came through a
 * share link, and a contact for launch news when it asked for it. Only the
 * join whose `key` the code check carries counts: a check without one, or
 * with another browser's, records the bare entry. Answers the entry;
 * `created` is false for a person already on the list, whose place is kept
 * (a later join may add launch news or answers).
 */
export const verify = mutation({
  args: { email: v.string(), join: v.optional(v.string()), source: v.optional(v.string()), locale: v.optional(v.string()), boost: v.object({ cap: v.number(), days: v.number() }) },
  returns: vEntryRef,
  handler: async (ctx, { email, join, source, locale, boost }) => {
    const address = waitlistEmail(email)
    const now = Date.now()
    const staged = join
      ? (await ctx.db.query('waitlistJoins').withIndex('email', q => q.eq('email', address)).order('desc').take(20))
          .filter(row => row.key === join && now - row.createdAt < WAITLIST_JOIN_TTL_MS)
      : []
    const existing = await ctx.db.query('waitlistEntries').withIndex('email', q => q.eq('email', address)).first()
    if (existing) await addToEntry(ctx, existing, staged[0])
    const entryId = existing?._id ?? await createEntry(ctx, { address, join: staged[0], source, locale, now, boost })
    for (const row of staged) await ctx.db.delete('waitlistJoins', row._id)
    const row = (await ctx.db.get('waitlistEntries', entryId))!
    return { id: row._id as string, created: !existing, status: row.status, source: row.source, referred: row.referredBy !== undefined, news: wantsNews(row) }
  },
})

// ── Reading ─────────────────────────────────────────────────────────────

const vPlace = v.object({
  status: vStatus,
  /** 1-based place among the people waiting; `null` once the person is not waiting. */
  position: v.union(v.null(), v.number()),
  total: v.number(),
  boost: v.number(),
  shareCode: v.string(),
  launchNews: v.boolean(),
  verifiedAt: v.number(),
})

/** An entry's standing, from the (stale) queue. `null` for an id that is no entry. */
async function placeOf(ctx: QueryCtx, entry: Entry): Promise<typeof vPlace.type> {
  const code = await peekOwnerCode(ctx, 'entry', entry._id)
  const total = await rank.count(ctx, { stale: true })
  let position: number | null = null
  if (entry.status === 'waiting' && entry.rankKey !== undefined) {
    // The count of people ahead needs no row for this entry: a join still
    // in the queue's backlog is placed where it will land.
    position = (await rank.indexOf(ctx, entry.rankKey, { id: entry._id, stale: true })) + 1
  }
  return {
    status: entry.status,
    position,
    total: Math.max(total, position ?? 0),
    boost: entry.boost,
    shareCode: code?.code ?? '',
    launchNews: wantsNews(entry),
    verifiedAt: entry.verifiedAt,
  }
}

/** An entry's place in line, by its id (the app checked the signed link that names it). */
export const place = query({
  args: { id: v.string() },
  returns: v.union(v.null(), vPlace),
  handler: async (ctx, { id }) => {
    const entryId = ctx.db.normalizeId('waitlistEntries', id)
    const entry = entryId ? await ctx.db.get('waitlistEntries', entryId) : null
    return entry ? await placeOf(ctx, entry) : null
  },
})

/** The entry of an address, if any: its id and status. */
export const lookup = query({
  args: { email: v.string() },
  returns: v.union(v.null(), v.object({ id: v.string(), status: vStatus })),
  handler: async (ctx, { email }) => {
    const entry = await ctx.db.query('waitlistEntries').withIndex('email', q => q.eq('email', waitlistEmail(email))).first()
    return entry ? { id: entry._id as string, status: entry.status } : null
  },
})

/** The ids of the segment and the topic launch news is mirrored to; `null` before the first contact is written. */
export const audience = query({
  args: {},
  returns: v.union(v.null(), v.object({ segmentId: v.string(), topicId: v.string() })),
  handler: async (ctx) => {
    const row = await ctx.db.query('waitlistSettings').first()
    return row?.segmentId && row.topicId ? { segmentId: row.segmentId, topicId: row.topicId } : null
  },
})

/** The ids of the people at the front of the queue, in order (for "the next N"). */
export const queue = query({
  args: { limit: v.number() },
  returns: v.array(v.string()),
  handler: async (ctx, { limit }) => {
    const page = await rank.paginate(ctx, { pageSize: Math.max(1, Math.min(limit, 500)), stale: true })
    return page.page.map(item => item.id)
  },
})

const vConsoleEntry = v.object({
  id: v.string(),
  email: v.string(),
  status: vStatus,
  source: v.string(),
  answers: v.record(v.string(), v.string()),
  locale: v.union(v.null(), v.string()),
  note: v.union(v.null(), v.string()),
  verifiedAt: v.number(),
  boost: v.number(),
  launchNews: v.boolean(),
  mirror: v.union(v.null(), v.string()),
  declinedFor: v.union(v.null(), v.string()),
})

/** The count per status. */
async function statusCounts(ctx: QueryCtx): Promise<Record<WaitlistStatus, number>> {
  const counts = { waiting: 0, admitted: 0, declined: 0, joined: 0 }
  for (const row of await ctx.db.query('waitlistStats').take(10)) {
    if ((WAITLIST_STATUSES as readonly string[]).includes(row.status)) counts[row.status as WaitlistStatus] = row.count
  }
  return counts
}

interface ConsoleFilter {
  status?: WaitlistStatus
  domain?: string
  source?: string
  question?: string
  answer?: string
}

/** The entries a console read lists: the oldest of the status, narrowed by what the filter names. */
async function filteredEntries(ctx: QueryCtx, { status, domain, source, question, answer }: ConsoleFilter): Promise<Entry[]> {
  const wanted = domain?.trim().toLowerCase().replace(/^@/, '')
  const byAnswer = question && answer ? { question, answer } : null
  const filtered = Boolean(wanted || source || byAnswer)
  const scanned = await ctx.db.query('waitlistEntries').withIndex('status_verifiedAt', q => q.eq('status', status ?? 'waiting')).take(filtered ? WAITLIST_FILTER_SCAN : WAITLIST_CONSOLE_ROWS)
  return scanned
    .filter(entry => (!wanted || entry.domain === wanted) && (!source || entry.source === source) && (!byAnswer || entry.answers?.[byAnswer.question] === byAnswer.answer))
    .slice(0, WAITLIST_CONSOLE_ROWS)
}

/** An entry as the console lists it. */
const consoleEntry = (entry: Entry): typeof vConsoleEntry.type => ({
  id: entry._id as string,
  email: entry.email,
  status: entry.status,
  source: entry.source,
  answers: entry.answers ?? {},
  locale: entry.locale ?? null,
  note: entry.note ?? null,
  verifiedAt: entry.verifiedAt,
  boost: entry.boost,
  launchNews: wantsNews(entry),
  mirror: entry.mirror ?? null,
  declinedFor: entry.declinedFor ?? null,
})

/** How many contacts wait to be written or have drifted (up to a thousand each). */
async function mirrorBacklog(ctx: QueryCtx): Promise<{ pending: number, drift: number }> {
  const count = async (state: 'pending' | 'drift') => (await ctx.db.query('waitlistEntries').withIndex('mirror', q => q.eq('mirror', state)).take(1000)).length
  return { pending: await count('pending'), drift: await count('drift') }
}

/**
 * The Waitlist tab's rows: the oldest entries of a status first, narrowed
 * by domain, source or an answer (a filter looks through the oldest
 * {@link WAITLIST_FILTER_SCAN} of the status), and a count per status.
 */
export const consoleRows = query({
  args: { status: v.optional(vStatus), domain: v.optional(v.string()), source: v.optional(v.string()), question: v.optional(v.string()), answer: v.optional(v.string()) },
  returns: v.object({
    counts: v.object({ waiting: v.number(), admitted: v.number(), declined: v.number(), joined: v.number() }),
    mirror: v.object({ pending: v.number(), drift: v.number() }),
    entries: v.array(vConsoleEntry),
  }),
  handler: async (ctx, filter) => ({
    counts: await statusCounts(ctx),
    mirror: await mirrorBacklog(ctx),
    entries: (await filteredEntries(ctx, filter)).map(consoleEntry),
  }),
})

// ── Leaving, admitting, declining ───────────────────────────────────────

/** An entry by its id, or `null` for an id that is no entry. */
async function entryById(ctx: MutationCtx, id: string): Promise<Entry | null> {
  const entryId = ctx.db.normalizeId('waitlistEntries', id)
  return entryId ? await ctx.db.get('waitlistEntries', entryId) : null
}

/** Withdraw the unused `waitlist` tickets an address holds: it left, or was declined. */
async function withdrawTickets(ctx: MutationCtx, email: string): Promise<void> {
  for (const row of await ctx.db.query('accessAdmissions').withIndex('email', q => q.eq('email', email)).take(20)) {
    if (row.source === 'waitlist' && row.usedAt === undefined) await ctx.db.delete('accessAdmissions', row._id)
  }
}

/** Take an address off the list: the person left. Their contact is removed from the segment, and what they gave a friend is taken back. */
export const leave = mutation({
  args: { id: v.string() },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const entry = await entryById(ctx, id)
    if (!entry) return null
    const { email } = entry
    const news = wantsNews(entry)
    await withdrawTickets(ctx, email)
    await removeEntry(ctx, entry)
    if (news) {
      await pool.enqueueAction(ctx, internal.waitlist.removeContact, { email })
      await recordForAddress(ctx, email, [{ kind: LAUNCH_NEWS_KIND, version: LAUNCH_NEWS_VERSION, granted: false, source: 'waitlist' }])
    }
    return null
  },
})

/** Whether an account exists for the address. */
export async function accountExists(ctx: MutationCtx, email: string): Promise<boolean> {
  return await ctx.db.query('user').withIndex('email_name', q => q.eq('email', email)).first() !== null
}

/** Give an address a `waitlist` ticket: a live one is extended, else one is made. */
async function giveTicket(ctx: MutationCtx, email: string, input: { label: string | undefined, createdBy: string | undefined, now: number }): Promise<void> {
  const { label, createdBy, now } = input
  const open = (await ctx.db.query('accessAdmissions').withIndex('email', q => q.eq('email', email)).order('desc').take(20))
    .find(row => row.usedAt === undefined && row.expiresAt > now)
  if (open) await ctx.db.patch('accessAdmissions', open._id, { expiresAt: now + ADMISSION_TTL_MS })
  else await ctx.db.insert('accessAdmissions', { email, source: 'waitlist', ...(label ? { label } : {}), expiresAt: now + ADMISSION_TTL_MS, ...(createdBy ? { createdBy } : {}), createdAt: now })
}

/**
 * Admit waiting entries: each gets a `waitlist` ticket (30 days), so the
 * address signs up while the app is closed. An address that has an account
 * already is joined instead. Answers the addresses admitted, in the order
 * given, for the emails the app sends; entries that are not waiting are
 * skipped.
 */
export const admit = mutation({
  args: { ids: v.array(v.string()), max: v.optional(v.number()), label: v.optional(v.string()), createdBy: v.optional(v.string()) },
  returns: v.array(v.object({ id: v.string(), email: v.string(), locale: v.union(v.null(), v.string()) })),
  handler: async (ctx, { ids, max, label, createdBy }) => {
    const now = Date.now()
    const admitted: Array<{ id: string, email: string, locale: string | null }> = []
    for (const id of new Set(ids)) {
      if (max !== undefined && admitted.length >= max) break
      const entry = await entryById(ctx, id)
      if (entry?.status !== 'waiting') continue
      await leaveQueue(ctx, entry)
      if (await accountExists(ctx, entry.email)) {
        await setStatus(ctx, entry, 'joined', { joinedAt: now })
        continue
      }
      await giveTicket(ctx, entry.email, { label, createdBy, now })
      await setStatus(ctx, entry, 'admitted', { admittedAt: now })
      admitted.push({ id: entry._id as string, email: entry.email, locale: entry.locale ?? null })
    }
    return admitted
  },
})

/**
 * Decline entries: they stay on record, out of the queue, and an unused
 * ticket is withdrawn. `abuse` also takes back what each gave the friend
 * whose link it came through, and keeps the reason.
 */
export const decline = mutation({
  args: { ids: v.array(v.string()), abuse: v.optional(v.boolean()) },
  returns: v.number(),
  handler: async (ctx, { ids, abuse }) => {
    let declined = 0
    for (const id of new Set(ids)) {
      const entry = await entryById(ctx, id)
      if (!entry || entry.status === 'joined' || entry.status === 'declined') continue
      await leaveQueue(ctx, entry)
      if (entry.status === 'admitted') await withdrawTickets(ctx, entry.email)
      if (abuse) await reverseBoost(ctx, entry)
      await setStatus(ctx, entry, 'declined', { declinedAt: Date.now(), ...(abuse ? { declinedFor: 'abuse' as const } : {}) })
      declined++
    }
    return declined
  },
})

/** Keep an administrator's note on an entry; an empty note clears it. */
export const note = mutation({
  args: { id: v.string(), note: v.string() },
  returns: v.null(),
  handler: async (ctx, { id, note: text }) => {
    const entry = await entryById(ctx, id)
    if (!entry) throw backendError('invalid_input', { field: 'id' }, '[nuxt-backend] waitlist.note: no such entry.')
    const trimmed = text.trim()
    if (trimmed.length > WAITLIST_NOTE_MAX) throw backendError('invalid_input', { field: 'note' }, `[nuxt-backend] waitlist.note: at most ${WAITLIST_NOTE_MAX} characters.`)
    await ctx.db.patch('waitlistEntries', entry._id, { note: trimmed || undefined })
    return null
  },
})

/**
 * An account was made for the address (it signed up, with a ticket or in a
 * public phase): its entry is joined. Safe to run again; no entry is fine.
 *
 * @internal
 */
export async function markJoined(ctx: MutationCtx, email: string, userId?: string): Promise<void> {
  const entry = await ctx.db.query('waitlistEntries').withIndex('email', q => q.eq('email', waitlistEmail(email))).first()
  if (!entry) return
  // The link it shared before launch keeps working: its code is the account's now.
  if (userId) await handCodeToAccount(ctx, entry._id, userId)
  if (entry.status === 'joined') return
  await leaveQueue(ctx, entry)
  await setStatus(ctx, entry, 'joined', { joinedAt: Date.now() })
}

/**
 * The waitlist's part of an erasure by address: the entry, its staged
 * joins, and what it gave a friend. The contact at the provider goes with
 * the email part of the erasure. `true` while rows are left.
 *
 * @internal
 */
export async function forgetWaitlist(ctx: MutationCtx, email: string): Promise<boolean> {
  const address = waitlistEmail(email)
  for (const row of await ctx.db.query('waitlistJoins').withIndex('email', q => q.eq('email', address)).take(50)) await ctx.db.delete('waitlistJoins', row._id)
  for (const entry of await ctx.db.query('waitlistEntries').withIndex('email', q => q.eq('email', address)).take(50)) await removeEntry(ctx, entry)
  return false
}

/** Stale staged joins go (maintenance). */
export async function pruneJoins(ctx: MutationCtx, before: number): Promise<{ pruned: number, done: boolean }> {
  const rows = await ctx.db.query('waitlistJoins').withIndex('createdAt', q => q.lt('createdAt', before)).take(200)
  for (const row of rows) await ctx.db.delete('waitlistJoins', row._id)
  return { pruned: rows.length, done: rows.length < 200 }
}

/** Contacts left pending or drifting for a while are written again (maintenance). */
export async function retryMirrors(ctx: MutationCtx, before: number): Promise<void> {
  for (const state of ['pending', 'drift'] as const) {
    const rows = await ctx.db.query('waitlistEntries').withIndex('mirror', q => q.eq('mirror', state)).take(MIRROR_RETRY_BATCH)
    for (const entry of rows) {
      if ((entry.mirrorAt ?? 0) < before) await enqueueMirror(ctx, entry)
    }
  }
}

// ── The launch-news mirror ──────────────────────────────────────────────

/** What a mirror job needs to write a contact: the address and the ids of the segment and topic (made on first use). */
export const mirrorTarget = internalQuery({
  args: { entryId: v.id('waitlistEntries') },
  returns: v.union(v.null(), v.object({ email: v.string(), segmentId: v.union(v.null(), v.string()), topicId: v.union(v.null(), v.string()) })),
  handler: async (ctx, { entryId }) => {
    const entry = await ctx.db.get('waitlistEntries', entryId)
    if (!entry || !wantsNews(entry)) return null
    const settings = await ctx.db.query('waitlistSettings').first()
    return { email: entry.email, segmentId: settings?.segmentId ?? null, topicId: settings?.topicId ?? null }
  },
})

/** Keep the ids of the segment and the topic the mirror writes to. */
export const saveAudience = internalMutation({
  args: { segmentId: v.string(), topicId: v.string() },
  returns: v.null(),
  handler: async (ctx, { segmentId, topicId }) => {
    const row = await ctx.db.query('waitlistSettings').first()
    if (row) await ctx.db.patch('waitlistSettings', row._id, { segmentId, topicId, updatedAt: Date.now() })
    else await ctx.db.insert('waitlistSettings', { segmentId, topicId, updatedAt: Date.now() })
    return null
  },
})

/** The provider's answer to a failed call, as an error a retry can tell apart. */
function providerError(action: string, error: { name?: string, message?: string, statusCode?: number | null }): Error {
  return new Error(`[nuxt-backend] Resend: ${action}: ${error.name ?? 'error'}${error.statusCode ? ` (${error.statusCode})` : ''}: ${error.message ?? ''}`.slice(0, 300))
}

/** Whether the provider's refusal is the contact being there already. */
const alreadyThere = (error: { name?: string, statusCode?: number | null }) => error.statusCode === 409 || error.name === 'already_exists'

/** The id of a provider object found by name in a listing, or made when there is none. */
async function foundOrMade(action: string, listed: { error: { name?: string, message?: string, statusCode?: number | null } | null, data: Array<{ id: string, name: string }> | null }, name: string, make: () => Promise<{ error: { name?: string, message?: string, statusCode?: number | null } | null, data: { id: string } | null }>): Promise<string> {
  if (listed.error || !listed.data) throw providerError(`list ${action}`, listed.error ?? {})
  const found = listed.data.find(item => item.name === name)
  if (found) return found.id
  const made = await make()
  if (made.error || !made.data) throw providerError(`create the ${action}`, made.error ?? {})
  return made.data.id
}

/** The segment and the topic launch news is written to: the ids kept, else found or made at the provider and kept. */
async function audienceOf(ctx: ActionCtx, resend: Resend, target: { segmentId: string | null, topicId: string | null }): Promise<{ segmentId: string, topicId: string }> {
  if (target.segmentId && target.topicId) return { segmentId: target.segmentId, topicId: target.topicId }
  const segments = await resend.segments.list()
  const segmentId = await foundOrMade('segment', { error: segments.error, data: segments.data?.data ?? null }, SEGMENT_NAME, () => resend.segments.create({ name: SEGMENT_NAME }))
  const topics = await resend.topics.list()
  const topicId = await foundOrMade('topic', { error: topics.error, data: topics.data?.data ?? null }, TOPIC_NAME, () => resend.topics.create({ name: TOPIC_NAME, description: 'News about the launch, for people who asked for it.', defaultSubscription: 'opt_out' }))
  await ctx.runMutation(internal.waitlist.saveAudience, { segmentId, topicId })
  return { segmentId, topicId }
}

/** Write one contact: created in the segment and subscribed to the topic, else (when it exists) added and subscribed. */
async function writeContact(resend: Resend, email: string, audience: { segmentId: string, topicId: string }): Promise<void> {
  const topics = [{ id: audience.topicId, subscription: 'opt_in' as const }]
  const created = await resend.contacts.create({ email, segments: [{ id: audience.segmentId }], topics })
  if (!created.error) return
  if (!alreadyThere(created.error)) throw providerError('write the contact', created.error)
  const added = await resend.contacts.segments.add({ email, segmentId: audience.segmentId })
  if (added.error && !alreadyThere(added.error)) throw providerError('add the contact to the segment', added.error)
  const subscribed = await resend.contacts.topics.update({ email, topics })
  if (subscribed.error) throw providerError('subscribe the contact to the topic', subscribed.error)
}

/**
 * Write one launch-news contact: the address in the segment, subscribed to
 * the topic. Finds or makes the segment and the topic on the first run. A
 * deployment that cannot deliver to the address (no key, or test mode with
 * an address that is not a provider test one) writes nothing and answers
 * why. A provider failure throws, and the workpool retries it.
 */
export const mirrorOne = internalAction({
  args: { entryId: v.id('waitlistEntries') },
  returns: v.union(v.object({ skipped: v.string() }), v.null()),
  handler: async (ctx, { entryId }) => {
    const target = await ctx.runQuery(internal.waitlist.mirrorTarget, { entryId })
    if (!target) return null
    const key = env.EMAIL_API_KEY
    const reason = undeliverableReason(target.email)
    if (!key || reason) return { skipped: reason ?? 'no-key' }
    const resend = new Resend(key)
    await writeContact(resend, target.email, await audienceOf(ctx, resend, target))
    return null
  },
})

/** Remove the contact of a person who left; a contact that is not there is fine. */
export const removeContact = internalAction({
  args: { email: v.string() },
  returns: v.null(),
  handler: async (_ctx, { email }) => {
    const key = env.EMAIL_API_KEY
    if (!key || undeliverableReason(email)) return null
    const removed = await new Resend(key).contacts.remove({ email })
    if (removed.error && removed.error.name !== 'not_found' && removed.error.statusCode !== 404) throw providerError('remove the contact', removed.error)
    return null
  },
})

/** A mirror job ended: the entry says whether its contact is written, skipped, or has drifted. */
export const mirrored = internalMutation({
  args: vOnCompleteArgs(v.object({ entryId: v.id('waitlistEntries') })),
  handler: async (ctx, { context, result }) => {
    if (result.kind === 'canceled') return
    const entry = await ctx.db.get('waitlistEntries', context.entryId)
    if (!entry || !wantsNews(entry)) return
    if (result.kind === 'success') {
      const skipped = (result.returnValue as { skipped?: string } | null)?.skipped
      await ctx.db.patch('waitlistEntries', entry._id, { mirror: skipped ? 'skipped' : 'synced', mirrorError: skipped, mirrorAt: Date.now() })
      return
    }
    logBackend('warn', 'waitlist.mirror_drift', 'A launch-news contact could not be written to the email provider; its entry is flagged and the next maintenance pass tries again.', result.error)
    await ctx.db.patch('waitlistEntries', entry._id, { mirror: 'drift', mirrorError: String(result.error).slice(0, 300), mirrorAt: Date.now() })
  },
})
