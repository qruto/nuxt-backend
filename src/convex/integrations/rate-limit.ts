import { MINUTE, RateLimiter } from '@convex-dev/rate-limiter'
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
 * Conservative default rate limits guarding sensitive flows. Each is keyed per
 * email/entity at the call site (e.g. `limit(ctx, 'emailOtp', { key: email })`).
 * Extend or override any of them by passing your own limits to
 * {@link setupRateLimiter}.
 *
 * Deliberately small: `emailOtp` throttles code *sends* (per-code brute force
 * is Better Auth's own `allowedAttempts` guard, and this package is
 * passwordless — there are no password flows to limit), `billingSync` guards
 * the live provider fan-out, and `ai`/`mcp` back the metered-action and agent
 * surfaces.
 */
export const DEFAULT_LIMITS = {
  /** Email OTP / verification sends — 5 per minute, small burst allowance. */
  emailOtp: { kind: 'token bucket', rate: 5, period: MINUTE, capacity: 5 },
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
   * Agent (MCP) session exchanges — 60 per minute per client+user. Guards the
   * token-exchange endpoint agents call on the app's behalf.
   */
  mcp: { kind: 'token bucket', rate: 60, period: MINUTE, capacity: 20 },
} as const satisfies Record<string, RateLimitConfig>

/** @deprecated Renamed {@link DEFAULT_LIMITS} — the set is no longer auth-only. */
export const DEFAULT_AUTH_LIMITS = DEFAULT_LIMITS

/**
 * Configure the {@link https://www.convex.dev/components/rate-limiter | Rate
 * Limiter} component, pre-seeded with {@link DEFAULT_LIMITS}. Pass extra
 * named limits to cover your own application functions; they are merged with
 * (and can override) the auth defaults.
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
  // required) for both the auth defaults and their own limits.
  return new RateLimiter<typeof DEFAULT_LIMITS & Limits>(
    components.rateLimiter,
    { ...DEFAULT_LIMITS, ...limits } as typeof DEFAULT_LIMITS & Limits,
  )
}

export type { RateLimitConfig }
export { HOUR, MINUTE, SECOND } from '@convex-dev/rate-limiter'
