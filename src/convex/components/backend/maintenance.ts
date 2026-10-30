import { v } from 'convex/values'
import { components, internal } from './_generated/api.js'
import type { Doc, TableNames } from './_generated/dataModel.js'
import { internalMutation, type MutationCtx, query } from './_generated/server.js'
import { logBackend } from '../../log.js'
import { SECRET_OUTBOX_TTL_MS } from './email.js'
import { scheduleHeartbeat } from './monitoring.js'
import { pruneJoins, retryMirrors, WAITLIST_JOIN_TTL_MS, WAITLIST_MIRROR_RETRY_MS } from './waitlist.js'
import { UNCLAIMED_FILE_MS } from '../../files.js'
import { INBOUND_RETENTION_MS, REPLY_ADDRESS_RETENTION_MS } from '../../inbound-rules.js'
import { GUEST_TRIES_RETENTION_MS, JOB_RETENTION_MS } from './jobs.js'
import { ALERT_RETENTION_MS } from './alerts.js'
import { AI_COST_RETENTION_MS } from './costs.js'
import { KNOWN_DEVICE_RETENTION_MS } from './devices.js'
import { LIFTED_SUPPRESSION_RETENTION_MS } from './suppressions.js'
import { sweepUnclaimed } from './storage.js'
import { ANNOUNCEMENT_RETENTION_MS, pruneAnnouncements } from './announcements.js'
import { LIFECYCLE_RUN_RETENTION_MS, pruneLifecycleRuns } from './lifecycle.js'
import { NOTIFICATION_READ_RETENTION_MS, NOTIFICATION_UNREAD_RETENTION_MS } from '../../notifications.js'
import { pruneDecisions } from './reports.js'

/**
 * The component's own housekeeping. Its cron (`crons.ts`) starts a pass every
 * hour; each task deletes what it no longer needs in batches of at most
 * {@link MAINTENANCE_BATCH} rows, one transaction each, and schedules its next
 * batch until nothing is left. A pass's cutoff is fixed when it starts, so a
 * pass always ends. The app schedules nothing for it: mounting the component
 * is enough.
 *
 * Each task's latest pass is kept in `maintenanceTasks` (started, finished,
 * rows deleted, the error that stopped it), which `status` serves to
 * DevTools. A batch runs as a subtransaction: one that throws rolls back on
 * its own, is logged, and ends its task's pass, so the lock is released and
 * the next pass tries again; a row that cannot be deleted is skipped.
 *
 * The pass checks in to its monitor once its last task finishes
 * ({@link MAINTENANCE_JOB}): `ok`, or `error` when a task recorded a
 * failure. A pass that never finishes, or a cron that stops, never checks
 * in, which the monitor reports as a missed run.
 */

/** Rows one maintenance transaction deletes at most, before it hands the rest to a fresh one. */
export const MAINTENANCE_BATCH = 200

/** How often the cron starts a pass. */
export const MAINTENANCE_INTERVAL_MS = 60 * 60 * 1000

/**
 * The cron job, and the monitor it checks in to (`backend-maintenance`)
 * once every task of a pass has finished: `error` when one of them failed,
 * and nothing at all when the pass never finishes, a missed run.
 */
export const MAINTENANCE_JOB = 'backend maintenance'

/** An expired session is deleted this long after it expired. */
const EXPIRED_SESSION_RETENTION_MS = 24 * 60 * 60 * 1000

/**
 * An expired verification (a sign-in code, an email change) is deleted this
 * long after it expired; until then a late attempt still reads as expired
 * rather than unknown.
 */
const EXPIRED_VERIFICATION_RETENTION_MS = 60 * 60 * 1000

/**
 * A rate-limit counter (Better Auth's own limiter, when an app turns it on)
 * is deleted after this long without a request. A custom rule with a longer
 * window starts afresh after a day without requests.
 */
const IDLE_RATE_LIMIT_RETENTION_MS = 24 * 60 * 60 * 1000

/** A metered AI request's plumbing, once settled or released, is deleted this long after it was created. */
const FINISHED_AI_REQUEST_RETENTION_MS = 24 * 60 * 60 * 1000

