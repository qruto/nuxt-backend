import { RateLimiter } from '@convex-dev/rate-limiter'
import {
  actionGeneric,
  type FunctionReference,
  type GenericDataModel,
  type GenericMutationCtx,
  type GenericQueryCtx,
  mutationGeneric,
  queryGeneric,
  type RegisteredAction,
  type RegisteredMutation,
  type RegisteredQuery,
  type TableNamesInDataModel,
} from 'convex/server'
import { type GenericId, v } from 'convex/values'
import { APPEAL_WINDOW_MS } from '../constants.js'
import { readEnv } from '../delivery.js'
import { backendError } from '../errors.js'
import { EVENT_VALUE_MAX } from '../events.js'
import { logBackend } from '../log.js'
import { randomToken, sha256Hex } from '../tokens.js'
import { APPEAL_FRAGMENT, REMOVAL_DEADLINE_MS, REPORT_REASONS, type ReportReason } from '../report-rules.js'
import { addressDigest, mailboxOf } from '../waitlist-rules.js'
import { type AdapterFindOne, type Administrators, createAccessReads, isAdministratorNow, refuseCaller, requireAdministratorInPerson } from './access.js'
import { setupAudit } from './audit.js'
import type { EmailTemplateData } from '../email-templates.js'
import type { Email } from './email.js'
import { verifyHuman } from './functions.js'
import { DEFAULT_LIMITS } from './rate-limit.js'

// Content duties, the app's half (`setupAdmin({ email, reports })`): the
// one-click report a signed-in person makes (`reportContent`), the public
// notice form behind the `report` page (`sendNotice`, DSA Art. 16, with the
// TAKE IT DOWN Act's removal request among its reasons), the Reports tab
// (`getReports`, `decideReport`, `flagCrime`, `decideAppeal`), and the
// author's appeal (`getAppeal`, `appealDecision`). The rows live in the
// backend component (`components/backend/reports.ts`); the app's own
// `describe`, `hide` and `restore` say what a reported thing is and how it
// goes. Every decision is emailed to whoever the law says must hear of it,
// and recorded on the activity trail without the reporter.

export type { ReportReason } from '../report-rules.js'

/**
 * A reported thing of the app's: the table it is in and its row id, an id of
 * that table. With the app's `DataModel` (`setupAdmin<DataModel>`), checking
 * `table` narrows `id` to that table's.
 */
export type ReportSubject<DM extends GenericDataModel = GenericDataModel> = {
  [T in TableNamesInDataModel<DM>]: { table: T, id: GenericId<T> }
}[TableNamesInDataModel<DM>]

/** What `reports.describe` says of a reported thing. */
export interface DescribedSubject {
  /** Its name in the Reports tab and in the author's emails. */
  title: string
  /** Where it is shown in the app, for the tab's link. */
  url?: string
  /** Whose it is: the account that gets the statement of reasons when it is hidden. */
  authorId?: string
  /**
   * The ids of the files it shows (`setupStorage` uploads). When it is
   * hidden on an intimate-image removal request, every identical copy of
   * them is removed too, and the same bytes are never kept again.
   */
  files?: string[]
}

/** `setupAdmin({ reports })`: how the Reports tab shows and acts on the app's content. */
export interface ReportsOptions<DM extends GenericDataModel = GenericDataModel> {
  /**
   * What a reported thing is, read in a query or a mutation: its title,
   * where it is, whose it is and its files; `null` for one that is not
   * there or may not be reported. The id comes from the person who
   * reports, checked only as an id of `table`: answer `null` for a table
   * you do not let people report.
   */
  describe: (ctx: GenericQueryCtx<DM>, subject: ReportSubject<DM>) => Promise<DescribedSubject | null> | DescribedSubject | null
  /** Hide it from everyone, in the decision's mutation. */
  hide: (ctx: GenericMutationCtx<DM>, subject: ReportSubject<DM>) => Promise<unknown> | unknown
  /** Show it again, when an appeal reverses a decision that hid it and nothing reported or hid it again since. Without it, reversing records the outcome and tells the author, and showing the content again is yours. */
  restore?: (ctx: GenericMutationCtx<DM>, subject: ReportSubject<DM>) => Promise<unknown> | unknown
  /**
   * The thing a notice's link points at, for a notice sent without one
   * (the form opened from your footer, a link pasted in): the Reports tab
   * files it under that thing once `describe` knows it. `null` for a link
   * that names none.
   */
  locate?: (ctx: GenericQueryCtx<DM>, url: URL) => Promise<{ table: string, id: string } | null> | { table: string, id: string } | null
}

