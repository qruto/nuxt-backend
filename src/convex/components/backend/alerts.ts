import { v } from 'convex/values'
import { Resend } from 'resend'
import { internal } from './_generated/api.js'
import { type ActionCtx, env, internalAction, internalMutation } from './_generated/server.js'
import { logBackend } from '../../log.js'
import { alertEvent, type BackendAlertKind, eventEnvelope, parseMonitoringDsn, postEnvelope, reportingDeployment } from '../../monitoring.js'
import { DAY_MS, dayOf } from './costs.js'

/**
 * The backend's alerts, checked every hour by the component's cron
 * (`backend alerts`) on a deployment that checks its jobs in (`sandbox` or
 * `production`, see `reportingDeployment`):
 *
 * - **The email quota:** the provider's usage endpoint, once the plan's daily
 *   or monthly quota is 80% used, and again once it is used up.
 * - **AI spend:** what AI cost the whole app for the UTC day so far (the
 *   job queue, metered actions, streams, chat and knowledge), once it passes
 *   twice the daily average of the seven days before and $5.
 * - **The AI spend limit:** raised at once, not by the hourly check, when
 *   the day's spend reaches `setupAi({ spendLimit })` and `pause_ai` turns
 *   on (`costs.checkSpendLimit`); on every deployment.
 *
 * Each fires once per period (`monitoringAlerts`): a `monitoring.alert` log
 * line, and a message event to the monitoring service when `MONITORING_DSN`
 * is set, grouped by its kind and tagged `backend.alert`. Convex's own usage
 * has no endpoint a deployment can read: its usage limits warn the team by
 * email (`npx convex deployment usage-limits set --type warning`), and
 * `doctor --prod` checks one is set.
 */

/** The cron job's name. */
export const ALERTS_JOB = 'backend alerts'

/** The share of a quota used at which the alert fires, then the share at which it fires again. */
export const EMAIL_QUOTA_THRESHOLDS = [0.8, 1] as const

/** The least the day's AI spend must reach, in US dollars, before it can alert. */
export const AI_SPEND_FLOOR_USD = 5

/** How many times the daily average of the days before the day's spend must reach. */
export const AI_SPEND_FACTOR = 2

/** The days before today the average is taken over. */
export const AI_SPEND_BASELINE_DAYS = 7

/** One alert to raise, before it is checked against the ones already sent. */
export interface PendingAlert {
  kind: BackendAlertKind
  /** The alert and its threshold, the row's key: `email_quota:daily:80`. */
  key: string
  /** The period it fires once for: the UTC day (`2026-10-27`), or for the monthly quota the day the plan's month resets (`until 2026-11-14`). */
  period: string
  level: 'warning' | 'error'
  message: string
  data: Record<string, string | number>
}

/** A quota window as the email provider's usage endpoint reports it. */
interface QuotaWindow {
  used: number
  limit: number | null
  /** When the window resets: the next UTC midnight, or the end of the plan's billing month. */
  resets_at?: string
}

const dateOf = (at: number) => new Date(at).toISOString().slice(0, 10)
const monthOf = (at: number) => new Date(at).toISOString().slice(0, 7)
const count = (value: number) => value.toLocaleString('en-US')

/**
 * The monthly window an alert fires once for: the plan's billing month,
 * named by the day it resets, since a paid plan's month runs from its
 * billing date. The calendar month when the provider names no reset.
 */
function billingMonthOf(window: QuotaWindow, now: number): string {
  const resets = window.resets_at ? Date.parse(window.resets_at) : Number.NaN
  return Number.isNaN(resets) ? monthOf(now) : `until ${dateOf(resets)}`
}

/**
 * The email quota alerts the usage calls for: the highest threshold each
 * window passed, once per UTC day for the daily quota and once per billing
 * month for the monthly one.
 */
export function emailQuotaAlerts(usage: { daily: QuotaWindow, monthly: QuotaWindow }, now: number): PendingAlert[] {
  const windows = [['daily', usage.daily, dateOf(now)], ['monthly', usage.monthly, billingMonthOf(usage.monthly, now)]] as const
  return windows.flatMap(([window, { used, limit }, period]) => {
    if (!limit || limit <= 0) return []
    const passed = EMAIL_QUOTA_THRESHOLDS.filter(threshold => used >= limit * threshold).at(-1)
    if (passed === undefined) return []
    const full = passed >= 1
    const message = full
      ? `The email plan's ${window} quota is used up: ${count(used)} of ${count(limit)} emails. Sign-in codes and every other email wait until it resets, unless the plan pays for more.`
      : `The email plan's ${window} quota is ${Math.floor((used / limit) * 100)}% used: ${count(used)} of ${count(limit)} emails.`
    return [{ kind: 'email_quota' as const, key: `email_quota:${window}:${passed * 100}`, period, level: full ? 'error' as const : 'warning' as const, message, data: { window, used, limit } }]
  })
}