/**
 * A request still `reserved` (or `streaming`) this long after it was created is deleted:
 * its stream's release never ran, and the credit reservation it stood for
 * has long expired on the billing side (it holds no balance past its TTL).
 */
const STUCK_AI_REQUEST_RETENTION_MS = 7 * 24 * 60 * 60 * 1000

/**
 * A sent email's record (status, recipients, body) is deleted this long
 * after it was finalized: delivered, bounced, failed or cancelled. An app
 * changes it with `setupEmail({ retention })`.
 */
export const EMAIL_RECORD_RETENTION_MS = 7 * 24 * 60 * 60 * 1000

/**
 * An email record that never reached a final status (no delivery event
 * arrived) is deleted this long after it was created. An app changes it
 * with `setupEmail({ retention })`.
 */
export const ABANDONED_EMAIL_RETENTION_MS = 30 * 24 * 60 * 60 * 1000

/**
 * An event of the audit trail is deleted this long after it was recorded:
 * a year of activity for the account it is about, its workspace and the
 * app's administrators.
 */
export const AUDIT_EVENT_RETENTION_MS = 365 * 24 * 60 * 60 * 1000

/** An invitation nobody answered is kept this long after it expired, so it can still show as expired. */
const EXPIRED_INVITATION_RETENTION_MS = 30 * 24 * 60 * 60 * 1000

/** An export's record is deleted a day after it was made, its file with it if its expiry never ran; the export limit counts it until then. */
export const ACCOUNT_EXPORT_RETENTION_MS = 24 * 60 * 60 * 1000

/**
 * An erasure that stopped at a failing participant is kept this long for
 * an operator to run again, then deleted with the address it holds.
 */
export const FAILED_ERASURE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000

/** A billing entity's deletion mark is kept this long after the erasure that set it. */
export const BILLING_DELETION_RETENTION_MS = 30 * 24 * 60 * 60 * 1000

/** California's automatic renewal law: proof of a renewing subscription's consent, kept three years. A withdrawal's record is kept as long. */
export const RENEWAL_CONSENT_RETENTION_MS = 3 * 365 * 24 * 60 * 60 * 1000

/** A consent proof whose checkout never started a subscription goes after two days: the checkout expired. */
const UNCONFIRMED_CONSENT_RETENTION_MS = 2 * 24 * 60 * 60 * 1000

/** Save offers and the lifecycle's once-marks are kept two years: longer than the one-offer-a-year rule and the annual reminder read them. */
export const LIFECYCLE_RECORD_RETENTION_MS = 2 * 365 * 24 * 60 * 60 * 1000

/**
 * A closed report or notice, and a decision with its appeal, are deleted
 * this long after they were closed or made: the 183 days a decision may be
 * appealed, then a year more. The year covers the appeal's answer, a
 * dispute settlement body and the yearly transparency report (DSA Art.
 * 20(1), 21 and 15). A decision whose appeal is still open waits for its
 * answer.
 */
export const REPORT_RETENTION_MS = 548 * 24 * 60 * 60 * 1000

/** Decisions one batch reads at most: each also reads its appeal, its subject and the hashes it blocked. */
const DECISION_BATCH = 50

/** A pass that started this long ago without finishing is taken to have crashed, and the next one starts afresh. */
const STALE_PASS_MS = 6 * 60 * 60 * 1000

/** One batch's outcome: rows deleted, and whether the task is done. */
interface Batch {
  pruned: number
  done: boolean
}

/**
 * What a batch leaves of the transaction's byte budget, for the pass's own
 * bookkeeping after it: a batch of large rows stops early rather than spend it.
 */
const BATCH_BYTES_RESERVE = 4 * 1024 * 1024

/**
 * The limits a batch runs under, half the platform's: whatever its rows
 * weigh, the sweep that runs it keeps room to record the pass and schedule
 * the next batch.
 */
export const BATCH_TRANSACTION_LIMITS = { bytesRead: 8 * 1024 * 1024, bytesWritten: 8 * 1024 * 1024, documentsRead: 16_000, documentsWritten: 8_000 }

