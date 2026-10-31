// The package's preset for the error-reporting SDK (@sentry/nuxt), shared by
// its client and server config: what the SDK collects, the scrubbing every
// event, span, breadcrumb, log line and feedback report goes through before
// it leaves, and the sampling. The backend's own reports are scrubbed the same way
// (src/convex/monitoring.ts). An app's own `sentry.client.config.ts` or
// `sentry.server.config.ts` replaces the package's whole, this preset with it.
import { scrubEvent, scrubFields, scrubText } from '../../../convex/monitoring.js'

/**
 * What the SDK collects: no user it fills in itself, no cookies, no request
 * or response bodies, no model inputs or outputs, no local variables. The
 * package sets no user on a report; the user feedback widget asks for no
 * name or address.
 */
export const DATA_COLLECTION = {
  userInfo: false,
  cookies: false,
  httpBodies: [] as never[],
  genAI: { inputs: false, outputs: false },
  stackFrameVariables: false,
}

/**
 * A log line with its message scrubbed, and its attributes as an event's
 * fields are: a console call's object arguments arrive there whole
 * (`{ email, code }`), walked, with every secret-named field replaced.
 */
function scrubLog<Log extends { message: unknown, attributes?: Record<string, unknown> }>(log: Log): Log {
  if (typeof log.message === 'string') log.message = scrubText(log.message)
  if (log.attributes) log.attributes = scrubFields(log.attributes)
  return log
}

/** A span attribute's value with its text scrubbed: a string, a list's strings, or an attribute object's `value`. */
function scrubAttribute(value: unknown): unknown {
  if (typeof value === 'string') return scrubText(value)
  if (Array.isArray(value)) return value.map(scrubAttribute)
  if (value !== null && typeof value === 'object' && 'value' in value) return { ...value, value: scrubAttribute(value.value) }
  return value
}

/**
 * A span as the SDK streams it, its name and its attributes' text scrubbed:
 * a page load's, a navigation's or a request's URL and query (`url.full`,
 * `http.query`). The attributes' names are the SDK's own conventions, and
 * stay.
 */
function scrubSpan<Span extends { name: string, attributes?: Record<string, unknown> }>(span: Span): Span {
  span.name = scrubText(span.name)
  if (span.attributes) span.attributes = Object.fromEntries(Object.entries(span.attributes).map(([key, value]) => [key, scrubAttribute(value)]))
  return span
}

/** A breadcrumb scrubbed like an event's. */
function scrubBreadcrumb<Crumb extends Record<string, unknown>>(crumb: Crumb): Crumb {
  return scrubEvent({ breadcrumbs: [crumb] }).breadcrumbs![0] as Crumb
}

/**
 * The callbacks every event, span, breadcrumb and log line goes through
 * last: addresses, credentials and secret-named parameters and fields
 * replaced, a request's cookies, body and secret headers dropped, a user
 * kept by its id alone. Spans stream one by one (the SDK's default
 * `traceLifecycle`), so `beforeSendSpan` scrubs them: no transaction is
 * built. A feedback report skips `beforeSend`; {@link scrubbingIntegration}
 * scrubs it.
 */
export const SCRUBBING = {
  beforeSend: <Event extends object>(event: Event): Event => scrubEvent(event as never) as Event,
  beforeSendSpan: <Span extends { name: string, attributes?: Record<string, unknown> }>(span: Span): Span => scrubSpan(span),
  beforeBreadcrumb: <Crumb extends object>(crumb: Crumb): Crumb => scrubBreadcrumb(crumb as Record<string, unknown>) as Crumb,
  beforeSendLog: <Log extends { message: unknown, attributes?: Record<string, unknown> }>(log: Log): Log => scrubLog(log),
}

/** What the integration needs of the SDK's client: its last hook on an event, after every event processor. */
interface ScrubbedClient {
  on: (hook: 'postprocessEvent', callback: (event: { type?: string }) => void) => unknown
}

/**
 * The integration that scrubs a feedback report, which no `before…`
 * callback sees: its page's URL, its request and its breadcrumbs, the
 * moment every event processor is done with it.
 */
export function scrubbingIntegration(): { name: string, setup: (client: ScrubbedClient) => void } {
  return {
    name: 'NuxtBackendScrubbing',
    setup(client) {
      client.on('postprocessEvent', (event) => {
        if (event.type === 'feedback') scrubEvent(event as never)
      })
    },
  }
}

/** The console levels sent as log lines, from the browser and the Nuxt server. */
export const LOG_LEVELS = ['warn', 'error'] as const

/**
 * Session replay, once a visitor allowed it: nothing sent until an error
 * (`replaysOnErrorSampleRate`), then the minute before it and the rest of
 * that visit, until 15 idle minutes or an hour end its session; every text,
 * input and medium masked.
 */
export const REPLAY = {
  sampling: { replaysSessionSampleRate: 0, replaysOnErrorSampleRate: 1 },
  privacy: { maskAllText: true, maskAllInputs: true, blockAllMedia: true },
} as const

/** Traces: every request in dev, one in ten in production. */
export const tracesSampleRate = (dev: boolean): number => dev ? 1 : 0.1
