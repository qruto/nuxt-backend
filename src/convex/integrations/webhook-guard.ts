import type { FunctionReference } from 'convex/server'
import { Webhook } from 'standardwebhooks'

/**
 * The shared fail-closed edge discipline for inbound webhook routes
 * (`/billing/events`, `/email/events`): secret-list parsing, body size cap,
 * redelivery dedupe, and outcome logging into the component's delivery ring
 * buffer. Uniform policy (documented in the Webhooks guide):
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
 * One rule: throw ⇒ 5xx ⇒ the provider retries (built-ins are idempotent);
 * dedupe short-circuits only fully-successful (`ok`) outcomes; nothing is
 * ever silently swallowed. Deliberately NO rate limiting here — signature
 * verification is the gate, and a limiter would drop the legitimate retry
 * bursts that follow an incident.
 */

export type WebhookOutcome
  = 'ok' | 'invalid_signature' | 'unknown_type' | 'handler_error' | 'duplicate' | 'oversized' | 'missing_secret'

/** A row of the delivery ring buffer, as served to feeds. */
export interface WebhookDeliveryRow {
  service: string
  deliveryId: string
  type?: string
  outcome: WebhookOutcome
  note?: string
  receivedAt: number
}

/** `components.backend.webhooks` — the delivery ring buffer functions. */
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

/** Payloads are KB-scale; bound memory before any verification runs. */
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

const warnedMissingSecret = new Set<string>()

export interface GuardedDelivery {
  deliveryId: string
  /** Record the delivery's outcome in the ring buffer (never throws). */
  record: (outcome: WebhookOutcome, details?: { type?: string, note?: string }) => Promise<void>
  /** A short-circuit response from the guard, or null to proceed. */
  rejection: Response | null
}

/**
 * Run the shared pre-verification checks for an inbound delivery and hand
 * back the outcome recorder. `secretsConfigured === false` fails closed with
 * 503 (mounted-but-unconfigured is an explicit, doctor-visible state — never
 * silent acceptance), oversized bodies 413, and a redelivery of an already
 * fully-processed id answers 200 without running anything.
 */
export async function guardDelivery(
  ctx: GuardCtx,
  refs: WebhookLogRefs,
  input: {
    service: string
    /** The provider delivery id header (webhook-id / svix-id). */
    deliveryId: string | null
    bodyLength: number
    secretsConfigured: boolean
  },
): Promise<GuardedDelivery> {
  const deliveryId = input.deliveryId ?? `none:${Date.now()}`
  const record: GuardedDelivery['record'] = async (outcome, details) => {
    try {
      await ctx.runMutation(refs.record as never, {
        service: input.service,
        deliveryId,
        type: details?.type,
        outcome,
        note: details?.note,
      } as never)
    }
    catch (error) {
      console.error(`[nuxt-backend] webhook delivery log write failed (${input.service}):`, error)
    }
  }

  if (!input.secretsConfigured) {
    if (!warnedMissingSecret.has(input.service)) {
      warnedMissingSecret.add(input.service)
      console.warn(
        `[nuxt-backend] /${input.service}/events is mounted but its webhook secret is not set — `
        + 'rejecting all deliveries (503) until it is. Add the secret to .env.local and run `npx nuxt-backend env push`.',
      )
    }
    await record('missing_secret')
    return { deliveryId, record, rejection: new Response('Webhook secret not configured', { status: 503 }) }
  }

  if (input.bodyLength > WEBHOOK_BODY_LIMIT) {
    await record('oversized')
    return { deliveryId, record, rejection: new Response('Payload too large', { status: 413 }) }
  }

  if (input.deliveryId) {
    const prior = await ctx.runQuery(refs.find as never, { service: input.service, deliveryId } as never) as
      { outcome: WebhookOutcome } | null
    if (prior?.outcome === 'ok') {
      await record('duplicate')
      return { deliveryId, record, rejection: new Response('Already processed', { status: 200 }) }
    }
  }

  return { deliveryId, record, rejection: null }
}

const STANDARD_WEBHOOK_PREFIX = 'whsec_'

/** Base64 of a string's UTF-8 bytes — the secret reading the provider SDK verifies with. */
function sdkSecretReading(secret: string): string {
  return btoa(String.fromCharCode(...new TextEncoder().encode(secret)))
}

/**
 * Re-sign a Standard Webhooks delivery for the provider SDK's reading of the
 * secret. The provider signs with Standard Webhooks semantics — the `whsec_`
 * prefix stripped and the rest base64-decoded into the HMAC key — while the
 * SDK's `validateEvent` keys the HMAC with the UTF-8 bytes of the whole
 * secret string, so every genuine delivery failed verification (observed as
 * 403s until the provider disabled the endpoint). A delivery that verifies
 * under the standard reading of one of the accepted secrets comes back with
 * its `webhook-signature` recomputed under the SDK reading of that same
 * secret; anything else is returned untouched and refused downstream.
 *
 * @internal
 */
export function translateStandardSignature(headers: Headers, body: string, secrets: readonly string[]): Headers {
  const id = headers.get('webhook-id')
  const timestamp = headers.get('webhook-timestamp')
  const signature = headers.get('webhook-signature')
  if (!id || !timestamp || !signature) return headers
  const delivered = { 'webhook-id': id, 'webhook-timestamp': timestamp, 'webhook-signature': signature }
  for (const secret of secrets) {
    if (!secret.startsWith(STANDARD_WEBHOOK_PREFIX)) continue
    try {
      new Webhook(secret).verify(body, delivered)
    }
    catch {
      continue
    }
    const resigned = new Webhook(sdkSecretReading(secret)).sign(id, new Date(Number(timestamp) * 1000), body)
    const translated = new Headers(headers)
    translated.set('webhook-signature', resigned)
    return translated
  }
  return headers
}