/**
 * Delete what `queries` yield from `table`, one after another, up to
 * {@link MAINTENANCE_BATCH} rows, stopping early while the transaction's
 * byte budget runs low; a row that cannot be deleted is skipped (and
 * logged). More may be left when the batch stopped short, unless nothing in
 * it could be deleted: then the task stops rather than read the same rows
 * forever.
 */
async function remove<Table extends TableNames>(ctx: MutationCtx, table: Table, queries: Array<AsyncIterable<Doc<Table>>>, before?: (row: Doc<Table>) => Promise<void>): Promise<Batch> {
  let seen = 0
  let pruned = 0
  let cut = false
  for (const query of queries) {
    for await (const row of query) {
      try {
        await before?.(row)
        await ctx.db.delete(table, row._id)
        pruned++
      }
      catch (error) {
        logBackend('error', 'maintenance.task_failed', `Maintenance could not delete a ${table} row; it is skipped.`, error)
      }
      const metrics = await ctx.meta.getTransactionMetrics()
      cut = ++seen >= MAINTENANCE_BATCH || metrics.bytesRead.remaining < BATCH_BYTES_RESERVE || metrics.bytesWritten.remaining < BATCH_BYTES_RESERVE
      if (cut) break
    }
    if (cut) break
  }
  return { pruned, done: !cut || pruned === 0 }
}

/**
 * The tasks, by name. Each deletes one batch of what is older than its
 * window, measured from `startedAt`, the pass's start.
 *
 * @internal
 */
