import { APIError, createAuthMiddleware } from 'better-auth/api'
import type { BetterAuthOptions } from 'better-auth/minimal'
import type { GenericActionCtx, GenericDataModel, GenericMutationCtx } from 'convex/server'
import * as z from 'zod'
import type { AuthRateLimitName, CanSignIn, CanSignInInput } from './auth-types.js'
import { logsOtp, type UndeliverableReason, undeliverableReason } from './delivery.js'
import { notifyEmailChanged } from './notices.js'
import { type AuthHookCtx, requestSession, type RequestSession } from './request-session.js'
import { authRefusal } from './refusals.js'
import { type AuthRuntime, asMutationCtx } from './runtime.js'
import { createTranslate } from '../labels.js'
import { logBackend } from '../log.js'

// The request-level guards: the routes the package turns off, the sign-in
// gate, the limits on sending and on checking codes, the per-caller route
// limits, and the refusals of an administrator acting as someone else and of
// email that would not arrive. They run from the package's before-hook, where
// a thrown `APIError` is the status the client sees and the route never runs.
// Each refusal carries its catalog code (`authRefusal`), so the client reads
// it with `getBackendError`.

export const DEFAULT_REFUSAL = 'Sign-in is by invitation right now.'

const SEND_CODE_PATH = '/email-otp/send-verification-otp'
/** The password-reset code requests, open only when the app turns passwords on. */
const RESET_CODE_PATHS = ['/email-otp/request-password-reset', '/forget-password/email-otp']
const RESET_PASSWORD_PATH = '/email-otp/reset-password'
const INVITE_PATH = '/organization/invite-member'
const REQUEST_EMAIL_CHANGE_PATH = '/email-otp/request-email-change'
const CHANGE_EMAIL_PATH = '/email-otp/change-email'

/** The code types `send-verification-otp` sends; Better Auth refuses any other. */
const SEND_CODE_TYPES = ['sign-in', 'email-verification', 'forget-password']

/**
 * The routes that check a code with no session, and the type of that code;
 * the address it went to is `body.email`. The email change's two checks need
 * the caller's session: see SESSION_RULES.
 */
const CODE_CHECKS: Readonly<Record<string, string>> = {
  '/sign-in/email-otp': 'sign-in',
  '/email-otp/verify-email': 'email-verification',
  [RESET_PASSWORD_PATH]: 'forget-password',
}

/** The passkey plugin's routes that add, rename or remove a passkey. */
const PASSKEY_CHANGES = new Set([
  '/passkey/generate-register-options',
  '/passkey/verify-registration',
  '/passkey/update-passkey',
  '/passkey/delete-passkey',
])

const translate = createTranslate()

/** What the operator reads in the logs, per reason: the setting to change. */
const UNDELIVERABLE_CAUSES: Record<UndeliverableReason, string> = {
  'no-key': 'EMAIL_API_KEY is not set on the deployment, so only sandbox addresses (and echoed codes) get through.',
  'test-mode': 'EMAIL_TEST_MODE is on, so the email provider accepts only its sandbox addresses. Set EMAIL_TEST_MODE=false once your domain is verified.',
  'no-sender': 'EMAIL_FROM is not set, and the fallback sender reaches only the provider\'s test addresses and your own account\'s address. Set it to an address on your verified domain.',
}

/**
 * The routes the package turns off: Better Auth's `disabledPaths`, merged
 * with the app's own, and refused by the request guard as well, by the
 * route's own path, so no spelling of the URL and no `auth.api` call reaches
 * them.
 *
 * - `/email-otp/check-verification-otp`. It checks a code without using it
 *   up, and counts a wrong guess with a read and a separate write, which
 *   concurrent guesses outrun. Nothing in the package calls it.
 * - The link routes of email verification and email change. Every proof of a
 *   mailbox here is a code, so a link minted before an upgrade stops working,
 *   and no route mints a code outside the limits on the code routes (with
 *   the emailOTP plugin, a verification "email" is a code).
 * - The password-reset code routes, unless the app turns passwords on
 *   (`emailAndPassword.enabled`). On a passwordless app they would email
 *   reset codes to any registered address, outside every limit, and set a
 *   password on the account.
 */