/** One notice as the Reports tab shows it: the notifier's details, never a one-click reporter's. */
export interface ReportNotice {
  id: string
  reason: ReportReason
  details: string | null
  url: string | null
  /** Who sent it: a notice's name and address, for the outcome email. */
  notifier: { name: string | null, email: string | null } | null
  /** The typed name that signs an intimate-image removal request. */
  signature: string | null
  /** The Art. 18 flag, on a notice the app could not place. */
  crime: { at: number, by: string, note?: string } | null
  createdAt: number
  /**
   * When an intimate-image removal request the app could not place must be
   * decided by (48 hours after it came), epoch ms; `null` for any other
   * notice, and for one filed under its thing, which carries the deadline.
   */
  deadline: number | null
}

/** A notice as the component keeps it, before the Reports tab gives it a deadline. */
type NoticeRow = Omit<ReportNotice, 'deadline'>

/** One reported thing, as the Reports tab lists it. */
export interface ReportedSubject {
  subject: { table: string, id: string }
  /** What `describe` says of it; `null` once it is gone. */
  described: DescribedSubject | null
  /** Its author, as `describe` names them, with their address for the Users tab's search; `null` without one. */
  author: { id: string, email: string | null } | null
  /** Open reports and notices. */
  open: number
  /** How many give each reason. */
  reasons: Partial<Record<ReportReason, number>>
  notices: ReportNotice[]
  /** When an open intimate-image removal request must be decided by (48 hours after it came), epoch ms; `null` without one. */
  deadline: number | null
  /** Flagged as a suspected crime that threatens life or safety (DSA Art. 18). */
  crime: { at: number, by: string, note?: string } | null
  updatedAt: number
}

/** An open appeal, as the Reports tab lists it. */
export interface ReportAppeal {
  id: string
  text: string
  createdAt: number
  decision: { action: 'hidden' | 'dismissed', reason: string, at: number }
  subject: { table: string, id: string } | null
  described: DescribedSubject | null
}

/** Everything the Reports tab shows. */
export interface ReportsConsole {
  /** Intimate-image removal requests first, by their deadline, then the most reported. */
  subjects: ReportedSubject[]
  /** Open notices the app could not place on a thing of its own: intimate-image removal requests first, by their deadline, then the newest. */
  notices: ReportNotice[]
  appeals: ReportAppeal[]
}

/** A decision as its appeal page reads it. */
export interface AppealView {
  /** What was decided on, as `describe` names it; `null` once it is gone. */
  title: string | null
  action: 'hidden' | 'dismissed'
  reason: string
  ground: 'illegal' | 'terms'
  /** When it was decided, epoch ms. */
  at: number
  /** Until when it may be appealed, epoch ms. */
  until: number
  /** The appeal sent, with its outcome once decided; `null` before one. */
  appeal: { status: 'open' | 'upheld' | 'reversed', createdAt: number, reason: string | null } | null
}

/** What a notice sends: the fields DSA Art. 16(2) and the TAKE IT DOWN Act ask for. */
// A type, not an interface: a function's args are an index-signature record.
export type NoticeInput = {
  /** The exact link to the content. */
  url: string
  reason: ReportReason
  /** Why the content is illegal or breaks the terms. */
  details: string
  /** The notifier's name; may be left out for child sexual abuse material. */
  name?: string
  /** The notifier's address, for the receipt and the outcome; may be left out for child sexual abuse material. */
  email?: string
  /** The notifier's statement that the notice is accurate and made in good faith. */
  goodFaith: boolean
  /** The typed full name that signs an intimate-image removal request. */
  signature?: string
  /** The thing it is about, when the form was opened from it (`?table=&id=`). */
  subject?: { table: string, id: string }
  locale?: string
  /** The bot check's token (`useHumanCheck().token('report', email)`). */
  human?: string | null
}

/** The report functions `backend/admin.ts` re-exports beside the console's reads. */
export interface ReportsApi {
  /** Report a thing, signed in: one open report per person and thing, at most 10 an hour (the `report` limit). */
  reportContent: RegisteredMutation<'public', { subject: { table: string, id: string }, reason: ReportReason, details?: string }, Promise<null>>
  /** The public notice form's send, for anyone: the bot check, the `report` limit per address and `reportGlobal`, and a receipt by email. */
  sendNotice: RegisteredAction<'public', NoticeInput, Promise<null>>
  /** A decision by its appeal link's token; `null` for a token no decision has. */
  getAppeal: RegisteredQuery<'public', { token: string }, Promise<AppealView | null>>
  /** Appeal a decision by its token: once, within six months. */
  appealDecision: RegisteredMutation<'public', { token: string, text: string }, Promise<null>>
  /** The Reports tab. `null` for anyone who is not an administrator now. */
  getReports: RegisteredQuery<'public', Record<string, never>, Promise<ReportsConsole | null>>
  /** Hide a thing or dismiss its reports, with the reason: an administrator's, in person, with a recent sign-in. */
  decideReport: RegisteredMutation<'public', { subject?: { table: string, id: string }, notice?: string, action: 'hide' | 'dismiss', reason: string, ground?: 'illegal' | 'terms' }, Promise<null>>
  /** Flag a suspected crime that threatens life or safety (DSA Art. 18): an administrator's, in person, with a recent sign-in. */
  flagCrime: RegisteredMutation<'public', { subject?: { table: string, id: string }, notice?: string, note?: string }, Promise<null>>
  /** Keep or reverse a decision an author appealed, with the reason: an administrator's, in person, with a recent sign-in. */
  decideAppeal: RegisteredMutation<'public', { appealId: string, outcome: 'uphold' | 'reverse', reason: string }, Promise<null>>
}

