import { hookAdapter } from './runtime.js'

// How the one-time codes are kept: a keyed hash of each code, and one live
// code per address and purpose.

const encoder = new TextEncoder()

/**
 * `storeOTP` for the emailOTP plugin: an HMAC-SHA-256 of the code, keyed by
 * the auth secret. Better Auth's own `'hashed'` is an unkeyed SHA-256, and a
 * six-digit code has a million values, so anyone who can read the table
 * inverts it in under a second. Keyed, the stored value yields nothing
 * without the secret.
 */
export function keyedCodeHash(secret: string | undefined): { hash: (otp: string) => Promise<string> } {
  let key: Promise<CryptoKey> | undefined
  return {
    hash: async (otp) => {
      // Unreachable on a deployment: the app's env contract requires it.
      if (!secret) throw new Error('[nuxt-backend] AUTH_SECRET is not set, so a one-time code cannot be stored. Set it on the deployment.')
      key ??= crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
      // The prefix keeps this MAC apart from anything else the secret signs.
      const mac = await crypto.subtle.sign('HMAC', await key, encoder.encode(`email-otp:${otp}`))
      return Array.from(new Uint8Array(mac), byte => byte.toString(16).padStart(2, '0')).join('')
    },
  }
}

/** The identifiers the emailOTP plugin keeps its codes under: `<type>-otp-<address>`. */
const CODE_IDENTIFIER = /^(?:sign-in|email-verification|forget-password|change-email)-otp-/

/**
 * A `verification.create.before` hook: a new code replaces every earlier one
 * for the same address and purpose. Each send adds a row, and Better Auth
 * reads the newest row while an update by identifier reaches whichever row
 * the database returns first — on the Convex adapter, the oldest. With two
 * rows, a wrong guess counted against the stale code and the live one never
 * ran out of attempts. One row per identifier keeps the count on the code it
 * guards.
 *
 * Applies to the emailOTP plugin's own identifiers only, stored as they come
 * (Better Auth's default): `verification.storeIdentifier` hashing turns it off.
 */
export async function replaceEarlierCodes(verification: { identifier?: unknown }, hookCtx: unknown): Promise<void> {
  const { identifier } = verification
  if (typeof identifier !== 'string' || !CODE_IDENTIFIER.test(identifier)) return
  await hookAdapter(hookCtx)?.deleteMany({ model: 'verification', where: [{ field: 'identifier', value: identifier }] })
}
