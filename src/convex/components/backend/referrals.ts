import type { FunctionHandle } from 'convex/server'
import { v } from 'convex/values'
import { backendError } from '../../errors.js'
import {
  mailboxOf,
  monthKey,
  newShareCode,
  normalizeShareCode,
  REFERRAL_BURST,
  REFERRAL_CLAIM_WINDOW_MS,
  REFERRAL_ROWS,
  type ReferralFlag,
  type ReferralState,
  type ReferralVoidReason,
} from '../../referral-rules.js'
import { sha256Hex } from '../../tokens.js'
import type { Doc } from './_generated/dataModel.js'
import { internalMutation, mutation, type MutationCtx, query, type QueryCtx } from './_generated/server.js'
import { vReferralTerms } from './schema.js'
import { keepWake } from './wake.js'
import { attributeReferral } from './funnel.js'
import { logBackend } from '../../log.js'

/**
 * The referral program: the component's half. Codes are program-wide: an
 * account's code and a waitlist entry's are one kind, made on first ask,
 * and an entry's moves to the account it becomes. A referral is claimed by
 * the account the code brought (an explicit claim, with nothing stored on
 * the device), starts its hold with the referred person's first paid order,
 * and is rewarded when the hold ends, unless a refund voided it first.
 * Caps are two counters (`referrer:<id>`, `month:<YYYY-MM>`) reserved
 * before a reward is granted, so a grant that stops half way resumes with
 * its slot and a voided one gives it back.
 *
 * The rewards themselves are the billing provider's (a discount at
 * checkout, a pack claimed at no cost, a moved renewal date, a plan pass),
 * granted by the app (`setupReferrals`), which calls these functions. They
 * are `public` component functions, reachable only through the parent app.
 */

type Referral = Doc<'referrals'>

/** The most rows a read of a person's or a code's referrals looks at. */
const READ_MAX = 500
/** The top referrers the admin console lists, and the tallies it reads to find them (the most rewarded, then the most referrals). */
const TOP_REFERRERS = 10
const TOP_READ = 50
/** The most referrals one sweep hands the app. */
const SWEEP_BATCH = 25

/** Whether a referral's reward waits for an administrator: it is flagged, and nobody released it. */
const inReview = (row: Pick<Referral, 'flags' | 'released'>): boolean => Boolean(row.flags?.length) && row.released !== true

/** Whether a referral's first payment was counted already: capped, or closed with no reward. A later order starts nothing. */
const settled = (row: Pick<Referral, 'capped' | 'unrewarded'>): boolean => row.capped === true || row.unrewarded === true

// ── Codes ───────────────────────────────────────────────────────────────

/** A code's row by its normalized code. */
async function rowOfCode(ctx: QueryCtx, code: string): Promise<Doc<'referralCodes'> | null> {
  return await ctx.db.query('referralCodes').withIndex('code', q => q.eq('code', code)).first()
}

/** The code row an owner holds, the oldest when it holds several. */
export async function peekOwnerCode(ctx: QueryCtx, ownerKind: 'user' | 'entry', ownerId: string): Promise<Doc<'referralCodes'> | null> {
  return await rowOfOwner(ctx, ownerKind, ownerId)
}

async function rowOfOwner(ctx: QueryCtx, ownerKind: 'user' | 'entry', ownerId: string): Promise<Doc<'referralCodes'> | null> {
  return await ctx.db.query('referralCodes').withIndex('owner', q => q.eq('ownerKind', ownerKind).eq('ownerId', ownerId)).first()
}

/**
 * An owner's code, made on first ask. A code that collides with another is
 * drawn again (40 bits, so it almost never is).
 *
 * @internal
 */
export async function ensureCode(ctx: MutationCtx, ownerKind: 'user' | 'entry', ownerId: string): Promise<Doc<'referralCodes'>> {
  const held = await rowOfOwner(ctx, ownerKind, ownerId)
  if (held) return held
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newShareCode()
    if (await rowOfCode(ctx, code)) continue
    const id = await ctx.db.insert('referralCodes', { code, ownerKind, ownerId, createdAt: Date.now() })
    return (await ctx.db.get('referralCodes', id))!
  }
  throw backendError('unavailable', { service: 'referrals', reason: 'code_space' }, '[nuxt-backend] referrals: a share code could not be made.')
}

/**
 * The code a waitlist entry holds, handed to the account the address became:
 * the link the person shared before launch keeps working as their referral
 * link. An account that has a code already keeps both.
 *
 * @internal
 */
export async function handCodeToAccount(ctx: MutationCtx, entryId: string, userId: string): Promise<void> {
  const row = await rowOfOwner(ctx, 'entry', entryId)
  if (row) await ctx.db.patch('referralCodes', row._id, { ownerKind: 'user', ownerId: userId })
}

