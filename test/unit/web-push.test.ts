import { describe, expect, it, vi } from 'vitest'
import { arePushKeys, base64urlDecode, base64urlEncode, encryptPushPayload, generatePushKeys, isPushTarget, PUSH_PAYLOAD_MAX, pushOutcome, sendPush, vapidAuthorization } from '../../src/convex/web-push'

// The deployment's own Web Push sender: RFC 8291 message encryption, held to
// the RFC's own worked example, and the RFC 8292 VAPID token, verified with
// the public key a browser binds its subscription to.

const RFC_8291 = {
  plaintext: 'When I grow up, I want to be a watermelon',
  asPublic: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  uaPublic: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  body: 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
}

describe('the message encryption (RFC 8291)', () => {
  it('writes the RFC\'s example body, byte for byte', async () => {
    const point = base64urlDecode(RFC_8291.asPublic)
    const privateKey = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', d: RFC_8291.asPrivate, x: base64urlEncode(point.slice(1, 33)), y: base64urlEncode(point.slice(33)) }, { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
    const publicKey = await crypto.subtle.importKey('raw', point, { name: 'ECDH', namedCurve: 'P-256' }, true, [])
    const body = await encryptPushPayload(new TextEncoder().encode(RFC_8291.plaintext), { p256dh: RFC_8291.uaPublic, auth: RFC_8291.auth }, { salt: base64urlDecode(RFC_8291.salt), keys: { publicKey, privateKey } })
    expect(base64urlEncode(body)).toBe(RFC_8291.body)
  })

  it('refuses a payload one record cannot hold', async () => {
    await expect(encryptPushPayload(new Uint8Array(PUSH_PAYLOAD_MAX + 1), { p256dh: RFC_8291.uaPublic, auth: RFC_8291.auth })).rejects.toThrow(RangeError)
  })
})

describe('the VAPID keys and token (RFC 8292)', () => {
  it('generates a pair that reads as one, and signs a token its public key verifies', async () => {
    const keys = await generatePushKeys()
    expect(arePushKeys(keys)).toBe(true)
    const header = await vapidAuthorization('https://fcm.googleapis.com/fcm/send/abc', keys, 'https://app.example.com', Date.UTC(2026, 9, 28))
    const [, token, key] = /^vapid t=([^,]+), k=(.+)$/.exec(header)!
    expect(key).toBe(keys.publicKey)
    const [head, claims, signature] = token!.split('.')
    expect(JSON.parse(new TextDecoder().decode(base64urlDecode(head!)))).toEqual({ typ: 'JWT', alg: 'ES256' })
    expect(JSON.parse(new TextDecoder().decode(base64urlDecode(claims!)))).toEqual({ aud: 'https://fcm.googleapis.com', exp: Date.UTC(2026, 9, 28) / 1000 + 12 * 3600, sub: 'https://app.example.com' })
    const verifier = await crypto.subtle.importKey('raw', base64urlDecode(keys.publicKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
    expect(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, verifier, base64urlDecode(signature!), new TextEncoder().encode(`${head}.${claims}`))).toBe(true)
  })

  it('reads a pair or a subscription only in the shape a browser and env push write', () => {
    expect(arePushKeys({ publicKey: RFC_8291.asPublic, privateKey: RFC_8291.asPrivate })).toBe(true)
    expect(arePushKeys({ publicKey: RFC_8291.asPrivate, privateKey: RFC_8291.asPrivate })).toBe(false)
    expect(arePushKeys({ publicKey: RFC_8291.asPublic })).toBe(false)
    expect(isPushTarget({ endpoint: 'https://web.push.apple.com/abc', p256dh: RFC_8291.uaPublic, auth: RFC_8291.auth })).toBe(true)
    expect(isPushTarget({ endpoint: 'http://web.push.apple.com/abc', p256dh: RFC_8291.uaPublic, auth: RFC_8291.auth })).toBe(false)
    expect(isPushTarget({ endpoint: 'https://web.push.apple.com/abc', p256dh: RFC_8291.uaPublic, auth: 'short' })).toBe(false)
  })
})

describe('what a push service answers', () => {
  it('drops a gone device, drops a payload too large, retries a busy service after its wait, and names a refusal', () => {
    expect(pushOutcome(201, null, 60_000)).toEqual({ kind: 'sent' })
    expect(pushOutcome(404, null, 60_000)).toEqual({ kind: 'gone' })
    expect(pushOutcome(410, null, 60_000)).toEqual({ kind: 'gone' })
    expect(pushOutcome(413, null, 60_000)).toEqual({ kind: 'too-large' })
    expect(pushOutcome(429, '30', 60_000)).toEqual({ kind: 'retry', retryAfterMs: 30_000 })
    expect(pushOutcome(503, null, 60_000)).toEqual({ kind: 'retry', retryAfterMs: 60_000 })
    expect(pushOutcome(403, null, 60_000)).toEqual({ kind: 'refused', status: 403 })
    expect(pushOutcome(400, null, 60_000)).toEqual({ kind: 'refused', status: 400 })
  })

  it('posts the encrypted body with the headers every push service requires, and reads a network failure as busy', async () => {
    const keys = await generatePushKeys()
    const device = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair
    const target = { endpoint: 'https://updates.push.services.mozilla.com/wpush/v2/abc', p256dh: base64urlEncode(new Uint8Array(await crypto.subtle.exportKey('raw', device.publicKey))), auth: base64urlEncode(crypto.getRandomValues(new Uint8Array(16))) }
    const fetcher = vi.fn(async () => new Response(null, { status: 201 }))
    expect(await sendPush(target, { title: 'Your strip is ready', navigate: 'https://app.example.com/strips/1' }, keys, 'https://app.example.com', { fetch: fetcher as never })).toEqual({ kind: 'sent' })
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(target.endpoint)
    expect(init.headers).toMatchObject({ 'Content-Encoding': 'aes128gcm', 'TTL': '86400', 'Urgency': 'normal', 'Authorization': expect.stringMatching(/^vapid t=.+, k=/) })
    const offline = async () => {
      throw new TypeError('offline')
    }
    expect(await sendPush(target, { title: 'x', navigate: 'https://app.example.com' }, keys, 'https://app.example.com', { fetch: offline as never })).toEqual({ kind: 'retry', retryAfterMs: 60_000 })
  })

  it('reads a device whose key is no point on the curve as gone, and posts nothing to it', async () => {
    const keys = await generatePushKeys()
    // 65 bytes that start with 0x04, as a key must, but name no point on P-256.
    const offCurve = new Uint8Array(65).fill(7)
    offCurve[0] = 4
    const target = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', p256dh: base64urlEncode(offCurve), auth: base64urlEncode(crypto.getRandomValues(new Uint8Array(16))) }
    expect(isPushTarget(target)).toBe(true)
    const fetcher = vi.fn(async () => new Response(null, { status: 201 }))
    expect(await sendPush(target, { title: 'x', navigate: 'https://app.example.com' }, keys, 'https://app.example.com', { fetch: fetcher as never })).toEqual({ kind: 'gone' })
    expect(fetcher).not.toHaveBeenCalled()
  })
})
