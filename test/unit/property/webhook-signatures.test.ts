import { createHmac } from 'node:crypto'
import fc from 'fast-check'
import { Webhook } from 'standardwebhooks'
import { describe, expect, it } from 'vitest'
import { parseSecretList, parseWebhookJson } from '../../../src/convex/integrations/webhook-guard'
import { signatureHeaders, timestampFresh, verifyWebhookSignature, WEBHOOK_TOLERANCE_SECONDS } from '../../../src/convex/webhook-signatures'

// Property tests (fast-check) for the one verifier every webhook delivery
// runs through (`verifyWebhookSignature`): Standard Webhooks signatures under
// the `webhook-*` headers (billing) or Svix's `svix-*` (email), checked
// against the rotation accept-list, and, for billing alone, Polar's legacy
// key reading (the whole secret's UTF-8 bytes). Every secret, body, id and
// time is generated: a genuine delivery verifies under any accepted secret in
// any position, and a changed body, a foreign secret, a stale timestamp or a
// legacy signature on the email route never does.

const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))

/** A signing secret as the providers issue them: `whsec_` and 24 to 32 random key bytes in base64. */
const signingSecret = fc.uint8Array({ minLength: 24, maxLength: 32 }).map(bytes => `whsec_${base64(bytes)}`)

/** A secret of Polar's older kind: any printable token, read as its UTF-8 bytes. */
const legacySecret = fc.stringMatching(/^\w{16,48}$/).filter(secret => !secret.startsWith('whsec_'))

/** A spec secret whose key is too short to be one: 0 to 15 bytes. */
const shortSecret = fc.uint8Array({ maxLength: 15 }).map(bytes => `whsec_${base64(bytes)}`)

/** A legacy secret too short to be a key: 1 to 15 characters. */
const shortLegacySecret = fc.stringMatching(/^\w{1,15}$/)

/** A delivery body: JSON, or any text (the verifier checks the bytes alone). */
const body = fc.oneof(fc.json(), fc.string({ unit: 'grapheme', maxLength: 200 }))

/** A provider message id. */
const messageId = fc.stringMatching(/^msg_[A-Za-z0-9]{1,24}$/)

/** A send time within the five-minute tolerance of now, whole seconds (the header carries seconds). */
const freshTime = fc.integer({ min: -240, max: 240 }).map(offset => new Date((Math.floor(Date.now() / 1000) + offset) * 1000))

/** A send time well outside the tolerance, either side. */
const staleTime = fc.oneof(fc.integer({ min: 330, max: 86_400 }), fc.integer({ min: -86_400, max: -330 }))
  .map(offset => new Date((Math.floor(Date.now() / 1000) + offset) * 1000))

/** Other secrets on the accept-list around the signing one, at a generated position. */
const acceptList = (signing: string) => fc.tuple(fc.array(signingSecret, { maxLength: 3 }), fc.nat()).map(([others, at]) => {
  const list = [...others]
  list.splice(at % (others.length + 1), 0, signing)
  return list
})

/** A different body than `original`. */
const otherBody = (original: string) => body.filter(candidate => candidate !== original)

/** The header names of each family the verifier reads. */
const family = fc.constantFrom('webhook', 'svix')

const headersOf = (prefix: string, id: string, at: Date, signature: string) => ({
  [`${prefix}-id`]: id,
  [`${prefix}-timestamp`]: String(Math.floor(at.getTime() / 1000)),
  [`${prefix}-signature`]: signature,
})

/** A signature under the spec's reading of a secret. */
const signed = (secret: string, id: string, at: Date, payload: string) => new Webhook(secret).sign(id, at, payload)

/** A signature keyed with `key` directly, for a key `standardwebhooks` itself refuses (the empty one). */
const signedWithKey = (key: Uint8Array, id: string, at: Date, payload: string) =>
  `v1,${createHmac('sha256', key).update(`${id}.${Math.floor(at.getTime() / 1000)}.${payload}`).digest('base64')}`

/** A signature under Polar's legacy reading: the whole secret's UTF-8 bytes as the key. */
const signedLegacy = (secret: string, id: string, at: Date, payload: string) => new Webhook(new TextEncoder().encode(secret), { format: 'raw' }).sign(id, at, payload)