/**
 * Delete a waitlist entry's code with the entry: a code nobody holds
 * resolves to nothing.
 *
 * @internal
 */
export async function dropEntryCode(ctx: MutationCtx, entryId: string): Promise<void> {
  for (const row of await ctx.db.query('referralCodes').withIndex('owner', q => q.eq('ownerKind', 'entry').eq('ownerId', entryId)).take(5)) {
    await ctx.db.delete('referralCodes', row._id)
  }
}

/**
 * The owner a code names, as the waitlist's boost reads it: the code
 * folded to its normal form, then its row. `null` for input that can be no
 * code and for a code nobody holds.
 *
 * @internal
 */
export async function ownerOfCode(ctx: QueryCtx, input: string): Promise<{ ownerKind: 'user' | 'entry', ownerId: string } | null> {
  const code = normalizeShareCode(input)
  const row = code ? await rowOfCode(ctx, code) : null
  return row ? { ownerKind: row.ownerKind, ownerId: row.ownerId } : null
}

/** A person's code, made on first ask. */
export const codeFor = mutation({
  args: { userId: v.string() },
  returns: v.object({ code: v.string(), sharePages: v.boolean() }),
  handler: async (ctx, { userId }) => {
    const row = await ensureCode(ctx, 'user', userId)
    return { code: row.code, sharePages: row.sharePages !== false }
  },
})

/** A person's code if they have one, without making it: what a read-only caller (a share page's query) sees. */
export const peekCode = query({
  args: { userId: v.string() },
  returns: v.union(v.null(), v.object({ code: v.string(), sharePages: v.boolean() })),
  handler: async (ctx, { userId }) => {
    const row = await rowOfOwner(ctx, 'user', userId)
    return row ? { code: row.code, sharePages: row.sharePages !== false } : null
  },
})

/** The owner's choice: whether their share pages carry their code. */
export const setSharing = mutation({
  args: { userId: v.string(), share: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { userId, share }) => {
    const row = await ensureCode(ctx, 'user', userId)
    await ctx.db.patch('referralCodes', row._id, { sharePages: share })
    return null
  },
})

/** What a visitor sees of a code before claiming it: the inviter's first name, when the code is an account's. */
export const preview = query({
  args: { code: v.string() },
  returns: v.union(v.null(), v.object({ inviter: v.union(v.null(), v.string()) })),
  handler: async (ctx, { code: input }) => {
    const code = normalizeShareCode(input)
    const row = code ? await rowOfCode(ctx, code) : null
    if (!row || row.ownerKind !== 'user') return null
    const id = ctx.db.normalizeId('user', row.ownerId)
    const user = id ? await ctx.db.get('user', id) : null
    if (!user || user.banned) return null
    const first = user.name.trim().split(/\s+/)[0] ?? ''
    return { inviter: first.length > 0 && first.length <= 40 ? first : null }
  },
})

// ── Fraud checks ────────────────────────────────────────────────────────

/** Whether two accounts have opened sessions from one network and one browser. */
async function shareNetwork(ctx: QueryCtx, a: string, b: string): Promise<boolean> {
  const seen = async (userId: string) => (await ctx.db.query('session').withIndex('userId', q => q.eq('userId', userId)).order('desc').take(30))
    .flatMap(row => (row.ipAddress && row.userAgent ? [`${row.ipAddress}\n${row.userAgent}`] : []))
  const theirs = new Set(await seen(a))
  return (await seen(b)).some(fingerprint => theirs.has(fingerprint))
}

/** The flags a pair of accounts raise, with the burst read for them: not refusals, a reason for an administrator to look. */
async function flagsOf(ctx: QueryCtx, referral: Pick<Referral, 'referrerId' | 'referredId'>, burst: boolean): Promise<ReferralFlag[]> {
  const flags: ReferralFlag[] = []
  if (await shareNetwork(ctx, referral.referrerId, referral.referredId)) flags.push('same_network')
  if (burst) flags.push('burst')
  return flags
}

/** At a claim: the claims on its code in the hour before it already make a burst. */
async function burstBefore(ctx: QueryCtx, code: string, now: number): Promise<boolean> {
  const recent = await ctx.db.query('referrals').withIndex('code_claimedAt', q => q.eq('code', code).gt('claimedAt', now - REFERRAL_BURST.windowMs)).take(REFERRAL_BURST.count + 1)
  return recent.length >= REFERRAL_BURST.count
}

/**
 * At a payment: the referral's own claim is one of a burst, some hour
 * around it holding `REFERRAL_BURST.count` claims on its code, itself
 * among them. Read around the claim, never the hour before the payment, so
 * a burst the claim was no part of flags nothing, and one it was part of
 * still does however late the payment comes. Reads at most four times the
 * count: past that, one side of the claim holds enough for a burst anyway.
 */
