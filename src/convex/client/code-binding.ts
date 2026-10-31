import { constantTimeEqual } from 'better-auth/crypto'
import { OTP_EXPIRES_IN_SECONDS } from '../constants.js'
import type { AuthHookCtx } from './request-session.js'
import { authRefusal } from './refusals.js'
import { type AuthLibrarySecretConfig, contextSecrets, firstVerified } from '../auth-secrets.js'

// A sign-in code works only in the browser that asked for it. Asking sets
// an HttpOnly cookie on the auth route that names the one code it goes
// with: a MAC, under the auth secret and tagged for sign-in, of the stored
// code (its keyed hash, its address and its expiry, which a wrong guess
// keeps: Better Auth then writes the row anew, under a new id). Checking the code needs that cookie, so a code read over
// someone's shoulder or typed into a phishing page signs nobody in
// elsewhere. Better Auth's email OTP plugin has no binding of its own
// (checked 2026-10-27, Better Auth 1.6).

/** The cookie's name, under Better Auth's prefix (`__Secure-better-auth.sign_in_code` over HTTPS). */
const CODE_COOKIE = 'sign_in_code'

/** The route that sends a code, and the one that signs in with it. */
const SEND_CODE_PATH = '/email-otp/send-verification-otp'
const SIGN_IN_PATH = '/sign-in/email-otp'

const encoder = new TextEncoder()

/** A stored code: the emailOTP plugin's row, `<hash>:<attempts>` under `sign-in-otp-<address>`. */
interface StoredCode { identifier: string, value: string, expiresAt: Date | string | number }

/** The MAC of a stored code, tagged for sign-in: what the cookie holds. The attempt count is no part of it. */
async function bindingOf(secret: string, code: StoredCode): Promise<string> {
  const at = code.value.lastIndexOf(':')
  const stored = at === -1 ? code.value : code.value.slice(0, at)
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(`sign-in-code:${code.identifier}:${new Date(code.expiresAt).getTime()}:${stored}`))
  return Array.from(new Uint8Array(mac), byte => byte.toString(16).padStart(2, '0')).join('')
}

/** The JSON body a hook sees, or nothing. */
function bodyOf(ctx: { body?: unknown }): Record<string, unknown> {
  return ctx.body && typeof ctx.body === 'object' ? ctx.body as Record<string, unknown> : {}
}

/** The live sign-in code row of an address: the emailOTP plugin's `sign-in-otp-<address>`. */
async function liveCode(ctx: AuthHookCtx, address: string): Promise<StoredCode | null> {
  const row = await ctx.context.internalAdapter.findVerificationValue(`sign-in-otp-${address.trim().toLowerCase()}`)
  return row && new Date(row.expiresAt).getTime() > Date.now() ? row : null
}

/** The cookie as this request writes it: HttpOnly, on the auth route, as long as a code lives. */
function codeCookie(ctx: AuthHookCtx, maxAge: number) {
  const cookie = ctx.context.createAuthCookie(CODE_COOKIE, { maxAge, path: ctx.context.options.basePath || '/' })
  return cookie
}

/**
 * Set the cookie that names the code a sign-in code request just stored,
 * once the route answered. Nothing for any other route or code type, or a
 * request the route refused.
 */
export async function bindCodeToBrowser(ctx: AuthHookCtx): Promise<void> {
  if (ctx.path !== SEND_CODE_PATH) return
  const { email, type } = bodyOf(ctx)
  const returned = (ctx.context as { returned?: unknown }).returned
  if (type !== 'sign-in' || typeof email !== 'string' || returned === undefined || returned instanceof Error) return
  const row = await liveCode(ctx, email)
  if (!row) return
  const { name, attributes } = codeCookie(ctx, OTP_EXPIRES_IN_SECONDS)
  ctx.setCookie(name, await bindingOf(ctx.context.secret, row), attributes)
}

/**
 * The same cookie with a value that names no code: what a request answered
 * without storing one (a passkey-only account) sets, so its answer looks
 * like any other.
 */
export function setUnboundCodeCookie(ctx: AuthHookCtx): void {
  const { name, attributes } = codeCookie(ctx, OTP_EXPIRES_IN_SECONDS)
  // Random hex of the same length as a MAC: nothing tells the two apart.
  ctx.setCookie(name, Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join(''), attributes)
}

/**
 * Refuse a sign-in code checked in another browser than the one that asked
 * for it, before the code is read: `invalid_input` on `otp`, reason
 * `other_browser`. With no live code for the address there is nothing to
 * bind, and the route refuses the check on its own.
 */
export async function assertCodeBrowser(ctx: AuthHookCtx): Promise<void> {
  if (ctx.path !== SIGN_IN_PATH) return
  const { email } = bodyOf(ctx)
  if (typeof email !== 'string') return
  const row = await liveCode(ctx, email)
  if (!row) return
  const held = ctx.getCookie(codeCookie(ctx, 0).name) ?? ''
  const bound = await firstVerified(contextSecrets(ctx.context as { secret: string, secretConfig?: AuthLibrarySecretConfig }), async secret => constantTimeEqual(held, await bindingOf(secret, row)))
  if (!bound) {
    throw authRefusal('invalid_input', { field: 'otp', reason: 'other_browser' })
  }
}

/** Once a code signed in, its cookie goes: it names a code that no longer exists. */
export function clearCodeCookie(ctx: AuthHookCtx): void {
  if (ctx.path !== SIGN_IN_PATH) return
  const returned = (ctx.context as { returned?: unknown }).returned
  if (returned === undefined || returned instanceof Error) return
  const { name, attributes } = codeCookie(ctx, 0)
  ctx.setCookie(name, '', { ...attributes, maxAge: 0 })
}
