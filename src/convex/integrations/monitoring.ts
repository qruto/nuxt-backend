/**
 * Error reports and cron check-ins from the backend's own actions, sent to
 * the monitoring service the deployment's DSN names. They are posted
 * straight to its ingest endpoint with `fetch`: no SDK runs in the backend.
 * Without `MONITORING_DSN` on the deployment every call is a no-op that
 * resolves `false`. Reports name the environment `BACKEND_ENVIRONMENT`
 * says (`env push` derives it from the deployment's kind), so they sit
 * beside the app's own.
 *
 * Only actions (and HTTP actions) can post: a query or a mutation cannot
 * fetch. Their failures are reported where they are called from: the
 * browser and the Nuxt server report them with the function's name and the
 * error's catalog code. A mutation job checks in by scheduling an action
 * that calls {@link checkIn} as it succeeds, so a failed run shows as a
 * missed check-in.
 *
 * The `authed`, `workspace`, `admin` and `withRole` actions of `createFunctions`
 * report what their handlers throw already, with its code and stack; an
 * action cannot read its own name, so those reports carry no
 * `backend.function` tag (the caller's report of the same failure does).
 * The functions here are for the app's own actions and jobs.
 *
 * Experimental: the cron check-ins follow the monitoring service's cron
 * monitors, whose options may still move, so this entry's shape may change
 * in a minor release. The tags a report carries (`MONITORING_TAGS`) are
 * stable, as are the health routes.
 *
 * @module
 * @experimental
 */
import { readEnv } from '../delivery.js'
import { logBackend } from '../log.js'
import { type BackendCronSchedule, checkInEnvelope, type CheckInStatus, errorEvent, eventEnvelope, isReportable, monitoringTags, monitorSlug, parseMonitoringDsn, postEnvelope, reportingDeployment } from '../monitoring.js'

export { isReportable, MONITORING_TAGS } from '../monitoring.js'
export type { BackendCronSchedule, CheckInStatus, CronInterval } from '../monitoring.js'

/** What a report says about where an error happened. */
export interface ReportErrorOptions {
  /** The function it happened in, `digest:send`, or the route, `imports webhook`. */
  function?: string
  /** More tags to search the report by. */
  tags?: Record<string, string>
}

/** The deployment's DSN, parsed; `null` when it is unset or malformed. */
function deploymentDsn() {
  return parseMonitoringDsn(readEnv('MONITORING_DSN'))
}

/** Where this deployment's reports come from, as its env names it. */
function deployment() {
  return reportingDeployment({ CONVEX_CLOUD_URL: readEnv('CONVEX_CLOUD_URL'), BACKEND_ENVIRONMENT: readEnv('BACKEND_ENVIRONMENT') })
}

/** Logged once per isolate: a DSN that does not parse turns reporting off. */
let warnedMalformed = false

function malformed(): void {
  if (warnedMalformed || !readEnv('MONITORING_DSN')) return
  warnedMalformed = true
  logBackend('warn', 'monitoring.report_failed', 'MONITORING_DSN is set but is not a DSN (https://<key>@<host>/<project id>), so nothing is reported.')
}

/**
 * Report an error to the monitoring service, from an action. A refusal from
 * the error catalog (anything but `unavailable`) is the app working as
 * designed and is not reported. Resolves with whether a report was sent;
 * never rejects, so a report cannot fail the action it reports on. A report
 * carries the error's name, message and stack, the function and the tags:
 * never the call's arguments, or who made it.
 *
 * @example
 * ```ts [backend/digest.ts]
 * import { reportError } from 'nuxt-backend/monitoring'
 *
 * export const send = internalAction({
 *   args: {},
 *   handler: async (ctx) => {
 *     try {
 *       await deliverDigests(ctx)
 *     }
 *     catch (error) {
 *       await reportError(error, { function: 'digest:send' })
 *       throw error
 *     }
 *   },
 * })
 * ```
 */
export async function reportError(error: unknown, options: ReportErrorOptions = {}): Promise<boolean> {
  if (!isReportable(error)) return false
  const dsn = deploymentDsn()
  if (!dsn) {
    malformed()
    return false
  }
  const { serverName, environment } = deployment()
  const event = errorEvent({
    error,
    tags: { ...monitoringTags(error, { ...options.function ? { function: options.function } : {}, source: 'backend' }), ...options.tags },
    ...serverName ? { serverName } : {},
    ...environment ? { environment } : {},
  })
  const sent = await postEnvelope(dsn, eventEnvelope(dsn, event))
  if (!sent) logBackend('warn', 'monitoring.report_failed', 'An error report could not be posted to the monitoring service; the function went on.')
  return sent
}

/** A check-in's status, and what keeps its monitor in step with the code. */
export interface CheckInOptions {
  /** Default `ok`. `in_progress` when a long job starts, then `ok` or `error` when it ends. */
  status?: CheckInStatus
  /**
   * The job's schedule, `every` an interval or on a `cron` expression. Given, the first
   * check-in creates the monitor, and every later one keeps its schedule in
   * step with the code.
   */
  schedule?: BackendCronSchedule
  /** How long the run took, in milliseconds. */
  durationMs?: number
}