async function claimInBurst(ctx: QueryCtx, row: Referral): Promise<boolean> {
  const { count, windowMs } = REFERRAL_BURST
  const near = await ctx.db.query('referrals').withIndex('code_claimedAt', q => q.eq('code', row.code).gt('claimedAt', row.claimedAt - windowMs).lt('claimedAt', row.claimedAt + windowMs)).take(4 * count)
  const times = [...near.filter(other => other._id !== row._id).map(other => other.claimedAt), row.claimedAt].sort((a, b) => a - b)
  for (let start = 0, end = 0; end < times.length; end++) {
    while (times[end]! - times[start]! >= windowMs) start++
    if (end - start + 1 >= count && times[start]! <= row.claimedAt && row.claimedAt <= times[end]!) return true
  }
  return false
}

/** The account of an id, or `null`. */
async function userOf(ctx: QueryCtx, userId: string): Promise<Doc<'user'> | null> {
  const id = ctx.db.normalizeId('user', userId)
  return id ? await ctx.db.get('user', id) : null
}

// ── Claiming ────────────────────────────────────────────────────────────

const vClaimed = v.union(
  v.object({ claimed: v.literal(true), id: v.string(), referrerId: v.string() }),
  v.object({ claimed: v.literal(false), reason: v.union(v.literal('invalid'), v.literal('own_code'), v.literal('already_claimed'), v.literal('too_late'), v.literal('self_referral')) }),
)

/**
 * Claim a code for an account. Never an error for a code that cannot be
 * used: it is ignored (`claimed: false` and why) and the sign-up goes on.
 * The first referral claimed wins; an account older than a day is past
 * attribution; the account's own code, and an address that is the
 * referrer's (plus tags and dots taken out), are refused as self-referral.
 * A referral from one network and browser, or a burst on one code, is
 * recorded and flagged for an administrator.
 */
export const claim = mutation({
  args: { code: v.string(), userId: v.string(), terms: vReferralTerms },
  returns: vClaimed,
  handler: async (ctx, { code: input, userId, terms }) => {
    const code = normalizeShareCode(input)
    const row = code ? await rowOfCode(ctx, code) : null
    if (!code || !row || row.ownerKind !== 'user') return { claimed: false as const, reason: 'invalid' as const }
    if (row.ownerId === userId) return { claimed: false as const, reason: 'own_code' as const }
    if (await ctx.db.query('referrals').withIndex('referredId', q => q.eq('referredId', userId)).first()) return { claimed: false as const, reason: 'already_claimed' as const }
    const [referred, referrer] = await Promise.all([userOf(ctx, userId), userOf(ctx, row.ownerId)])
    const now = Date.now()
    if (!referred || !referrer || referrer.banned) return { claimed: false as const, reason: 'invalid' as const }
    if (now - referred.createdAt > REFERRAL_CLAIM_WINDOW_MS) return { claimed: false as const, reason: 'too_late' as const }
    if (mailboxOf(referred.email) === mailboxOf(referrer.email)) return { claimed: false as const, reason: 'self_referral' as const }
    // A mailbox is referred once: an account erased and made again with the address claims nothing.
    const mailbox = await sha256Hex(mailboxOf(referred.email))
    if (await ctx.db.query('referrals').withIndex('mailbox', q => q.eq('mailbox', mailbox)).first()) return { claimed: false as const, reason: 'already_claimed' as const }
    const draft = { code, referrerId: row.ownerId, referredId: userId }
    const flags = await flagsOf(ctx, draft, await burstBefore(ctx, code, now))
    const fields = { ...draft, mailbox, state: 'claimed' as const, terms, claimedAt: now, ...(flags.length ? { flags, review: true } : {}) }
    const id = await ctx.db.insert('referrals', fields)
    // The growth funnel counts the person under the code they came through; a failure there never fails the claim.
    try {
      await attributeReferral(ctx, userId, code)
    }
    catch (error) {
      logBackend('warn', 'funnel.count_failed', 'The growth funnel did not count a referral claim; the referral is recorded.', error)
    }
    await count(ctx, null, { ...fields, _id: id, _creationTime: now })
    return { claimed: true as const, id: id as string, referrerId: row.ownerId }
  },
})

/** What a program promised the person referred at their claim, while they have not paid yet: the checkout reads it. */
export const offerFor = query({
  args: { userId: v.string() },
  returns: v.union(v.null(), v.object({ id: v.string(), discount: v.optional(v.string()), trialDays: v.optional(v.number()) })),
  handler: async (ctx, { userId }) => {
    const row = await ctx.db.query('referrals').withIndex('referredId', q => q.eq('referredId', userId)).first()
    const reward = row?.terms.referred
    if (!row || row.state !== 'claimed' || settled(row) || !reward) return null
    return { id: row._id as string, ...('discount' in reward ? { discount: reward.discount } : { trialDays: reward.trialDays }) }
  },
})

