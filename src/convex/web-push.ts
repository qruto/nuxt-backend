// Web Push, sent from the deployment itself: VAPID (RFC 8292) signs who the
// sender is with an ES256 JWT, and the message is encrypted for the one
// device it goes to (RFC 8291, the `aes128gcm` content coding of RFC 8188).
// Web Crypto only, so it runs in Convex's default runtime, in Node and in a
// browser alike; no push provider and no dependency. `env push` generates
// the key pair with the same code (`generatePushKeys`).

import { base64url } from './tokens.js'

/** Where the Nuxt module serves the push service worker (src/runtime/server/push-worker.ts). */
export const PUSH_WORKER_URL = '/_backend/push/worker.js'

/** The push worker's scope: its own, so a service worker the app has at `/` keeps its pages. */
export const PUSH_WORKER_SCOPE = '/_backend/push/'

/** A device's push subscription, as the browser hands it over (`PushSubscription.toJSON()`). */
export interface PushTarget {
  endpoint: string
  /** The device's public key, base64url (65 bytes, uncompressed P-256). */
  p256dh: string
  /** The device's authentication secret, base64url (16 bytes). */
  auth: string
}

/** The app's VAPID key pair, base64url: the public key uncompressed (65 bytes), the private key the raw scalar (32 bytes). */
export interface PushKeys {
  publicKey: string
  privateKey: string
}

/** The longest payload one record of 4096 bytes carries, after the header, the tag and the delimiter. */
export const PUSH_PAYLOAD_MAX = 3993

/** How long a push service keeps a message for a device that is offline, in seconds. */
export const PUSH_TTL_SECONDS = 24 * 60 * 60

/** How long a VAPID token is good for: the push services accept at most 24 hours. */
const VAPID_TTL_SECONDS = 12 * 60 * 60

/** The record size the header declares. */
const RECORD_SIZE = 4096

const encoder = new TextEncoder()

/** Bytes as base64url without padding, as keys and tokens are written. */
export const base64urlEncode = base64url

/** Base64url (padded or not) as bytes. */
export function base64urlDecode(text: string): Uint8Array<ArrayBuffer> {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4))
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
  return bytes
}

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

/** HKDF-SHA-256 (RFC 5869), `length` bytes. */
async function hkdf(salt: Uint8Array<ArrayBuffer>, ikm: Uint8Array<ArrayBuffer>, info: Uint8Array<ArrayBuffer>, length: number): Promise<Uint8Array<ArrayBuffer>> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8))
}

/** Whether a string reads as a key of this shape: base64url of `bytes` bytes, starting with `first` when given. */
function isKey(text: string, bytes: number, first?: number): boolean {
  if (!/^[\w-]+$/.test(text)) return false
  try {
    const decoded = base64urlDecode(text)
    return decoded.length === bytes && (first === undefined || decoded[0] === first)
  }
  catch {
    return false
  }
}

/** Whether a pair reads as VAPID keys: an uncompressed P-256 point and a 32-byte scalar. */
export function arePushKeys(keys: { publicKey?: string, privateKey?: string }): keys is PushKeys {
  return typeof keys.publicKey === 'string' && typeof keys.privateKey === 'string' && isKey(keys.publicKey, 65, 4) && isKey(keys.privateKey, 32)
}

/** Whether a subscription reads as one a browser made: an https endpoint, a P-256 key and a 16-byte secret. */
export function isPushTarget(target: { endpoint?: unknown, p256dh?: unknown, auth?: unknown }): target is PushTarget {
  if (typeof target.endpoint !== 'string' || typeof target.p256dh !== 'string' || typeof target.auth !== 'string') return false
  if (target.endpoint.length > 1024 || !target.endpoint.startsWith('https://')) return false
  try {
    new URL(target.endpoint)
  }
  catch {
    return false
  }
  return isKey(target.p256dh, 65, 4) && isKey(target.auth, 16)
}

/** A new VAPID key pair, as `env push` writes it. */
export async function generatePushKeys(): Promise<PushKeys> {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']) as CryptoKeyPair
  const publicKey = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))
  const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey)
  return { publicKey: base64urlEncode(publicKey), privateKey: jwk.d! }
}

/** The private key as Web Crypto signs with it: a JWK built from the raw scalar and the public point. */
async function signingKey(keys: PushKeys): Promise<CryptoKey> {
  const point = base64urlDecode(keys.publicKey)
  const jwk: JsonWebKey = { kty: 'EC', crv: 'P-256', d: keys.privateKey, x: base64urlEncode(point.slice(1, 33)), y: base64urlEncode(point.slice(33, 65)), ext: false }
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
}

/**
 * The `Authorization` header of RFC 8292: an ES256 JWT for the push
 * service's origin, signed with the app's private key, and the public key
 * the device's subscription is bound to. `subject` is a contact for the
 * app: an https URL or a `mailto:` address.
 */
export async function vapidAuthorization(endpoint: string, keys: PushKeys, subject: string, now = Date.now()): Promise<string> {
  const header = base64urlEncode(encoder.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const claims = base64urlEncode(encoder.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + VAPID_TTL_SECONDS, sub: subject })))
  const unsigned = `${header}.${claims}`
  // Web Crypto signs ECDSA as the raw r || s that JWS wants.
  const signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, await signingKey(keys), encoder.encode(unsigned)))
  return `vapid t=${unsigned}.${base64urlEncode(signature)}, k=${keys.publicKey}`
}