describe('the one webhook verifier', () => {
  it('a delivery signed with any accepted secret verifies, wherever that secret sits in the list, under either header family', () => {
    fc.assert(fc.property(signingSecret.chain(secret => fc.tuple(fc.constant(secret), acceptList(secret))), body, messageId, freshTime, family, ([secret, accepted], payload, id, at, prefix) => {
      expect(verifyWebhookSignature(accepted, payload, headersOf(prefix, id, at, signed(secret, id, at, payload)))).toBe(true)
      expect(verifyWebhookSignature(accepted, payload, new Headers(headersOf(prefix, id, at, signed(secret, id, at, payload))))).toBe(true)
    }))
  })

  it('a body changed after signing never verifies', () => {
    fc.assert(fc.property(signingSecret, body.chain(original => fc.tuple(fc.constant(original), otherBody(original))), messageId, freshTime, family, (secret, [original, changed], id, at, prefix) => {
      expect(verifyWebhookSignature([secret], changed, headersOf(prefix, id, at, signed(secret, id, at, original)), { legacyKey: true })).toBe(false)
    }))
  })

  it('a delivery signed with a secret off the list never verifies', () => {
    fc.assert(fc.property(signingSecret, fc.array(signingSecret, { maxLength: 3 }), body, messageId, freshTime, family, (secret, accepted, payload, id, at, prefix) => {
      fc.pre(!accepted.includes(secret))
      expect(verifyWebhookSignature(accepted, payload, headersOf(prefix, id, at, signed(secret, id, at, payload)), { legacyKey: true })).toBe(false)
    }))
  })

  it('a delivery sent more than five minutes from now never verifies, even with the right secret', () => {
    fc.assert(fc.property(signingSecret, body, messageId, staleTime, family, (secret, payload, id, at, prefix) => {
      expect(verifyWebhookSignature([secret], payload, headersOf(prefix, id, at, signed(secret, id, at, payload)), { legacyKey: true })).toBe(false)
    }))
  })

  it('a timestamp header that is not plain digits never verifies, though the library would read a number from it and its signature matches', () => {
    // standardwebhooks parses the header with parseInt and signs the number
    // it read, so each of these forms carries a valid signature for it.
    const decorate = fc.constantFrom((seconds: string) => `${seconds}abc`, (seconds: string) => `+${seconds}`, (seconds: string) => ` ${seconds}`, (seconds: string) => `${seconds}.0`, (seconds: string) => `${seconds}e0`)
    fc.assert(fc.property(signingSecret, body, messageId, freshTime, family, decorate, (secret, payload, id, at, prefix, form) => {
      const headers = headersOf(prefix, id, at, signed(secret, id, at, payload))
      const forged = { ...headers, [`${prefix}-timestamp`]: form(headers[`${prefix}-timestamp`]!) }
      expect(verifyWebhookSignature([secret], payload, forged, { legacyKey: true })).toBe(false)
    }))
  })

  it('the verifier holds the tolerance itself: digits only, within the window either way', () => {
    const now = 1_800_000_000_000
    const seconds = now / 1000
    expect(timestampFresh(String(seconds), now)).toBe(true)
    expect(timestampFresh(String(seconds - WEBHOOK_TOLERANCE_SECONDS), now)).toBe(true)
    expect(timestampFresh(String(seconds + WEBHOOK_TOLERANCE_SECONDS), now)).toBe(true)
    expect(timestampFresh(String(seconds - WEBHOOK_TOLERANCE_SECONDS - 1), now)).toBe(false)
    expect(timestampFresh(String(seconds + WEBHOOK_TOLERANCE_SECONDS + 1), now)).toBe(false)
    for (const header of ['', '-1', `${seconds}abc`, `0x${seconds.toString(16)}`, `${seconds}.5`, '1'.repeat(13)]) expect(timestampFresh(header, now)).toBe(false)
  })

  it('a signature moved to another message id never verifies', () => {
    fc.assert(fc.property(signingSecret, body, messageId, messageId, freshTime, (secret, payload, signedId, sentId, at) => {
      fc.pre(signedId !== sentId)
      expect(verifyWebhookSignature([secret], payload, headersOf('webhook', sentId, at, signed(secret, signedId, at, payload)))).toBe(false)
    }))
  })

  it('a delivery missing any signature header, or mixing the two families, never verifies', () => {
    const header = fc.constantFrom('id', 'timestamp', 'signature')
    fc.assert(fc.property(signingSecret, body, messageId, freshTime, header, (secret, payload, id, at, part) => {
      const headers: Record<string, string> = headersOf('webhook', id, at, signed(secret, id, at, payload))
      const dropped = Object.fromEntries(Object.entries(headers).filter(([name]) => name !== `webhook-${part}`))
      expect(verifyWebhookSignature([secret], payload, dropped)).toBe(false)
      const mixed = { ...dropped, [`svix-${part}`]: headers[`webhook-${part}`]! }
      expect(verifyWebhookSignature([secret], payload, mixed)).toBe(false)
      expect(signatureHeaders(mixed)).toBeNull()
    }))
  })

  it('a legacy-keyed delivery verifies on the route that takes the legacy key, and nowhere else', () => {
    fc.assert(fc.property(legacySecret, body, messageId, freshTime, (secret, payload, id, at) => {
      const headers = headersOf('webhook', id, at, signedLegacy(secret, id, at, payload))
      expect(verifyWebhookSignature([secret], payload, headers, { legacyKey: true })).toBe(true)
      expect(verifyWebhookSignature([secret], payload, headers)).toBe(false)
    }))
  })

  it('a legacy-keyed delivery that is stale or changed never verifies either', () => {
    fc.assert(fc.property(legacySecret, body.chain(original => fc.tuple(fc.constant(original), otherBody(original))), messageId, freshTime, staleTime, (secret, [original, changed], id, fresh, stale) => {
      expect(verifyWebhookSignature([secret], changed, headersOf('webhook', id, fresh, signedLegacy(secret, id, fresh, original)), { legacyKey: true })).toBe(false)
      expect(verifyWebhookSignature([secret], original, headersOf('webhook', id, stale, signedLegacy(secret, id, stale, original)), { legacyKey: true })).toBe(false)
    }))
  })

  it('a bare `whsec_` is no key: a delivery signed with the empty key, under either reading, never verifies', () => {
    fc.assert(fc.property(body, messageId, freshTime, family, fc.boolean(), (payload, id, at, prefix, legacyKey) => {
      const forged = [signedWithKey(new Uint8Array(0), id, at, payload), signedWithKey(new TextEncoder().encode('whsec_'), id, at, payload)].join(' ')
      expect(verifyWebhookSignature(['whsec_'], payload, headersOf(prefix, id, at, forged), { legacyKey })).toBe(false)
    }))
  })

  it('a secret with under 16 bytes of key verifies nothing, even a delivery signed with it', () => {
    fc.assert(fc.property(shortSecret, body, messageId, freshTime, family, (secret, payload, id, at, prefix) => {
      const key = Uint8Array.from(atob(secret.slice('whsec_'.length)), char => char.charCodeAt(0))
      expect(verifyWebhookSignature([secret], payload, headersOf(prefix, id, at, signedWithKey(key, id, at, payload)), { legacyKey: true })).toBe(false)
    }))
    fc.assert(fc.property(shortLegacySecret, body, messageId, freshTime, (secret, payload, id, at) => {
      expect(verifyWebhookSignature([secret], payload, headersOf('webhook', id, at, signedLegacy(secret, id, at, payload)), { legacyKey: true })).toBe(false)
    }))
  })

  it('no secret verifies nothing', () => {
    fc.assert(fc.property(signingSecret, body, messageId, freshTime, (secret, payload, id, at) => {
      expect(verifyWebhookSignature([], payload, headersOf('webhook', id, at, signed(secret, id, at, payload)), { legacyKey: true })).toBe(false)
    }))
  })

  it('arbitrary headers, bodies and secrets never make it throw, and never verify', () => {
    const anyHeaders = fc.dictionary(fc.oneof(fc.constantFrom('webhook-id', 'webhook-timestamp', 'webhook-signature', 'svix-id', 'svix-timestamp', 'svix-signature'), fc.string({ maxLength: 20 })), fc.string({ maxLength: 80 }))
    fc.assert(fc.property(anyHeaders, fc.string(), fc.array(fc.string(), { maxLength: 4 }), fc.boolean(), (headers, payload, secrets, legacyKey) => {
      expect(verifyWebhookSignature(secrets, payload, headers, { legacyKey })).toBe(false)
    }))
  })
})