export function disabledRoutes(options: BetterAuthOptions): string[] {
  return [
    '/email-otp/check-verification-otp',
    '/send-verification-email',
    '/verify-email',
    '/change-email',
    ...(options.emailAndPassword?.enabled ? [] : [...RESET_CODE_PATHS, RESET_PASSWORD_PATH]),
  ]
}

/** What the guards need to know of the app's configuration. */
export interface RequestPolicy {
  /** Codes go out through the package's own emailOTP plugin, so the package may refuse them. */
  codes: boolean
  /** Workspace invitations go out through the package (no `organization` plugin or `sendInvitationEmail` of the app's). */
  invitations: boolean
  /** The app turned passwords on (`emailAndPassword.enabled`): reset codes go out, under the code limits. */
  passwords: boolean
  /** The routes {@link disabledRoutes} turns off. */
  disabled: readonly string[]
}

const DEFAULT_POLICY: RequestPolicy = { codes: true, invitations: true, passwords: false, disabled: [] }

/** A request the guards look at: the hook's context, and the function ctx they spend limits with. */
interface Guarded<DM extends GenericDataModel> {
  runtime: AuthRuntime<DM>
  ctx: GenericMutationCtx<DM> | GenericActionCtx<DM>
  policy: RequestPolicy
  request: AuthHookCtx
}

/** The request's JSON body, or nothing. */
function bodyOf(request: { body?: unknown }): Record<string, unknown> {
  return request.body && typeof request.body === 'object' ? request.body as Record<string, unknown> : {}
}

/** An address the route accepts: Better Auth lower-cases it and checks it with the same schema. */
function isEmail(value: unknown): value is string {
  return typeof value === 'string' && z.email().safeParse(value.toLowerCase()).success
}

/** Spend one token of a limit; a closed one is the 429 `rate_limited` the client sees, with the wait (ms) and the limit in the body. */
async function spend<DM extends GenericDataModel>(
  { runtime, ctx }: Pick<Guarded<DM>, 'runtime' | 'ctx'>,
  limit: AuthRateLimitName,
  message: string,
  key?: string,
): Promise<void> {
  if (!runtime.rateLimiter) return
  // The client spreads the refusal's body into the result's `error`, so
  // `retryAfter` is how `useLoginFlow` can say when to retry.
  const { ok, retryAfter } = key ? await runtime.rateLimiter.limit(ctx, limit, { key }) : await runtime.rateLimiter.limit(ctx, limit)
  // A limiter of the app's own may answer a wait that is no number: the
  // refusal goes out without one rather than failing the catalog's check.
  if (!ok) throw authRefusal('rate_limited', { message, retryAfter: Number.isFinite(retryAfter) ? retryAfter : undefined, limit })
}

/**
 * Spend one attempt at a code sent to `address` (`emailOtpAttempt`, keyed by
 * a digest of the address). Better Auth allows three wrong guesses per code,
 * but a new code is one request away: without a limit per address, a guess
 * loop that keeps asking for codes runs for as long as codes can be sent. A
 * check spends one, right or wrong, before the route reads the code — but
 * only while a code is waiting: a check with none guesses nothing (the route
 * refuses it), and spending on it would let anyone lock an address out of
 * signing in by code without one code being sent. `identifier` builds the
 * emailOTP plugin's key for that code (`<type>-otp-<address>`) from the
 * lower-cased address, as the plugin does.
 */
async function spendAttempt<DM extends GenericDataModel>(
  guarded: Pick<Guarded<DM>, 'runtime' | 'ctx' | 'request'>,
  address: unknown,
  identifier: (address: string) => string,
): Promise<void> {
  if (typeof address !== 'string' || !guarded.runtime.rateLimiter) return
  const waiting = await guarded.request.context.internalAdapter.findVerificationValue(identifier(address.toLowerCase()))
  if (!waiting || new Date(waiting.expiresAt).getTime() <= Date.now()) return
  await spend(guarded, 'emailOtpAttempt', 'Too many code attempts. Please try again later.', await hashKey(address))
}

/** Ask the gate, when the app has one. */
async function gate<DM extends GenericDataModel>({ runtime, ctx }: Pick<Guarded<DM>, 'runtime' | 'ctx'>, input: CanSignInInput): Promise<void> {
  if (runtime.canSignIn) await assertCanSignIn(runtime.canSignIn, ctx, input)
}

