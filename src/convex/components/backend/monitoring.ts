import { v } from 'convex/values'
import { internal } from './_generated/api.js'
import { env, internalAction, type MutationCtx } from './_generated/server.js'
import { logBackend } from '../../log.js'
import { checkInEnvelope, parseMonitoringDsn, postEnvelope, reportingDeployment } from '../../monitoring.js'
import type { BackendCronSchedule } from '../../monitoring.js'

/**
 * The component's cron check-ins. Each of its scheduled jobs checks in to a
 * monitor of the service `MONITORING_DSN` names (forwarded by the app's
 * `convex.config.ts`, with `BACKEND_ENVIRONMENT`), so a job that stops
 * running, or fails, shows there. A mutation cannot fetch, so a mutation
 * job schedules {@link heartbeat} as it ends ({@link scheduleHeartbeat}),
 * inside its own transaction: a run that throws rolls the schedule back
 * with it, and its monitor sees a missed check-in. Nothing is scheduled or
 * posted without a DSN, or from a deployment that does not check in (a dev
 * or a preview one, see `reportingDeployment`).
 */

/** When a job is due, as a check-in's monitor config takes it. */
const vSchedule = v.union(
  v.object({ every: v.object({ seconds: v.optional(v.number()), minutes: v.optional(v.number()), hours: v.optional(v.number()) }) }),
  v.object({ cron: v.string() }),
)

/** How a run ended: `ok`, or `error` for one that recorded a failure. */
const vStatus = v.union(v.literal('ok'), v.literal('error'))

/** The component's env, as a report reads it. */
function deployment() {
  return reportingDeployment({ CONVEX_CLOUD_URL: env.CONVEX_CLOUD_URL, BACKEND_ENVIRONMENT: env.BACKEND_ENVIRONMENT })
}

/**
 * Post one check-in of `monitor`. Resolves with whether the service took
 * it; never rejects.
 */
export async function postCheckIn(monitor: string, status: 'ok' | 'error', schedule: BackendCronSchedule): Promise<boolean> {
  const dsn = parseMonitoringDsn(env.MONITORING_DSN)
  const { environment, checksIn } = deployment()
  if (!dsn || !checksIn) return false
  const sent = await postEnvelope(dsn, checkInEnvelope(dsn, { monitor, status, schedule, ...environment ? { environment } : {} }))
  if (!sent) logBackend('warn', 'monitoring.report_failed', `The check-in of "${monitor}" could not be posted to the monitoring service; the job went on.`)
  return sent
}

/**
 * A mutation job's check-in, scheduled inside its transaction: it posts
 * only once the job commits, `ok`, or `error` for a run that recorded a
 * failure of its own. Nothing is scheduled without a DSN that parses, or
 * on a deployment that does not check in.
 */
export async function scheduleHeartbeat(ctx: MutationCtx, monitor: string, schedule: BackendCronSchedule, status: 'ok' | 'error' = 'ok'): Promise<void> {
  if (!parseMonitoringDsn(env.MONITORING_DSN) || !deployment().checksIn) return
  await ctx.scheduler.runAfter(0, internal.monitoring.heartbeat, { monitor, schedule, status })
}

/** The action a mutation job's check-in runs in, once the job has committed. */
export const heartbeat = internalAction({
  args: { monitor: v.string(), schedule: vSchedule, status: v.optional(vStatus) },
  returns: v.boolean(),
  handler: async (_ctx, { monitor, schedule, status }) => postCheckIn(monitor, status ?? 'ok', schedule as BackendCronSchedule),
})