export const MAINTENANCE_TASKS = {
  sessions: async (ctx: MutationCtx, startedAt: number) => remove(ctx, 'session', [ctx.db.query('session')
    .withIndex('expiresAt', q => q.lt('expiresAt', startedAt - EXPIRED_SESSION_RETENTION_MS))]),

  verifications: async (ctx: MutationCtx, startedAt: number) => remove(ctx, 'verification', [ctx.db.query('verification')
    .withIndex('expiresAt', q => q.lt('expiresAt', startedAt - EXPIRED_VERIFICATION_RETENTION_MS))]),

  rateLimits: async (ctx: MutationCtx, startedAt: number) => remove(ctx, 'rateLimit', [ctx.db.query('rateLimit')
    .withIndex('lastRequest', q => q.lt('lastRequest', startedAt - IDLE_RATE_LIMIT_RETENTION_MS))]),

  aiRequests: async (ctx: MutationCtx, startedAt: number) => {
    const windows = [['settled', FINISHED_AI_REQUEST_RETENTION_MS], ['released', FINISHED_AI_REQUEST_RETENTION_MS], ['reserved', STUCK_AI_REQUEST_RETENTION_MS], ['streaming', STUCK_AI_REQUEST_RETENTION_MS]] as const
    return remove(ctx, 'aiRequests', windows.map(([status, window]) => ctx.db.query('aiRequests')
      .withIndex('status_createdAt', q => q.eq('status', status).lt('createdAt', startedAt - window))))
  },

  invitations: async (ctx: MutationCtx, startedAt: number) => remove(ctx, 'invitation', [ctx.db.query('invitation')
    .withIndex('status_expiresAt', q => q.eq('status', 'pending').lt('expiresAt', startedAt - EXPIRED_INVITATION_RETENTION_MS))]),

  // The audit trail, a year back.
  auditEvents: async (ctx: MutationCtx, startedAt: number) => remove(ctx, 'auditEvents', [ctx.db.query('auditEvents')
    .withIndex('at', q => q.lt('at', startedAt - AUDIT_EVENT_RETENTION_MS))]),

  // Notifications: a read one 90 days after it was read, an unread one 365 days after it was recorded.
  notifications: async (ctx: MutationCtx, startedAt: number) => remove(ctx, 'notifications', [
    ctx.db.query('notifications').withIndex('readAt_at', q => q.gt('readAt', 0).lt('readAt', startedAt - NOTIFICATION_READ_RETENTION_MS)),
    ctx.db.query('notifications').withIndex('readAt_at', q => q.eq('readAt', undefined).lt('at', startedAt - NOTIFICATION_UNREAD_RETENTION_MS)),
  ]),

  // An announcement and its dismissals, 90 days after it expired.
  announcements: async (ctx: MutationCtx, startedAt: number): Promise<Batch> => pruneAnnouncements(ctx, startedAt - ANNOUNCEMENT_RETENTION_MS, MAINTENANCE_BATCH),

  // A finished lifecycle run of a flow that may run again, 90 days on.
  lifecycleRuns: async (ctx: MutationCtx, startedAt: number): Promise<Batch> => pruneLifecycleRuns(ctx, startedAt - LIFECYCLE_RUN_RETENTION_MS, MAINTENANCE_BATCH),

  // An export's file goes when its link expires; its record a day after it
  // was made, with the file when that expiry never ran.
  accountExports: async (ctx: MutationCtx, startedAt: number) => remove(ctx, 'accountExports', [ctx.db.query('accountExports')
    .withIndex('createdAt', q => q.lt('createdAt', startedAt - ACCOUNT_EXPORT_RETENTION_MS))], async (row) => {
    for (const part of await ctx.db.query('accountExportParts').withIndex('exportId', q => q.eq('exportId', row._id)).take(250)) {
      await ctx.storage.delete(part.storageId)
      await ctx.db.delete('accountExportParts', part._id)
    }
    if (row.storageId) await ctx.storage.delete(row.storageId)
  }),

  // An erasure that kept failing, past the window an operator has to run it again.
  failedErasures: async (ctx: MutationCtx, startedAt: number) => {
    const batch = await remove(ctx, 'accountErasures', [ctx.db.query('accountErasures')
      .withIndex('failedAt', q => q.gt('failedAt', 0).lt('failedAt', startedAt - FAILED_ERASURE_RETENTION_MS))])
    const appPart = await remove(ctx, 'accountErasureFailures', [ctx.db.query('accountErasureFailures')
      .withIndex('failedAt', q => q.lt('failedAt', startedAt - FAILED_ERASURE_RETENTION_MS))])
    batch.pruned += appPart.pruned
    batch.done &&= appPart.done
    if (batch.pruned > 0) logBackend('error', 'account.erasure_failed', `${batch.pruned} failed erasure(s) were dropped after ${FAILED_ERASURE_RETENTION_MS / 86_400_000} days without a retry.`)
    return batch
  },

  // A waitlist join whose code never checked is dropped after a day.
  waitlistJoins: async (ctx: MutationCtx, startedAt: number): Promise<Batch> => pruneJoins(ctx, startedAt - WAITLIST_JOIN_TTL_MS),

  // A launch-news contact left pending or drifting is written again; nothing is deleted.
  waitlistMirror: async (ctx: MutationCtx, startedAt: number): Promise<Batch> => {
    await retryMirrors(ctx, startedAt - WAITLIST_MIRROR_RETRY_MS)
    return { pruned: 0, done: true }
  },

  // Uploads nobody claimed (a closed tab, a claim refused and rolled back),
  // a day after they arrived. Storage is walked in creation order from where
  // the last batch stopped, kept in the task's row, so a kept file is read
  // once and a backlog spreads over batches.
  files: async (ctx: MutationCtx, startedAt: number): Promise<Batch> => {
    const row = await ctx.db.query('maintenanceTasks').withIndex('task', q => q.eq('task', 'files')).unique()
    const batch = await sweepUnclaimed(ctx, startedAt - UNCLAIMED_FILE_MS, row?.cursor ?? 0)
    if (row && batch.cursor !== row.cursor) await ctx.db.patch('maintenanceTasks', row._id, { cursor: batch.cursor })
    return { pruned: batch.pruned, done: batch.done }
  },

  // The job queue's finished jobs, dead letters included, 30 days on. A
  // guest's done job stays counted in its browser's `guestTries`.
  jobs: async (ctx: MutationCtx, startedAt: number) => {
    const before = startedAt - JOB_RETENTION_MS
    return remove(ctx, 'jobs', (['done', 'failed', 'canceled'] as const).map(status => ctx.db.query('jobs')
      .withIndex('by_status_and_endedAt', q => q.eq('status', status).lt('endedAt', before))))
  },

  // A browser's used guest tries, a year after its last: the visitor cookie's lifetime.
  guestTries: async (ctx: MutationCtx, startedAt: number) => remove(ctx, 'guestTries', [ctx.db.query('guestTries')
    .withIndex('by_lastAt', q => q.lt('lastAt', startedAt - GUEST_TRIES_RETENTION_MS))]),

  // What AI cost per person per day, and the app's day totals, 90 days on: the Costs tab reads no further back.
  aiCosts: async (ctx: MutationCtx, startedAt: number) => remove(ctx, 'aiCosts', [ctx.db.query('aiCosts')
    .withIndex('by_day_and_who', q => q.lt('day', startedAt - AI_COST_RETENTION_MS))]),

  aiCostDays: async (ctx: MutationCtx, startedAt: number) => remove(ctx, 'aiCostDays', [ctx.db.query('aiCostDays')
    .withIndex('by_day_and_shard', q => q.lt('day', startedAt - AI_COST_RETENTION_MS))]),

  // The devices an account signed in from, a year after each was last seen.
  knownDevices: async (ctx: MutationCtx, startedAt: number) => remove(ctx, 'knownDevices', [ctx.db.query('knownDevices')
    .withIndex('lastSeenAt', q => q.lt('lastSeenAt', startedAt - KNOWN_DEVICE_RETENTION_MS))]),

  // A suppression the provider lifted, a week on: a late event from before the lift no longer comes.
  suppressions: async (ctx: MutationCtx, startedAt: number) => remove(ctx, 'suppressions', [ctx.db.query('suppressions')
    .withIndex('liftedAt_suppressedAt', q => q.gt('liftedAt', 0).lt('liftedAt', startedAt - LIFTED_SUPPRESSION_RETENTION_MS))]),

  // The alerts sent, once the month they guard is over.
  monitoringAlerts: async (ctx: MutationCtx, startedAt: number) => remove(ctx, 'monitoringAlerts', [ctx.db.query('monitoringAlerts')
    .withIndex('by_at', q => q.lt('at', startedAt - ALERT_RETENTION_MS))]),

  // The contact form's messages and the mail the app received, 90 days on; a reply address a year.
  contactMessages: async (ctx: MutationCtx, startedAt: number) => remove(ctx, 'contactMessages', [ctx.db.query('contactMessages')
    .withIndex('sentAt', q => q.lt('sentAt', startedAt - INBOUND_RETENTION_MS))]),

  inboundMessages: async (ctx: MutationCtx, startedAt: number) => remove(ctx, 'inboundMessages', [ctx.db.query('inboundMessages')
    .withIndex('receivedAt', q => q.lt('receivedAt', startedAt - INBOUND_RETENTION_MS))]),

  replyAddresses: async (ctx: MutationCtx, startedAt: number) => remove(ctx, 'replyAddresses', [ctx.db.query('replyAddresses')
    .withIndex('createdAt', q => q.lt('createdAt', startedAt - REPLY_ADDRESS_RETENTION_MS))]),

  // The content duties' records, 548 days after a report closed or a
  // decision was made; a decision whose appeal is open waits for its answer.
  reports: async (ctx: MutationCtx, startedAt: number) => remove(ctx, 'reports', [ctx.db.query('reports')
    .withIndex('status_closedAt', q => q.eq('status', 'closed').lt('closedAt', startedAt - REPORT_RETENTION_MS))]),

  reportDecisions: async (ctx: MutationCtx, startedAt: number): Promise<Batch> => pruneDecisions(ctx, startedAt - REPORT_RETENTION_MS, DECISION_BATCH),

  billingDeletions: async (ctx: MutationCtx, startedAt: number) => remove(ctx, 'billingDeletions', [ctx.db.query('billingDeletions')
    .withIndex('at', q => q.lt('at', startedAt - BILLING_DELETION_RETENTION_MS))]),

  // The billing lifecycle's records, each past its own window: consent
  // proofs three years after the consent (a day or two for a checkout that
  // started nothing), withdrawals three years, save offers and once-marks two.
  billingConsents: async (ctx: MutationCtx, startedAt: number) => remove(ctx, 'billingRenewalConsents', [
    ctx.db.query('billingRenewalConsents').withIndex('consentedAt_createdAt', q => q.eq('consentedAt', undefined).lt('createdAt', startedAt - UNCONFIRMED_CONSENT_RETENTION_MS)),
    ctx.db.query('billingRenewalConsents').withIndex('consentedAt_createdAt', q => q.gt('consentedAt', 0).lt('consentedAt', startedAt - RENEWAL_CONSENT_RETENTION_MS)),
  ]),

  billingWithdrawals: async (ctx: MutationCtx, startedAt: number) => remove(ctx, 'billingWithdrawals', [ctx.db.query('billingWithdrawals')
    .withIndex('at', q => q.lt('at', startedAt - RENEWAL_CONSENT_RETENTION_MS))]),

  billingSaveOffers: async (ctx: MutationCtx, startedAt: number) => remove(ctx, 'billingSaveOffers', [ctx.db.query('billingSaveOffers')
    .withIndex('madeAt', q => q.lt('madeAt', startedAt - LIFECYCLE_RECORD_RETENTION_MS))]),

  billingLifecycleMarks: async (ctx: MutationCtx, startedAt: number) => remove(ctx, 'billingLifecycleMarks', [ctx.db.query('billingLifecycleMarks')
    .withIndex('at', q => q.lt('at', startedAt - LIFECYCLE_RECORD_RETENTION_MS))]),

  // A secret email whose own expiry never ran: its code has expired, so
  // its message is deleted, unsent.
  secretOutbox: async (ctx: MutationCtx, startedAt: number): Promise<Batch> => {
    const batch = await remove(ctx, 'secretOutbox', [ctx.db.query('secretOutbox')
      .withIndex('by_creation_time', q => q.lt('_creationTime', startedAt - SECRET_OUTBOX_TTL_MS))])
    if (batch.pruned > 0) logBackend('warn', 'email.secret_failed', `${batch.pruned} secret email(s) were not delivered: their codes expired first.`)
    return batch
  },
} satisfies Record<string, (ctx: MutationCtx, startedAt: number) => Promise<Batch>>