/**
 * Refuse a code or an invitation the transport would drop, on the request.
 * Better Auth runs both senders in the background and answers success
 * whatever they throw, so a failure there leaves a person waiting for an
 * email that never comes. The cause goes to the logs for the operator; the
 * person sees a labelled message, and no code or invitation is created.
 */
function assertDeliverable(runtime: Pick<AuthRuntime, 'email'>, address: string, kind: 'code' | 'invitation'): void {
  // setupAuth requires the email instance; without one there is no send to refuse.
  if (!runtime.email) return
  const reason = undeliverableReason(address, { echo: kind === 'code' && logsOtp() })
  if (!reason) return
  const refused = kind === 'code' ? 'A one-time code' : 'An invitation'
  logBackend('warn', 'email.undeliverable', `${refused} was refused: ${UNDELIVERABLE_CAUSES[reason]}`)
  throw authRefusal('unavailable', {
    service: 'email',
    reason: reason === 'test-mode' ? 'test_mode' : 'unconfigured',
    message: translate(reason === 'test-mode' ? 'auth.undeliverable.testMode' : 'auth.undeliverable.unconfigured'),
  })
}

/**
 * The requests that send a code: the sign-in, verification and (with
 * passwords on) reset codes. Better Auth runs the emailOTP
 * `sendVerificationOTP` callback through `runInBackgroundOrAwait`, which
 * catches anything it throws, logs "Failed to run background task" and still
 * answers `{ success: true }` — and the code is stored before the sender even
 * runs. So every limit, the sign-in gate and the delivery check run here, on
 * the request, where a refusal is the 429/403/400 the sign-in UI shows and no
 * code is stored.
 */
async function assertCodeSendAllowed<DM extends GenericDataModel>(
  runtime: AuthRuntime<DM> | undefined,
  policy: RequestPolicy,
  request: AuthHookCtx,
): Promise<void> {
  const viaSend = request.path === SEND_CODE_PATH
  if (!viaSend && !RESET_CODE_PATHS.includes(request.path)) return
  const { email, type } = bodyOf(request)
  if (viaSend && type === 'forget-password' && !policy.passwords) {
    throw authRefusal('invalid_input', { field: 'type', message: 'This app signs in with codes and passkeys: there is no password to reset.' })
  }
  // A request the route refuses on its own spends nothing.
  if (!isEmail(email) || (viaSend && !SEND_CODE_TYPES.includes(type as string))) return
  const ctx = asMutationCtx(runtime?.ctx)
  if (!runtime || !ctx) return
  const guarded = { runtime, ctx }
  await spend(guarded, 'emailOtpGlobal', 'Verification codes are temporarily unavailable. Please try again later.')
  if (runtime.canSignIn && type === 'sign-in') {
    const isNewUser = runtime.userExists ? !(await runtime.userExists(ctx, email)) : true
    await gate(guarded, { email: email.toLowerCase(), isNewUser, purpose: 'sign-in' })
  }
  // After the gate, so an app's own refusal is the one a person reads.
  if (policy.codes) assertDeliverable(runtime, email, 'code')
  // Per address last, after the gate: a refused address consumes no quota,
  // so an invitation that arrives later still works.
  await spend(guarded, 'emailOtp', 'Too many verification requests. Please try again in a moment.', await hashKey(email))
}

/** The routes that check a code without a session. */
async function assertCodeCheckAllowed<DM extends GenericDataModel>(runtime: AuthRuntime<DM> | undefined, request: AuthHookCtx): Promise<void> {
  const type = CODE_CHECKS[request.path]
  if (!type) return
  const ctx = asMutationCtx(runtime?.ctx)
  if (!runtime || !ctx) return
  await spendAttempt({ runtime, ctx, request }, bodyOf(request).email, address => `${type}-otp-${address}`)
}

/** The first half of a refusal to an administrator acting as someone else. */
const IMPERSONATING = 'An administrator acting as this account cannot'