describe('the edge\'s parsing of what it has not verified yet', () => {
  it('the secret list keeps every non-blank entry, trimmed, in order', () => {
    const entry = fc.string({ minLength: 1, maxLength: 40 }).map(value => value.replace(/,/g, '')).filter(value => value.trim() !== '')
    const padding = fc.constantFrom('', ' ', '  ', '\t')
    fc.assert(fc.property(fc.array(fc.tuple(padding, entry, padding), { maxLength: 6 }), fc.array(padding, { maxLength: 3 }), (entries, blanks) => {
      const raw = [...entries.map(([before, value, after]) => `${before}${value}${after}`), ...blanks].join(',')
      expect(parseSecretList(raw)).toEqual(entries.map(([, value]) => value.trim()))
    }))
  })

  it('a body is read without ever throwing: JSON with its string `type`, anything else as the raw text', () => {
    fc.assert(fc.property(fc.oneof(fc.json(), fc.string()), (raw) => {
      const parsed = parseWebhookJson(raw)
      let json: unknown
      try {
        json = JSON.parse(raw)
      }
      catch {
        expect(parsed).toEqual({ payload: raw })
        return
      }
      expect(parsed.payload).toEqual(json)
      const type = typeof json === 'object' && json !== null ? (json as { type?: unknown }).type : undefined
      expect(parsed.type).toBe(typeof type === 'string' ? type : undefined)
    }))
  })
})
