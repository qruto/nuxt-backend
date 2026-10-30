import { Webhook } from 'standardwebhooks'

// The one verifier every inbound webhook runs through: `/billing/events`
// (Polar) and `/email/events` (Resend, which signs through Svix). Both sign
// to the Standard Webhooks scheme: an HMAC-SHA256 over `id.timestamp.body`,
// sent as `v1,<base64>` in a signature header beside the id and the
// timestamp. Kept apart from the routes so the property tests
// (test/unit/property/) can drive it directly.

/**
 * How far a delivery's timestamp may be from now, either way, in seconds:
 * the Standard Webhooks tolerance. An older delivery replayed fails, and so
 * does one dated ahead; a redelivery inside the window is caught by the
 * delivery log's dedupe on its id.
 */
export const WEBHOOK_TOLERANCE_SECONDS = 5 * 60

/** A delivery's signature headers, read from one family of names. */
export interface WebhookSignatureHeaders {
  'webhook-id': string
  'webhook-timestamp': string
  'webhook-signature': string
}

/** What a delivery is verified with beside its secrets. */
export interface WebhookVerifyOptions {
  /**
   * Also accept the key reading Polar signed with before it moved to
   * Standard Webhooks (secrets created before 2026-09-08): the HMAC keyed
   * with the UTF-8 bytes of the whole secret, where the spec base64-decodes
   * it after its `whsec_` prefix. The billing route's alone.
   */
  legacyKey?: boolean
}

type HeaderSource = Headers | Readonly<Record<string, string>>

function headerOf(headers: HeaderSource, name: string): string | undefined {
  if (typeof (headers as Headers).get === 'function') return (headers as Headers).get(name) ?? undefined
  const record = headers as Readonly<Record<string, string>>
  for (const key of Object.keys(record)) {
    if (key.toLowerCase() === name) return record[key]
  }
  return undefined
}

/**
 * A delivery's signature headers: the spec's `webhook-*` names, or Svix's
 * `svix-*` (Resend's), never a mix of both, so an id from one family can't
 * pair with a signature from the other. `null` when the family it starts
 * lacks one of the three.
 */
export function signatureHeaders(headers: HeaderSource): WebhookSignatureHeaders | null {
  for (const prefix of ['webhook', 'svix']) {
    const id = headerOf(headers, `${prefix}-id`)
    const timestamp = headerOf(headers, `${prefix}-timestamp`)
    const signature = headerOf(headers, `${prefix}-signature`)
    if (id || timestamp || signature) {
      return id && timestamp && signature ? { 'webhook-id': id, 'webhook-timestamp': timestamp, 'webhook-signature': signature } : null
    }
  }
  return null
}

/**
 * A delivery's id, as the delivery log keys it: the spec's `webhook-id`, else
 * Svix's `svix-id`. Read before anything is verified, for the redelivery
 * dedupe and the log row; `null` when there is none.
 */
export function deliveryIdOf(headers: HeaderSource): string | null {
  return headerOf(headers, 'webhook-id') || headerOf(headers, 'svix-id') || null
}

/** The Standard Webhooks secret prefix, public and so no part of a key. */
const SECRET_PREFIX = 'whsec_'

/**
 * The fewest key bytes a reading of a secret may have, 128 bits. A shorter
 * key, the empty one of a bare `whsec_` above all (a truncated paste or a
 * placeholder), is one anyone can guess and sign with, so it is no key. The
 * check is the verifier's own and does not lean on the library's version:
 * `standardwebhooks` 1.0.0 accepts an empty key. The providers issue 24 or 32.
 */
const MIN_KEY_BYTES = 16

/** A secret without its `whsec_` prefix: the key material either reading starts from. */
function materialOf(secret: string): string {
  return secret.startsWith(SECRET_PREFIX) ? secret.slice(SECRET_PREFIX.length) : secret
}

/** How many bytes the base64 `encoded` decodes to (its padding dropped). */
function decodedLength(encoded: string): number {
  return Math.floor(encoded.replace(/=+$/, '').length * 3 / 4)
}

/**
 * The verifiers a secret yields: the spec's reading (the `whsec_` prefix
 * dropped and the rest base64-decoded), and, with `legacyKey`, Polar's
 * earlier one (the whole secret's UTF-8 bytes). A reading with fewer than
 * {@link MIN_KEY_BYTES} bytes of key material yields no verifier, and a
 * secret no reading can use yields none, and so only fails to verify.
 */
function verifiersOf(secret: string, legacyKey: boolean): Webhook[] {
  const verifiers: Webhook[] = []
  const material = materialOf(secret)
  if (decodedLength(material) >= MIN_KEY_BYTES) {
    try {
      verifiers.push(new Webhook(secret))
    }
    catch {
      // Not base64 after its prefix: the spec's reading has no key.
    }
  }
  if (legacyKey && new TextEncoder().encode(material).length >= MIN_KEY_BYTES) {
    verifiers.push(new Webhook(new TextEncoder().encode(secret), { format: 'raw' }))
  }
  return verifiers
}

/** A delivery timestamp as the spec writes it: Unix seconds, digits only. */
const TIMESTAMP = /^\d{1,12}$/

/**
 * Whether a delivery's `webhook-timestamp` is digits only and within
 * {@link WEBHOOK_TOLERANCE_SECONDS} of `now` (milliseconds), either way.
 * The verifier's own check, ahead of the library's: `standardwebhooks`
 * reads the header with `parseInt`, which takes `1700000000abc` (or
 * `1.7e9`, or a leading `+`) for a number, and signs the number it read,
 * so a header the spec does not allow would verify. Fails closed on
 * anything but plain digits.
 *
 * @internal
 */
export function timestampFresh(timestamp: string, now = Date.now()): boolean {
  if (!TIMESTAMP.test(timestamp)) return false
  return Math.abs(now / 1000 - Number(timestamp)) <= WEBHOOK_TOLERANCE_SECONDS
}

/**
 * Whether a delivery verifies under one of the accepted secrets: the
 * rotation accept-list of a webhook secret variable (`"whsec_new,whsec_old"`,
 * first entry primary). It fails closed: no secret, a missing or mixed
 * header, a timestamp that is not digits only or is more than
 * {@link WEBHOOK_TOLERANCE_SECONDS} from now either way (checked here, not
 * only by the library: {@link timestampFresh}), or a signature that matches none of the keys is `false`, and
 * nothing in it throws. The comparison is constant-time
 * (`standardwebhooks`), and the body is the raw text as delivered: verify it
 * before parsing anything.
 *
 * @internal
 */
export function verifyWebhookSignature(secrets: readonly string[], body: string, headers: HeaderSource, { legacyKey = false }: WebhookVerifyOptions = {}): boolean {
  const signed = signatureHeaders(headers)
  if (!signed || !timestampFresh(signed['webhook-timestamp'])) return false
  return secrets.some(secret => verifiersOf(secret, legacyKey).some((verifier) => {
    try {
      verifier.verify(body, { ...signed }, { jsonParse: false })
      return true
    }
    catch {
      // Not this key: the next one may be the other half of a rotation.
      return false
    }
  }))
}
