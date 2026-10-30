import { v } from 'convex/values'
import type { Doc, Id } from './_generated/dataModel.js'
import { mutation, type MutationCtx, query, type QueryCtx } from './_generated/server.js'
import { APPEAL_WINDOW_MS } from '../../constants.js'
import { ERASED_PREFIX } from './parties.js'
import { vReportReason } from './schema.js'

/**
 * Content duties: the component's half of `setupAdmin({ reports })`. One
 * row per reported thing of the app's (`reportSubjects`), counting its open
 * reports, with each one-click report and each notice of the public form
 * beside it (`reports`), every decision (`reportDecisions`) and the
 * appeals against them (`reportAppeals`). Every function trusts its caller,
 * the app's `setupAdmin`, which decides who may call it, checks the
 * subject with the app's `describe` and sends the emails. An account's
 * erasure and export read them through `eraseReports` and `reportRows`.
 */

/** The most rows the Reports tab reads of each list. */
export const REPORTS_CONSOLE_ROWS = 100

/** The most reports of one subject the tab tallies. */
const SUBJECT_REPORTS_READ = 200

/** The most open reports one decision closes: the rate limits keep a subject far below it. */
const SUBJECT_CLOSE_MAX = 1000

const vSubject = v.object({ table: v.string(), id: v.string() })
const vNotifier = v.object({ name: v.optional(v.string()), email: v.optional(v.string()), locale: v.optional(v.string()) })
const vCrime = v.object({ at: v.number(), by: v.string(), note: v.optional(v.string()) })

/** A decision's author, or `null` for none or one since erased: nobody to write to. */
function authorOf(decision: Doc<'reportDecisions'>): string | null {
  return decision.authorId && !decision.authorId.startsWith(ERASED_PREFIX) ? decision.authorId : null
}

/** A subject's row, by the app's table and row id. */
function subjectOf(ctx: QueryCtx, subject: { table: string, id: string }): Promise<Doc<'reportSubjects'> | null> {
  return ctx.db.query('reportSubjects').withIndex('table_subjectId', q => q.eq('table', subject.table).eq('subjectId', subject.id)).unique()
}

/** The subject's row, made or reopened for a new report. */
async function openSubject(ctx: MutationCtx, subject: { table: string, id: string }): Promise<Doc<'reportSubjects'>> {
  const now = Date.now()
  const row = await subjectOf(ctx, subject)
  if (!row) {
    const id = await ctx.db.insert('reportSubjects', { table: subject.table, subjectId: subject.id, status: 'open', open: 0, updatedAt: now })
    return (await ctx.db.get('reportSubjects', id))!
  }
  if (row.status !== 'open') await reopen(ctx, row, now)
  return (await ctx.db.get('reportSubjects', row._id))!
}

/** Reopen a decided subject, counting the reports still open on it and the clock of its oldest intimate-image request. */
async function reopen(ctx: MutationCtx, row: Doc<'reportSubjects'>, now: number): Promise<void> {
  const open = await ctx.db.query('reports').withIndex('subject_status', q => q.eq('subject', row._id).eq('status', 'open')).take(SUBJECT_CLOSE_MAX)
  const intimate = open.filter(report => report.reason === 'intimate').map(report => report.createdAt)
  await ctx.db.patch('reportSubjects', row._id, { status: 'open', open: open.length, intimateAt: intimate.length ? Math.min(...intimate) : undefined, updatedAt: now })
}

/** Count one more open report on a subject, starting the 48-hour clock for an intimate-image request. */
async function countReport(ctx: MutationCtx, row: Doc<'reportSubjects'>, reason: string, at: number): Promise<void> {
  await ctx.db.patch('reportSubjects', row._id, {
    open: row.open + 1,
    updatedAt: at,
    ...(reason === 'intimate' && row.intimateAt === undefined ? { intimateAt: at } : {}),
  })
}

/**
 * A signed-in person's report: one open report per person and subject, so
 * a second report of the same thing updates the first.
 */