// ── The first payment and the hold ──────────────────────────────────────

/** Whether a person is the entity's owner or a member of it (or the entity is the person's own account): their payment is not a friend's. */
async function belongsTo(ctx: QueryCtx, userId: string, entityId: string): Promise<boolean> {
  if (entityId === userId) return true
  const organizationId = ctx.db.normalizeId('organization', entityId)
  if (!organizationId) return false
  return Boolean(await ctx.db.query('member').withIndex('organizationId_userId', q => q.eq('organizationId', entityId).eq('userId', userId)).first())
}

/**
 * The referred person's first paid order, on the billing entity they pay
 * for: it starts the hold. An order on an entity the referrer belongs to is
 * the same customer paying: the referral is voided as self-referral. The
 * flags are read again, with the sessions the person has opened since and
 * the claims on the code around its own: a flag found now goes back to an
 * administrator, released before or not.
 * Answers when the hold ends, or `null` when the order starts none.
 */
export const orderPaid = mutation({
  args: { ownerId: v.string(), entityId: v.string(), orderId: v.string() },
  returns: v.union(v.null(), v.object({ id: v.string(), holdUntil: v.number() })),
  handler: async (ctx, { ownerId, entityId, orderId }) => {
    const row = await ctx.db.query('referrals').withIndex('referredId', q => q.eq('referredId', ownerId)).first()
    if (!row || row.state !== 'claimed' || settled(row)) return null
    const now = Date.now()
    if (await belongsTo(ctx, row.referrerId, entityId)) {
      await patchReferral(ctx, row, { state: 'voided', voidedAt: now, voidedFor: 'self_referral' satisfies ReferralVoidReason })
      return null
    }
    const known = new Set(row.flags ?? [])
    const found = (await flagsOf(ctx, row, await claimInBurst(ctx, row))).filter(flag => !known.has(flag))
    const flags = [...known, ...new Set(found)]
    const released = row.released === true && found.length === 0
    const review = flags.length > 0 && !released
    const holdUntil = now + row.terms.holdMs
    await patchReferral(ctx, row, {
      state: 'held',
      orderId,
      entityId,
      paidAt: now,
      holdUntil,
      // A reward that waits for an administrator stays out of the sweep's range until it is released.
      dueAt: review ? undefined : holdUntil,
      released: released || undefined,
      review: review || undefined,
      ...(flags.length ? { flags } : {}),
    })
    return { id: row._id as string, holdUntil }
  },
})

/** Give back the slot a referral holds under the caps. */
async function releaseSlot(ctx: MutationCtx, row: Referral): Promise<void> {
  if (!row.reservedMonth) return
  for (const key of [`referrer:${row.referrerId}`, `month:${row.reservedMonth}`]) {
    const counter = await ctx.db.query('referralCounters').withIndex('key', q => q.eq('key', key)).first()
    if (counter) await ctx.db.patch('referralCounters', counter._id, { count: Math.max(0, counter.count - 1) })
  }
  await patchReferral(ctx, row, { reservedMonth: undefined })
}

/** Void a referral that has not been rewarded, giving back its slot. `false` for one already rewarded or voided. */
async function voidRow(ctx: MutationCtx, row: Referral, reason: ReferralVoidReason): Promise<boolean> {
  if (row.state === 'rewarded' || row.state === 'voided') return false
  await releaseSlot(ctx, row)
  await patchReferral(ctx, row, { state: 'voided', voidedAt: Date.now(), voidedFor: reason, review: undefined, dueAt: undefined })
  return true
}

/**
 * The referral's first order was refunded: during the hold it is voided and
 * nobody gets the reward. Answers the referral when it was voided here.
 */
export const orderRefunded = mutation({
  args: { orderId: v.string() },
  returns: v.union(v.null(), v.string()),
  handler: async (ctx, { orderId }) => {
    const row = await ctx.db.query('referrals').withIndex('orderId', q => q.eq('orderId', orderId)).first()
    if (!row) return null
    return (await voidRow(ctx, row, 'refunded')) ? row._id as string : null
  },
})

// ── The reward ──────────────────────────────────────────────────────────

/** A referral as the app grants from it. */
const vDue = v.object({
  state: v.string(),
  id: v.string(),
  referrerId: v.string(),
  referredId: v.string(),
  orderId: v.string(),
  entityId: v.string(),
  terms: vReferralTerms,
  grant: v.optional(v.object({ discountId: v.optional(v.string()), endsAt: v.optional(v.number()), done: v.optional(v.boolean()) })),
})