/** The longest text each field keeps. */
const MAX = { url: 2048, details: 4000, name: 200, email: 320, signature: 200, reason: 2000, note: 500, appeal: 4000, table: 64, id: 128 } as const

const vReason = v.union(...REPORT_REASONS.map(reason => v.literal(reason)))
const vSubject = v.object({ table: v.string(), id: v.string() })

/** An address's shape, as the form checks it. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/

interface ReportRefs {
  fileReport: FunctionReference<'mutation', 'internal', { subject: { table: string, id: string }, reporterId: string, reason: ReportReason, details?: string }, null>
  fileNotice: FunctionReference<'mutation', 'internal', { subject?: { table: string, id: string }, url: string, reason: ReportReason, details: string, notifier: { name?: string, email?: string, locale?: string }, signature?: string }, string>
  reportsConsole: FunctionReference<'query', 'internal', Record<string, never>, {
    subjects: Array<{ table: string, id: string, open: number, reasons: Record<string, number>, notices: NoticeRow[], intimateAt: number | null, crime: ReportNotice['crime'], updatedAt: number }>
    notices: Array<NoticeRow & { hint: { table: string, id: string } | null }>
    appeals: Array<{ id: string, text: string, createdAt: number, decision: { action: 'hidden' | 'dismissed', reason: string, at: number, authorId: string | null }, subject: { table: string, id: string } | null }>
  }>
  unplacedNotices: FunctionReference<'query', 'internal', Record<string, never>, Array<{ id: string, url: string | null }>>
  decide: FunctionReference<'mutation', 'internal', { subject?: { table: string, id: string }, notice?: string, notices?: string[], action: 'hidden' | 'dismissed', reason: string, ground: 'illegal' | 'terms', by: string, authorId?: string, appealTokenHash?: string }, {
    decisionId: string
    reports: number
    notifiers: Array<{ email: string, name?: string, locale?: string, url?: string }>
    intimate: boolean
    notice: boolean
  } | null>
  flagCrime: FunctionReference<'mutation', 'internal', { subject?: { table: string, id: string }, notice?: string, by: string, note?: string }, boolean>
  appealOf: FunctionReference<'query', 'internal', { tokenHash: string }, {
    decisionId: string
    action: 'hidden' | 'dismissed'
    reason: string
    ground: 'illegal' | 'terms'
    at: number
    until: number
    subject: { table: string, id: string } | null
    authorId: string | null
    appeal: AppealView['appeal']
  } | null>
  fileAppeal: FunctionReference<'mutation', 'internal', { tokenHash: string, text: string }, 'appealed' | 'unknown' | 'expired' | 'appealed_already'>
  decideAppeal: FunctionReference<'mutation', 'internal', { appeal: string, outcome: 'upheld' | 'reversed', reason: string, by: string }, { action: 'hidden' | 'dismissed', subject: { table: string, id: string } | null, authorId: string | null, restore: boolean } | null>
}

type ConsoleRows = ReportRefs['reportsConsole']['_returnType']
type Decided = NonNullable<ReportRefs['decide']['_returnType']>

interface StorageRemoval {
  removeCopies: FunctionReference<'mutation', 'internal', { storageIds: string[], decision?: string }, number>
}

/** Text a person typed, trimmed and held to its length; refused when it is required and empty, or too long. */
function text(value: string | undefined, field: keyof typeof MAX, required: boolean): string | undefined {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  if (!trimmed) {
    if (required) throw backendError('invalid_input', { field }, `[nuxt-backend] The ${field} is required.`)
    return undefined
  }
  if (trimmed.length > MAX[field]) throw backendError('invalid_input', { field, reason: 'too_long' }, `[nuxt-backend] The ${field} is at most ${MAX[field]} characters.`)
  return trimmed
}

/** A subject as a caller names it: a short table name and id. */
function checkedSubject(subject: { table: string, id: string }): { table: string, id: string } {
  const table = text(subject?.table, 'table', true)!
  const id = text(subject?.id, 'id', true)!
  if (!/^[a-z_]\w*$/i.test(table)) throw backendError('invalid_input', { field: 'subject' }, '[nuxt-backend] A subject names a table of the app.')
  return { table, id }
}

