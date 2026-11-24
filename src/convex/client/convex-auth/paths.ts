// Which engine routes a Convex Auth app's browser reaches, and through
// which function: the routes that open a session go through `signIn`, so
// the auth proxy keeps the Convex Auth session it opens in its cookies;
// every other route the auth client calls goes through `authRequest`; the
// routes Convex Auth replaces go through neither.

/** The routes that open a session a person signs in to. */
export const ENGINE_SIGN_IN_PATHS: ReadonlySet<string> = new Set([
  '/sign-in/email-otp',
  '/email-otp/verify-email',
  '/passkey/verify-authentication',
  '/sign-in/recovery-code',
  // A recovery session's passkey, which makes it an ordinary session.
  '/passkey/verify-registration',
  '/admin/impersonate-user',
  '/admin/stop-impersonating',
  // An app that turns passwords on.
  '/sign-in/email',
  '/sign-up/email',
  '/email-otp/reset-password',
])

/** Whether a route opens a session, and goes through `signIn`. */
export function isEngineSignInPath(path: string): boolean {
  return ENGINE_SIGN_IN_PATHS.has(path)
}

/**
 * The routes `authRequest` refuses, with why: the session's own (Convex
 * Auth signs out, refreshes and lists sessions), the engine's token and
 * key routes (the backend mints the access token), and the routes that
 * open a session, which `signIn` runs. `null` for a route it runs.
 */
export function refusesEnginePath(path: string): string | null {
  if (!path.startsWith('/') || path.includes('..') || path.includes('?')) return 'Not a route.'
  // A recovery session's passkey goes through signIn only when it carries one; an ordinary session's registers here.
  if (path === '/passkey/verify-registration') return null
  if (ENGINE_SIGN_IN_PATHS.has(path)) return 'Sign-in routes go through signIn.'
  if (path === '/sign-out' || path.startsWith('/convex/') || path.startsWith('/jwks') || path === '/token') return 'Convex Auth holds the session.'
  if (path.startsWith('/multi-session/') || path === '/update-session') return 'Convex Auth holds the session.'
  return null
}

/** Whether a value reads as a session row: what carries a token to scrub. */
function isSessionLike(value: Record<string, unknown>): boolean {
  return typeof value.token === 'string' && ('userId' in value || 'expiresAt' in value)
}

/**
 * A route's answer without the engine's session tokens: the browser holds
 * Convex Auth's session, and an engine token in its hands would be a second
 * credential to steal. A sign-in's `{ token }` and every session row's
 * `token` go; nothing else changes.
 */
export function scrubSessionTokens(body: unknown, depth = 0): unknown {
  if (depth > 6 || body === null || typeof body !== 'object') return body
  if (Array.isArray(body)) return body.map(item => scrubSessionTokens(item, depth + 1))
  const record = body as Record<string, unknown>
  const scrubbed: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(record)) {
    if (key === 'token' && typeof value === 'string' && (depth === 0 || isSessionLike(record))) continue
    scrubbed[key] = scrubSessionTokens(value, depth + 1)
  }
  return scrubbed
}