/** Whether a held referral may be rewarded at `now`: its hold is over and no flag waits for an administrator. */
function rewardable(row: Referral, now: number): boolean {
  return row.state === 'held' && row.holdUntil !== undefined && row.holdUntil <= now && !inReview(row)
}

/** The held referrals the sweep takes up at `now`, the longest due first: a reward waiting for an administrator is out of the range, and a grant that failed is moved later. */
async function dueRows(ctx: QueryCtx, now: number, count: number): Promise<Referral[]> {
  return await ctx.db.query('referrals').withIndex('state_dueAt', q => q.eq('state', 'held').gt('dueAt', 0).lte('dueAt', now)).take(count)
}

/** The referrals whose hold has ended and that may be rewarded, the longest due first. */
export const due = query({
  args: { now: v.number(), limit: v.optional(v.number()) },
  returns: v.object({ ids: v.array(v.string()), more: v.boolean() }),
  handler: async (ctx, { now, limit }) => {
    const cap = Math.min(limit ?? SWEEP_BATCH, SWEEP_BATCH)
    const rows = await dueRows(ctx, now, cap + 1)
    const ready = rows.filter(row => rewardable(row, now))
    return { ids: ready.slice(0, cap).map(row => row._id as string), more: rows.length > cap }
  },
})

/** One referral for a grant. */
export const get = query({
  args: { id: v.string() },
  returns: v.union(v.null(), vDue),
  handler: async (ctx, { id }) => {
    const rowId = ctx.db.normalizeId('referrals', id)
    const row = rowId ? await ctx.db.get('referrals', rowId) : null
    if (!row?.orderId || !row.entityId) return null
    return { id: row._id as string, referrerId: row.referrerId, referredId: row.referredId, orderId: row.orderId, entityId: row.entityId, terms: row.terms, state: row.state, ...(row.grant ? { grant: row.grant } : {}) }
  },
})

/** A counter's value. */
async function counterOf(ctx: QueryCtx, key: string): Promise<Doc<'referralCounters'> | null> {
  return await ctx.db.query('referralCounters').withIndex('key', q => q.eq('key', key)).first()
}

/** Add `by` to a counter (one by default), never below zero. */
async function bump(ctx: MutationCtx, key: string, by = 1): Promise<void> {
  const counter = await counterOf(ctx, key)
  if (counter) await ctx.db.patch('referralCounters', counter._id, { count: Math.max(0, counter.count + by) })
  else if (by > 0) await ctx.db.insert('referralCounters', { key, count: by })
}

/** The total a referral counts in on the admin console: voided, else capped, else its state. */
type TotalKey = 'claimed' | 'held' | 'rewarded' | 'voided' | 'capped'
const totalOf = (row: Pick<Referral, 'state' | 'capped'>): TotalKey => row.state === 'voided' ? 'voided' : row.capped ? 'capped' : row.state

/** The program's total of one kind: a referral state, or `flagged` for the ones waiting for an administrator. */
const totalKey = (key: TotalKey | 'flagged'): string => `total:${key}`

/** A referrer's tally row. */
async function tallyOf(ctx: QueryCtx, referrerId: string): Promise<Doc<'referralTallies'> | null> {
  return await ctx.db.query('referralTallies').withIndex('referrerId', q => q.eq('referrerId', referrerId)).first()
}

/**
 * Keep the console's numbers in step with one referral's change, from
 * `before` (`null`: it is new) to `after` (`null`: it is deleted): the
 * program's totals by state and flagged, and its referrer's tally of
 * referrals (voided ones left out) and rewards. Every write of a referral
 * goes through here, so the totals never need the rows read again.
 */
async function count(ctx: MutationCtx, before: Referral | null, after: Referral | null): Promise<void> {
  const [was, now] = [before && totalOf(before), after && totalOf(after)]
  if (was !== now) {
    if (was) await bump(ctx, totalKey(was), -1)
    if (now) await bump(ctx, totalKey(now))
  }
  const [flaggedBefore, flaggedAfter] = [before?.review === true, after?.review === true]
  if (flaggedBefore !== flaggedAfter) await bump(ctx, totalKey('flagged'), flaggedAfter ? 1 : -1)
  const referrerId = (after ?? before)!.referrerId
  const live = (row: Referral | null) => (row && row.state !== 'voided' ? 1 : 0)
  const paid = (row: Referral | null) => (row?.state === 'rewarded' ? 1 : 0)
  const [referrals, rewarded] = [live(after) - live(before), paid(after) - paid(before)]
  if (referrals === 0 && rewarded === 0) return
  const tally = await tallyOf(ctx, referrerId)
  if (tally) await ctx.db.patch('referralTallies', tally._id, { referrals: Math.max(0, tally.referrals + referrals), rewarded: Math.max(0, tally.rewarded + rewarded) })
  else await ctx.db.insert('referralTallies', { referrerId, referrals: Math.max(0, referrals), rewarded: Math.max(0, rewarded) })
}