/** The link a notice gives: an `http:` or `https:` URL. */
function checkedUrl(value: string): string {
  const url = text(value, 'url', true)!
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') return parsed.href
  }
  catch {
    // Refused below.
  }
  throw backendError('invalid_input', { field: 'url' }, '[nuxt-backend] The link to the content is a web address, starting with https://.')
}

/** A notice as the form sent it, checked against what Art. 16(2) and the TAKE IT DOWN Act ask for, and shaped as the component keeps it. */
function checkedNotice(input: NoticeInput) {
  const url = checkedUrl(input.url)
  const details = text(input.details, 'details', true)!
  // Art. 16(2)(c): a name and an address, except for a notice of child sexual abuse material.
  const anonymous = input.reason === 'child_abuse'
  const name = text(input.name, 'name', !anonymous)
  const email = text(input.email, 'email', !anonymous)?.toLowerCase()
  if (email && !EMAIL_SHAPE.test(email)) throw backendError('invalid_input', { field: 'email' }, '[nuxt-backend] That is not an email address.')
  if (input.goodFaith !== true) throw backendError('invalid_input', { field: 'goodFaith' }, '[nuxt-backend] A notice states that it is accurate and made in good faith.')
  // The TAKE IT DOWN Act's request: signed with the person's name.
  const signature = text(input.signature, 'signature', input.reason === 'intimate')
  const locale = input.locale?.trim().slice(0, 35) || undefined
  return {
    ...(input.subject ? { subject: checkedSubject(input.subject) } : {}),
    url,
    reason: input.reason,
    details,
    notifier: { ...(name ? { name } : {}), ...(email ? { email } : {}), ...(locale ? { locale } : {}) },
    ...(signature ? { signature } : {}),
  }
}

/** A subject row of the component as the Reports tab lists it, before `describe` fills it in. */
function subjectView(row: ConsoleRows['subjects'][number]): ReportedSubject {
  return {
    subject: { table: row.table, id: row.id },
    described: null,
    author: null,
    open: row.open,
    reasons: row.reasons as ReportedSubject['reasons'],
    notices: row.notices.map(notice => ({ ...notice, deadline: null })),
    deadline: row.intimateAt === null ? null : row.intimateAt + REMOVAL_DEADLINE_MS,
    crime: row.crime,
    updatedAt: row.updatedAt,
  }
}

/** File a notice under the thing `locate` placed its link on, listing that thing when nobody reported it yet. */
function placeNotice(subjects: ReportedSubject[], at: { table: string, id: string }, notice: NoticeRow): void {
  let entry = subjects.find(known => known.subject.table === at.table && known.subject.id === at.id)
  if (!entry) {
    entry = { subject: at, described: null, author: null, open: 0, reasons: {}, notices: [], deadline: null, crime: null, updatedAt: notice.createdAt }
    subjects.push(entry)
  }
  entry.notices.push({ ...notice, deadline: null })
  entry.open += 1
  entry.reasons[notice.reason] = (entry.reasons[notice.reason] ?? 0) + 1
  if (notice.reason === 'intimate') entry.deadline = Math.min(entry.deadline ?? Infinity, notice.createdAt + REMOVAL_DEADLINE_MS)
}

/** The activity trail's record of a decision: who decided what, never who reported it. */
function decidedEvent(subject: { table: string, id: string } | undefined, described: DescribedSubject | null, fields: { action: string, ground: string, reports: number, reason: string }) {
  return {
    type: 'report.decided' as const,
    subjectId: described?.authorId ?? null,
    ...(subject ? { targetId: subject.id } : {}),
    data: { ...fields, reason: trailText(fields.reason), ...(subject ? { table: subject.table } : {}) },
  }
}

/** The app's address, for links in the emails. */
const siteUrl = (): string => readEnv('SITE_URL')?.replace(/\/+$/, '') ?? ''

/**
 * A link a notifier typed, as an email repeats it: only one into the app
 * itself, so the form never mails anyone a link of a stranger's choosing.
 */
function onSite(url: string | undefined): string | undefined {
  try {
    return url && new URL(url).origin === new URL(siteUrl()).origin ? url : undefined
  }
  catch {
    return undefined
  }
}

/**
 * What the activity trail keeps of a reason an administrator wrote: its
 * start, as long as an event's string may be, so the event is written. The
 * cut never leaves half a surrogate pair, which is not valid Unicode.
 */
const trailText = (value: string): string => {
  if (value.length <= EVENT_VALUE_MAX) return value
  const start = value.slice(0, EVENT_VALUE_MAX - 1)
  return `${/[\uD800-\uDBFF]$/.test(start) ? start.slice(0, -1) : start}…`
}

/**
 * Build the report functions over the backend component. `setupAdmin`
 * calls it when the app passes `reports`.
 *
 * @internal
 */