/**
 * The routes that act for the signed-in caller, in the order each one's
 * checks run: an administrator impersonating the account is refused, then
 * the route's own `check` (the gate, the delivery of what it will email, the
 * attempt at the code it checks) runs before any limit is spent, then the
 * caller's own bucket, then the deployment's.
 *
 * The caller limits bound routes where one caller acts on *other people*:
 * every `/admin/*` route reaches into somebody else's account, and
 * `invite-member` sends mail in the workspace's name. Better Auth authorizes
 * them (only an admin passes `/admin/*`, only a member with the invite
 * permission passes `invite-member`) but does not bound how fast an
 * authorized caller may go — these limits do, so one compromised admin
 * session or one runaway script cannot ban a thousand accounts or send a
 * thousand invitations. An email change is the same shape: its second code
 * goes to an address the caller typed. Keyed by user id, not by session:
 * opening more sessions must not multiply the budget.
 *
 * A route whose cost lands on a shared resource also names a `global` limit:
 * an unkeyed ceiling for the whole deployment, spent only after the caller's
 * own bucket allowed the request, so one account's refused excess never eats
 * it. Invitations spend the deployment's sending reputation, which is
 * exactly the shape `emailOtpGlobal` already guards on the code path.
 *
 * The impersonation refusals keep an administrator's visit a visit: while a
 * session carries `impersonatedBy`, it cannot leave access behind — a
 * passkey, an address of the administrator's choosing, a linked sign-in, a
 * workspace invitation or role — or delete the account. Approving an agent
 * is refused in `agentConsent`, on the consent route.
 */
const SESSION_RULES: ReadonlyArray<{
  matches: (path: string) => boolean
  /** The refusal to an impersonating administrator; absent where one may act. */
  impersonated?: string
  /** Before any limit is spent; `false` when the route refuses the request on its own, so it spends nothing. */
  check?: <DM extends GenericDataModel>(guarded: Guarded<DM>, session: RequestSession) => Promise<boolean>
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
    matches: path => path === INVITE_PATH,
    impersonated: `${IMPERSONATING} change who can access its workspaces.`,
    check: async ({ runtime, policy, request }) => {
      const { email } = bodyOf(request)
      if (policy.invitations && typeof email === 'string') assertDeliverable(runtime, email, 'invitation')
      return true
    },
    caller: { limit: 'invitation', message: 'Too many invitations sent. Please try again later.' },
    global: { limit: 'invitationGlobal', message: 'Invitations are temporarily unavailable. Please try again later.' },
  },
  {
    matches: path => path === '/organization/update-member-role',
    impersonated: `${IMPERSONATING} change who can access its workspaces.`,
  },
  {
    // The new address, then the current address's code, before the code to
    // the new address goes out.
    matches: path => path === REQUEST_EMAIL_CHANGE_PATH,
    impersonated: `${IMPERSONATING} change its email address.`,
    check: async (guarded, session) => {
      const { newEmail, otp } = bodyOf(guarded.request)
      const checksCode = typeof otp === 'string' && otp !== ''
      // The package's plugin requires the current address's code; Better
      // Auth refuses a change without it, or to the same address.
      if (!isEmail(newEmail) || newEmail.toLowerCase() === session.user.email.toLowerCase()) return false
      if (guarded.policy.codes && !checksCode) return false
      await gate(guarded, { email: newEmail.toLowerCase(), isNewUser: false, purpose: 'email-change' })
      if (guarded.policy.codes) assertDeliverable(guarded.runtime, newEmail, 'code')
      if (checksCode) await spendAttempt(guarded, session.user.email, address => `email-verification-otp-${address}`)
      return true
    },
    caller: { limit: 'emailChange', message: 'Too many email changes. Please try again later.' },
    global: { limit: 'emailOtpGlobal', message: 'Verification codes are temporarily unavailable. Please try again later.' },
  },
  {
    // The new address's code, the step that moves the account.
    matches: path => path === CHANGE_EMAIL_PATH,
    impersonated: `${IMPERSONATING} change its email address.`,
    check: async (guarded, session) => {
      const { newEmail } = bodyOf(guarded.request)
      if (!isEmail(newEmail) || newEmail.toLowerCase() === session.user.email.toLowerCase()) return false
      await gate(guarded, { email: newEmail.toLowerCase(), isNewUser: false, purpose: 'email-change' })
      const current = session.user.email.toLowerCase()
      await spendAttempt(guarded, newEmail, address => `change-email-otp-${current}-${address}`)
      return true
    },
  },
  {
    matches: path => PASSKEY_CHANGES.has(path),
    impersonated: `${IMPERSONATING} change its passkeys.`,
  },
  {
    matches: path => path === '/link-social',
    impersonated: `${IMPERSONATING} link another way to sign in.`,
  },
  {
    matches: path => path === '/delete-user' || path === '/delete-user/callback',
    impersonated: `${IMPERSONATING} delete it.`,
  },
]

