import { APIError, createAuthMiddleware, getSessionFromCtx } from 'better-auth/api'
import type { BetterAuthOptions } from 'better-auth/minimal'
import type { GenericActionCtx, GenericDataModel, GenericMutationCtx } from 'convex/server'
import type { AuthRateLimitName, CanSignIn, CanSignInInput } from './auth-types.js'
import { type AuthRuntime, asMutationCtx } from './runtime.js'

// The request-level guards: the sign-in gate, the OTP send limits and the
// per-caller route limits, run from the package's before-hook, where a thrown
// `APIError` is the status the client sees.

export const DEFAULT_REFUSAL = 'Sign-in is by invitation right now.'

const OTP_SEND_PATH = '/email-otp/send-verification-otp'

/**
 * Request-level guard for OTP sends. Better Auth runs the emailOTP
 * `sendVerificationOTP` callback through `runInBackgroundOrAwait`, which
 * catches anything it throws, logs "Failed to run background task" and still
 * answers `{ success: true }` — so a refusal raised inside the sender never
 * reaches the client, and the OTP is minted before the sender even runs.
 * This before-hook applies the deployment-wide backstop to every OTP request
 * and the sign-in gate to `type: 'sign-in'` on the request itself, where a
 * thrown `APIError` becomes the 429/403 the sign-in UI shows and no code is
 * stored.
 *
 */
async function assertOtpRequestAllowed<DM extends GenericDataModel>(
  runtime: AuthRuntime<DM> | undefined,
  request: { path?: string, body?: unknown },
): Promise<void> {
  if (request.path !== OTP_SEND_PATH) return
  const body = request.body as { email?: unknown, type?: unknown } | undefined
  if (typeof body?.email !== 'string') return
  const ctx = asMutationCtx(runtime?.ctx)
  if (!runtime || !ctx) return
  // A thrown APIError here is the 429/403 the client sees, and its body is the
  // response JSON — the client spreads it into the result's `error`, so
  // `retryAfter` (ms) is how `useLoginFlow` can say when to retry.
  if (runtime.rateLimiter) {
    const { ok, retryAfter } = await runtime.rateLimiter.limit(ctx, 'emailOtpGlobal')
    if (!ok) throw new APIError('TOO_MANY_REQUESTS', { message: 'Verification codes are temporarily unavailable. Please try again later.', retryAfter })
  }
  if (runtime.canSignIn && body.type === 'sign-in') {
    const isNewUser = runtime.userExists ? !(await runtime.userExists(ctx, body.email)) : true
    await assertCanSignIn(runtime.canSignIn, ctx, { email: body.email, isNewUser, purpose: 'sign-in' })
  }
  // Per address last, after the gate: a refused address consumes no quota, so
  // an invitation that arrives later still works. This used to run inside the
  // sender, where Better Auth swallowed the refusal — the user saw "code sent"
  // and never got one.
  if (runtime.rateLimiter) {
    const { ok, retryAfter } = await runtime.rateLimiter.limit(ctx, 'emailOtp', { key: await hashKey(body.email) })
    if (!ok) throw new APIError('TOO_MANY_REQUESTS', { message: 'Too many verification requests. Please try again in a moment.', retryAfter })
  }
}

/**
 * The privileged routes the package throttles on the request itself, keyed by
 * the signed-in caller.
 *
 * Both are routes where one caller acts on *other people*: every `/admin/*`
 * route reaches into somebody else's account, and `invite-member` sends mail
 * in the workspace's name. Better Auth authorizes them (only an admin passes
 * `/admin/*`, only a member with the invite permission passes
 * `invite-member`) but does not bound how fast an authorized caller may go —
 * these limits do, so one compromised admin session or one runaway script
 * cannot ban a thousand accounts or send a thousand invitations.
 *
 * Keyed by user id, not by session: opening more sessions must not multiply
 * the budget. A caller with no session is left alone — the route itself
 * answers 401, so there is nothing to throttle and no bucket to poison.
 *
 * A per-caller limit bounds one account and nothing more, so a route whose
 * cost lands on a shared resource also names a `global` limit: an unkeyed
 * ceiling for the whole deployment, consumed only after the caller's own
 * bucket allowed the request, so one account's refused excess never eats it.
 * Invitations spend the deployment's sending reputation, which is exactly the
 * shape `emailOtpGlobal` already guards on the OTP path.
 *
 * A route anyone may call without a session (agent client registration) has
 * no caller to key on, so its rule names only the `global` ceiling, checked
 * before any session lookup.
 */