export const fileReport = mutation({
  args: { subject: vSubject, reporterId: v.string(), reason: vReportReason, details: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { subject, reporterId, reason, details }) => {
    const row = await openSubject(ctx, subject)
    const now = Date.now()
    const mine = await ctx.db.query('reports').withIndex('reporterId_subject_status', q => q.eq('reporterId', reporterId).eq('subject', row._id).eq('status', 'open')).first()
    if (mine) {
      await ctx.db.patch('reports', mine._id, { reason, details })
      if (reason === 'intimate' && row.intimateAt === undefined) await ctx.db.patch('reportSubjects', row._id, { intimateAt: now })
      return null
    }
    await ctx.db.insert('reports', { subject: row._id, kind: 'report', reason, ...(details ? { details } : {}), reporterId, status: 'open', createdAt: now })
    await countReport(ctx, row, reason, now)
    return null
  },
})

/** The open notices on their own that name a subject: the ones its decision closes. */
function hintedNotices(ctx: QueryCtx, subject: { table: string, id: string }): Promise<Doc<'reports'>[]> {
  return ctx.db.query('reports').withIndex('hint_status', q => q.eq('hint.table', subject.table).eq('hint.id', subject.id).eq('status', 'open')).take(SUBJECT_CLOSE_MAX)
}

/**
 * A notice from the public form. The subject it names comes from anyone, so
 * it is not trusted to make a subject: the notice joins one someone reported
 * before (checked then), and otherwise waits on its own with the subject as
 * its hint, for the app's `describe` to place. Returns its id.
 */
export const fileNotice = mutation({
  args: {
    subject: v.optional(vSubject),
    url: v.string(),
    reason: vReportReason,
    details: v.string(),
    notifier: vNotifier,
    signature: v.optional(v.string()),
  },
  returns: v.string(),
  handler: async (ctx, { subject, url, reason, details, notifier, signature }) => {
    const now = Date.now()
    const row = subject && await subjectOf(ctx, subject) ? await openSubject(ctx, subject) : null
    const id = await ctx.db.insert('reports', {
      ...(row ? { subject: row._id } : subject ? { hint: subject } : {}),
      kind: 'notice',
      reason,
      details,
      url,
      notifier,
      ...(signature ? { signature } : {}),
      status: 'open',
      createdAt: now,
    })
    if (row) await countReport(ctx, row, reason, now)
    return id
  },
})

/** One report or notice as the Reports tab shows it: never who sent a one-click report. */
function reportView(row: Doc<'reports'>) {
  return {
    id: row._id as string,
    kind: row.kind,
    reason: row.reason,
    details: row.details ?? null,
    url: row.url ?? null,
    notifier: row.kind === 'notice' ? { name: row.notifier?.name ?? null, email: row.notifier?.email ?? null } : null,
    signature: row.signature ?? null,
    crime: row.crime ?? null,
    createdAt: row.createdAt,
  }
}

const vReportView = v.object({
  id: v.string(),
  kind: v.union(v.literal('report'), v.literal('notice')),
  reason: vReportReason,
  details: v.union(v.string(), v.null()),
  url: v.union(v.string(), v.null()),
  notifier: v.union(v.object({ name: v.union(v.string(), v.null()), email: v.union(v.string(), v.null()) }), v.null()),
  signature: v.union(v.string(), v.null()),
  crime: v.union(vCrime, v.null()),
  createdAt: v.number(),
})

/** A notice on its own as the Reports tab shows it, with the subject it names for the app to check. */
const vUnplacedView = vReportView.extend({ hint: v.union(vSubject, v.null()) })

/**
 * The open notices nobody placed on a subject yet: intimate-image removal
 * requests oldest first, read on their own so no other notices crowd their
 * 48-hour clocks out, then the newest of the rest.
 */