export function createReports(components: { backend: unknown, rateLimiter?: unknown }, options: ReportsOptions, deps: { email: Pick<Email, 'sendTemplate'>, administrators: Administrators, reportPath: string }) {
  if (typeof options?.describe !== 'function' || typeof options.hide !== 'function') {
    throw new TypeError('[nuxt-backend] setupAdmin({ reports }): `describe` and `hide` are functions: what a reported thing is, and how it is hidden.')
  }
  if (typeof (deps.email as Partial<Email> | undefined)?.sendTemplate !== 'function') {
    throw new TypeError('[nuxt-backend] setupAdmin({ reports }) emails receipts, outcomes and statements of reasons: pass the app\'s setupEmail instance as `email`.')
  }
  const backend = components.backend as { reports: ReportRefs, storage: StorageRemoval, adapter: { findOne: AdapterFindOne } }
  const refs = backend.reports
  const reads = createAccessReads(backend.adapter.findOne)
  const { email, administrators } = deps
  const audit = setupAudit(components as never)
  const limiter = components.rateLimiter
    ? new RateLimiter(components.rateLimiter as never, { report: DEFAULT_LIMITS.report, reportGlobal: DEFAULT_LIMITS.reportGlobal })
    : undefined

  /** A subject's id as an id of its table, or `null` when it is none (or the table is not the app's). */
  const normalized = (ctx: GenericQueryCtx<GenericDataModel>, subject: { table: string, id: string }): ReportSubject | null => {
    try {
      const id = ctx.db.normalizeId(subject.table as never, subject.id)
      return id ? { table: subject.table, id } : null
    }
    catch {
      return null
    }
  }

  /** What `describe` says of a subject; `null` when it is gone, may not be reported, or `describe` threw. */
  const describe = async (ctx: GenericQueryCtx<GenericDataModel>, subject: { table: string, id: string }): Promise<DescribedSubject | null> => {
    const id = normalized(ctx, subject)
    if (!id) return null
    try {
      return (await options.describe(ctx, id)) ?? null
    }
    catch (error) {
      logBackend('warn', 'reports.describe_failed', 'reports.describe threw for a reported row: the Reports tab shows it as gone.', error)
      return null
    }
  }

  /** Where `locate` places a notice's link; `null` without `locate`, for a link it does not place, or one it threw on. */
  const locate = async (ctx: GenericQueryCtx<GenericDataModel>, url: string | null): Promise<{ table: string, id: string } | null> => {
    if (!options.locate || !url) return null
    try {
      const found = await options.locate(ctx, new URL(url))
      return found ? { table: found.table, id: String(found.id) } : null
    }
    catch {
      return null
    }
  }

  /** An account's address, read fresh; `null` once it is gone. */
  const addressOf = async (ctx: GenericQueryCtx<GenericDataModel>, userId: string): Promise<string | null> => {
    const user = await ctx.runQuery(backend.adapter.findOne, { model: 'user', where: [{ field: '_id', value: userId }] }) as { email?: string | null } | null
    return user?.email ?? null
  }

  /** Send one of the duty emails; a failure is logged, never thrown: the decision stands, and the log says who to write to. */
  async function send<Name extends 'noticeReceived' | 'noticeDecided' | 'contentRestricted' | 'appealDecided'>(ctx: Parameters<Email['sendTemplate']>[0], template: Name, data: EmailTemplateData<Name>, options: { locale?: string, idempotencyKey: string }): Promise<void> {
    try {
      await email.sendTemplate(ctx, template as never, data as never, { ...(options.locale ? { locale: options.locale } : {}), idempotencyKey: options.idempotencyKey })
    }
    catch (error) {
      logBackend('error', 'reports.email_unsent', `A ${String(template)} email could not be sent: tell the person yourself.`, error)
    }
  }

  const record = async (ctx: GenericMutationCtx<GenericDataModel>, event: Parameters<typeof audit.recordBackendEvent>[1]): Promise<void> => {
    try {
      await audit.recordBackendEvent(ctx as never, event)
    }
    catch (error) {
      logBackend('warn', 'audit.record_failed', `A ${event.type} event was not recorded; the decision went through.`, error)
    }
  }

  const reportContent = mutationGeneric({
    args: { subject: vSubject, reason: vReason, details: v.optional(v.string()) },
    returns: v.null(),
    handler: async (ctx, args) => {
      const identity = await ctx.auth.getUserIdentity()
      if (!identity) throw backendError('unauthenticated', {}, '[nuxt-backend] Sign in to report content, or use the report form.')
      // A report is the person's own: an administrator visiting the account makes none.
      refuseCaller(identity as unknown as Record<string, unknown>, { impersonation: 'refused' }, 'reportContent')
      const account = await reads.account(ctx, identity.subject)
      if (!account || account.banned) throw backendError('forbidden', { reason: 'banned' }, '[nuxt-backend] This account cannot report content.')
      const subject = checkedSubject(args.subject)
      const details = text(args.details, 'details', false)
      if (!await describe(ctx, subject)) throw backendError('invalid_input', { field: 'subject' }, `[nuxt-backend] reportContent: nothing of '${subject.table}' has that id, or reports.describe does not describe it.`)
      if (limiter) await limiter.limit(ctx as never, 'report', { key: identity.subject, throws: true })
      await ctx.runMutation(refs.fileReport, { subject, reporterId: identity.subject, reason: args.reason, ...(details ? { details } : {}) })
      return null
    },
  })

  const sendNotice = actionGeneric({
    args: {
      url: v.string(),
      reason: vReason,
      details: v.string(),
      name: v.optional(v.string()),
      email: v.optional(v.string()),
      goodFaith: v.boolean(),
      signature: v.optional(v.string()),
      subject: v.optional(vSubject),
      locale: v.optional(v.string()),
      human: v.optional(v.union(v.string(), v.null())),
    },
    returns: v.null(),
    handler: async (ctx, input) => {
      const notice = checkedNotice(input)
      const address = notice.notifier.email
      // The bot check first: a refused call spends none of the limits.
      await verifyHuman(ctx, input.human, { action: 'report', ...(address ? { subject: address } : {}) })
      if (limiter) {
        // Per mailbox (`me+1@` is `me@`). A notice without an address, which only child sexual abuse material may be, counts against the deployment's ceiling alone: one shared bucket would let anyone shut that channel.
        if (address) await limiter.limit(ctx as never, 'report', { key: `notice:${await addressDigest(mailboxOf(address))}`, throws: true })
        await limiter.limit(ctx as never, 'reportGlobal', { throws: true })
      }
      const id = await ctx.runMutation(refs.fileNotice, notice)
      if (address) {
        const locale = notice.notifier.locale
        const url = onSite(notice.url)
        await send(ctx, 'noticeReceived', { email: address, ...(url ? { url } : {}), intimate: notice.reason === 'intimate' }, { ...(locale ? { locale } : {}), idempotencyKey: `nuxt-backend:notice-received:${id}` })
      }
      return null
    },
  })

  const getAppeal = queryGeneric({
    args: { token: v.string() },
    handler: async (ctx, { token }): Promise<AppealView | null> => {
      if (typeof token !== 'string' || token.length < 16 || token.length > 128) return null
      const found = await ctx.runQuery(refs.appealOf, { tokenHash: await sha256Hex(token) })
      if (!found) return null
      const described = found.subject ? await describe(ctx, found.subject) : null
      return { title: described?.title ?? null, action: found.action, reason: found.reason, ground: found.ground, at: found.at, until: found.until, appeal: found.appeal }
    },
  })

  const appealDecision = mutationGeneric({
    args: { token: v.string(), text: v.string() },
    returns: v.null(),
    handler: async (ctx, args) => {
      const body = text(args.text, 'appeal', true)!
      const outcome = typeof args.token === 'string' && args.token.length >= 16 && args.token.length <= 128
        ? await ctx.runMutation(refs.fileAppeal, { tokenHash: await sha256Hex(args.token), text: body })
        : 'unknown'
      if (outcome === 'unknown') throw backendError('invalid_input', { field: 'token' }, '[nuxt-backend] This appeal link names no decision.')
      if (outcome === 'expired') throw backendError('invalid_input', { field: 'token', reason: 'appeal_expired' }, '[nuxt-backend] This decision can no longer be appealed: six months have passed.')
      if (outcome === 'appealed_already') throw backendError('invalid_input', { field: 'token', reason: 'appealed_already' }, '[nuxt-backend] This decision was appealed already.')
      await record(ctx, { type: 'report.appealed', actor: null, subjectId: null })
      return null
    },
  })

  const getReports = queryGeneric({
    args: {},
    handler: async (ctx): Promise<ReportsConsole | null> => {
      if (!await isAdministratorNow(ctx, reads, administrators, 'getReports')) return null
      const rows = await ctx.runQuery(refs.reportsConsole, {})
      const subjects: ReportedSubject[] = rows.subjects.map(subjectView)
      const described = describedOnce(ctx)
      const notices = await placeNotices(ctx, rows.notices, subjects, described)
      for (const entry of subjects) {
        entry.described = await described(entry.subject)
        const authorId = entry.described?.authorId
        entry.author = authorId ? { id: authorId, email: await addressOf(ctx, authorId) } : null
      }
      subjects.sort((a, b) => (a.deadline ?? Infinity) - (b.deadline ?? Infinity) || b.open - a.open || b.updatedAt - a.updatedAt)
      const appeals: ReportAppeal[] = []
      for (const appeal of rows.appeals) {
        const { authorId: _author, ...decision } = appeal.decision
        appeals.push({ ...appeal, decision, described: appeal.subject ? await describe(ctx, appeal.subject) : null })
      }
      return { subjects, notices, appeals }
    },
  })

  /** `describe` for one console read: each subject described once. */
  function describedOnce(ctx: GenericQueryCtx<GenericDataModel>): (subject: { table: string, id: string }) => Promise<DescribedSubject | null> {
    const known = new Map<string, Promise<DescribedSubject | null>>()
    return (subject) => {
      const key = `${subject.table}:${subject.id}`
      if (!known.has(key)) known.set(key, describe(ctx, subject))
      return known.get(key)!
    }
  }

  /**
   * File each notice on its own under the thing it names, else the thing
   * `locate` says its link points at: either only once `describe` knows it,
   * since both come from whoever sent the notice. Answers the notices left
   * on their own, intimate-image removal requests first by their deadline.
   */
  async function placeNotices(ctx: GenericQueryCtx<GenericDataModel>, rows: ConsoleRows['notices'], subjects: ReportedSubject[], described: ReturnType<typeof describedOnce>): Promise<ReportNotice[]> {
    const notices: ReportNotice[] = []
    for (const { hint, ...notice } of rows) {
      const located = hint && await described(hint) ? hint : await locate(ctx, notice.url)
      const at = located && await described(located) ? located : null
      if (at) placeNotice(subjects, at, notice)
      else notices.push({ ...notice, deadline: notice.reason === 'intimate' ? notice.createdAt + REMOVAL_DEADLINE_MS : null })
    }
    return notices.sort((a, b) => (a.deadline ?? Infinity) - (b.deadline ?? Infinity) || b.createdAt - a.createdAt)
  }

  /** The open notices sent without their thing whose link `locate` places on it: closed with its decision. */
  const locatedNotices = async (ctx: GenericQueryCtx<GenericDataModel>, subject: { table: string, id: string }): Promise<string[]> => {
    if (!options.locate) return []
    const ids: string[] = []
    for (const notice of await ctx.runQuery(refs.unplacedNotices, {})) {
      const at = await locate(ctx, notice.url)
      if (at?.table === subject.table && at.id === subject.id) ids.push(notice.id)
    }
    return ids
  }

  const decideReport = mutationGeneric({
    args: { subject: v.optional(vSubject), notice: v.optional(v.string()), action: v.union(v.literal('hide'), v.literal('dismiss')), reason: v.string(), ground: v.optional(v.union(v.literal('illegal'), v.literal('terms'))) },
    returns: v.null(),
    handler: async (ctx, args) => {
      const adminId = await requireAdministratorInPerson(ctx, reads, administrators, 'decideReport')
      const reason = text(args.reason, 'reason', true)!
      const ground = args.ground ?? 'terms'
      if (!args.subject === !args.notice) throw backendError('invalid_input', { field: 'subject' }, '[nuxt-backend] decideReport: name the `subject`, or a `notice` sent without one.')
      const action = args.action === 'hide' ? 'hidden' as const : 'dismissed' as const
      const subject = args.subject ? checkedSubject(args.subject) : undefined
      const described = subject ? await describe(ctx, subject) : null
      if (subject && action === 'hidden') await hideSubject(ctx, subject, described)
      // The author may appeal a decision that hid their content: the link's token, its hash kept.
      const appealToken = action === 'hidden' && described?.authorId ? randomToken() : undefined
      const target = subject ? { subject, notices: await locatedNotices(ctx, subject) } : { notice: args.notice! }
      const decided = await ctx.runMutation(refs.decide, { ...target, action, reason, ground, by: adminId, ...await appealFields(described, appealToken) })
      if (!decided) throw backendError('invalid_input', { field: subject ? 'subject' : 'notice' }, '[nuxt-backend] decideReport: nothing open to decide there.')
      await tellDecision(ctx, { decided, described, action, reason, ground, appealToken })
      // An intimate image shared without consent: its identical copies go too, and never come back.
      if (action === 'hidden' && decided.intimate && described?.files?.length) {
        await ctx.runMutation(backend.storage.removeCopies, { storageIds: described.files, decision: decided.decisionId })
      }
      await record(ctx, decidedEvent(subject, described, { action, ground, reports: decided.reports, reason }))
      return null
    },
  })

  /** What a decision keeps of its author and its appeal link: the author `describe` names, and the token's hash. */
  async function appealFields(described: DescribedSubject | null, appealToken: string | undefined): Promise<{ authorId?: string, appealTokenHash?: string }> {
    return {
      ...(described?.authorId ? { authorId: described.authorId } : {}),
      ...(appealToken ? { appealTokenHash: await sha256Hex(appealToken) } : {}),
    }
  }

  /** Run the app's `hide` on a subject, refused when `describe` does not know it or it names no row. */
  async function hideSubject(ctx: GenericMutationCtx<GenericDataModel>, subject: { table: string, id: string }, described: DescribedSubject | null): Promise<void> {
    // A subject comes from whoever reported it: only one `describe` knows is the app's to hide.
    if (!described) throw backendError('invalid_input', { field: 'subject' }, `[nuxt-backend] decideReport: reports.describe answers null for this subject of '${subject.table}', so there is nothing to hide. Dismiss its reports instead.`)
    const id = normalized(ctx, subject)
    if (!id) throw backendError('invalid_input', { field: 'subject' }, `[nuxt-backend] decideReport: nothing of '${subject.table}' has that id.`)
    await options.hide(ctx, id)
  }

  /** Email a decision: its outcome to each notifier (Art. 16(5)), and the statement of reasons to the author of what was hidden (Art. 17). */
  async function tellDecision(ctx: GenericMutationCtx<GenericDataModel>, { decided, described, action, reason, ground, appealToken }: {
    decided: Decided
    described: DescribedSubject | null
    action: 'hidden' | 'dismissed'
    reason: string
    ground: 'illegal' | 'terms'
    appealToken: string | undefined
  }): Promise<void> {
    // A notice on its own hides nothing of the app's and matches no copies: its sender hears it was acted on, never that it was removed.
    const outcome = action === 'dismissed' ? 'kept' as const : described ? 'removed' as const : 'handled' as const
    for (const notifier of decided.notifiers) {
      const locale = notifier.locale
      const url = onSite(notifier.url) ?? described?.url
      await send(ctx, 'noticeDecided', { email: notifier.email, ...(url ? { url } : {}), outcome, reason }, { ...(locale ? { locale } : {}), idempotencyKey: `nuxt-backend:notice-decided:${decided.decisionId}:${notifier.email}` })
    }
    const authorEmail = appealToken && described?.authorId ? await addressOf(ctx, described.authorId) : null
    if (!authorEmail || !described) return
    await send(ctx, 'contentRestricted', {
      email: authorEmail,
      title: described.title,
      reason,
      ground,
      notice: decided.notice,
      appealUrl: `${siteUrl()}${deps.reportPath}#${APPEAL_FRAGMENT}${appealToken}`,
      appealUntil: Date.now() + APPEAL_WINDOW_MS,
    }, { idempotencyKey: `nuxt-backend:content-restricted:${decided.decisionId}` })
  }

  const flagCrime = mutationGeneric({
    args: { subject: v.optional(vSubject), notice: v.optional(v.string()), note: v.optional(v.string()) },
    returns: v.null(),
    handler: async (ctx, args) => {
      const adminId = await requireAdministratorInPerson(ctx, reads, administrators, 'flagCrime')
      if (!args.subject === !args.notice) throw backendError('invalid_input', { field: 'subject' }, '[nuxt-backend] flagCrime: name the `subject`, or a `notice` sent without one.')
      const note = text(args.note, 'note', false)
      const subject = args.subject ? checkedSubject(args.subject) : undefined
      const flagged = await ctx.runMutation(refs.flagCrime, { ...(subject ? { subject } : { notice: args.notice! }), by: adminId, ...(note ? { note } : {}) })
      if (!flagged) throw backendError('invalid_input', { field: subject ? 'subject' : 'notice' }, '[nuxt-backend] flagCrime: nothing was reported there.')
      await record(ctx, { type: 'report.crime_flagged', subjectId: null, ...(subject ? { targetId: subject.id, data: { table: subject.table } } : { targetId: args.notice!, data: {} }) })
      return null
    },
  })

  const decideAppeal = mutationGeneric({
    args: { appealId: v.string(), outcome: v.union(v.literal('uphold'), v.literal('reverse')), reason: v.string() },
    returns: v.null(),
    handler: async (ctx, args) => {
      const adminId = await requireAdministratorInPerson(ctx, reads, administrators, 'decideAppeal')
      const reason = text(args.reason, 'reason', true)!
      const outcome = args.outcome === 'reverse' ? 'reversed' as const : 'upheld' as const
      const decided = await ctx.runMutation(refs.decideAppeal, { appeal: args.appealId, outcome, reason, by: adminId })
      if (!decided) throw backendError('invalid_input', { field: 'appealId' }, '[nuxt-backend] decideAppeal: no open appeal has that id.')
      const id = decided.subject ? normalized(ctx, decided.subject) : null
      if (decided.restore && id && options.restore) await options.restore(ctx, id)
      const described = decided.subject ? await describe(ctx, decided.subject) : null
      const authorEmail = decided.authorId ? await addressOf(ctx, decided.authorId) : null
      if (authorEmail) {
        await send(ctx, 'appealDecided', { email: authorEmail, title: described?.title ?? '', outcome, reason }, { idempotencyKey: `nuxt-backend:appeal-decided:${args.appealId}` })
      }
      await record(ctx, {
        type: 'report.appeal_decided',
        subjectId: decided.authorId,
        ...(decided.subject ? { targetId: decided.subject.id } : {}),
        data: { outcome, reason: trailText(reason) },
      })
      return null
    },
  })

  return { reportContent, sendNotice, getAppeal, appealDecision, getReports, decideReport, flagCrime, decideAppeal } as unknown as ReportsApi
}