/** Change a referral, its totals with it. */
async function patchReferral(ctx: MutationCtx, row: Referral, fields: Partial<Omit<Referral, '_id' | '_creationTime'>>): Promise<void> {
  await ctx.db.patch('referrals', row._id, fields)
  await count(ctx, row, { ...row, ...fields })
}

/**
 * Take the slot a reward needs under the caps, before anything is granted.
 * `grant`: go on (a slot is held, now or from an earlier try that stopped
 * half way); `capped`: the caps are reached, so the referral is recorded
 * and counted with no reward (it reads as `claimed`); `skip`: it is not
 * due, voided already, or waits for an administrator.
 */
export const beginReward = mutation({
  args: { id: v.string(), now: v.number() },
  returns: v.union(v.literal('grant'), v.literal('capped'), v.literal('skip')),
  handler: async (ctx, { id, now }) => {
    const rowId = ctx.db.normalizeId('referrals', id)
    const row = rowId ? await ctx.db.get('referrals', rowId) : null
    if (!row || !rewardable(row, now)) return 'skip'
    if (row.reservedMonth) return 'grant'
    const { perReferrer, perMonth } = row.terms.caps
    const month = monthKey(now)
    const [own, program] = await Promise.all([counterOf(ctx, `referrer:${row.referrerId}`), counterOf(ctx, `month:${month}`)])
    if ((perReferrer !== null && (own?.count ?? 0) >= perReferrer) || (perMonth !== null && (program?.count ?? 0) >= perMonth)) {
      await patchReferral(ctx, row, { state: 'claimed', capped: true, dueAt: undefined })
      return 'capped'
    }
    await bump(ctx, `referrer:${row.referrerId}`)
    await bump(ctx, `month:${month}`)
    await patchReferral(ctx, row, { reservedMonth: month })
    return 'grant'
  },
})

/** Remember how far the referrer's reward got (the discount minted for a pack), so a retry resumes. */
export const noteGrant = mutation({
  args: { id: v.string(), grant: v.object({ discountId: v.optional(v.string()), endsAt: v.optional(v.number()), done: v.optional(v.boolean()) }) },
  returns: v.null(),
  handler: async (ctx, { id, grant }) => {
    const rowId = ctx.db.normalizeId('referrals', id)
    const row = rowId ? await ctx.db.get('referrals', rowId) : null
    if (row) await patchReferral(ctx, row, { grant: { ...row.grant, ...grant } })
    return null
  },
})

/** The reward was granted: the referral is rewarded. Answers `false` for one voided or rewarded meanwhile. */
export const finishReward = mutation({
  args: { id: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { id }) => {
    const rowId = ctx.db.normalizeId('referrals', id)
    const row = rowId ? await ctx.db.get('referrals', rowId) : null
    if (row?.state !== 'held') return false
    await patchReferral(ctx, row, { state: 'rewarded', rewardedAt: Date.now(), dueAt: undefined })
    return true
  },
})

/** Take a held referral up again at `until`, not before: its grant failed, or has to wait. Behind it, the referrals due sooner come first. */
export const deferReward = mutation({
  args: { id: v.string(), until: v.number() },
  returns: v.null(),
  handler: async (ctx, { id, until }) => {
    const rowId = ctx.db.normalizeId('referrals', id)
    const row = rowId ? await ctx.db.get('referrals', rowId) : null
    if (row?.state === 'held' && row.dueAt !== undefined) await patchReferral(ctx, row, { dueAt: until })
    return null
  },
})

/**
 * The hold ended under a program with no referrer reward: the referral is
 * recorded and counted (it reads as `claimed`), with no slot under the caps
 * and nothing that reads as a reward. `false` for one not due.
 */
export const closeUnrewarded = mutation({
  args: { id: v.string(), now: v.number() },
  returns: v.boolean(),
  handler: async (ctx, { id, now }) => {
    const rowId = ctx.db.normalizeId('referrals', id)
    const row = rowId ? await ctx.db.get('referrals', rowId) : null
    if (!row || !rewardable(row, now)) return false
    await releaseSlot(ctx, row)
    await patchReferral(ctx, row, { state: 'claimed', unrewarded: true, dueAt: undefined })
    return true
  },
})