async function unplacedRows(ctx: QueryCtx): Promise<Doc<'reports'>[]> {
  const intimate = await ctx.db.query('reports').withIndex('kind_status_subject_reason', q => q.eq('kind', 'notice').eq('status', 'open').eq('subject', undefined).eq('reason', 'intimate')).take(REPORTS_CONSOLE_ROWS)
  const newest = await ctx.db.query('reports').withIndex('kind_status_subject', q => q.eq('kind', 'notice').eq('status', 'open').eq('subject', undefined)).order('desc').take(REPORTS_CONSOLE_ROWS)
  const seen = new Set(intimate.map(row => row._id))
  return [...intimate, ...newest.filter(row => !seen.has(row._id))]
}

/** The links of the open notices on their own, for the app's `locate` to place on the subject it decides. */
export const unplacedNotices = query({
  args: {},
  returns: v.array(v.object({ id: v.string(), url: v.union(v.string(), v.null()) })),
  handler: async ctx => (await unplacedRows(ctx)).map(row => ({ id: row._id as string, url: row.url ?? null })),
})

/** A subject's open reports, newest first, and the reasons they give, tallied. */
async function subjectReports(ctx: QueryCtx, subject: Id<'reportSubjects'>) {
  const rows = await ctx.db.query('reports').withIndex('subject_status', q => q.eq('subject', subject).eq('status', 'open')).order('desc').take(SUBJECT_REPORTS_READ)
  const reasons: Record<string, number> = {}
  for (const row of rows) reasons[row.reason] = (reasons[row.reason] ?? 0) + 1
  return { reasons, notices: rows.filter(row => row.kind === 'notice').map(reportView) }
}

/**
 * The Reports tab: the open subjects (intimate-image requests first, by
 * their clock, then the most reported), the open notices the app could not
 * place on a subject, and the open appeals.
 */
export const reportsConsole = query({
  args: {},
  returns: v.object({
    subjects: v.array(v.object({
      table: v.string(),
      id: v.string(),
      open: v.number(),
      reasons: v.record(v.string(), v.number()),
      notices: v.array(vReportView),
      intimateAt: v.union(v.number(), v.null()),
      crime: v.union(vCrime, v.null()),
      updatedAt: v.number(),
    })),
    notices: v.array(vUnplacedView),
    appeals: v.array(v.object({
      id: v.string(),
      text: v.string(),
      createdAt: v.number(),
      decision: v.object({ action: v.union(v.literal('hidden'), v.literal('dismissed')), reason: v.string(), at: v.number(), authorId: v.union(v.string(), v.null()) }),
      subject: v.union(vSubject, v.null()),
    })),
  }),
  handler: async (ctx) => {
    const clocked = await ctx.db.query('reportSubjects').withIndex('status_intimateAt', q => q.eq('status', 'open').gt('intimateAt', 0)).take(REPORTS_CONSOLE_ROWS)
    const reported = await ctx.db.query('reportSubjects').withIndex('status_open', q => q.eq('status', 'open')).order('desc').take(REPORTS_CONSOLE_ROWS)
    const seen = new Set<string>()
    const subjects = []
    for (const row of [...clocked, ...reported]) {
      if (seen.has(row._id) || subjects.length >= REPORTS_CONSOLE_ROWS || row.open === 0) continue
      seen.add(row._id)
      const { reasons, notices } = await subjectReports(ctx, row._id)
      subjects.push({ table: row.table, id: row.subjectId, open: row.open, reasons, notices, intimateAt: row.intimateAt ?? null, crime: row.crime ?? null, updatedAt: row.updatedAt })
    }
    const unplaced = await unplacedRows(ctx)
    const appeals = []
    for (const appeal of await ctx.db.query('reportAppeals').withIndex('status', q => q.eq('status', 'open')).take(REPORTS_CONSOLE_ROWS)) {
      const decision = await ctx.db.get('reportDecisions', appeal.decision)
      if (!decision) continue
      const subject = decision.subject ? await ctx.db.get('reportSubjects', decision.subject) : null
      appeals.push({
        id: appeal._id as string,
        text: appeal.text ?? '',
        createdAt: appeal.createdAt,
        decision: { action: decision.action, reason: decision.reason, at: decision.at, authorId: authorOf(decision) },
        subject: subject ? { table: subject.table, id: subject.subjectId } : null,
      })
    }
    return { subjects, notices: unplaced.map(row => ({ ...reportView(row), hint: row.hint ?? null })), appeals }
  },
})

