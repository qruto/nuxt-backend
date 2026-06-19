import { HOUR, MINUTE, RateLimiter } from '@convex-dev/rate-limiter'
import type { RateLimitConfig } from '@convex-dev/rate-limiter'

/** The component reference accepted by the rate limiter (`components.rateLimiter`). */
type RateLimiterComponent = ConstructorParameters<typeof RateLimiter>[0]

/**
 * Conservative default rate limits guarding auth-sensitive flows. Each is keyed
 * per email/IP at the call site (e.g. `limit(ctx, 'emailOtp', { key: email })`).
 * Extend or override any of them by passing your own limits to
 * {@link setupRateLimiter}.
 */
export const DEFAULT_AUTH_LIMITS = {
  /** Email OTP / verification sends — 5 per minute, small burst allowance. */
  emailOtp: { kind: 'token bucket', rate: 5, period: MINUTE, capacity: 5 },
  /** Sign-in attempts — 10 per minute. */
  signIn: { kind: 'token bucket', rate: 10, period: MINUTE, capacity: 10 },
  /** New account creation — 20 per hour (global / per-key fixed window). */
  signUp: { kind: 'fixed window', rate: 20, period: HOUR },
  /** Password reset requests — 5 per 5 minutes. */
  passwordReset: { kind: 'token bucket', rate: 5, period: 5 * MINUTE, capacity: 5 },
} as const satisfies Record<string, RateLimitConfig>

/**
 * Configure the {@link https://www.convex.dev/components/rate-limiter | Rate
 * Limiter} component, pre-seeded with {@link DEFAULT_AUTH_LIMITS}. Pass extra
 * named limits to cover your own application functions; they are merged with
 * (and can override) the auth defaults.
 *
 * @example
 * ```ts
 * import { setupRateLimiter } from 'nuxt-backend/convex/rate-limit'
 * import { components } from './_generated/api'
 * import { MINUTE } from '@convex-dev/rate-limiter'
 *
 * export const rateLimiter = setupRateLimiter(components.rateLimiter, {
 *   sendMessage: { kind: 'token bucket', rate: 30, period: MINUTE, capacity: 5 },
 * })
 * ```
 */
export function setupRateLimiter<
  Limits extends Record<string, RateLimitConfig> = Record<never, never>,
>(
  component: RateLimiterComponent,
  limits?: Limits,
): RateLimiter<typeof DEFAULT_AUTH_LIMITS & Limits> {
  // Intersect the default and custom limit types so callers keep autocomplete
  // and known-name typing on `.limit(ctx, 'yourLimit')` (no inline `config`
  // required) for both the auth defaults and their own limits.
  return new RateLimiter<typeof DEFAULT_AUTH_LIMITS & Limits>(
    component,
    { ...DEFAULT_AUTH_LIMITS, ...limits } as typeof DEFAULT_AUTH_LIMITS & Limits,
  )
}

export type { RateLimitConfig }
export { HOUR, MINUTE, SECOND } from '@convex-dev/rate-limiter'
