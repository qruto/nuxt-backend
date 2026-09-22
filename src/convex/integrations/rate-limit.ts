import { DAY, HOUR, MINUTE, RateLimiter } from '@convex-dev/rate-limiter'
import type { RateLimitConfig } from '@convex-dev/rate-limiter'

/** The component reference accepted by the rate limiter (`components.rateLimiter`). */
type RateLimiterComponent = ConstructorParameters<typeof RateLimiter>[0]

/**
 * The component handle `setupRateLimiter` reads from your generated
 * `components` object (the key is picked structurally — pass the whole object).
 */
export interface RateLimiterComponents {
  rateLimiter: RateLimiterComponent
}

/**
 * The package's default rate limits — `emailOtp`, `emailOtpGlobal`,
 * `billingSync`, `ai`, `aiBudget`, `mcp`, `admin` and `invitation` —
 * guarding the flows the package itself drives. Most are keyed per
 * email/entity/caller at the call site (e.g. `limit(ctx, 'emailOtp', { key:
 * hash })`); `emailOtpGlobal` is unkeyed. Extend or override any of them by
 * passing your own limits to {@link setupRateLimiter}.
 *
 * Deliberately small: `emailOtp` throttles code *sends* (per-code brute force
 * is Better Auth's own `allowedAttempts` guard, and this package is
 * passwordless — there are no password flows to limit), `emailOtpGlobal`
 * caps sends deployment-wide, `billingSync` guards the live provider
 * fan-out, `ai`/`aiBudget`/`mcp` back the metered-action, credit-budget and
 * agent surfaces, and `admin`/`invitation` cover the two signed-in routes
 * where one caller acts on *other* people — see `setupAuth`'s route limits.
 *
 * ## Covering other auth routes
 *
 * These names throttle the routes the package wires itself. Every *other*
 * Better Auth route is throttled by Better Auth's own per-path limiter, which
 * takes its rules — and a durable storage — straight from your auth options:
 *
 * ```ts
 * setupAuth(components, query, {
 *   authOptions: {
 *     rateLimit: {
 *       storage: 'database',
 *       customRules: { '/organization/create': { window: 60, max: 5 } },
 *     },
 *   },
 * })
 * ```
 *
 * That limiter counts per IP inside the auth request; the named limits here
 * count per identity and are enforced before the route runs.
 */
export const DEFAULT_LIMITS = {
  /** Email OTP / verification sends — 5 per minute per address, small burst allowance. */
  emailOtp: { kind: 'token bucket', rate: 5, period: MINUTE, capacity: 5 },
  /**
   * Email OTP sends across the whole deployment — 300 per hour, a fixed
   * window. The backstop the per-address limit cannot be: an attacker
   * rotating addresses to probe an invite gate or run up the email bill hits
   * this ceiling. Raise it when a launch legitimately signs in more than that.
   */
  emailOtpGlobal: { kind: 'fixed window', rate: 300, period: HOUR },
  /**
   * Entitlement syncs — 10 per minute per billing entity, small burst for the
   * back-to-back syncs after checkout / top-up. Guards the live provider
   * fan-out `syncEntitlements` performs (see `setupBilling`'s `rateLimiter`).
   */
  billingSync: { kind: 'token bucket', rate: 10, period: MINUTE, capacity: 5 },
  /**
   * Metered AI calls (`setupAi`'s default limit) — 30 per minute per billing
   * entity with a burst of 10. Reference by name (`limit: 'ai'`) or declare
   * your own per-feature limits and name them in `meteredAction`.
   */
  ai: { kind: 'token bucket', rate: 30, period: MINUTE, capacity: 10 },
  /**
   * Per-entity credit budget for metered AI (`setupAi({ budget })`) — a fixed
   * window counting **credits**, not calls: each spend consumes its cost in
   * tokens, so the window is "credits per period per billing entity". A fixed
   * window (not a bucket) because a budget is a period allowance that resets,
   * not a smoothed rate.
   *
   * The default is a generous ceiling — `setupAi({ budget: { units, period } })`
   * passes the app's own numbers inline and overrides it. It exists so the
   * name resolves even when a caller names the limit without configuring one.
   */
  aiBudget: { kind: 'fixed window', rate: 10_000, period: DAY },
  /**
   * Agent (MCP) session exchanges — 60 per minute per client+user. Guards the
   * token-exchange endpoint agents call on the app's behalf.
   */
  mcp: { kind: 'token bucket', rate: 60, period: MINUTE, capacity: 20 },
  /**
   * Administrator actions — 30 per minute per administrator, burst 10. Covers
   * every `/admin/*` route that acts on somebody else (list, create, update,
   * ban/unban, set role, impersonate, revoke sessions, remove user): each is
   * one privileged call against another person's account, so the ceiling is
   * "a human working fast", not a script. `/admin/stop-impersonating` and
   * `/admin/has-permission` are deliberately exempt — the first is how an
   * administrator leaves an impersonated session and must never be throttled,
   * the second is a read-only check the console calls on render.
   */
  admin: { kind: 'token bucket', rate: 30, period: MINUTE, capacity: 10 },
  /**
   * Workspace invitations — 30 per hour per inviter, burst 10. An hour window
   * (not a minute) because the abuse this stops is using a workspace as a mail
   * cannon: what matters is the volume one account can send, not its
   * per-second rate. Invitations also cost an email, so this sits in front of
   * the `emailOtpGlobal` backstop rather than behind it.
   */
  invitation: { kind: 'token bucket', rate: 30, period: HOUR, capacity: 10 },
} as const satisfies Record<string, RateLimitConfig>

/**
 * Configure the {@link https://www.convex.dev/components/rate-limiter | Rate
 * Limiter} component, pre-seeded with {@link DEFAULT_LIMITS}. Pass extra
 * named limits to cover your own application functions; they are merged with
 * (and can override) the package defaults.
 *
 * @example
 * ```ts
 * import { setupRateLimiter } from 'nuxt-backend/rate-limit'
 * import { components } from './_generated/api'
 * import { MINUTE } from '@convex-dev/rate-limiter'
 *
 * export const rateLimiter = setupRateLimiter(components, {
 *   sendMessage: { kind: 'token bucket', rate: 30, period: MINUTE, capacity: 5 },
 * })
 * ```
 */
export function setupRateLimiter<
  Limits extends Record<string, RateLimitConfig> = Record<never, never>,
>(
  components: RateLimiterComponents,
  limits?: Limits,
): RateLimiter<typeof DEFAULT_LIMITS & Limits> {
  // Intersect the default and custom limit types so callers keep autocomplete
  // and known-name typing on `.limit(ctx, 'yourLimit')` (no inline `config`
  // required) for both the package defaults and their own limits.
  return new RateLimiter<typeof DEFAULT_LIMITS & Limits>(
    components.rateLimiter,
    { ...DEFAULT_LIMITS, ...limits } as typeof DEFAULT_LIMITS & Limits,
  )
}

export type { RateLimitConfig }
export { DAY, HOUR, MINUTE, SECOND } from '@convex-dev/rate-limiter'
