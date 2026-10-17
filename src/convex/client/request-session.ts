import { type createAuthMiddleware, getSessionFromCtx } from 'better-auth/api'
import { bearer } from 'better-auth/plugins/bearer'
import { authRefusal } from './refusals.js'

// The caller of a request, read before the route runs: what every
// request-level guard keys its limits and refusals on.

/** The context Better Auth hands a before-hook. */
export type AuthHookCtx = Parameters<Parameters<typeof createAuthMiddleware>[0]>[0]

/** The parts of the route's session the guards read. */
export interface RequestSession {
  user: { id: string, email: string }
  session: { id: string, impersonatedBy?: string | null }
}

/**
 * The bearer plugin's before-hook, which the convex plugin embeds: it moves
 * an `Authorization: Bearer` session token into the session cookie.
 */
const bearerToCookie = bearer().hooks.before[0]!

/**
 * The headers the route will authenticate with. The bearer hook returns the
 * rewritten cookie, and Better Auth applies what a before-hook returns only
 * once every before-hook has run — so a hook that reads the cookie sees the
 * request as it arrived, without the Bearer token's session. Running the same
 * hook here yields the headers the route will see: a token it verifies
 * replaces the session cookie, one it rejects changes nothing.
 */
async function routeHeaders(ctx: AuthHookCtx): Promise<Headers | undefined> {
  if (!bearerToCookie.matcher(ctx as never)) return ctx.headers
  const result = await bearerToCookie.handler({ ...ctx, returnHeaders: false } as never) as
    { context?: { headers?: Headers } } | undefined
  return result?.context?.headers ?? ctx.headers
}

/** Whether the request carries a credential: a Bearer token, or the session cookie. */
function carriesCredential(ctx: AuthHookCtx, headers: Headers | undefined): boolean {
  const authorization = ctx.request?.headers.get('authorization') || ctx.headers?.get('authorization') || ''
  if (/^bearer\s+\S/i.test(authorization)) return true
  const name = ctx.context.authCookies.sessionToken.name
  return (headers?.get('cookie') ?? '').split(';').some(cookie => cookie.trim().startsWith(`${name}=`))
}

/**
 * The session the route will run with, resolved the way the route resolves
 * it: from the session cookie, or from a Bearer token, which the bearer
 * plugin turns into that cookie. Better Auth caches it on the context, so the
 * route's own session middleware reuses it instead of reading it again, and
 * a session already cached there is the one the route will use.
 *
 * `null` when the request carries no credential: the route answers 401
 * itself, or serves an anonymous caller. A credential that resolves to no
 * session is refused here with 401, so a lookup that failed in this hook can
 * never let the route run without the checks keyed on its caller.
 */
export async function requestSession(ctx: AuthHookCtx): Promise<RequestSession | null> {
  const headers = await routeHeaders(ctx)
  const resolved = await getSessionFromCtx({ ...ctx, headers } as never) as RequestSession | null
  if (resolved) return resolved
  if (carriesCredential(ctx, headers)) throw authRefusal('unauthenticated', { message: 'Sign in again to continue.' })
  return null
}
