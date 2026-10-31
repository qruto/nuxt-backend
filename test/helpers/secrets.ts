// Credentials made up per test run. A literal in the repository with a
// provider's prefix and enough random-looking characters after it is what
// secret scanners match (GitHub flagged two `whsec_` fixtures as live Stripe
// webhook secrets), so no test writes one: each value is built here, at run
// time, from the prefix and fresh random bytes. test/unit/secret-literals.test.ts
// keeps it that way.

/** `count` random bytes, from the platform's CSPRNG (Node and the edge runtime alike). */
function randomBytes(count: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(count))
}

/**
 * A made-up credential in a provider's shape: `prefix` and 32 random
 * alphanumeric characters (`re_…`, `polar_oat_…`, `polar_whs_…`).
 */
export function fakeCredential(prefix: string): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  return prefix + Array.from(randomBytes(32), byte => alphabet[byte % alphabet.length]).join('')
}

/**
 * A webhook signing secret as Standard Webhooks and svix issue them: `whsec_`
 * and the base64 of `bytes` random key bytes (24 by default; the providers
 * hand out 24 or 32).
 */
export function signingSecret(bytes = 24): string {
  return `whsec_${btoa(String.fromCharCode(...randomBytes(bytes)))}`
}
