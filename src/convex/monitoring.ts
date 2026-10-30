// Error reports and cron check-ins, posted straight to the monitoring
// service's ingest endpoint (an envelope, Sentry's wire format) with fetch:
// no SDK, so it runs in the backend's default runtime as well as in Node.
// Runtime-neutral (fetch, Web Crypto and the error catalog only): the
// backend's actions and HTTP actions post with it, the backend component's
// heartbeat checks its cron in with it, and the Nuxt side reads the same
// tags off a failed call (src/runtime/monitoring/).

import type { Crons } from 'convex/server'
import { parseBackendEnvironment } from './environment.js'
import { getBackendError } from './errors.js'
import { isLoopbackUrl } from './loopback.js'

/** How often an interval check-in runs: exactly one of `seconds`, `minutes` or `hours`. */
export type CronInterval = Parameters<Crons['interval']>[1]

/**
 * When a monitored job runs, as its monitor expects it: `every` an
 * interval, or on a `cron` expression (five fields, UTC).
 */
export type BackendCronSchedule
  = | { every: CronInterval, cron?: never }
    | { cron: string, every?: never }

/**
 * The tags an event about a backend call carries. Brand-neutral, so a search
 * in the monitoring service reads the same whichever side reported it: the
 * browser, the Nuxt server or the backend itself.
 */
export const MONITORING_TAGS = {
  /** The function the call ran, `billing:checkout`, or the webhook it came in on, `billing webhook`. */
  function: 'backend.function',
  /** Its catalog code (`unavailable`), or `none` for a crash or an app's own error. */
  code: 'backend.code',
  /** An `unavailable` refusal's `service` and `reason`, as `billing/provider_refused`. */
  reason: 'backend.reason',
  /** Where it was reported from: `browser`, `server` or `backend`. */
  source: 'backend.source',
} as const

/** A parsed DSN: where the ingest endpoint is, and the public key that posts to it. */
export interface MonitoringDsn {
  /** The DSN as it was given. */
  dsn: string
  /** The ingest origin, with any path prefix: `https://o1.ingest.example.io`. */
  origin: string
  projectId: string
  publicKey: string
}

/**
 * Read a DSN (`https://<public key>@<host>/<project id>`); `null` for
 * anything else, so a malformed value turns reporting off rather than
 * posting somewhere unexpected.
 */
export function parseMonitoringDsn(value: string | undefined | null): MonitoringDsn | null {
  if (!value?.trim()) return null
  let url: URL
  try {
    url = new URL(value.trim())
  }
  catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  const publicKey = decodeURIComponent(url.username)
  const segments = url.pathname.split('/').filter(Boolean)
  const projectId = segments.pop()
  if (!publicKey || !projectId || !/^\d+$/.test(projectId)) return null
  const prefix = segments.length > 0 ? `/${segments.join('/')}` : ''
  return { dsn: value.trim(), origin: `${url.protocol}//${url.host}${prefix}`, projectId, publicKey }
}

/** Where envelopes for a DSN go, its public key in the query (no other credential is needed to post). */
export function envelopeUrl(dsn: MonitoringDsn): string {
  return `${dsn.origin}/api/${dsn.projectId}/envelope/?sentry_key=${encodeURIComponent(dsn.publicKey)}&sentry_version=7`
}

/** How a backend function is called. */
export type BackendCallKind = 'query' | 'mutation' | 'action'

/** The function a failed call ran, as the browser client names it in the error it throws. */
export interface BackendCall {
  /** `module:export`, such as `billing:checkout`. */
  function: string
  kind?: BackendCallKind
}

const CALL_PREFIX = /\[CONVEX ([QMA?])\(([^)]+)\)\]/
const CALL_KIND: Record<string, BackendCallKind | undefined> = { Q: 'query', M: 'mutation', A: 'action' }

/**
 * The function a browser client call failed in, read from the prefix the
 * client writes on every failure (`[CONVEX M(billing:checkout)] …`); `null`
 * for an error that is not a failed call. A server-side call (Nitro) carries
 * no such prefix, so its call site names the function instead.
 */
export function backendCallOf(error: unknown): BackendCall | null {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : ''
  const match = CALL_PREFIX.exec(message)
  if (!match) return null
  const kind = CALL_KIND[match[1]!]
  return { function: match[2]!, ...(kind ? { kind } : {}) }
}

/**
 * Whether a failure is worth a report: a crash or an app's own error (no
 * catalog code), or a service that cannot serve the call (`unavailable`).
 * Every other catalog code is a refusal, the app working as designed:
 * nobody signed in, a role it lacks, an argument it refuses, credits that
 * ran out.
 */