/** What a decision's emails need: each notifier with an address, and whether an intimate-image request was among them. */
const vDecided = v.object({
  decisionId: v.string(),
  reports: v.number(),
  notifiers: v.array(v.object({ email: v.string(), name: v.optional(v.string()), locale: v.optional(v.string()), url: v.optional(v.string()) })),
  intimate: v.boolean(),
  notice: v.boolean(),
})

/** Close a list of open reports with an outcome; answers what their emails need. */
async function closeReports(ctx: MutationCtx, rows: Doc<'reports'>[], outcome: 'hidden' | 'dismissed', at: number) {
  for (const row of rows) await ctx.db.patch('reports', row._id, { status: 'closed', outcome, closedAt: at })
  return {
    notifiers: rows.flatMap(notifierOf),
    intimate: rows.some(row => row.reason === 'intimate'),
    notice: rows.some(row => row.kind === 'notice'),
  }
}

/** Who to tell a notice's outcome: its notifier, when they gave an address. */
function notifierOf(row: Doc<'reports'>): Array<{ email: string, name?: string, locale?: string, url?: string }> {
  const { email, name, locale } = row.notifier ?? {}
  if (!email) return []
  return [{ email, ...(name ? { name } : {}), ...(locale ? { locale } : {}), ...(row.url ? { url: row.url } : {}) }]
}

/** An open notice nobody placed on a thing yet, by its id; `null` for anything else. */
async function unplacedNotice(ctx: QueryCtx, notice: string): Promise<Doc<'reports'> | null> {
  const id = ctx.db.normalizeId('reports', notice)
  const row = id ? await ctx.db.get('reports', id) : null
  return row?.kind === 'notice' && row.status === 'open' && !row.subject ? row : null
}

/** A decision as it is kept. */
type DecisionFields = Pick<Doc<'reportDecisions'>, 'action' | 'reason' | 'ground' | 'by' | 'at' | 'authorId' | 'appealTokenHash'>

/**
 * Decide a subject: close its open reports, the notices on their own that
 * name it and the ones the app placed on it, keep the decision, and mark
 * the subject decided.
 */
async function decideSubject(ctx: MutationCtx, subject: { table: string, id: string }, notices: string[], decision: DecisionFields) {
  const placed = (await hintedNotices(ctx, subject)).filter(row => !row.subject)
  for (const id of notices.slice(0, 100)) {
    const found = await unplacedNotice(ctx, id)
    if (found && !placed.some(row => row._id === found._id)) placed.push(found)
  }
  const row = await subjectOf(ctx, subject) ?? (placed.length ? await openSubject(ctx, subject) : null)
  if (!row) return null
  const open = await ctx.db.query('reports').withIndex('subject_status', q => q.eq('subject', row._id).eq('status', 'open')).take(SUBJECT_CLOSE_MAX)
  for (const found of placed) {
    await ctx.db.patch('reports', found._id, { subject: row._id })
    open.push(found)
  }
  const closed = await closeReports(ctx, open, decision.action, decision.at)
  const decisionId = await ctx.db.insert('reportDecisions', { subject: row._id, ...decision })
  await ctx.db.patch('reportSubjects', row._id, { status: decision.action, open: 0, intimateAt: undefined, decisionId, updatedAt: decision.at })
  return { decisionId: decisionId as string, reports: open.length, ...closed }
}

/**
 * Decide a subject, or a notice the app could not place: close its open
 * reports, keep the decision (with its appeal link's token hash, when it
 * restricted something), and answer who to tell.
 */