/** Void a referral from the app (the order was found refunded at the end of the hold). */
export const voidReferral = mutation({
  args: { id: v.string(), reason: v.union(v.literal('refunded'), v.literal('administrator'), v.literal('account_erased')) },
  returns: v.boolean(),
  handler: async (ctx, { id, reason }) => {
    const rowId = ctx.db.normalizeId('referrals', id)
    const row = rowId ? await ctx.db.get('referrals', rowId) : null
    return row ? await voidRow(ctx, row, reason) : false
  },
})

// ── Reading ─────────────────────────────────────────────────────────────

const vState = v.union(v.literal('claimed'), v.literal('held'), v.literal('rewarded'), v.literal('voided'))

/** A person's referrals as they read them: counts and each one's state, never who the other person is. */
export const mine = query({
  args: { userId: v.string() },
  returns: v.object({
    claimed: v.number(),
    held: v.number(),
    rewarded: v.number(),
    referrals: v.array(v.object({ id: v.string(), state: vState, claimedAt: v.number(), rewardedAt: v.union(v.null(), v.number()) })),
  }),
  handler: async (ctx, { userId }) => {
    const rows = await ctx.db.query('referrals').withIndex('referrerId_claimedAt', q => q.eq('referrerId', userId)).order('desc').take(READ_MAX)
    const count = (state: ReferralState) => rows.filter(row => row.state === state).length
    return {
      claimed: count('claimed'),
      held: count('held'),
      rewarded: count('rewarded'),
      referrals: rows.slice(0, REFERRAL_ROWS).map(row => ({ id: row._id as string, state: row.state, claimedAt: row.claimedAt, rewardedAt: row.rewardedAt ?? null })),
    }
  },
})

const vConsoleRow = v.object({
  id: v.string(),
  referrerId: v.string(),
  state: vState,
  claimedAt: v.number(),
  paidAt: v.union(v.null(), v.number()),
  holdUntil: v.union(v.null(), v.number()),
  rewardedAt: v.union(v.null(), v.number()),
  flags: v.array(v.string()),
  released: v.boolean(),
  capped: v.boolean(),
  voidedFor: v.union(v.null(), v.string()),
})

const rowOf = (row: Referral) => ({
  id: row._id as string,
  referrerId: row.referrerId,
  state: row.state,
  claimedAt: row.claimedAt,
  paidAt: row.paidAt ?? null,
  holdUntil: row.holdUntil ?? null,
  rewardedAt: row.rewardedAt ?? null,
  flags: row.flags ?? [],
  released: row.released === true,
  capped: row.capped === true,
  voidedFor: row.voidedFor ?? null,
})

/** The referrals view of the admin console: totals, the top referrers, the flagged queue and one referrer's history. */
export const consoleRows = query({
  args: { referrerId: v.optional(v.string()) },
  returns: v.object({
    totals: v.object({ claimed: v.number(), held: v.number(), rewarded: v.number(), voided: v.number(), capped: v.number(), flagged: v.number() }),
    top: v.array(v.object({ referrerId: v.string(), name: v.union(v.null(), v.string()), referrals: v.number(), rewarded: v.number() })),
    flagged: v.array(vConsoleRow),
    history: v.array(vConsoleRow),
  }),
  handler: async (ctx, { referrerId }) => {
    // The flagged queue is read on its own, however old the claim: a flag never drops out of an administrator's reach.
    const flagged = await ctx.db.query('referrals').withIndex('review_claimedAt', q => q.eq('review', true)).order('desc').take(REFERRAL_ROWS)
    // The totals and the tallies are kept on every state change: the whole program, never a window of its newest claims.
    const keys = ['claimed', 'held', 'rewarded', 'voided', 'capped', 'flagged'] as const
    const counts = await Promise.all(keys.map(async key => (await counterOf(ctx, totalKey(key)))?.count ?? 0))
    const totals = Object.fromEntries(keys.map((key, index) => [key, counts[index]!])) as Record<typeof keys[number], number>
    const tallies = await ctx.db.query('referralTallies').withIndex('rewarded_referrals').order('desc').take(TOP_READ)
    const top = await Promise.all(tallies
      .filter(tally => tally.referrals > 0)
      .sort((a, b) => b.rewarded - a.rewarded || b.referrals - a.referrals)
      .slice(0, TOP_REFERRERS)
      .map(async tally => ({ referrerId: tally.referrerId, name: (await userOf(ctx, tally.referrerId))?.name ?? null, referrals: tally.referrals, rewarded: tally.rewarded })))
    const history = referrerId
      ? (await ctx.db.query('referrals').withIndex('referrerId_claimedAt', q => q.eq('referrerId', referrerId)).order('desc').take(REFERRAL_ROWS)).map(rowOf)
      : []
    return { totals, top, flagged: flagged.map(rowOf), history }
  },
})