export function isReportable(error: unknown): boolean {
  const refusal = getBackendError(error)
  return !refusal || refusal.code === 'unavailable'
}

/**
 * The tags of a failed call: the function (given, or read off a browser
 * client's error), the catalog code (`none` without one) and, for
 * `unavailable`, which service failed and why.
 */
export function monitoringTags(error: unknown, context: { function?: string, source?: 'browser' | 'server' | 'backend' } = {}): Record<string, string> {
  const refusal = getBackendError(error)
  const fn = context.function ?? backendCallOf(error)?.function
  const tags: Record<string, string> = { [MONITORING_TAGS.code]: refusal?.code ?? 'none' }
  if (fn) tags[MONITORING_TAGS.function] = fn
  if (refusal?.code === 'unavailable' && refusal.data.service) tags[MONITORING_TAGS.reason] = `${refusal.data.service}/${refusal.data.reason ?? 'unknown'}`
  if (context.source) tags[MONITORING_TAGS.source] = context.source
  return tags
}

/** 32 lowercase hex characters: the id format events and check-ins take. */
function randomId(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

/** One stack frame, in the order the ingest endpoint wants them: the caller first, the throw site last. */
interface StackFrame {
  function?: string
  filename: string
  lineno: number
  colno: number
  in_app: boolean
}

const FRAME = /^\s*at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?\s*$/

/** The frames of a V8 stack trace, oldest first; none when there is no stack to read. */
export function stackFrames(stack: string | undefined): StackFrame[] {
  if (!stack) return []
  const frames: StackFrame[] = []
  for (const line of stack.split('\n')) {
    const match = FRAME.exec(line)
    if (!match) continue
    const filename = match[2]!
    frames.push({
      ...(match[1] ? { function: match[1] } : {}),
      filename,
      lineno: Number(match[3]),
      colno: Number(match[4]),
      in_app: !filename.includes('node_modules'),
    })
  }
  return frames.reverse()
}

/** The longest message an event carries; the rest is cut. */
const MESSAGE_LIMIT = 8192

/** What stands in for a value the scrubbing removed. */
export const FILTERED = '[Filtered]'

/** An address, also percent-encoded once or twice (`a%40b.com`, `a%2540b.com`) in a URL. */
const EMAIL = /[\w.%+-]+(?:@|%40|%2540)[\w-]+(?:\.[\w-]+)+/g
const BEARER = /\b(Bearer|Basic)\s+[\w.~+/=-]+/gi
/** A credential's scheme alone, as a header's value starts. */
const AUTH_SCHEME = /^(?:Bearer|Basic)$/i
/**
 * A parameter's name and its `=`, after a separator or a percent-encoded
 * one: a URL carried in another's query (`?redirect=/share?ref=1%26token=…`)
 * is read too. Or a field's or a header's name and its `:`, quoted or not:
 * `{"token":"…"}`, `x-api-key: …`.
 */
const PARAM = /(?<=^|[^\w.%-]|%[\dA-F]{2})([\w.-]+)(?:=|%3D|["']?[ \t]*:[ \t]*)/gi
/**
 * A parameter's value: a quoted one to its closing quote (`code="…"`, a
 * JSON string), else up to the next separator, raw or percent-encoded
 * (`%26`, `%23`), or the end of a list or an object.
 */
const PARAM_VALUE = /(["'])(?:(?!\1)[^\\\n]|\\.)+\1|(?:(?!%2[36])[^&#\s"',;{}[\]])+/y

/** The words that make a name a secret's wherever they stand in it: `invite_token`, `sessionId`, `client_secret`. */
const SECRET_WORDS = new Set(['token', 'secret', 'secrets', 'password', 'passwords', 'passwd', 'passcode', 'otp', 'signature', 'sig', 'session', 'sessionid', 'auth', 'authorization', 'ticket', 'credential', 'credentials', 'apikey', 'cookie', 'cookies', 'verifier'])
/** The words that do as a name's last one: `api_key`, `x-api-key`, `otp_code`, but not `key_id` or `code.function`. */
const SECRET_LAST_WORDS = new Set(['key', 'keys', 'code', 'codes'])
/** The words before a last `code` that make it a status: `status_code`, `errorCode`. */
const STATUS_WORDS = new Set(['status', 'error', 'exit'])

/**
 * Whether a parameter, field or header name says it carries a secret. Its
 * words split at `_`, `-`, `.` and a lower-to-upper case step
 * (`accessToken`); one of them is a secret's, or the last is `key` or a
 * `code` that is no status or error code.
 */
function isSecretName(name: string): boolean {
  const words = name.replace(/([a-z\d])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z\d]+/).filter(Boolean)
  if (words.some(word => SECRET_WORDS.has(word))) return true
  const last = words[words.length - 1]
  return last !== undefined && SECRET_LAST_WORDS.has(last) && !STATUS_WORDS.has(words[words.length - 2] ?? '')
}

/** A text with the value of every secret-named parameter replaced; another's value is read on for one inside it. */
function scrubParams(text: string): string {
  let scrubbed = ''
  let from = 0
  for (const match of text.matchAll(PARAM)) {
    if (match.index < from || !isSecretName(match[1]!)) continue
    const start = match.index + match[0].length
    PARAM_VALUE.lastIndex = start
    const value = PARAM_VALUE.exec(text)
    // `Authorization: Bearer …`: the scheme stays, its credential is filtered already.
    if (!value || AUTH_SCHEME.test(value[0])) continue
    // A quoted value keeps its quotes, so a JSON body stays JSON.
    const quote = value[1] ?? ''
    scrubbed += text.slice(from, start) + quote + FILTERED + quote
    from = PARAM_VALUE.lastIndex
  }
  return scrubbed + text.slice(from)
}

/**
 * A text with the personal data and secrets a report must not carry
 * replaced: email addresses (`[email]`), bearer and basic credentials, and
 * the value of every parameter, field or header whose name says it is a
 * secret (`token`, `invite_token`, `accessToken`, `code`, `api_key`,
 * `signature`, …), written `name=value`, `name="value"`, `"name":"value"`
 * or `name: value`, also in a URL carried percent-encoded in another. The monitoring preset
 * runs it on every message, URL and breadcrumb it sends, from every side.
 */
export function scrubText(text: string): string {
  return scrubParams(text
    .replace(EMAIL, '[email]')
    .replace(BEARER, (_match, scheme: string) => `${scheme} ${FILTERED}`))
}

/** A value scrubbed where it is text, objects and arrays walked, a field whose name says it is a secret replaced; anything else as it is. */
function scrubValue(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return scrubText(value)
  if (depth > 4 || value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(item => scrubValue(item, depth + 1))
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, isSecretName(key) ? FILTERED : scrubValue(item, depth + 1)]))
}

/** Fields scrubbed as an event's are: their text by {@link scrubText}, objects and arrays walked, a field whose name says it is a secret replaced. */
export function scrubFields<Fields extends Record<string, unknown>>(fields: Fields): Fields {
  return scrubValue(fields) as Fields
}

/** The parts of an event the scrubbing reads: Sentry's event shape, loosely. */
export interface ScrubbableEvent {
  message?: unknown
  exception?: { values?: Array<{ value?: string }> }
  request?: Record<string, unknown>
  breadcrumbs?: Array<Record<string, unknown>>
  user?: Record<string, unknown>
  extra?: Record<string, unknown>
  contexts?: Record<string, unknown>
}

/**
 * An event with personal data and secrets removed before it leaves:
 * {@link scrubText} on its message, its exceptions' messages, its request,
 * its breadcrumbs, its extra data and its contexts; a request's cookies and
 * its body dropped, and every field whose name says it is a secret (a
 * header, a parameter) replaced; and of its user, the id alone (no address,
 * name or IP address). Changes the event in place and returns it.
 */
export function scrubEvent<Event extends ScrubbableEvent>(event: Event): Event {
  if (typeof event.message === 'string') event.message = scrubText(event.message)
  for (const exception of event.exception?.values ?? []) {
    if (exception.value) exception.value = scrubText(exception.value)
  }
  if (event.request) {
    const { cookies: _cookies, data: _data, ...request } = event.request
    event.request = scrubValue(request) as Record<string, unknown>
  }
  if (event.breadcrumbs) event.breadcrumbs = event.breadcrumbs.map(crumb => scrubValue(crumb) as Record<string, unknown>)
  if (event.extra) event.extra = scrubValue(event.extra) as Record<string, unknown>
  if (event.contexts) event.contexts = scrubValue(event.contexts) as Record<string, unknown>
  if (event.user) event.user = typeof event.user.id === 'string' || typeof event.user.id === 'number' ? { id: event.user.id } : {}
  return event
}

/** What an error event says beside the error itself. */
export interface ErrorEventInput {
  error: unknown
  tags?: Record<string, string>
  /** Defaults to `error`. */
  level?: 'error' | 'warning'
  environment?: string
  /** The machine or deployment that reported it. */
  serverName?: string
}

/** An error event, as the ingest endpoint takes it. */
export function errorEvent(input: ErrorEventInput): Record<string, unknown> {
  const error = input.error instanceof Error ? input.error : new Error(typeof input.error === 'string' ? input.error : 'A non-error value was thrown')
  const frames = stackFrames(error.stack)
  return {
    event_id: randomId(),
    timestamp: Date.now() / 1000,
    platform: 'javascript',
    level: input.level ?? 'error',
    logger: 'nuxt-backend',
    ...(input.environment ? { environment: input.environment } : {}),
    ...(input.serverName ? { server_name: input.serverName } : {}),
    tags: { ...input.tags },
    exception: {
      values: [{
        type: error.name || 'Error',
        value: scrubText(error.message.slice(0, MESSAGE_LIMIT)),
        ...(frames.length > 0 ? { stacktrace: { frames } } : {}),
        mechanism: { type: 'nuxt-backend', handled: false },
      }],
    },
  }
}

/**
 * The alerts the backend raises, by kind: the email plan's quota running
 * out, and the day's AI spend jumping past the days before. Each is one
 * issue in the monitoring service (its fingerprint is the kind), so an alert
 * rule on new issues, or on the `backend.alert` tag, notifies once per
 * kind; Convex's own usage warnings email the team directly.
 */
export type BackendAlertKind = 'email_quota' | 'ai_spend' | 'ai_spend_limit'

/** What an alert says. */
export interface AlertEventInput {
  alert: BackendAlertKind
  /** The sentence the issue shows: what crossed what. */
  message: string
  /** `warning` while there is room left, `error` once it ran out. */
  level: 'warning' | 'error'
  /** The figures behind it: `used`, `limit`, `usd`. */
  data?: Record<string, string | number>
  environment?: string
  serverName?: string
}

/** The tag an alert carries, beside `backend.source`. */
export const ALERT_TAG = 'backend.alert'

/** An alert as a message event, grouped by its kind. */
export function alertEvent(input: AlertEventInput): Record<string, unknown> {
  return {
    event_id: randomId(),
    timestamp: Date.now() / 1000,
    platform: 'javascript',
    level: input.level,
    logger: 'nuxt-backend',
    ...(input.environment ? { environment: input.environment } : {}),
    ...(input.serverName ? { server_name: input.serverName } : {}),
    message: { formatted: input.message },
    fingerprint: ['nuxt-backend-alert', input.alert],
    tags: { [ALERT_TAG]: input.alert, [MONITORING_TAGS.source]: 'backend' },
    ...(input.data ? { extra: input.data } : {}),
  }
}

/** One envelope: its header line, then each item's header and payload, newline-terminated. */
function envelope(dsn: MonitoringDsn, items: Array<[header: Record<string, unknown>, payload: Record<string, unknown>]>, eventId?: string): string {
  const header = { ...(eventId ? { event_id: eventId } : {}), sent_at: new Date().toISOString(), dsn: dsn.dsn }
  return `${[JSON.stringify(header), ...items.flatMap(([itemHeader, payload]) => [JSON.stringify(itemHeader), JSON.stringify(payload)])].join('\n')}\n`
}

/** An error event as one envelope. */
export function eventEnvelope(dsn: MonitoringDsn, event: Record<string, unknown>): string {
  return envelope(dsn, [[{ type: 'event' }, event]], typeof event.event_id === 'string' ? event.event_id : undefined)
}

/** What a check-in says: `in_progress` when a job starts, `ok` or `error` when it ends. */
export type CheckInStatus = 'ok' | 'error' | 'in_progress'

/** One check-in of a job to its monitor. */
export interface CheckInInput {
  /** The job's name: `backend maintenance` checks in to the monitor `backend-maintenance`. */
  monitor: string
  status: CheckInStatus
  /**
   * The job's schedule. Given, the check-in creates the monitor when it is
   * missing and keeps its schedule in step with the code.
   */
  schedule?: BackendCronSchedule
  /** How long the run took. */
  durationMs?: number
  environment?: string
  /** How late a check-in may arrive before the monitor reports it missed, in minutes. Default 10. */
  marginMinutes?: number
  /** How long a run may last before the monitor reports it timed out, in minutes. Default 30. */
  maxRuntimeMinutes?: number
}

/** A job's name as a monitor slug: lower case, words joined by `-`. */
export function monitorSlug(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'job'
}

/** A schedule as the monitor's config takes it. Intervals count whole minutes, the shortest a monitor knows. */
function monitorScheduleConfig(schedule: BackendCronSchedule): Record<string, unknown> {
  if (schedule.cron !== undefined) return { type: 'crontab', value: schedule.cron }
  // One unit is set, as Convex's `crons.interval` takes it; the others read as 0.
  const { seconds = 0, minutes = 0, hours = 0 } = schedule.every as { seconds?: number, minutes?: number, hours?: number }
  const total = hours * 60 + minutes + seconds / 60
  if (Number.isInteger(total / 60) && total >= 60) return { type: 'interval', value: total / 60, unit: 'hour' }
  return { type: 'interval', value: Math.max(1, Math.ceil(total)), unit: 'minute' }
}

/** A check-in as one envelope. */
export function checkInEnvelope(dsn: MonitoringDsn, input: CheckInInput): string {
  const payload: Record<string, unknown> = {
    check_in_id: randomId(),
    monitor_slug: monitorSlug(input.monitor),
    status: input.status,
    ...(input.durationMs !== undefined ? { duration: input.durationMs / 1000 } : {}),
    ...(input.environment ? { environment: input.environment } : {}),
    ...(input.schedule
      ? {
          monitor_config: {
            schedule: monitorScheduleConfig(input.schedule),
            checkin_margin: input.marginMinutes ?? 10,
            max_runtime: input.maxRuntimeMinutes ?? 30,
            timezone: 'UTC',
          },
        }
      : {}),
  }
  return envelope(dsn, [[{ type: 'check_in' }, payload]])
}

/** How long a report may take before it is given up: a slow ingest endpoint never holds up what it reports on. */
export const REPORT_TIMEOUT_MS = 3000

/**
 * Post one envelope. Resolves with whether the endpoint took it, and never
 * rejects: a report that cannot be delivered must not fail what it reports
 * on, nor hold it up past {@link REPORT_TIMEOUT_MS}. Outside an action (a
 * query or a mutation cannot fetch) it resolves `false` too.
 */
export async function postEnvelope(dsn: MonitoringDsn, body: string, fetcher: typeof fetch = fetch): Promise<boolean> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const timedOut = new Promise<false>((resolve) => {
    timer = setTimeout(() => {
      controller.abort()
      resolve(false)
    }, REPORT_TIMEOUT_MS)
  })
  const posted = (async () => {
    try {
      const response = await fetcher(envelopeUrl(dsn), {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-sentry-envelope' },
        body,
        signal: controller.signal,
      })
      return response.ok
    }
    catch {
      return false
    }
  })()
  try {
    return await Promise.race([posted, timedOut])
  }
  finally {
    clearTimeout(timer)
  }
}

/** The environments that never check a job in: one that sleeps with a laptop, or is deleted with its branch. */
const QUIET_ENVIRONMENTS: ReadonlySet<string> = new Set(['development', 'preview'])

/** What the backend reads to say where a report comes from. */
export interface ReportingEnv {
  /** The deployment's own URL, which the platform sets. */
  CONVEX_CLOUD_URL?: string
  /** The kind of deployment: `development`, `preview`, `sandbox` or `production`, as `env push` derives it. */
  BACKEND_ENVIRONMENT?: string
}

/** Where the backend's reports come from, as they name it. */
export interface ReportingDeployment {
  /** The deployment: its host's first label (`happy-otter-123`), or the whole host of a local one. */
  serverName?: string
  /** The environment its reports name, matching the app's. */
  environment?: string
  /** Whether its jobs check in: only from an environment named, and never from `development` or `preview`. */
  checksIn: boolean
}

/**
 * Where the backend's reports come from. The backend cannot tell production
 * from a dev or a preview deployment by itself, so `env push` names each by
 * its kind in `BACKEND_ENVIRONMENT`, which is also the name its reports
 * carry, as the app's do (a `sandbox` demo's errors sit apart from
 * production's). Without one, a report names the deployment
 * (`happy-otter-123`), or `development` for a local one. Only a deployment
 * named, and named neither `development` nor `preview`, checks its jobs in:
 * a laptop that sleeps, or a preview deleted with its branch, would read as a
 * missed run.
 */
export function reportingDeployment(env: ReportingEnv): ReportingDeployment {
  const named = parseBackendEnvironment(env.BACKEND_ENVIRONMENT)
  const checksIn = named !== undefined && !QUIET_ENVIRONMENTS.has(named)
  if (!env.CONVEX_CLOUD_URL) return { ...named ? { environment: named } : {}, checksIn }
  try {
    const { hostname } = new URL(env.CONVEX_CLOUD_URL)
    const local = isLoopbackUrl(env.CONVEX_CLOUD_URL)
    const serverName = local ? hostname : hostname.split('.')[0]!
    return { serverName, environment: named ?? (local ? 'development' : serverName), checksIn }
  }
  catch {
    return { ...named ? { environment: named } : {}, checksIn }
  }
}