export const decide = mutation({
  args: {
    subject: v.optional(vSubject),
    notice: v.optional(v.string()),
    /** Open notices sent without their thing that the app placed on this one: closed with it. */
    notices: v.optional(v.array(v.string())),
    action: v.union(v.literal('hidden'), v.literal('dismissed')),
    reason: v.string(),
    ground: v.union(v.literal('illegal'), v.literal('terms')),
    by: v.string(),
    authorId: v.optional(v.string()),
    appealTokenHash: v.optional(v.string()),
  },
  returns: v.union(vDecided, v.null()),
  handler: async (ctx, { subject, notice, notices, action, reason, ground, by, authorId, appealTokenHash }) => {
    const at = Date.now()
    if (subject) return decideSubject(ctx, subject, notices ?? [], { action, reason, ground, by, at, ...(authorId ? { authorId } : {}), ...(appealTokenHash ? { appealTokenHash } : {}) })
    const row = notice ? await unplacedNotice(ctx, notice) : null
    if (!row) return null
    const closed = await closeReports(ctx, [row], action, at)
    const decisionId = await ctx.db.insert('reportDecisions', { notice: row._id, action, reason, ground, by, at })
    return { decisionId, reports: 1, ...closed }
  },
})

/** Flag a subject or a notice as a suspected crime that threatens someone's life or safety (DSA Art. 18). Answers whether one was found. */
export const flagCrime = mutation({
  args: { subject: v.optional(vSubject), notice: v.optional(v.string()), by: v.string(), note: v.optional(v.string()) },
  returns: v.boolean(),
  handler: async (ctx, { subject, notice, by, note }) => {
    const crime = { at: Date.now(), by, ...(note ? { note } : {}) }
    if (subject) {
      const row = await subjectOf(ctx, subject)
      if (row) {
        await ctx.db.patch('reportSubjects', row._id, { crime, updatedAt: crime.at })
        return true
      }
      // A subject only notices on their own name: the flag goes on each of them.
      const hinted = (await hintedNotices(ctx, subject)).filter(notice => !notice.subject)
      for (const notice of hinted) await ctx.db.patch('reports', notice._id, { crime })
      return hinted.length > 0
    }
    const id = notice ? ctx.db.normalizeId('reports', notice) : null
    const row = id ? await ctx.db.get('reports', id) : null
    if (!row) return false
    await ctx.db.patch('reports', row._id, { crime })
    return true
  },
})

const vAppealable = v.object({
  decisionId: v.string(),
  action: v.union(v.literal('hidden'), v.literal('dismissed')),
  reason: v.string(),
  ground: v.union(v.literal('illegal'), v.literal('terms')),
  at: v.number(),
  until: v.number(),
  subject: v.union(vSubject, v.null()),
  authorId: v.union(v.string(), v.null()),
  appeal: v.union(v.object({ status: v.union(v.literal('open'), v.literal('upheld'), v.literal('reversed')), createdAt: v.number(), reason: v.union(v.string(), v.null()) }), v.null()),
})

/** A decision by its appeal token's hash, with its appeal; `null` for a hash no decision has. */
export const appealOf = query({
  args: { tokenHash: v.string() },
  returns: v.union(vAppealable, v.null()),
  handler: async (ctx, { tokenHash }) => {
    const decision = await ctx.db.query('reportDecisions').withIndex('appealTokenHash', q => q.eq('appealTokenHash', tokenHash)).unique()
    if (!decision) return null
    const subject = decision.subject ? await ctx.db.get('reportSubjects', decision.subject) : null
    const appeal = await ctx.db.query('reportAppeals').withIndex('decision', q => q.eq('decision', decision._id)).order('desc').first()
    return {
      decisionId: decision._id as string,
      action: decision.action,
      reason: decision.reason,
      ground: decision.ground,
      at: decision.at,
      until: decision.at + APPEAL_WINDOW_MS,
      subject: subject ? { table: subject.table, id: subject.subjectId } : null,
      authorId: authorOf(decision),
      appeal: appeal ? { status: appeal.status, createdAt: appeal.createdAt, reason: appeal.reason ?? null } : null,
    }
  },
})

