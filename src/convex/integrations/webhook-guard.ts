import type { FunctionReference } from 'convex/server'
import { logBackend } from '../log.js'
import { reportError } from './monitoring.js'

/**
 * The one fail-closed edge every inbound webhook route runs through
 * (`/billing/events`, `/email/events`): {@link handleWebhookDelivery} owns
 * the secret check, the body size cap, reading the body, redelivery dedupe,
 * the JSON parse, the outcome log and the `webhook.rejected` deployment-log
 * line; a route supplies only its signature check (the one verifier,
 * `webhook-signatures.ts`) and its handlers. Uniform policy
 * (documented in the Webhooks guide):
 *
 * | condition                        | status | outcome            |
 * | -------------------------------- | ------ | ------------------ |
 * | secret env missing/empty         | 503    | `missing_secret`   |
 * | invalid/stale signature          | 403    | `invalid_signature`|
 * | body over the cap                | 413    | `oversized`        |
 * | authentic, type unknown          | 202    | `unknown_type`     |
 * | handler threw                    | 500    | `handler_error`    |
 * | duplicate of a successful one    | 200    | `duplicate`        |
 * | success                          | 2xx    | `ok`               |
 *
 * One rule: throw ⇒ 5xx ⇒ the provider retries (built-ins are idempotent),
 * and the failure goes to the monitoring service (`MONITORING_DSN`);
 * dedupe short-circuits only fully-successful (`ok`) outcomes; nothing is
 * ever silently swallowed. Deliberately NO rate limiting here — signature
 * verification is the gate, and a limiter would drop the legitimate retry
 * bursts that follow an incident.
 *
 * Every outcome is recorded, but only a delivery whose signature verified
 * gets a log row of its own: the component counts the requests answered
 * before verification (`missing_secret`, `oversized`, `invalid_signature`,
 * `duplicate`) per service and outcome, so junk requests can neither grow
 * the log nor evict the `ok` rows dedupe reads. The log is deployment-wide,
 * so its reader (`getWebhookDeliveries`) is admin-only.
 */

/**
 * How a webhook route answered a request, as its row of the delivery log
 * says: `ok` handled, `duplicate` a redelivery of one handled already,
 * `unknown_type` verified but of a type the route does not parse,
 * `handler_error` a handler threw (the provider retries), and
 * `invalid_signature`, `oversized` and `missing_secret` refused before
 * any signature verified.
 */
export type WebhookOutcome
  = 'ok' | 'invalid_signature' | 'unknown_type' | 'handler_error' | 'duplicate' | 'oversized' | 'missing_secret'

/** A row of the delivery log, as served to feeds. */
export interface WebhookDeliveryRow {
  service: string
  deliveryId: string
  type?: string
  outcome: WebhookOutcome
  note?: string
  receivedAt: number
  /**
   * Set on a tally of requests answered before their signature verified:
   * how many it stands for (the latest one's id, type, note and time are the
   * row's own). It counts afresh after a day without one.
   */
  count?: number
  /** When an administrator last had the provider send it again (`replayWebhookDelivery`). */
  replayedAt?: number
}

/** `components.backend.webhooks` — the delivery log functions. */
export interface WebhookLogRefs {
  record: FunctionReference<'mutation', 'internal', {
    service: string
    deliveryId: string
    type?: string
    outcome: WebhookOutcome
    note?: string
  }, null>
  find: FunctionReference<'query', 'internal', {
    service: string
    deliveryId: string
  }, { outcome: WebhookOutcome, receivedAt: number } | null>
  listRecent: FunctionReference<'query', 'internal', { limit?: number }, WebhookDeliveryRow[]>
}

/** Payloads are KB-scale; bound memory before any verification runs. In bytes, as delivered. */
export const WEBHOOK_BODY_LIMIT = 1024 * 1024

/**
 * Both webhook secret env vars accept a comma-separated accept-list
 * (`"whsec_new,whsec_old"`) for zero-downtime rotation; first entry primary.
 */
export function parseSecretList(raw: string | undefined): string[] {
  return (raw ?? '').split(',').map(entry => entry.trim()).filter(Boolean)
}

type GuardCtx = {
  runQuery: (ref: never, args: never) => Promise<unknown>
  runMutation: (ref: never, args: never) => Promise<unknown>
}

/** The routes behind the edge, each the service its deliveries are logged under. */
export type WebhookService = 'billing' | 'email'

/** A delivery body as the edge reads it before any route verifies it. */
export interface ParsedWebhook {
  /** The event's `type` field, when the body is a JSON object that has one. */
  type?: string
  /** The parsed JSON, or the raw body when it is not JSON. */
  payload: unknown
}

/**
 * Read a delivery body once, for every route: the event type (for the
 * delivery log and the unknown-type hook) and the payload the typed handlers
 * receive. Never throws — a body that is not JSON comes back as the raw
 * string with no type, and the route's signature check decides its fate.
 */