/** A task's name. */
type TaskName = keyof typeof MAINTENANCE_TASKS

/** The provider component's own prunes: it batches them itself and does not count what it deletes. */
const EMAIL_RECORDS_TASK = 'emailRecords'

const vTask = v.union(...(Object.keys(MAINTENANCE_TASKS) as TaskName[]).map(name => v.literal(name)))

/** Mark a task's pass started, unless one is still running or a daily task already ran today. Returns whether to start. */
async function startTask(ctx: MutationCtx, task: string, now: number): Promise<boolean> {
  const row = await ctx.db.query('maintenanceTasks').withIndex('task', q => q.eq('task', task)).unique()
  if (!row) {
    await ctx.db.insert('maintenanceTasks', { task, startedAt: now, totalPruned: 0 })
    return true
  }
  const running = (row.finishedAt === undefined || row.finishedAt < row.startedAt) && now - row.startedAt < STALE_PASS_MS
  if (running) return false
  await ctx.db.patch('maintenanceTasks', row._id, { startedAt: now })
  return true
}

/** The maintenance cron's schedule, as its monitor's config takes it. */
const MAINTENANCE_SCHEDULE = { every: { minutes: MAINTENANCE_INTERVAL_MS / 60_000 } }

/**
 * Record a finished pass, which releases its task for the next one: when,
 * how many rows it deleted (`undefined` when the task cannot count them),
 * and the error that ended it early, if one did. The task that finishes a
 * pass last checks the pass in to its monitor.
 */