/**
 * Appeal a decision by its token's hash: one appeal per decision, within
 * six months of it. Answers `appealed`, or why not.
 */
export const fileAppeal = mutation({
  args: { tokenHash: v.string(), text: v.string() },
  returns: v.union(v.literal('appealed'), v.literal('unknown'), v.literal('expired'), v.literal('appealed_already')),
  handler: async (ctx, { tokenHash, text }) => {
    const decision = await ctx.db.query('reportDecisions').withIndex('appealTokenHash', q => q.eq('appealTokenHash', tokenHash)).unique()
    if (!decision) return 'unknown'
    const now = Date.now()
    if (now > decision.at + APPEAL_WINDOW_MS) return 'expired'
    if (await ctx.db.query('reportAppeals').withIndex('decision', q => q.eq('decision', decision._id)).first()) return 'appealed_already'
    await ctx.db.insert('reportAppeals', { decision: decision._id, text, status: 'open', createdAt: now })
    return 'appealed'
  },
})

/**
 * Whether the subject was reported or hidden again since a decision: a
 * reversal of it then leaves the content as it is, for those to decide.
 */
async function actedOnSince(ctx: QueryCtx, subject: Doc<'reportSubjects'> | null, decision: Doc<'reportDecisions'>): Promise<boolean> {
  if (!subject) return false
  if (subject.status === 'open') return true
  if (!subject.decisionId || subject.decisionId === decision._id) return false
  return (await ctx.db.get('reportDecisions', subject.decisionId))?.action === 'hidden'
}

/**
 * Decide an open appeal: `upheld` keeps the decision, `reversed` reopens
 * nothing but marks the subject decided the other way, while the decision
 * is its latest and nothing reopened it. Reversing a removal lifts the
 * block it put on its files' bytes, unless the subject was reported or
 * hidden again since. Answers what the app needs to restore the content
 * and tell the author; `null` for an appeal that is not open.
 */
export const decideAppeal = mutation({
  args: { appeal: v.string(), outcome: v.union(v.literal('upheld'), v.literal('reversed')), reason: v.string(), by: v.string() },
  returns: v.union(v.object({
    action: v.union(v.literal('hidden'), v.literal('dismissed')),
    subject: v.union(vSubject, v.null()),
    authorId: v.union(v.string(), v.null()),
    /** Whether the app shows the content again: a removal reversed, and nothing reported or hidden since. */
    restore: v.boolean(),
  }), v.null()),
  handler: async (ctx, { appeal: appealId, outcome, reason, by }) => {
    const id = ctx.db.normalizeId('reportAppeals', appealId)
    const appeal = id ? await ctx.db.get('reportAppeals', id) : null
    if (!appeal || appeal.status !== 'open') return null
    const decision = await ctx.db.get('reportDecisions', appeal.decision)
    if (!decision) return null
    const now = Date.now()
    await ctx.db.patch('reportAppeals', appeal._id, { status: outcome, reason, by, closedAt: now })
    const subject = decision.subject ? await ctx.db.get('reportSubjects', decision.subject) : null
    const reversed = outcome === 'reversed'
    if (subject && reversed && subject.decisionId === decision._id && subject.status !== 'open') {
      await ctx.db.patch('reportSubjects', subject._id, { status: decision.action === 'hidden' ? 'dismissed' : 'hidden', updatedAt: now })
    }
    const restore = reversed && decision.action === 'hidden' && !await actedOnSince(ctx, subject, decision)
    if (restore) {
      for (const blocked of await ctx.db.query('blockedFiles').withIndex('decision', q => q.eq('decision', decision._id)).take(100)) await ctx.db.delete('blockedFiles', blocked._id)
    }
    return { action: decision.action, subject: subject ? { table: subject.table, id: subject.subjectId } : null, authorId: authorOf(decision), restore }
  },
})

// ── Erasure and export ─────────────────────────────────────────

/** The most appeals of one decision an erasure reads: `fileAppeal` lets one through. */
const DECISION_APPEALS_MAX = 10

