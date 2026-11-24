import type { FunctionReference } from 'convex/server'

// Convex Auth's core component, as the backend reads it: mounted by the app
// at `auth` (`app.use(auth)` in convex.config.ts, the path the core's own
// tokens name), with the functions that open, refresh, list and end its
// sessions. Read structurally from the app's `components`, like the
// backend component's adapter.

/** The token bundle a core session opens or rotates with. */
export type CoreTokenBundle = {
  accessToken: string
  refreshToken: string
  refreshTokenExpiresAt: number
  userId: string
}

/** The core's session lifetimes: what every call that opens or refreshes a session passes. */
export type CoreTtl = {
  accessTokenTtlSeconds: number
  refreshInactivityTimeoutSeconds: number
  sessionMaxLifetimeSeconds: number
}

/** The core's own functions the backend calls. */
export interface ConvexAuthCore {
  public: {
    _internal_dangerous_signIn: FunctionReference<'mutation', 'internal', CoreTtl & {
      claims: { method: string, profile: unknown }
      componentPath: string
      userId: string
      onSignInHandle?: string
    }, CoreTokenBundle>
    refresh: FunctionReference<'mutation', 'internal', CoreTtl & { refreshToken: string }, { kind: 'rotated', tokens: CoreTokenBundle } | { kind: 'noSession' }>
    signOut: FunctionReference<'mutation', 'internal', { refreshToken: string }, null>
    getSession: FunctionReference<'query', 'internal', { sessionId: string }, { userId: string } | null>
    revokeSessions: FunctionReference<'mutation', 'internal', { sessionIds: string[] }, string[]>
  }
}

/** The core, from the app's `components`; `undefined` when the app mounts none. */
export function convexAuthCore(components: unknown): ConvexAuthCore | undefined {
  const core = (components as { auth?: { public?: Record<string, unknown> } } | undefined)?.auth
  return core?.public && typeof core.public === 'object' ? core as unknown as ConvexAuthCore : undefined
}

/** One hour: the longest an access token `ctx.auth.signJwt` signs may live. */
const MAX_ACCESS_TOKEN_SECONDS = 60 * 60

/** The lifetimes a Convex Auth app's sessions take, `setupAuth({ sessions })`. */
export interface ConvexAuthSessionOptions {
  /** How long an access token lives before the browser refreshes it, in seconds. Default 900 (15 minutes), at most 3600. */
  accessTokenTtlSeconds?: number
  /** How long a session lives at most, in seconds, however often it refreshes. Default 30 days. */
  sessionMaxLifetimeSeconds?: number
  /** How long a session lives without a refresh, in seconds. Default: its max lifetime. */
  refreshInactivityTimeoutSeconds?: number
}

/** The lifetimes, defaults filled in and checked: what the core is called with. */
export function resolveCoreTtl(options: ConvexAuthSessionOptions = {}): CoreTtl {
  const accessTokenTtlSeconds = options.accessTokenTtlSeconds ?? 15 * 60
  const sessionMaxLifetimeSeconds = options.sessionMaxLifetimeSeconds ?? 30 * 24 * 60 * 60
  const refreshInactivityTimeoutSeconds = options.refreshInactivityTimeoutSeconds ?? sessionMaxLifetimeSeconds
  const whole = (value: number) => Number.isInteger(value) && value > 0
  if (!whole(accessTokenTtlSeconds) || accessTokenTtlSeconds > MAX_ACCESS_TOKEN_SECONDS) {
    throw new TypeError(`[nuxt-backend] setupAuth: \`sessions.accessTokenTtlSeconds\` must be a whole number of seconds from 1 to ${MAX_ACCESS_TOKEN_SECONDS}.`)
  }
  if (!whole(sessionMaxLifetimeSeconds) || !whole(refreshInactivityTimeoutSeconds) || refreshInactivityTimeoutSeconds > sessionMaxLifetimeSeconds) {
    throw new TypeError('[nuxt-backend] setupAuth: `sessions.sessionMaxLifetimeSeconds` and `sessions.refreshInactivityTimeoutSeconds` must be whole numbers of seconds, the inactivity timeout no longer than the max lifetime.')
  }
  return { accessTokenTtlSeconds, refreshInactivityTimeoutSeconds, sessionMaxLifetimeSeconds }
}

/** The session id a core access token names: its subject. `null` for anything that is no JWT. */
export function coreSessionIdOf(accessToken: string): string | null {
  const payload = accessToken.split('.')[1]
  if (!payload) return null
  try {
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '='))) as { sub?: unknown }
    return typeof json.sub === 'string' ? json.sub : null
  }
  catch {
    return null
  }
}
