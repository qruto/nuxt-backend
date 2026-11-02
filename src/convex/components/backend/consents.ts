import { v } from 'convex/values'
import type { Doc } from './_generated/dataModel.js'
import { mutation, type MutationCtx, query, type QueryCtx } from './_generated/server.js'
import type { ConsentDecision } from '../../consent-rules.js'
import { addressDigest } from '../../waitlist-rules.js'
import { vConsent } from './schema.js'

/**
 * The consent ledger: the component's half. One row per decision, a grant or
 * a withdrawal, of one kind at one version, from one place, and never an
 * overwrite, so the history stays readable and the export can show it. A row
 * belongs to an account, or, for a decision given before the account existed
 * (the waitlist's launch-news box), to a hash of the address; the rows of an
 * address move to the account when it signs up (`recordSignUp`).
 *
 * `setupAccount` checks every kind against what the app declares and writes
 * through `record`; the reads (`state`, `latest`) answer the latest decision
 * per kind, which the app compares with the latest version it declares.
 */

/** The most rows a read folds into the latest decision per kind: far more than a person holds. */
const ROWS_MAX = 500

/** The most rows an erasure removes in one batch. */
const FORGET_BATCH = 200

/** One decision as it is written. */
const vEntry = v.object({
  kind: v.string(),
  version: v.string(),
  granted: v.boolean(),
  source: v.string(),
  text: v.optional(v.string()),
  /** What the decision came with: `checkout:<id>` for a soft opt-in at checkout. */
  reference: v.optional(v.string()),
})

/** One decision as it is read: the kind's latest. */
const vDecision = v.object({ kind: v.string(), version: v.string(), granted: v.boolean(), at: v.number() })

type Entry = typeof vEntry.type
type Row = Doc<'consents'>

/** Whom a decision belongs to: the account, else a hash of the address. */
type Subject = { userId: string } | { emailHash: string }

/** The subject a call names: the account when it names one, else the address. */
async function subjectOf(userId: string | undefined, email: string | undefined): Promise<Subject | null> {
  if (userId) return { userId }
  return email?.trim() ? { emailHash: await addressDigest(email) } : null
}

/** A subject's rows, newest first, at most {@link ROWS_MAX}. */
async function rowsOf(ctx: QueryCtx, subject: Subject): Promise<Row[]> {
  return 'userId' in subject
    ? await ctx.db.query('consents').withIndex('userId_at', q => q.eq('userId', subject.userId)).order('desc').take(ROWS_MAX)
    : await ctx.db.query('consents').withIndex('emailHash_at', q => q.eq('emailHash', subject.emailHash)).order('desc').take(ROWS_MAX)
}

/** The latest decision per kind, from rows newest first. */
function latestPerKind(rows: readonly Row[]): Map<string, Row> {
  const latest = new Map<string, Row>()
  for (const row of rows) {
    if (!latest.has(row.kind)) latest.set(row.kind, row)
  }
  return latest
}

/** Write decisions for a subject, skipping one that repeats the kind's latest. Answers the ones written. */
export async function recordFor(ctx: MutationCtx, subject: Subject, entries: readonly Entry[], at = Date.now()): Promise<Entry[]> {
  const latest = latestPerKind(await rowsOf(ctx, subject))
  const written: Entry[] = []
  for (const entry of entries) {
    const held = latest.get(entry.kind)
    // The same decision again (the version already granted, or a kind already withdrawn) changes nothing.
    if (held && held.granted === entry.granted && held.version === entry.version) continue
    await ctx.db.insert('consents', { ...subject, kind: entry.kind, version: entry.version, granted: entry.granted, at, source: entry.source, ...(entry.text ? { text: entry.text } : {}), ...(entry.reference ? { reference: entry.reference } : {}) })
    latest.set(entry.kind, { ...subject, kind: entry.kind, version: entry.version, granted: entry.granted, at, source: entry.source } as Row)
    written.push(entry)
  }
  return written
}

