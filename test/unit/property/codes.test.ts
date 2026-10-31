import { createHmac } from 'node:crypto'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { keyedCodeHash } from '../../../src/convex/client/codes'

// Property tests (fast-check) for how a one-time code is stored: an
// HMAC-SHA-256 of `email-otp:<code>` keyed by AUTH_SECRET, hex. Checked
// against Node's own HMAC for generated secrets and codes, so the stored value
// is exactly the keyed hash the comment promises: the same code under the
// same secret always matches, and nothing about it is readable without the
// secret.

/** An auth secret: any non-empty text (generated ones are base64, hand-set ones anything). */
const secret = fc.string({ unit: 'grapheme', minLength: 1, maxLength: 64 })
/** A code as the plugin makes them, and any other text a request could carry. */
const code = fc.oneof(fc.stringMatching(/^\d{6}$/), fc.string({ unit: 'grapheme', maxLength: 32 }))

const nodeHmac = (key: string, otp: string) => createHmac('sha256', key).update(`email-otp:${otp}`).digest('hex')

describe('keyedCodeHash', () => {
  it('is the HMAC-SHA-256 of `email-otp:<code>` under the secret, as 64 lower-case hex digits', async () => {
    await fc.assert(fc.asyncProperty(secret, code, async (key, otp) => {
      const stored = await keyedCodeHash(key).hash(otp)
      expect(stored).toMatch(/^[0-9a-f]{64}$/)
      expect(stored).toBe(nodeHmac(key, otp))
    }))
  })

  it('stores the same code the same way every time, so a check finds it', async () => {
    await fc.assert(fc.asyncProperty(secret, code, async (key, otp) => {
      const hasher = keyedCodeHash(key)
      expect(await hasher.hash(otp)).toBe(await hasher.hash(otp))
      expect(await keyedCodeHash(key).hash(otp)).toBe(await hasher.hash(otp))
    }))
  })

  it('keeps two codes apart, and one code under two secrets apart', async () => {
    await fc.assert(fc.asyncProperty(secret, secret, code, code, async (key, otherKey, otp, otherOtp) => {
      fc.pre(otp !== otherOtp && key !== otherKey)
      const hasher = keyedCodeHash(key)
      expect(await hasher.hash(otp)).not.toBe(await hasher.hash(otherOtp))
      expect(await hasher.hash(otp)).not.toBe(await keyedCodeHash(otherKey).hash(otp))
    }))
  })

  it('refuses to store anything without a secret', async () => {
    await fc.assert(fc.asyncProperty(fc.constantFrom(undefined, ''), code, async (missing, otp) => {
      await expect(keyedCodeHash(missing).hash(otp)).rejects.toThrow(/AUTH_SECRET is not set/)
    }))
  })
})