/** An administrator's decision on a flagged referral: release its reward, or void it. */
export const resolveFlag = mutation({
  args: { id: v.string(), resolution: v.union(v.literal('release'), v.literal('void')) },
  returns: v.boolean(),
  handler: async (ctx, { id, resolution }) => {
    const rowId = ctx.db.normalizeId('referrals', id)
    const row = rowId ? await ctx.db.get('referrals', rowId) : null
    if (!row?.flags?.length || (row.state !== 'claimed' && row.state !== 'held')) return false
    if (resolution === 'void') return await voidRow(ctx, row, 'administrator')
    // A held referral goes back to the sweep, due from the end of its hold.
    await patchReferral(ctx, row, { released: true, review: undefined, ...(row.state === 'held' && row.holdUntil !== undefined ? { dueAt: row.holdUntil } : {}) })
    return true
  },
})

// ── The sweep ───────────────────────────────────────────────────────────

/** Keep the handle the component's sweep wakes the app by. Idempotent. */
export const registerSweep = mutation({
  args: { wake: v.string() },
  returns: v.null(),
  handler: async (ctx, { wake }) => {
    await keepWake(ctx, 'referralSweep', wake)
    return null
  },
})

/**
 * The component's own sweep (crons.ts), hourly: wake the app when a hold has
 * ended. It reads and returns otherwise, and does nothing in an app that
 * never registered a program.
 */
export const sweep = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const row = await ctx.db.query('referralSweep').first()
    if (!row) return null
    const now = Date.now()
    if ((await dueRows(ctx, now, 1)).some(held => rewardable(held, now))) await ctx.scheduler.runAfter(0, row.wake as FunctionHandle<'action', { op: 'sweep' }>, { op: 'sweep' })
    return null
  },
})

// ── Export and erasure ──────────────────────────────────────────────────

/** The most rows an erasure batch touches. */
const FORGET_BATCH = 200

/**
 * The referral program's part of an account's data: its code, the referral
 * that brought it, and the referrals it brought, as states and times (never
 * who the other person is, nor the order).
 *
 * @internal
 */
export async function referralRows(ctx: QueryCtx, userId: string) {
  const code = await rowOfOwner(ctx, 'user', userId)
  const brought = await ctx.db.query('referrals').withIndex('referrerId_claimedAt', q => q.eq('referrerId', userId)).take(READ_MAX)
  const came = await ctx.db.query('referrals').withIndex('referredId', q => q.eq('referredId', userId)).first()
  const own = (row: Referral) => ({
    code: row.code,
    state: row.state,
    claimedAt: row.claimedAt,
    paidAt: row.paidAt ?? null,
    holdUntil: row.holdUntil ?? null,
    rewardedAt: row.rewardedAt ?? null,
    voidedAt: row.voidedAt ?? null,
    voidedFor: row.voidedFor ?? null,
    capped: row.capped === true,
  })
  return {
    referralCode: code ? { code: code.code, sharePages: code.sharePages !== false, createdAt: code.createdAt } : null,
    referredBy: came ? own(came) : null,
    referrals: brought.map(own),
  }
}

/**
 * The referral program's part of an erasure: the account's codes and the
 * referrals it brought are deleted, with its own counter. The referral that
 * brought it stays its referrer's, without the account (voided when it was
 * not rewarded yet): only the digest of its mailbox is left, so the address
 * can't be referred again. A slot under the caps is given back only for a
 * reward not granted: one paid out stays counted. `true` while rows are
 * left.
 *
 * @internal
 */
export async function forgetReferrals(ctx: MutationCtx, userId: string): Promise<boolean> {
  let left = FORGET_BATCH
  for (const row of await ctx.db.query('referralCodes').withIndex('owner', q => q.eq('ownerKind', 'user').eq('ownerId', userId)).take(left)) {
    await ctx.db.delete('referralCodes', row._id)
    left--
  }
  const came = await ctx.db.query('referrals').withIndex('referredId', q => q.eq('referredId', userId)).first()
  if (came && left > 0) {
    await voidRow(ctx, came, 'account_erased')
    await patchReferral(ctx, came, { referredId: '', orderId: undefined, entityId: undefined })
    left--
  }
  for (const row of await ctx.db.query('referrals').withIndex('referrerId_claimedAt', q => q.eq('referrerId', userId)).take(Math.max(left, 1))) {
    if (left <= 0) break
    if (row.state !== 'rewarded') await releaseSlot(ctx, row)
    await ctx.db.delete('referrals', row._id)
    await count(ctx, row, null)
    left--
  }
  if (left <= 0) return true
  const own = await counterOf(ctx, `referrer:${userId}`)
  if (own) await ctx.db.delete('referralCounters', own._id)
  const tally = await tallyOf(ctx, userId)
  if (tally) await ctx.db.delete('referralTallies', tally._id)
  return false
}