/** Write decisions of an address before it has an account (the waitlist's launch-news box). Answers the ones written. */
export async function recordForAddress(ctx: MutationCtx, email: string, entries: readonly Entry[]): Promise<Entry[]> {
  return await recordFor(ctx, { emailHash: await addressDigest(email) }, entries)
}

/** Write decisions of an account, or of an address before it has one. Answers the ones written. */
export const record = mutation({
  args: { userId: v.optional(v.string()), email: v.optional(v.string()), entries: v.array(vEntry) },
  returns: v.array(vEntry),
  handler: async (ctx, { userId, email, entries }) => {
    const subject = await subjectOf(userId, email)
    return subject ? await recordFor(ctx, subject, entries) : []
  },
})

/**
 * An account was created: the decisions its address gave before move to it
 * (the rows keep their time and source), then the entries are written, each
 * unless the kind already stands. Answers what was carried over and what was
 * written.
 */
export const recordSignUp = mutation({
  args: { userId: v.string(), email: v.string(), entries: v.array(vEntry) },
  returns: v.object({ carried: v.array(vDecision), recorded: v.array(vEntry) }),
  handler: async (ctx, { userId, email, entries }) => {
    const emailHash = await addressDigest(email)
    const carried: Array<typeof vDecision.type> = []
    const before = await ctx.db.query('consents').withIndex('emailHash_at', q => q.eq('emailHash', emailHash)).order('asc').take(ROWS_MAX)
    for (const row of before) {
      await ctx.db.patch('consents', row._id, { userId, emailHash: undefined })
      carried.push({ kind: row.kind, version: row.version, granted: row.granted, at: row.at })
    }
    return { carried, recorded: await recordFor(ctx, { userId }, entries) }
  },
})

/** The latest decision of an account for each kind it has one for. */
export const state = query({
  args: { userId: v.string() },
  returns: v.array(vDecision),
  handler: async (ctx, { userId }) => [...latestPerKind(await rowsOf(ctx, { userId })).values()]
    .map(({ kind, version, granted, at }) => ({ kind, version, granted, at })),
})

/** The latest decision of an account for one kind; `null` for a kind it never decided. */
export const latest = query({
  args: { userId: v.string(), kind: v.string() },
  returns: v.union(vDecision, v.null()),
  handler: async (ctx, { userId, kind }): Promise<ConsentDecision & { kind: string } | null> => {
    const row = await ctx.db.query('consents').withIndex('userId_kind_at', q => q.eq('userId', userId).eq('kind', kind)).order('desc').first()
    return row ? { kind: row.kind, version: row.version, granted: row.granted, at: row.at } : null
  },
})

/** Every decision of an account, oldest first: what the export carries and an administrator's tooling reads. */
export const history = query({
  args: { userId: v.string() },
  returns: v.array(vConsent.omit('userId', 'emailHash')),
  handler: async (ctx, { userId }) => await consentRows(ctx, userId),
})

/** Every row of an account as an export carries it, oldest first. */
export async function consentRows(ctx: QueryCtx, userId: string): Promise<Array<Omit<Row, '_id' | '_creationTime' | 'userId' | 'emailHash'>>> {
  return (await rowsOf(ctx, { userId })).reverse().map(({ kind, version, granted, at, source, text, reference }) => ({ kind, version, granted, at, source, ...(text ? { text } : {}), ...(reference ? { reference } : {}) }))
}

/**
 * The ledger's part of an erasure: the rows of the account and of its
 * address, in batches. `true` while rows are left.
 *
 * @internal
 */
export async function forgetConsents(ctx: MutationCtx, { userId, email }: { userId?: string, email?: string }): Promise<boolean> {
  let left = FORGET_BATCH
  const take = async (rows: Row[]) => {
    for (const row of rows) await ctx.db.delete('consents', row._id)
    left -= rows.length
  }
  if (userId) await take(await ctx.db.query('consents').withIndex('userId_at', q => q.eq('userId', userId)).take(left))
  if (email && left > 0) {
    const emailHash = await addressDigest(email)
    await take(await ctx.db.query('consents').withIndex('emailHash_at', q => q.eq('emailHash', emailHash)).take(left))
  }
  return left <= 0
}