/** The most reports, and the most decisions, an export lists. */
const EXPORT_ROWS_MAX = 200

/**
 * An account's part of an erasure, or an address's, one batch of at most
 * `budget` writes. A report, a notice, a decision with its statement of
 * reasons and an appeal's outcome stay, as the record a host answers for,
 * and lose the person:
 * - a notice sent from the address loses its notifier (name, address,
 *   language) and its signature; its reason, link and text stay, for the
 *   decision that rests on them;
 * - a report the account made in a click names the pseudonym, and loses
 *   its text;
 * - a decision on content it wrote names the pseudonym as the author, and
 *   the appeal against it loses its text;
 * - what it decided, flagged or answered as an administrator names the
 *   pseudonym.
 *
 * A removed image's hash names nobody, and stays. A rewritten row leaves
 * the index the next read starts from, so each batch reads from the start.
 * `true` while rows may be left.
 *
 * @internal
 */
export async function eraseReports(ctx: MutationCtx, { userId, email, alias }: { userId?: string, email?: string, alias: string }, budget: number): Promise<boolean> {
  let left = budget
  /** Rewrite each row a read yields while the batch lasts. */
  const rewrite = async <Row>(read: (take: number) => Promise<Row[]>, patch: (row: Row) => Promise<void>): Promise<void> => {
    if (left <= 0) return
    for (const row of await read(left)) {
      await patch(row)
      left--
    }
  }
  if (email) {
    await rewrite(take => ctx.db.query('reports').withIndex('notifierEmail', q => q.eq('notifier.email', email)).take(take), row => ctx.db.patch('reports', row._id, { notifier: undefined, signature: undefined }))
  }
  if (!userId) return left <= 0
  await rewrite(take => ctx.db.query('reports').withIndex('reporterId_subject_status', q => q.eq('reporterId', userId)).take(take), row => ctx.db.patch('reports', row._id, { reporterId: alias, details: undefined }))
  // The decisions on content it wrote: the appeal's text goes first, while the decision still names the author.
  await rewrite(take => ctx.db.query('reportDecisions').withIndex('authorId', q => q.eq('authorId', userId)).take(take), async (decision) => {
    for (const appeal of await ctx.db.query('reportAppeals').withIndex('decision', q => q.eq('decision', decision._id)).take(DECISION_APPEALS_MAX)) {
      if (appeal.text === undefined) continue
      await ctx.db.patch('reportAppeals', appeal._id, { text: undefined })
      left--
    }
    await ctx.db.patch('reportDecisions', decision._id, { authorId: alias })
  })
  // What it did as an administrator.
  await rewrite(take => ctx.db.query('reportDecisions').withIndex('by', q => q.eq('by', userId)).take(take), row => ctx.db.patch('reportDecisions', row._id, { by: alias }))
  await rewrite(take => ctx.db.query('reportAppeals').withIndex('by', q => q.eq('by', userId)).take(take), row => ctx.db.patch('reportAppeals', row._id, { by: alias }))
  await rewrite(take => ctx.db.query('reportSubjects').withIndex('crimeBy', q => q.eq('crime.by', userId)).take(take), row => ctx.db.patch('reportSubjects', row._id, { crime: { ...row.crime!, by: alias } }))
  await rewrite(take => ctx.db.query('reports').withIndex('crimeBy', q => q.eq('crime.by', userId)).take(take), row => ctx.db.patch('reports', row._id, { crime: { ...row.crime!, by: alias } }))
  return left <= 0
}

/** A subject's table and row id, for an export; `null` for none. */
async function subjectKey(ctx: QueryCtx, subject: Id<'reportSubjects'> | undefined): Promise<{ table: string, id: string } | null> {
  const row = subject ? await ctx.db.get('reportSubjects', subject) : null
  return row ? { table: row.table, id: row.subjectId } : null
}