async function finishTask(ctx: MutationCtx, task: string, pruned: number | undefined, error?: string): Promise<void> {
  const row = await ctx.db.query('maintenanceTasks').withIndex('task', q => q.eq('task', task)).unique()
  if (!row) return
  await ctx.db.patch('maintenanceTasks', row._id, {
    finishedAt: Date.now(),
    pruned,
    totalPruned: row.totalPruned + (pruned ?? 0),
    error,
  })
  await checkInWhenPassEnds(ctx, row.startedAt)
}

/**
 * Check a pass in once its last task has finished: the tasks it started
 * share its start time. Two tasks that finish at once read each other's
 * rows, so only the one that commits second sees the pass whole.
 */
async function checkInWhenPassEnds(ctx: MutationCtx, startedAt: number): Promise<void> {
  const tasks = (await ctx.db.query('maintenanceTasks').withIndex('task').take(50)).filter(task => task.startedAt === startedAt)
  if (tasks.some(task => task.finishedAt === undefined || task.finishedAt < task.startedAt)) return
  await scheduleHeartbeat(ctx, MAINTENANCE_JOB, MAINTENANCE_SCHEDULE, tasks.some(task => task.error !== undefined) ? 'error' : 'ok')
}

/** Start a maintenance pass: every task's first batch, each in a transaction of its own. The component's cron runs it every hour. */
export const run = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now()
    for (const task of Object.keys(MAINTENANCE_TASKS) as TaskName[]) {
      if (await startTask(ctx, task, now)) await ctx.scheduler.runAfter(0, internal.maintenance.sweep, { task, startedAt: now, pruned: 0 })
    }
    if (await startTask(ctx, EMAIL_RECORDS_TASK, now)) {
      // The app's retention, as its sends last carried it, else the defaults.
      const retention = await ctx.db.query('emailSettings').first()
      await ctx.scheduler.runAfter(0, components.resend.lib.cleanupOldEmails, { olderThan: retention?.finalizedMs ?? EMAIL_RECORD_RETENTION_MS })
      await ctx.scheduler.runAfter(0, components.resend.lib.cleanupAbandonedEmails, { olderThan: retention?.abandonedMs ?? ABANDONED_EMAIL_RETENTION_MS })
      await finishTask(ctx, EMAIL_RECORDS_TASK, undefined)
    }
    return null
  },
})

