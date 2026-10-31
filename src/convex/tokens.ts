// Token helpers that run wherever Web Crypto does: the default Convex
// runtime, Node and the browser. A secret kept in a table is read by anyone
// who can read the table, so the pattern is one random token handed out once
// and its SHA-256 stored and compared. Nothing here touches Convex.

/** The fewest random bytes a token may have: 128 bits, out of reach of guessing. */
export const MIN_TOKEN_BYTES = 16

/** The most random bytes a token may have. */
export const MAX_TOKEN_BYTES = 1024

/** Bytes as unpadded base64url. */
export function base64url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * An HMAC-SHA-256 key derived from a secret for one use: the secret signs
 * the tag, and the result is the key, so a key made for one kind of signed
 * link signs nothing else, and a new tag version is a new key.
 */
export async function taggedHmacKey(secret: string, tag: string): Promise<CryptoKey> {
  const encoder = new TextEncoder()
  const base = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const derived = await crypto.subtle.sign('HMAC', base, encoder.encode(tag))
  return crypto.subtle.importKey('raw', derived, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
}

/** Whether two strings are equal, in time that does not depend on where they differ: for comparing signatures. */
export function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let index = 0; index < a.length; index++) diff |= a.charCodeAt(index) ^ b.charCodeAt(index)
  return diff === 0
}

/** Bytes as lower-case hex. */
export function toHex(bytes: ArrayBuffer | Uint8Array): string {
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * A random token from the platform's secure random source: 32 bytes by
 * default, written as 43 URL-safe characters (`A-Z a-z 0-9 - _`), so it
 * goes into a path or a query as it is. Hand it out once and keep only
 * `sha256Hex(token)`.
 *
 * `bytes` is the entropy, from 16 to 1024. The token's length is longer:
 * 22 characters for 16 bytes.
 *
 * @throws TypeError when `bytes` is no whole number from 16 to 1024.
 *
 * @example
 * ```ts
 * import { randomToken, sha256Hex } from 'nuxt-backend/functions'
 *
 * const token = randomToken()
 * const tokenHash = await sha256Hex(token) // store this
 * return token // shown once
 * ```
 */
export function randomToken(bytes: number = 32): string {
  if (!Number.isInteger(bytes) || bytes < MIN_TOKEN_BYTES || bytes > MAX_TOKEN_BYTES) {
    throw new TypeError(`[nuxt-backend] randomToken: "${bytes}" bytes is no whole number from ${MIN_TOKEN_BYTES} to ${MAX_TOKEN_BYTES}. A shorter token can be guessed.`)
  }
  return base64url(crypto.getRandomValues(new Uint8Array(bytes)))
}

/**
 * The text's SHA-256 as 64 lower-case hex characters, from its UTF-8
 * bytes. The hash to store for a token, and to look it up by: hash what
 * arrives and compare hashes.
 *
 * It suits tokens that are random and long. A password or any guessable
 * secret needs a slow, salted hash instead (the package never stores
 * passwords).
 *
 * @example
 * ```ts
 * import { sha256Hex } from 'nuxt-backend/functions'
 *
 * await sha256Hex('abc') // 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
 * ```
 */
export async function sha256Hex(text: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))
}

/**
 * The address trimmed and lower-cased: the form to store and compare it in,
 * so `Ana@Example.com ` and `ana@example.com` are one person. Only
 * surrounding whitespace and case change, and the domain is not rewritten
 * (no punycode, no plus-tag or dot rules, which differ by provider).
 *
 * @example
 * ```ts
 * import { normalizeEmail } from 'nuxt-backend/functions'
 *
 * normalizeEmail('  Ana@Example.com ') // 'ana@example.com'
 * ```
 */
export function normalizeEmail(address: string): string {
  return address.trim().toLowerCase()
}