/** The AI spend alert the days call for: today's against the average of the days before. */
export function aiSpendAlert(days: ReadonlyArray<{ day: number, usd: number }>, now: number): PendingAlert | null {
  const today = dayOf(now)
  const spent = days.find(entry => entry.day === today)?.usd ?? 0
  const before = days.filter(entry => entry.day < today && entry.day >= today - AI_SPEND_BASELINE_DAYS * DAY_MS)
  const average = before.reduce((sum, entry) => sum + entry.usd, 0) / AI_SPEND_BASELINE_DAYS
  if (spent < AI_SPEND_FLOOR_USD || spent < AI_SPEND_FACTOR * average) return null
  const usd = (value: number) => `$${value.toFixed(2)}`
  return {
    kind: 'ai_spend',
    key: 'ai_spend',
    period: dateOf(now),
    level: 'warning',
    message: `AI calls cost ${usd(spent)} so far today (UTC), over ${AI_SPEND_FACTOR} times the ${usd(average)} a day of the ${AI_SPEND_BASELINE_DAYS} days before.`,
    data: { usd: Number(spent.toFixed(4)), average: Number(average.toFixed(4)) },
  }
}

/** Claim an alert for its period: `true` the first time, `false` once it was sent. */
export const claim = internalMutation({
  args: { alert: v.string(), period: v.string(), at: v.number() },
  returns: v.boolean(),
  handler: async (ctx, { alert, period, at }) => {
    const sent = await ctx.db.query('monitoringAlerts').withIndex('by_alert_and_period', q => q.eq('alert', alert).eq('period', period)).unique()
    if (sent) return false
    await ctx.db.insert('monitoringAlerts', { alert, period, at })
    return true
  },
})

/** The email quota alerts, from the provider's usage endpoint; none without a key, or when it cannot be read. */
async function emailAlerts(now: number): Promise<PendingAlert[]> {
  if (!env.EMAIL_API_KEY) return []
  try {
    const usage = await new Resend(env.EMAIL_API_KEY).usage.get()
    if (usage.error) throw new Error(usage.error.message)
    return emailQuotaAlerts(usage.data.emails, now)
  }
  catch (error) {
    logBackend('warn', 'monitoring.alert_unread', 'The email provider\'s usage could not be read for the quota alert.', error)
    return []
  }
}

/** Where the alerts report from: the deployment's environment and server name, and whether it checks its jobs in. */
const reportingFrom = () => reportingDeployment({ CONVEX_CLOUD_URL: env.CONVEX_CLOUD_URL, BACKEND_ENVIRONMENT: env.BACKEND_ENVIRONMENT })

/**
 * Raise an alert the first time in its period: a `monitoring.alert` log line,
 * and the monitoring service's event when `MONITORING_DSN` is set. Answers
 * whether it was raised.
 */
async function raiseOnce(ctx: ActionCtx, alert: PendingAlert, now: number, where: ReturnType<typeof reportingFrom>): Promise<boolean> {
  if (!await ctx.runMutation(internal.alerts.claim, { alert: alert.key, period: alert.period, at: now })) return false
  logBackend('warn', 'monitoring.alert', alert.message)
  const dsn = parseMonitoringDsn(env.MONITORING_DSN)
  if (!dsn) return true
  const event = alertEvent({
    alert: alert.kind,
    message: alert.message,
    level: alert.level,
    data: alert.data,
    ...where.environment ? { environment: where.environment } : {},
    ...where.serverName ? { serverName: where.serverName } : {},
  })
  if (!await postEnvelope(dsn, eventEnvelope(dsn, event))) logBackend('warn', 'monitoring.report_failed', `The ${alert.kind} alert could not be posted to the monitoring service; it stays in the log.`)
  return true
}

const vPendingAlert = v.object({
  kind: v.union(v.literal('email_quota'), v.literal('ai_spend'), v.literal('ai_spend_limit')),
  key: v.string(),
  period: v.string(),
  level: v.union(v.literal('warning'), v.literal('error')),
  message: v.string(),
  data: v.record(v.string(), v.union(v.string(), v.number())),
})

/** Raise one alert now, once in its period: what the AI spend limit schedules when it pauses AI. */
export const raise = internalAction({
  args: { alert: vPendingAlert },
  returns: v.boolean(),
  handler: async (ctx, { alert }) => raiseOnce(ctx, alert, Date.now(), reportingFrom()),
})

/** The hourly check: each alert that fires for the first time in its period is logged and reported. */
export const check = internalAction({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    // A pause the spend limit left on past its day, lifted even where nothing checks in.
    await ctx.runMutation(internal.costs.resetSpendLimit, {})
    const where = reportingFrom()
    if (!where.checksIn) return 0
    const now = Date.now()
    const today = dayOf(now)
    // The day totals the costs keep: a few rows a day however many people spent, so no day of the baseline is cut short.
    const days = await ctx.runQuery(internal.costs.dailySpend, { since: today - AI_SPEND_BASELINE_DAYS * DAY_MS, until: today })
    const spend = aiSpendAlert(days, now)
    const pending = [...await emailAlerts(now), ...spend ? [spend] : []]
    let raised = 0
    for (const alert of pending) {
      if (await raiseOnce(ctx, alert, now, where)) raised++
    }
    return raised
  },
})

/** How long an alert's record is kept: past the longest period it guards, a month. */
export const ALERT_RETENTION_MS = 62 * 24 * 60 * 60 * 1000