/**
 * Encrypt a payload for one device (RFC 8291): an ECDH agreement between a
 * new key pair and the device's key, mixed with its authentication secret,
 * keys one AES-128-GCM record. The body is the `aes128gcm` header (salt,
 * record size, the new public key) and that record.
 */
export async function encryptPushPayload(payload: Uint8Array, target: Pick<PushTarget, 'p256dh' | 'auth'>, random: { salt?: Uint8Array<ArrayBuffer>, keys?: CryptoKeyPair } = {}): Promise<Uint8Array<ArrayBuffer>> {
  if (payload.length > PUSH_PAYLOAD_MAX) throw new RangeError(`A push payload holds at most ${PUSH_PAYLOAD_MAX} bytes.`)
  const userAgentKey = base64urlDecode(target.p256dh)
  const authSecret = base64urlDecode(target.auth)
  const local = random.keys ?? await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair
  const localKey = new Uint8Array(await crypto.subtle.exportKey('raw', local.publicKey))
  const peer = await crypto.subtle.importKey('raw', userAgentKey, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: peer }, local.privateKey, 256))
  const ikm = await hkdf(authSecret, shared, concat(encoder.encode('WebPush: info\0'), userAgentKey, localKey), 32)
  const salt = random.salt ?? crypto.getRandomValues(new Uint8Array(16))
  const contentKey = await hkdf(salt, ikm, encoder.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, encoder.encode('Content-Encoding: nonce\0'), 12)
  const key = await crypto.subtle.importKey('raw', contentKey, 'AES-GCM', false, ['encrypt'])
  // The last (and only) record ends with the delimiter 0x02, and no padding.
  const record = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(payload, new Uint8Array([2]))))
  const size = new Uint8Array(4)
  new DataView(size.buffer).setUint32(0, RECORD_SIZE)
  return concat(salt, size, new Uint8Array([localKey.length]), localKey, record)
}

/**
 * The message every push carries, in the Declarative Web Push format Safari
 * 18.4 and later shows by itself; the package's service worker shows the
 * same fields on Chromium and Firefox. `navigate` is the absolute URL a
 * click opens.
 */
export interface PushMessage {
  title: string
  body?: string
  navigate: string
  lang?: string
}

/** A message as the bytes the device decrypts. Declarative Web Push wants `web_push: 8030` beside the notification. */
export function pushPayload(message: PushMessage): Uint8Array {
  const notification = { title: message.title, ...(message.body ? { body: message.body } : {}), navigate: message.navigate, ...(message.lang ? { lang: message.lang } : {}) }
  return encoder.encode(JSON.stringify({ web_push: 8030, notification }))
}

/** What a push service answered, as the sender acts on it. */
export type PushOutcome
  /** Accepted (`201`, or any `2xx`). */
  = | { kind: 'sent' }
  /** The device is gone (`404`, `410`): drop its subscription. */
    | { kind: 'gone' }
  /** The payload is too large (`413`): drop the message, log it. */
    | { kind: 'too-large' }
  /** Busy (`429`, `5xx`, or no answer): try again after `retryAfterMs`. */
    | { kind: 'retry', retryAfterMs: number }
  /** The keys were refused (`400`, `403`, or another `4xx`): the key pair does not match the subscription, or the token was malformed. */
    | { kind: 'refused', status: number }

/** A `Retry-After` header's wait in milliseconds: seconds, or an HTTP date; `null` without one. */
function retryAfter(header: string | null, now: number): number | null {
  if (!header) return null
  const seconds = Number(header)
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000
  const at = Date.parse(header)
  return Number.isNaN(at) ? null : Math.max(0, at - now)
}

/** How a push service's answer reads. `fallbackRetryMs` is the wait when a busy service names none. */
export function pushOutcome(status: number, retryAfterHeader: string | null, fallbackRetryMs: number, now = Date.now()): PushOutcome {
  if (status >= 200 && status < 300) return { kind: 'sent' }
  if (status === 404 || status === 410) return { kind: 'gone' }
  if (status === 413) return { kind: 'too-large' }
  if (status === 429 || status >= 500) return { kind: 'retry', retryAfterMs: retryAfter(retryAfterHeader, now) ?? fallbackRetryMs }
  return { kind: 'refused', status }
}

/**
 * Send one message to one device: encrypt it, sign the request, post it.
 * Never throws for an answer: a network failure reads as `retry`.
 */
export async function sendPush(target: PushTarget, message: PushMessage, keys: PushKeys, subject: string, options: { fetch?: typeof fetch, fallbackRetryMs?: number, urgency?: 'very-low' | 'low' | 'normal' | 'high' } = {}): Promise<PushOutcome> {
  const payload = pushPayload(message)
  if (payload.length > PUSH_PAYLOAD_MAX) return { kind: 'too-large' }
  const body = await encryptPushPayload(payload, target)
  const fallbackRetryMs = options.fallbackRetryMs ?? 60_000
  try {
    const response = await (options.fetch ?? fetch)(target.endpoint, {
      method: 'POST',
      headers: {
        'Authorization': await vapidAuthorization(target.endpoint, keys, subject),
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        'TTL': String(PUSH_TTL_SECONDS),
        'Urgency': options.urgency ?? 'normal',
      },
      body,
    })
    return pushOutcome(response.status, response.headers.get('retry-after'), fallbackRetryMs)
  }
  catch {
    return { kind: 'retry', retryAfterMs: fallbackRetryMs }
  }
}