export function parseWebhookJson(body: string): ParsedWebhook {
  let payload: unknown
  try {
    payload = JSON.parse(body)
  }
  catch {
    return { payload: body }
  }
  const type = typeof payload === 'object' && payload !== null ? (payload as { type?: unknown }).type : undefined
  return typeof type === 'string' ? { type, payload } : { payload }
}

/**
 * What a route's signature check made of a delivery that passed the edge's
 * own checks:
 *
 * - `ok` — verified and handled; the route's response goes back.
 * - `unknown_type` — verified, but of a type the route cannot parse: the edge
 *   calls `onUnknownEvent` and answers 202.
 * - `invalid_signature` / `missing_secret` — refused before anything ran
 *   (`missing_secret` here is the route's own half missing a secret the app
 *   has).
 * - `handler_error` — nothing about the delivery could run. With a
 *   `response`, that response goes back; without one, the edge throws
 *   `note`, so the platform answers 500 and the provider retries.
 *
 * Refusals log no event type: nothing about an unverified body goes in the
 * delivery log.
 */
export type WebhookVerdict
  = | { outcome: 'ok', response: Response, type?: string, note?: string }
    | { outcome: 'unknown_type', type?: string }
    | { outcome: 'invalid_signature' | 'missing_secret', response?: Response, note?: string }
    | { outcome: 'handler_error', response?: Response, note: string }

/** One inbound delivery and the route that verifies and handles it. */
export interface WebhookDelivery<Ctx> {
  service: WebhookService
  /** The provider's delivery id header (`webhook-id` / `svix-id`). */
  deliveryId: string | null
  /**
   * The inbound request. The edge reads its body, once, and only after the
   * secret check and a `Content-Length` over the cap have had their say.
   */
  request: Request
  /** Whether the app has at least one secret to verify with; `false` answers 503. */
  secretsConfigured: boolean
  /**
   * Verify the signature of `body` (the request's, read by the edge) and run
   * the handlers. A throw is a handler error once the signature verified:
   * the edge logs it with the event type and rethrows, so the platform
   * answers 500 and the provider retries against the idempotent built-ins.
   * A failure before verification is a `handler_error` verdict instead,
   * which logs no type.
   */
  verify: (event: ParsedWebhook, body: string) => Promise<WebhookVerdict>
  /**
   * Called for an authentic delivery whose type the route does not know. A
   * throw is a handler error like any other: logged with the type, rethrown.
   */
  onUnknownEvent?: (ctx: Ctx, event: { type?: string, payload: unknown }) => Promise<void>
}

const warnedMissingSecret = new Set<string>()
/** The refusals already explained in this isolate, as `<service>:<outcome>`. */
const loggedRefusals = new Set<string>()

const REFUSALS = {
  missing_secret: { status: 503, text: 'Webhook secret not configured' },
  oversized: { status: 413, text: 'Payload too large' },
  invalid_signature: { status: 403, text: 'Invalid signature' },
} as const

/**
 * The deployment-log line a refusal leaves: the route, the outcome and the
 * status, nothing from the body. Once per isolate for each route and outcome
 * — a refused request costs nothing to send, so a line per request would let
 * anyone flood the log; the delivery log counts every one of them.
 */
function logRejected(service: WebhookService, outcome: keyof typeof REFUSALS, status: number): void {
  const key = `${service}:${outcome}`
  if (loggedRefusals.has(key)) return
  loggedRefusals.add(key)
  logBackend('warn', 'webhook.rejected', `/${service}/events refused a delivery: ${outcome} (${status}). `
  + 'Further refusals like it are counted in the delivery log, not repeated here.')
}

/** One delivery's log: its row in the delivery log, and the refusal that also writes the deployment-log line. */
interface DeliveryRecorder {
  record: (outcome: WebhookOutcome, details?: { type?: string, note?: string }) => Promise<void>
  refuse: (outcome: keyof typeof REFUSALS, response?: Response, note?: string) => Promise<Response>
}

/** The recorder for one delivery; a log write that fails is reported and never fails the delivery. */
function deliveryRecorder(log: GuardCtx, refs: WebhookLogRefs, service: WebhookService, deliveryId: string): DeliveryRecorder {
  const record: DeliveryRecorder['record'] = async (outcome, details) => {
    try {
      await log.runMutation(refs.record as never, { service, deliveryId, type: details?.type, outcome, note: details?.note } as never)
    }
    catch (error) {
      logBackend('error', 'webhook.log_write_failed', `Webhook delivery log write failed (${service}).`, error)
    }
  }
  const refuse: DeliveryRecorder['refuse'] = async (outcome, response, note) => {
    const fallback = REFUSALS[outcome]
    const answer = response ?? new Response(fallback.text, { status: fallback.status })
    await record(outcome, note === undefined ? undefined : { note })
    logRejected(service, outcome, answer.status)
    return answer
  }
  return { record, refuse }
}