/**
 * Request-level guard for {@link SESSION_RULES}. The caller is the session the
 * route will run with, `Authorization: Bearer` included ({@link requestSession}).
 * A request with no credential is left to the route, which answers 401 itself:
 * there is nothing to refuse and no bucket to poison.
 */
async function assertSessionRouteAllowed<DM extends GenericDataModel>(
  runtime: AuthRuntime<DM> | undefined,
  policy: RequestPolicy,
  request: AuthHookCtx,
): Promise<void> {
  const rule = SESSION_RULES.find(entry => entry.matches(request.path))
  if (!rule) return
  const session = await requestSession(request)
  if (!session) return
  if (rule.impersonated && session.session.impersonatedBy) throw authRefusal('forbidden', { reason: 'impersonating', message: rule.impersonated })

  const ctx = asMutationCtx(runtime?.ctx)
  if (!runtime || !ctx) return
  const guarded: Guarded<DM> = { runtime, ctx, policy, request }
  if (await rule.check?.(guarded, session) === false) return
  if (rule.caller) await spend(guarded, rule.caller.limit, rule.caller.message, session.user.id)
  // The caller's own budget allowed this one, so it may spend the shared
  // ceiling — never the other way round.
  if (rule.global) await spend(guarded, rule.global.limit, rule.global.message)
}

/**
 * A route anyone may call without a session (agent client registration) has
 * no caller to key on, so it spends only a deployment-wide ceiling.
 */
async function assertAnonymousRouteAllowed<DM extends GenericDataModel>(runtime: AuthRuntime<DM> | undefined, request: AuthHookCtx): Promise<void> {
  if (request.path !== '/mcp/register') return
  const ctx = asMutationCtx(runtime?.ctx)
  if (!runtime || !ctx) return
  await spend({ runtime, ctx }, 'agentRegistrationGlobal', 'Too many agents are registering right now. Please try again later.')
}

/** The package's before- and after-hooks, each chained ahead of a consumer-supplied one. */
export function makeRequestHooks<DM extends GenericDataModel>(
  runtime: AuthRuntime<DM> | undefined,
  consumer: BetterAuthOptions['hooks'],
  policy: RequestPolicy = DEFAULT_POLICY,
): BetterAuthOptions['hooks'] {
  const consumerBefore = consumer?.before as unknown as ((ctx: unknown) => Promise<unknown>) | undefined
  const consumerAfter = consumer?.after as unknown as ((ctx: unknown) => Promise<unknown>) | undefined
  return {
    ...consumer,
    before: createAuthMiddleware(async (ctx) => {
      // A server-only endpoint has no path, and no route of the package's.
      if (typeof ctx.path === 'string') {
        if (policy.disabled.includes(ctx.path)) throw new APIError('NOT_FOUND', { message: 'Not found.' })
        await assertCodeSendAllowed(runtime, policy, ctx)
        await assertCodeCheckAllowed(runtime, ctx)
        await assertSessionRouteAllowed(runtime, policy, ctx)
        await assertAnonymousRouteAllowed(runtime, ctx)
      }
      if (consumerBefore) return consumerBefore(ctx)
    }),
    after: createAuthMiddleware(async (ctx) => {
      if (typeof ctx.path === 'string') await notifyEmailChanged(runtime, ctx)
      if (consumerAfter) return consumerAfter(ctx)
    }),
  }
}

/** Ask the gate; a refusal becomes the `forbidden` (reason `sign_in_refused`) refusal the sign-in UI shows. */
export async function assertCanSignIn<DM extends GenericDataModel>(
  canSignIn: CanSignIn<DM>,
  ctx: GenericMutationCtx<DM> | GenericActionCtx<DM>,
  input: CanSignInInput,
): Promise<void> {
  const verdict = await canSignIn(ctx, input)
  // The app's own sentence, when it wrote one: anything else reads as the default, never as a crash.
  const message = typeof verdict === 'object' && verdict !== null && typeof verdict.message === 'string' && verdict.message ? verdict.message : DEFAULT_REFUSAL
  if (verdict !== true) throw authRefusal('forbidden', { reason: 'sign_in_refused', message })
}

/**
 * SHA-256 of a normalized key, hex — so rate-limit rows carry a digest of the
 * address rather than the address itself.
 */
async function hashKey(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value.trim().toLowerCase()))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}
