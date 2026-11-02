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
 * `emailOtpAttempt`, `emailChange`, `billingSync`, `ai`, `aiBudget`, `aiGlobal`,
 * `admin`, `invitation`, `invitationGlobal`, `workspaceCreate`, `accountDelete`,
 * `passkeySignIn`, `passkeySignInGlobal`, `signUpOtpGlobal`, `inviteCheck`,
 * `inviteCheckGlobal`, `waitlistJoin`, `waitlistJoinGlobal`, `contact`, `contactGlobal`,
 * `inboundMail`, `inboundMailGlobal`, `report`, `reportGlobal`,
 * `write` and `upload` —
 * guarding the flows the package itself drives.
 * Keyed per email/entity/caller at the call site (e.g. `limit(ctx,
 * 'emailOtp', { key: hash })`); the `*Global` ones are unkeyed. Extend or
 * override any of them by passing your own limits to {@link setupRateLimiter}.
 *
 * Deliberately small: `emailOtp` throttles code *sends* and
 * `emailOtpAttempt` code *checks*, per address (Better Auth's own
 * `allowedAttempts` bounds the guesses at one code, but a new code is one
 * request away), `emailOtpGlobal` caps sends deployment-wide,
 * `billingSync` guards the live provider fan-out, `ai`/`aiBudget`
 * back the metered-action and credit-budget surfaces, `aiGlobal` caps what
 * the app pays for itself (guest jobs), and
 * `admin`/`invitation`/`emailChange` cover the signed-in routes where one
 * caller acts on *other* people or addresses, `workspaceCreate` the route
 * that makes a billing entity, `accountDelete` an account's own deletion —
 * see `setupAuth`'s route
 * limits — and `passkeySignIn`/
 * `passkeySignInGlobal` the routes anyone may call without a session. The package is passwordless: there are no password limits, and an
 * app that turns passwords on brings its own.
 *
 * ## Covering other auth routes
 *
 * These names throttle the routes the package wires itself. Better Auth's own
 * per-path limiter is off by default: it counts in memory, which on Convex
 * lasts one function call. To throttle another route through it, turn it on
 * with a durable storage, straight from your auth options:
 *
 * ```ts
 * setupAuth(components, query, {
 *   authOptions: {
 *     rateLimit: {
 *       enabled: true,
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
   * Code checks — 10 per hour per address, burst 10. Every route that checks
   * a code (sign-in, verification, both steps of an email change, a password
   * reset when the app has passwords) spends one while a code is waiting,
   * right or wrong, keyed by a SHA-256 of the address the code went to.
   * Better Auth refuses a code after three wrong guesses, but `emailOtp` lets
   * five new codes out a minute: without this limit, a guess loop that keeps
   * requesting codes would get fifteen guesses a minute at one address, for
   * as long as it ran. Here it gets ten an hour. Like every limit keyed by an
   * address, someone who spends it can keep that address from signing in
   * with a code for the hour — never without codes going to it, since a
   * check with no code waiting spends nothing — and a passkey still signs it
   * in.
   */
  emailOtpAttempt: { kind: 'token bucket', rate: 10, period: HOUR, capacity: 10 },
  /**
   * Email changes — 5 per hour per account. The code an email change sends to
   * the new address goes where the caller chose, so it is bounded per account
   * and then by `emailOtpGlobal`, like every other code.
   */
  emailChange: { kind: 'token bucket', rate: 5, period: HOUR, capacity: 5 },
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
   * What the app pays for itself, across the whole deployment — 300 per
   * hour, a fixed window, unkeyed. Every job a signed-out visitor starts
   * (`defineJobQueue({ guest })`) spends one: no credits pay for those, so
   * this window is what bounds the gateway bill a flood of visitors could
   * run up. Over it, a guest job is refused with `rate_limited`. Raise it
   * when a launch legitimately lets more visitors try than that.
   */
  aiGlobal: { kind: 'fixed window', rate: 300, period: HOUR },
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
   * (not a minute) because what matters is the volume one account can send,
   * not its per-second rate. Per **inviter**: it bounds one account, not a
   * workspace and not the deployment — {@link DEFAULT_LIMITS.invitationGlobal}
   * is the ceiling that does.
   */
  invitation: { kind: 'token bucket', rate: 30, period: HOUR, capacity: 10 },
  /**
   * Invitations across the whole deployment — 200 per hour, a fixed window.
   * The backstop the per-inviter limit cannot be, and the counterpart of
   * `emailOtpGlobal` on the package's other outbound-email path: a workspace
   * with many members, or many accounts acting together, would otherwise put
   * 30 invitation emails per member per hour on your sending domain. Only
   * requests that already cleared `invitation` consume this, so one account's
   * refused excess never eats the shared ceiling. Raise it when a launch
   * legitimately invites more than that.
   */
  invitationGlobal: { kind: 'fixed window', rate: 200, period: HOUR },
  /**
   * Workspaces made — 10 per hour per member, burst 5. Every new workspace
   * is a billing entity: with a free plan in the catalog it becomes a
   * provider customer and gets the plan's credits, so one account must not
   * mint them in a loop. Per **member**, like `invitation`; the sign-in
   * limits bound how many accounts one person holds.
   */
  workspaceCreate: { kind: 'token bucket', rate: 10, period: HOUR, capacity: 5 },
  /**
   * An account's own deletion — 3 per hour per account, burst 3. Deleting
   * is final and starts an erasure across every participant, the providers
   * included: a person deletes once, so the bucket only stops a script that
   * keeps asking with a session it holds.
   */
  accountDelete: { kind: 'token bucket', rate: 3, period: HOUR, capacity: 3 },
  /**
   * Passkey sign-in challenges — 30 per minute per client address, burst 30.
   * Every passkey sign-in starts with a challenge the server stores
   * (`/passkey/generate-authenticate-options`, which needs no session): a
   * tap on "Sign in with passkey", and each sign-in page that offers
   * passkeys in the browser's autofill, again every four and a half minutes
   * while it stays open in view, a challenge lasting five. Keyed by an
   * HMAC, under the auth secret, of the client's address: the one the app's
   * server signed under `PROTECTION_PROOF_SECRET` for a request through its
   * auth proxy (clientAddressPlugin), else the one Convex wrote into
   * `x-forwarded-for`, the address that connected. Without the secret every
   * visitor through the app's server shares that server's address, so
   * {@link DEFAULT_LIMITS.passkeySignInGlobal} is the ceiling behind it.
   */
  passkeySignIn: { kind: 'token bucket', rate: 30, period: MINUTE, capacity: 30 },
  /**
   * Passkey sign-in challenges across the whole deployment — 3000 per hour,
   * a fixed window, spent after {@link DEFAULT_LIMITS.passkeySignIn}
   * allowed the request. The ceiling a caller who rotates its address meets:
   * it bounds how fast anyone can fill the verification table. At the
   * ceiling, a passkey prompt answers 429 and autofill offers no passkey;
   * email codes still sign people in. Raise it when more sign-in pages than
   * that open in an hour (a page left open in view spends about thirteen).
   */
  passkeySignInGlobal: { kind: 'fixed window', rate: 3000, period: HOUR },
  /**
   * Sign-in codes to addresses with no account yet — 200 per hour across
   * the deployment, a fixed window. Spent in place of `emailOtpGlobal` by a
   * code that would create an account while `setupAccess` is wired, so a
   * rush of joins on a launch day never holds up existing people's codes.
   * Raise it for a launch that signs up more than that in an hour.
   */
  signUpOtpGlobal: { kind: 'fixed window', rate: 200, period: HOUR },
  /**
   * Invite checks (`checkInvite`, behind `useInvite().check` and the
   * `/invite` page) — 10 per minute per signed-in caller, burst 10. A code
   * has 50 bits, so guessing one is out of reach anyway; the limit keeps
   * a script from turning the check into a lookup.
   */
  inviteCheck: { kind: 'token bucket', rate: 10, period: MINUTE, capacity: 10 },
  /**
   * Invite checks across the deployment — 1000 per hour, a fixed window:
   * the ceiling a caller without a session meets, and the backstop behind
   * {@link DEFAULT_LIMITS.inviteCheck}.
   */
  inviteCheckGlobal: { kind: 'fixed window', rate: 1000, period: HOUR },
  /**
   * Waitlist joins (`joinWaitlist`, behind `useWaitlist().join` and
   * `<WaitlistForm>`) — 5 per hour per address, burst 3, so a script
   * cannot use the form to ask for one mailbox's codes in a loop.
   */
  waitlistJoin: { kind: 'token bucket', rate: 5, period: HOUR, capacity: 3 },
  /**
   * Waitlist joins across the deployment — 1000 per hour, a fixed window:
   * the ceiling on the form, behind {@link DEFAULT_LIMITS.waitlistJoin}.
   * The codes a join asks for spend `signUpOtpGlobal` besides.
   */
  waitlistJoinGlobal: { kind: 'fixed window', rate: 1000, period: HOUR },
  /**
   * Contact and feedback messages (`submitContactMessage`, `<ContactForm>`) —
   * 5 per hour per sender, burst 3. The sender is the signed-in account, else a
   * hash of the address typed, never the address itself, so one person cannot
   * flood the team's inbox.
   */
  contact: { kind: 'token bucket', rate: 5, period: HOUR, capacity: 3 },
  /**
   * Contact and feedback messages across the deployment — 500 per hour, a
   * fixed window: the ceiling on the form, behind {@link DEFAULT_LIMITS.contact}.
   */
  contactGlobal: { kind: 'fixed window', rate: 500, period: HOUR },
  /**
   * Inbound mail (`setupEmail({ inbound })`) — 30 per hour per sender, burst
   * 10, keyed by a hash of the sender's address. Mail past it is dropped and
   * logged (`email.inbound_rejected`, reason `rate_limited`), never answered.
   */
  inboundMail: { kind: 'token bucket', rate: 30, period: HOUR, capacity: 10 },
  /** Inbound mail across the deployment — 3000 per hour, a fixed window, behind {@link DEFAULT_LIMITS.inboundMail}. */
  inboundMailGlobal: { kind: 'fixed window', rate: 3000, period: HOUR },
  /**
   * Content reports (`reportContent`, and each mailbox that sends notices
   * through the `report` page, `me+1@` counted as `me@`) — 10 per hour per
   * person, so nobody floods the Reports tab.
   */
  report: { kind: 'fixed window', rate: 10, period: HOUR },
  /**
   * Notices through the public `report` page across the deployment — 500 per
   * hour: the ceiling behind {@link DEFAULT_LIMITS.report}, and with the bot
   * check the only limit on a notice without an address, so no shared
   * bucket can shut the anonymous channel for child sexual abuse material.
   */
  reportGlobal: { kind: 'fixed window', rate: 500, period: HOUR },

  /**
   * Writes of your own signed-in functions — 120 per minute per account,
   * burst 60. The scaffold's
   * `createFunctions(…, { limits: { authed: 'write', workspace: 'write' } })`
   * spends one on every `authed`, `withRole`, `workspace` and
   * `withFeature` mutation and action, keyed by the account, so one
   * session cannot write in a loop.
   * Override it here, or name another limit per tier.
   */
  write: { kind: 'token bucket', rate: 120, period: MINUTE, capacity: 60 },
  /**
   * Upload URLs — 100 per hour per account, burst 20. An upload URL takes a
   * file of any size and the size is checked only once it has arrived, so
   * this rate is what bounds the bytes one account can push into storage
   * before `storage.claim` refuses them (`setupStorage`'s
   * `generateUploadUrl`). The burst lets one batch of `useUploadQueue` through.
   */
  upload: { kind: 'token bucket', rate: 100, period: HOUR, capacity: 20 },
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
