import { createHmac } from 'node:crypto'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { CALL_METHOD, isProofFormat, PROOF_TTL_MS, proofKeys, signProof, verifyProof } from '../../../src/convex/proof'

// Property tests (fast-check) for the bot check's proof: what the app's
// server signs once its bot check passed, and the deployment verifies. For
// generated secrets, targets (method, path, audience, subject) and clocks:
// a proof passes for its own target within its minute, and for nothing
// else, and its signature is exactly the HMAC the docs describe, checked
// against Node's own.

/** One proof key: any non-empty text without a comma or edge whitespace (generated ones are base64, hand-set ones anything). */
const secret = fc.string({ unit: 'grapheme', minLength: 1, maxLength: 64 }).filter(key => !key.includes(',') && key.trim() === key)
/** A request method, or a call's. */
const method = fc.constantFrom('POST', 'GET', 'post', CALL_METHOD)
/** A request path, or a call's action. */
const path = fc.oneof(fc.constantFrom('/api/auth/email-otp/send-verification-otp', '/api/auth/sign-up/email', 'waitlist', 'contact'), fc.string({ maxLength: 40 }))
/** A deployment's host, or none. */
const audience = fc.oneof(fc.constantFrom('happy-otter-123.convex.site', 'brave-fox-456.convex.site', '127.0.0.1:3211', ''), fc.string({ maxLength: 40 }))
/** An address, a call's subject, or none (text with newlines and quotes included). */
const subject = fc.oneof(fc.constantFrom('', 'ada@example.com', 'bob@example.com'), fc.string({ maxLength: 40 }))
/** A clock, anywhere in a few decades around now. */
const now = fc.integer({ min: 1_000_000_000_000, max: 4_000_000_000_000 })

/** The signature as the docs describe it: HMAC-SHA-256 over the domain tag and the JSON array of method, path, audience, subject and stamp. */
function nodeSignature(key: string, target: { method: string, path: string, audience: string, subject: string }, stamp: number): string {
  return createHmac('sha256', key).update(`backend-proof:v1\n${JSON.stringify([target.method.toUpperCase(), target.path, target.audience, target.subject, stamp])}`).digest('base64url')
}

/** A target with no audience and no subject, for the properties about the rest. */
const plain = (method: string, path: string, at?: number) => ({ method, path, audience: '', ...(at === undefined ? {} : { now: at }) })