/**
 * Check a scheduled job in to its monitor, from an action: the job named
 * `send weekly digest` checks in to `send-weekly-digest`. A monitor that
 * expects a check-in and gets none reports the job missed, which is how a
 * failed run shows. Resolves with whether the check-in was sent; never
 * rejects.
 *
 * Only a deployment whose `BACKEND_ENVIRONMENT` is set, and is neither
 * `development` nor `preview`, checks in: `env push --prod` sets
 * `production`. A dev deployment that sleeps with a laptop, or a preview
 * deleted with its branch, would otherwise read as a missed run.
 *
 * A job that runs as a mutation cannot fetch: it schedules an action that
 * checks in, as its last step, so a run that throws takes the check-in with
 * it.
 *
 * @example
 * ```ts [backend/digest.ts]
 * import { checkIn } from 'nuxt-backend/monitoring'
 *
 * export const send = internalAction({
 *   args: {},
 *   handler: async (ctx) => {
 *     await deliverDigests(ctx)
 *     await checkIn('send weekly digest', { schedule: { cron: '15 8 * * 1' } })
 *   },
 * })
 * ```
 *
 * @example
 * ```ts [backend/digest.ts]
 * // A mutation job: its last step schedules the check-in, in its own transaction.
 * export const prune = internalMutation({
 *   args: {},
 *   handler: async (ctx) => {
 *     await pruneOldDrafts(ctx)
 *     await ctx.scheduler.runAfter(0, internal.digest.pruneCheckIn, {})
 *   },
 * })
 *
 * export const pruneCheckIn = internalAction({
 *   args: {},
 *   handler: async () => {
 *     await checkIn('prune drafts', { schedule: { every: { hours: 1 } } })
 *   },
 * })
 * ```
 */
export async function checkIn(job: string, options: CheckInOptions = {}): Promise<boolean> {
  const dsn = deploymentDsn()
  if (!dsn) {
    malformed()
    return false
  }
  const { environment, checksIn } = deployment()
  if (!checksIn) return false
  const sent = await postEnvelope(dsn, checkInEnvelope(dsn, {
    monitor: job,
    status: options.status ?? 'ok',
    ...options.schedule ? { schedule: options.schedule } : {},
    ...options.durationMs !== undefined ? { durationMs: options.durationMs } : {},
    ...environment ? { environment } : {},
  }))
  if (!sent) logBackend('warn', 'monitoring.report_failed', `A check-in of "${job}" could not be posted to the monitoring service; the job went on.`)
  return sent
}

/**
 * An action handler that reports what it throws ({@link reportError}), then
 * rethrows it: the caller still sees the failure.
 *
 * @example
 * ```ts [backend/imports.ts]
 * import { reportingErrors } from 'nuxt-backend/monitoring'
 *
 * export const run = internalAction({
 *   args: { url: v.string() },
 *   handler: reportingErrors(async (ctx, { url }) => importFrom(url), { function: 'imports:run' }),
 * })
 * ```
 */
export function reportingErrors<Ctx, Args extends unknown[], Result>(
  handler: (ctx: Ctx, ...args: Args) => Promise<Result>,
  options: ReportErrorOptions = {},
): (ctx: Ctx, ...args: Args) => Promise<Result> {
  return async (ctx, ...args) => {
    try {
      return await handler(ctx, ...args)
    }
    catch (error) {
      await reportError(error, options)
      throw error
    }
  }
}

/**
 * An action handler that checks its job in each time it runs: `ok` with how
 * long the run took, or `error` (with the error reported, then rethrown)
 * when it throws. Wrap the action a cron of `backend/crons.ts` calls, and
 * pass the cron's schedule: the first check-in creates the monitor. A job
 * that never runs, or runs late, is the monitor's missed check-in.
 *
 * @example
 * ```ts [backend/digest.ts]
 * import { checkingIn } from 'nuxt-backend/monitoring'
 *
 * export const send = internalAction({
 *   args: {},
 *   handler: checkingIn('send weekly digest', { cron: '15 8 * * 1' }, async (ctx) => {
 *     await deliverDigests(ctx)
 *   }),
 * })
 * ```
 */
export function checkingIn<Ctx, Args extends unknown[], Result>(
  job: string,
  schedule: BackendCronSchedule,
  handler: (ctx: Ctx, ...args: Args) => Promise<Result>,
): (ctx: Ctx, ...args: Args) => Promise<Result> {
  return async (ctx, ...args) => {
    const started = Date.now()
    try {
      const result = await handler(ctx, ...args)
      await checkIn(job, { schedule, durationMs: Date.now() - started })
      return result
    }
    catch (error) {
      await Promise.all([
        reportError(error, { tags: { 'backend.job': monitorSlug(job) } }),
        checkIn(job, { status: 'error', schedule, durationMs: Date.now() - started }),
      ])
      throw error
    }
  }
}