const ROUTE_LIMITS: ReadonlyArray<{
  matches: (path: string) => boolean
  caller?: { limit: AuthRateLimitName, message: string }
  global?: { limit: AuthRateLimitName, message: string }
}> = [
  {
    // `stop-impersonating` is the way out of an impersonated session and must
    // never be throttled; `has-permission` is a read-only check the console
    // calls on render.
    matches: path => path.startsWith('/admin/')
      && path !== '/admin/stop-impersonating'
      && path !== '/admin/has-permission',
    caller: { limit: 'admin', message: 'Too many administrator actions. Please try again in a moment.' },
  },
  {
    matches: path => path === '/organization/invite-member',
    caller: { limit: 'invitation', message: 'Too many invitations sent. Please try again later.' },
    global: {
      limit: 'invitationGlobal',
      message: 'Invitations are temporarily unavailable. Please try again later.',
    },
  },
  {
    matches: path => path === '/mcp/register',
    global: {
      limit: 'agentRegistrationGlobal',
      message: 'Too many agents are registering right now. Please try again later.',
    },
  },
]

/**
 * Request-level guard for `ROUTE_LIMITS`. Runs in the same before-hook
 * as {@link assertOtpRequestAllowed}, where a thrown `APIError` becomes the
 * 429 the client sees and the route never runs.
 *
 * A rule with a `global` ceiling consumes it second, so a refused caller
 * never spends the deployment's budget.
 *
 * `getSessionFromCtx` resolves the session from the request cookie and caches
 * it on `ctx.context.session`, which the route's own `sessionMiddleware` then
 * reuses — so this costs no extra read on a call that was going to resolve a
 * session anyway. A context too bare to resolve one (or an outright failure)
 * is treated as "no session": the route will reject it.
 */
async function assertRouteLimitAllowed<DM extends GenericDataModel>(
  runtime: AuthRuntime<DM> | undefined,
  request: { path?: string, context?: unknown, headers?: unknown },
): Promise<void> {
  if (typeof request.path !== 'string') return
  const rule = ROUTE_LIMITS.find(entry => entry.matches(request.path as string))
  if (!rule) return
  const ctx = asMutationCtx(runtime?.ctx)
  if (!runtime?.rateLimiter || !ctx) return

  if (rule.caller) {
    const session = await getSessionFromCtx(request as never).catch(() => null) as
      { user?: { id?: unknown } } | null
    const userId = session?.user?.id
    if (typeof userId !== 'string' || userId === '') return

    // Like the OTP refusals, each carries the limiter's wait (ms) in the body.
    const { ok, retryAfter } = await runtime.rateLimiter.limit(ctx, rule.caller.limit, { key: userId })
    if (!ok) throw new APIError('TOO_MANY_REQUESTS', { message: rule.caller.message, retryAfter })
  }

  // The caller's own budget allowed this one, so it may spend the shared
  // ceiling — never the other way round (see ROUTE_LIMITS).
  if (!rule.global) return
  const { ok: withinGlobal, retryAfter: globalRetryAfter } = await runtime.rateLimiter.limit(ctx, rule.global.limit)
  if (!withinGlobal) throw new APIError('TOO_MANY_REQUESTS', { message: rule.global.message, retryAfter: globalRetryAfter })
}

/** The package's before-hook, chained ahead of a consumer-supplied one. */
export function makeRequestHooks<DM extends GenericDataModel>(
  runtime: AuthRuntime<DM> | undefined,
  consumer: BetterAuthOptions['hooks'],
): BetterAuthOptions['hooks'] {
  const consumerBefore = consumer?.before as unknown as ((ctx: unknown) => Promise<unknown>) | undefined
  return {
    ...consumer,
    before: createAuthMiddleware(async (ctx) => {
      await assertOtpRequestAllowed(runtime, ctx)
      await assertRouteLimitAllowed(runtime, ctx)
      if (consumerBefore) return consumerBefore(ctx)
    }),
  }
}

/** Ask the gate; a refusal becomes the `FORBIDDEN` `APIError` the sign-in UI shows. */
export async function assertCanSignIn<DM extends GenericDataModel>(
  canSignIn: CanSignIn<DM>,
  ctx: GenericMutationCtx<DM> | GenericActionCtx<DM>,
  input: CanSignInInput,
): Promise<void> {
  const verdict = await canSignIn(ctx, input)
  if (verdict !== true) throw new APIError('FORBIDDEN', { message: verdict.message ?? DEFAULT_REFUSAL })
}

/**
 * SHA-256 of a normalized key, hex — so rate-limit rows carry a digest of the
 * address rather than the address itself.
 */
async function hashKey(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value.trim().toLowerCase()))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}