describe('a proof', () => {
  it('is `v1.<ms>.<HMAC-SHA-256, base64url>` of the method, path, audience, subject and time it was signed', async () => {
    await fc.assert(fc.asyncProperty(secret, method, path, audience, subject, now, async (key, m, p, a, s, at) => {
      const proof = await signProof(key, { method: m, path: p, audience: a, subject: s, now: at })
      expect(isProofFormat(proof)).toBe(true)
      expect(proof).toBe(`v1.${at}.${nodeSignature(key, { method: m, path: p, audience: a, subject: s }, at)}`)
    }))
  })

  it('never passes for another deployment or another subject, whatever their text', async () => {
    await fc.assert(fc.asyncProperty(secret, method, path, audience, audience, subject, subject, now, async (key, m, p, a, otherAudience, s, otherSubject, at) => {
      const proof = await signProof(key, { method: m, path: p, audience: a, subject: s, now: at })
      expect(await verifyProof(key, proof, { method: m, path: p, audience: a, subject: s, now: at })).toEqual({ ok: true })
      if (otherAudience !== a) expect(await verifyProof(key, proof, { method: m, path: p, audience: otherAudience, subject: s, now: at })).toEqual({ ok: false, reason: 'mismatch' })
      if (otherSubject !== s) expect(await verifyProof(key, proof, { method: m, path: p, audience: a, subject: otherSubject, now: at })).toEqual({ ok: false, reason: 'mismatch' })
    }))
  })

  it('passes for its own target, under its own secret, for a minute', async () => {
    await fc.assert(fc.asyncProperty(secret, method, path, now, fc.integer({ min: 0, max: PROOF_TTL_MS }), async (key, m, p, at, age) => {
      const proof = await signProof(key, plain(m, p, at))
      expect(await verifyProof(key, proof, plain(m, p, at + age))).toEqual({ ok: true })
    }))
  })

  it('reads the method in any letter case, the path exactly', async () => {
    await fc.assert(fc.asyncProperty(secret, path, now, async (key, p, at) => {
      const proof = await signProof(key, plain('post', p, at))
      expect(await verifyProof(key, proof, plain('POST', p, at))).toEqual({ ok: true })
      expect(await verifyProof(key, proof, plain('POST', `${p}/`, at))).toEqual({ ok: false, reason: 'mismatch' })
    }))
  })

  it('never passes under another secret, for another method or for another path', async () => {
    await fc.assert(fc.asyncProperty(secret, secret, method, method, path, path, now, async (key, otherKey, m, otherMethod, p, otherPath, at) => {
      const proof = await signProof(key, plain(m, p, at))
      if (otherKey !== key) expect(await verifyProof(otherKey, proof, plain(m, p, at))).toEqual({ ok: false, reason: 'mismatch' })
      if (otherMethod.toUpperCase() !== m.toUpperCase()) expect(await verifyProof(key, proof, plain(otherMethod, p, at))).toEqual({ ok: false, reason: 'mismatch' })
      if (otherPath !== p) expect(await verifyProof(key, proof, plain(m, otherPath, at))).toEqual({ ok: false, reason: 'mismatch' })
    }))
  })

  it('expires a minute after it was signed, and is refused from more than a few seconds ahead', async () => {
    await fc.assert(fc.asyncProperty(secret, method, path, now, fc.integer({ min: 1, max: 10 * PROOF_TTL_MS }), async (key, m, p, at, past) => {
      const proof = await signProof(key, plain(m, p, at))
      expect(await verifyProof(key, proof, plain(m, p, at + PROOF_TTL_MS + past))).toEqual({ ok: false, reason: 'expired' })
      expect(await verifyProof(key, proof, plain(m, p, at - 5_000 - past))).toEqual({ ok: false, reason: 'early' })
      // Within the clocks' skew, a proof from just ahead still passes.
      expect(await verifyProof(key, proof, plain(m, p, at - 5_000))).toEqual({ ok: true })
    }))
  })

  it('refuses one whose time or signature was changed', async () => {
    await fc.assert(fc.asyncProperty(secret, method, path, now, fc.integer({ min: 1, max: PROOF_TTL_MS }), fc.integer({ min: 0, max: 42 }), async (key, m, p, at, shift, position) => {
      const proof = await signProof(key, plain(m, p, at))
      const [, stamp, signature] = proof.split('.') as [string, string, string]
      // A later stamp would buy another minute: the signature covers it.
      expect(await verifyProof(key, `v1.${Number(stamp) + shift}.${signature}`, plain(m, p, at))).toMatchObject({ ok: false })
      // One character of the signature changed (the last carries two bits base64url ignores).
      const index = Math.min(position, 41)
      const flipped = signature.slice(0, index) + (signature[index] === 'A' ? 'B' : 'A') + signature.slice(index + 1)
      expect(await verifyProof(key, `v1.${stamp}.${flipped}`, plain(m, p, at))).toEqual({ ok: false, reason: 'mismatch' })
    }))
  })

  it('refuses anything that is not shaped like one, and says it is missing when there is none', async () => {
    await fc.assert(fc.asyncProperty(secret, fc.string({ maxLength: 80 }), now, async (key, junk, at) => {
      fc.pre(!isProofFormat(junk))
      const check = await verifyProof(key, junk, plain('POST', '/x', at))
      expect(check).toEqual({ ok: false, reason: junk ? 'malformed' : 'missing' })
    }))
    expect(await verifyProof('k', null, plain('POST', '/x'))).toEqual({ ok: false, reason: 'missing' })
    expect(await verifyProof('k', undefined, plain('POST', '/x'))).toEqual({ ok: false, reason: 'missing' })
  })

  it('passes under either key while the secret rotates, and is signed with the first', async () => {
    await fc.assert(fc.asyncProperty(secret, secret, method, path, now, async (next, previous, m, p, at) => {
      fc.pre(next !== previous)
      const target = plain(m, p, at)
      const old = await signProof(previous, target)
      // The deployment holds `new,old` while the app's server still signs with the old one…
      expect(await verifyProof(`${next}, ${previous}`, old, target)).toEqual({ ok: true })
      // …and the server, given `new,old` too, signs with the new one, which the old key alone refuses.
      const rotated = await signProof(`${next},${previous}`, target)
      expect(rotated).toBe(await signProof(next, target))
      expect(await verifyProof(previous, rotated, target)).toEqual({ ok: false, reason: 'mismatch' })
      expect(proofKeys(` ${next} ,, ${previous} `)).toEqual([next, previous])
    }))
  })

  it('refuses to sign without a secret', async () => {
    await expect(signProof('', plain('POST', '/x'))).rejects.toThrow(/no secret/)
    await expect(signProof(' , ', plain('POST', '/x'))).rejects.toThrow(/no secret/)
  })
})