/**
 * What an account's export carries of the content duties: the reports it
 * made in a click, and the decisions on content it wrote, each with its
 * statement of reasons and the appeal against it. Never who decided, and
 * never a crime flag. A notice sent from its address is not carried:
 * anyone can type an address into the public form, so an erasure by the
 * address reaches those rows, and an export by the account does not.
 *
 * @internal
 */
export async function reportRows(ctx: QueryCtx, userId: string) {
  const reports = await ctx.db.query('reports').withIndex('reporterId_subject_status', q => q.eq('reporterId', userId)).take(EXPORT_ROWS_MAX)
  const decisions = await ctx.db.query('reportDecisions').withIndex('authorId', q => q.eq('authorId', userId)).take(EXPORT_ROWS_MAX)
  return {
    contentReports: await Promise.all(reports.map(async row => ({
      subject: await subjectKey(ctx, row.subject),
      reason: row.reason,
      details: row.details ?? null,
      status: row.status,
      outcome: row.outcome ?? null,
      createdAt: row.createdAt,
      closedAt: row.closedAt ?? null,
    }))),
    contentDecisions: await Promise.all(decisions.map(async (row) => {
      const appeal = await ctx.db.query('reportAppeals').withIndex('decision', q => q.eq('decision', row._id)).first()
      return {
        subject: await subjectKey(ctx, row.subject),
        action: row.action,
        reason: row.reason,
        ground: row.ground,
        at: row.at,
        appeal: appeal ? { text: appeal.text ?? null, status: appeal.status, createdAt: appeal.createdAt, reason: appeal.reason ?? null, closedAt: appeal.closedAt ?? null } : null,
      }
    })),
  }
}

// ── Retention ──────────────────────────────────────────────────

/**
 * One batch of the content duties' retention (the maintenance pass's
 * `reportDecisions` task): every decision made before `before`, with its
 * appeal, at most `budget` read. A decision whose appeal is still open
 * waits for its answer. A decision that goes leaves the hashes of the
 * images it removed, which name nobody, and its subject's record: cleared
 * when something is open on the subject again, deleted otherwise, since
 * the reports and notices it closed go by the same window. Answers what
 * it deleted and whether it read every decision due.
 *
 * @internal
 */
export async function pruneDecisions(ctx: MutationCtx, before: number, budget: number): Promise<{ pruned: number, done: boolean }> {
  let seen = 0
  let pruned = 0
  for await (const decision of ctx.db.query('reportDecisions').withIndex('at', q => q.lt('at', before))) {
    if (++seen > budget) return { pruned, done: pruned === 0 }
    if (await removeDecision(ctx, decision)) pruned++
  }
  return { pruned, done: true }
}

/** Delete one decision with its appeal, unless that appeal is still open; answers whether it went. */
async function removeDecision(ctx: MutationCtx, decision: Doc<'reportDecisions'>): Promise<boolean> {
  const appeals = await ctx.db.query('reportAppeals').withIndex('decision', q => q.eq('decision', decision._id)).take(DECISION_APPEALS_MAX)
  if (appeals.some(appeal => appeal.status === 'open')) return false
  for (const appeal of appeals) await ctx.db.delete('reportAppeals', appeal._id)
  for (const blocked of await ctx.db.query('blockedFiles').withIndex('decision', q => q.eq('decision', decision._id)).take(100)) {
    await ctx.db.patch('blockedFiles', blocked._id, { decision: undefined })
  }
  await releaseSubject(ctx, decision)
  await ctx.db.delete('reportDecisions', decision._id)
  return true
}

/** A subject whose latest decision goes: cleared while something is open on it again, deleted otherwise. */
async function releaseSubject(ctx: MutationCtx, decision: Doc<'reportDecisions'>): Promise<void> {
  const subject = decision.subject ? await ctx.db.get('reportSubjects', decision.subject) : null
  if (subject?.decisionId !== decision._id) return
  if (subject.status === 'open') await ctx.db.patch('reportSubjects', subject._id, { decisionId: undefined })
  else await ctx.db.delete('reportSubjects', subject._id)
}