const vBatch = v.object({ pruned: v.number(), done: v.boolean() })

/** One batch of one task, run by `sweep` as a subtransaction of its own. */
export const batch = internalMutation({
  args: { task: vTask, startedAt: v.number() },
  returns: vBatch,
  handler: async (ctx, { task, startedAt }) => {
    const { pruned, done } = await MAINTENANCE_TASKS[task](ctx, startedAt)
    return { pruned, done }
  },
})

/**
 * Run one batch of one task; schedule the next until the task is done, then
 * record the pass. A batch that throws rolls back alone: the error is
 * logged and recorded, and the pass ends, so the next one starts afresh.
 */
export const sweep = internalMutation({
  args: { task: vTask, startedAt: v.number(), pruned: v.number() },
  returns: v.null(),
  handler: async (ctx, { task, startedAt, pruned }) => {
    let batch: Batch
    try {
      batch = await ctx.runMutation(internal.maintenance.batch, { task, startedAt }, { transactionLimits: BATCH_TRANSACTION_LIMITS })
    }
    catch (error) {
      logBackend('error', 'maintenance.task_failed', `Maintenance task ${task} failed; its pass ends here and the next one tries again.`, error)
      await finishTask(ctx, task, pruned, error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300))
      return null
    }
    const total = pruned + batch.pruned
    if (!batch.done) {
      await ctx.scheduler.runAfter(0, internal.maintenance.sweep, { task, startedAt, pruned: total })
      return null
    }
    await finishTask(ctx, task, total)
    return null
  },
})

/**
 * Maintenance health: each task's latest pass, by task name. A task that has
 * never run is absent. `pruned` is the latest finished pass's count, absent
 * for the email records, whose prune the provider component counts itself.
 * Exposed as `components.backend.maintenance.status`; DevTools reads it.
 */
export const status = query({
  args: {},
  returns: v.array(v.object({
    task: v.string(),
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),
    pruned: v.optional(v.number()),
    totalPruned: v.number(),
    error: v.optional(v.string()),
  })),
  handler: async (ctx) => {
    const rows = await ctx.db.query('maintenanceTasks').withIndex('task').take(50)
    return rows.map(({ task, startedAt, finishedAt, pruned, totalPruned, error }) => ({
      task,
      startedAt,
      totalPruned,
      ...(finishedAt === undefined ? {} : { finishedAt }),
      ...(pruned === undefined ? {} : { pruned }),
      ...(error === undefined ? {} : { error }),
    }))
  },
})