/**
 * The request's body as text, or `null` when it is over the cap: refused on
 * a declared `Content-Length` before anything is read, and otherwise
 * counted as it streams in (a chunked body, or one that understated its
 * length), the read cancelled the moment the count passes the cap, so no
 * more than the cap is ever held.
 */
async function readCappedBody(request: Request): Promise<string | null> {
  const declared = Number(request.headers.get('content-length') ?? Number.NaN)
  if (Number.isFinite(declared) && declared > WEBHOOK_BODY_LIMIT) return null
  if (!request.body) return ''
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (let read = await reader.read(); !read.done; read = await reader.read()) {
    total += read.value.byteLength
    if (total > WEBHOOK_BODY_LIMIT) {
      await reader.cancel()
      return null
    }
    chunks.push(read.value)
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(bytes)
}

/** The answer before any route runs: 503 without a secret, 413 over the cap, 200 for an id already processed — or the body to verify. */
async function answerBeforeRoute<Ctx>(log: GuardCtx, refs: WebhookLogRefs, delivery: WebhookDelivery<Ctx>, logged: DeliveryRecorder): Promise<Response | string> {
  const { service } = delivery
  if (!delivery.secretsConfigured) {
    // This warning is the refusal's deployment-log line: no webhook.rejected beside it.
    if (!warnedMissingSecret.has(service)) {
      warnedMissingSecret.add(service)
      logBackend(
        'warn',
        'webhook.secret_missing',
        `/${service}/events is mounted but its webhook secret is not set — `
        + 'rejecting all deliveries (503) until it is. Add the secret to .env.local and run `npx nuxt-backend env push`.',
      )
    }
    await logged.record('missing_secret')
    return new Response(REFUSALS.missing_secret.text, { status: REFUSALS.missing_secret.status })
  }
  const body = await readCappedBody(delivery.request)
  if (body === null) return logged.refuse('oversized')
  if (!delivery.deliveryId) return body
  const prior = await log.runQuery(refs.find as never, { service, deliveryId: delivery.deliveryId } as never) as { outcome: WebhookOutcome } | null
  if (prior?.outcome !== 'ok') return body
  await logged.record('duplicate')
  return new Response('Already processed', { status: 200 })
}

/**
 * Run one inbound delivery through the edge and answer it. In order: a
 * missing secret answers 503 (mounted-but-unconfigured is an explicit,
 * doctor-visible state — never silent acceptance), an oversized body 413
 * (on its declared length before it is read, else on the bytes read), and a
 * redelivery of an id already processed 200 without running anything.
 * Only then does the route verify the delivery and run its handlers, and the
 * edge turns its verdict into the response, the delivery-log row and, for a
 * refusal, a `webhook.rejected` line in the deployment log.
 */
export async function handleWebhookDelivery<Ctx>(
  ctx: Ctx,
  refs: WebhookLogRefs,
  delivery: WebhookDelivery<Ctx>,
): Promise<Response> {
  const log = ctx as unknown as GuardCtx
  const logged = deliveryRecorder(log, refs, delivery.service, delivery.deliveryId ?? `none:${Date.now()}`)
  const body = await answerBeforeRoute(log, refs, delivery, logged)
  if (typeof body !== 'string') return body

  const event = parseWebhookJson(body)
  let verdict: WebhookVerdict
  try {
    verdict = await delivery.verify(event, body)
  }
  catch (error) {
    await logged.record('handler_error', { type: event.type, note: errorNote(error) })
    await reportError(error, { function: `${delivery.service} webhook` })
    throw error
  }

  switch (verdict.outcome) {
    case 'ok':
      await logged.record('ok', { type: verdict.type ?? event.type, ...(verdict.note ? { note: verdict.note } : {}) })
      return verdict.response
    case 'unknown_type': {
      const type = verdict.type ?? event.type
      try {
        await delivery.onUnknownEvent?.(ctx, { type, payload: event.payload })
      }
      catch (error) {
        await logged.record('handler_error', { type, note: errorNote(error) })
        await reportError(error, { function: `${delivery.service} webhook` })
        throw error
      }
      await logged.record('unknown_type', { type })
      return new Response('Accepted (unknown event type)', { status: 202 })
    }
    case 'handler_error':
      await logged.record('handler_error', { note: verdict.note })
      await reportError(new Error(verdict.note), { function: `${delivery.service} webhook` })
      if (verdict.response) return verdict.response
      throw new Error(verdict.note)
    default:
      return logged.refuse(verdict.outcome, verdict.response, verdict.note)
  }
}

/** A thrown value as the delivery log's note. */
function errorNote(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
