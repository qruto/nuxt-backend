import type { BetterAuthPlugin } from 'better-auth'
import { APIError, createAuthMiddleware, getIp } from 'better-auth/api'
import type { BetterAuthOptions } from 'better-auth/minimal'
import { captcha } from 'better-auth/plugins'
import type { GenericActionCtx, GenericDataModel, GenericMutationCtx } from 'convex/server'
import * as z from 'zod'
import type { AuthMutationCtx, AuthRateLimitName, CanSignIn, CanSignInInput } from './auth-types.js'
import { noteRouteBefore, recordRouteEvent } from './audit.js'
import { notifyEmailChanged } from './notices.js'
import { assertCodeBrowser, bindCodeToBrowser, clearCodeCookie, setUnboundCodeCookie } from './code-binding.js'
import { assertAgeBeforeCode } from './age-gate.js'
import { assertTicketBeforeCode, codeRequestBudget } from './launch-gate.js'
import { assertKeepsAPasskey, assertRecoveryScope, assertSandboxAdminPasskeyOnly, passkeyOnlyAccount, releaseRecoverySession, sendPasskeyOnlyNotice, stableUserHandle } from './passkey-only.js'
import { type AuthHookCtx, requestSession, type RequestSession } from './request-session.js'
import { authRefusal } from './refusals.js'
import { type AuthRuntime, asMutationCtx, hookAdapter } from './runtime.js'
import { logsOtp, UNDELIVERABLE_CAUSES, undeliverableReason } from '../delivery.js'
import { backendError, refusalResponse } from '../errors.js'
import { logBackend } from '../log.js'
import { pausedData } from '../pauses.js'
import { deploymentAudience, PROOF_HEADER, PROTECTED_AUTH_ROUTES, requestSubject, verifyProof } from '../proof.js'
import { REAUTHENTICATE_HEADER } from '../constants.js'
import { type SensitiveAction, type SensitiveLimit, sensitiveRoute } from '../sensitive-actions.js'

// The request-level guards: the routes the package turns off, the sign-in
// gate, the bot check's proof, re-authentication, and every route's row of
// the sensitive-action table (../sensitive-actions.ts): how recent a sign-in
// it takes, whether an administrator acting as someone else may use it, and
// the limits it spends; then the refusal of email that would not arrive.
// They run from the package's one before-hook, where
// a thrown `APIError` is the status the client sees and the route never runs.
// Each refusal carries its catalog code (`authRefusal`) and no English
// sentence of its own: the client reads it with `getBackendError`, and the
// `errors` labels word it in the person's language. Only an app's own
// `canSignIn` message travels as the app wrote it.

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
 * the caller's session: see ROUTE_CHECKS.
 */
const CODE_CHECKS: Readonly<Record<string, string>> = {
  '/sign-in/email-otp': 'sign-in',
  '/email-otp/verify-email': 'email-verification',
  [RESET_PASSWORD_PATH]: 'forget-password',
}

/**
 * Whether a session an administrator opened by impersonating someone may use
 * a route: only where the route's row of the sensitive-action table allows
 * it — reads, keeping the visit's own session going, and the support work a
 * visit is for. Every other route is refused to it: the account- and
 * access-changing ones, the token and account routes, teams, roles, every
 * `/admin/*` route but the way out, and any route a plugin of the app's own
 * adds. An allowlist, so a route Better Auth adds later is refused until it
 * has a row.
 */
function visitMayUse(path: string): boolean {
  return sensitiveRoute(path)?.impersonation === 'allowed'
}

/**
 * The routes a caller reaches without a session: signing in or up, codes,
 * password resets, discovery.
 * A stale credential sent along to one of these is the route's business;
 * on any other route a credential that resolves to no session is refused,
 * so a failed session read can never pass for "not impersonated".
 */
function sessionless(path: string): boolean {
  return path.startsWith('/sign-in/') || path.startsWith('/sign-up/') || path.startsWith('/callback/') || path.startsWith('/.well-known/')
    || SESSIONLESS_ROUTES.has(path)
}
const SESSIONLESS_ROUTES = new Set([
  '/email-otp/send-verification-otp', '/email-otp/verify-email', '/email-otp/request-password-reset', '/email-otp/reset-password',
  '/forget-password/email-otp', '/verify-email', '/request-password-reset', '/reset-password',
  '/passkey/generate-authenticate-options', '/passkey/verify-authentication',
])

/** Routes no browser session acts on: a stale cookie sent along is no one's to refuse. */
const NO_SESSION_ROUTES = new Set(['/ok', '/error', '/convex/jwks', '/convex/.well-known/openid-configuration'])

/**
 * The fields an impersonated session may still write on a route it may use:
 * the profile's name and image, never an app's own user field (Better Auth
 * writes every `additionalFields` entry with `input: true` on `/update-user`).
 */
const IMPERSONATION_FIELDS: Readonly<Record<string, readonly string[]>> = {
  '/update-user': ['name', 'image'],
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
  /**
   * The secret the bot check's proofs are signed with, when no package
   * challenge checks the protected routes (`PROTECTION_PROOF_SECRET`, and
   * no `PROTECTION_CHALLENGE_SECRET_KEY` or an app's own captcha plugin):
   * they refuse a request without one that passes.
   */
  proof?: string
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

/** The limits a route's row of the sensitive-action table names; none for a route off it. */
function routeLimit(path: string): SensitiveLimit {
  return sensitiveRoute(path)?.limit ?? {}
}

/**
 * Spend one token of a limit; a closed one is the 429 `rate_limited` the
 * client sees, with the wait (ms) and the limit in the body. A row that
 * names no such limit spends nothing.
 */
async function spend<DM extends GenericDataModel>(
  { runtime, ctx }: Pick<Guarded<DM>, 'runtime' | 'ctx'>,
  limit: AuthRateLimitName | undefined,
  key?: string,
): Promise<void> {
  if (!runtime.rateLimiter || !limit) return
  // The client spreads the refusal's body into the result's `error`, so
  // `retryAfter` is how `useLoginFlow` can say when to retry.
  const { ok, retryAfter } = key ? await runtime.rateLimiter.limit(ctx, limit, { key }) : await runtime.rateLimiter.limit(ctx, limit)
  // A limiter of the app's own may answer a wait that is no number: the
  // refusal goes out without one rather than failing the catalog's check.
  if (!ok) throw authRefusal('rate_limited', { retryAfter: Number.isFinite(retryAfter) ? retryAfter : undefined, limit })
}

/**
 * Spend one attempt at a code sent to `address` (`limit`, the route's
 * `emailOtpAttempt`, keyed by a digest of the address). Better Auth allows three wrong guesses per code,
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
  limit = routeLimit(guarded.request.path).address,
): Promise<void> {
  if (typeof address !== 'string' || !guarded.runtime.rateLimiter || !limit) return
  if (!await codeWaiting(guarded.request, identifier(address.toLowerCase()))) return
  await spend(guarded, limit, await hashKey(address))
}

/** Whether a code is waiting under the emailOTP plugin's `identifier`, unexpired. */
async function codeWaiting(request: AuthHookCtx, identifier: string): Promise<boolean> {
  const waiting = await request.context.internalAdapter.findVerificationValue(identifier)
  return waiting != null && new Date(waiting.expiresAt).getTime() > Date.now()
}

/** Ask the gate, when the app has one. */
async function gate<DM extends GenericDataModel>({ runtime, ctx }: Pick<Guarded<DM>, 'runtime' | 'ctx'>, input: CanSignInInput): Promise<void> {
  if (runtime.canSignIn) await assertCanSignIn(runtime.canSignIn, ctx, input)
}

/** What `assertDeliverable` refuses, as the log line names it. */
const UNDELIVERABLE_KINDS = {
  code: 'A one-time code',
  invitation: 'An invitation',
} as const

/**
 * Refuse a code or an invitation the transport would drop, on the
 * request. Better Auth runs both senders
 * in the background and answers success whatever they throw, so a failure
 * there leaves a person waiting for an email that never comes. The cause
 * goes to the logs for the operator; the person reads the `errors` label
 * for the reason, and no code, invitation or deletion token is created.
 */
function assertDeliverable(runtime: Pick<AuthRuntime, 'email'>, address: string, kind: keyof typeof UNDELIVERABLE_KINDS): void {
  // setupAuth requires the email instance; without one there is no send to refuse.
  if (!runtime.email) return
  // Only a sign-in code is ever echoed to the logs.
  const reason = undeliverableReason(address, { echo: kind === 'code' && logsOtp() })
  if (!reason) return
  logBackend('warn', 'email.undeliverable', `${UNDELIVERABLE_KINDS[kind]} was refused: ${UNDELIVERABLE_CAUSES[reason]}`)
  throw authRefusal('unavailable', { service: 'email', reason: reason === 'test-mode' ? 'test_mode' : 'unconfigured' })
}

/**
 * Refuse a code to an address the email provider suppressed, as the
 * backend component's copy of its list knows it: one indexed read, no
 * provider call. The refusal reads the same whether or not an account holds
 * the address (`unavailable`, reason `suppressed`, which `useLoginFlow`
 * shows as its `undeliverable` step), and comes before the address's own
 * budget is spent and before any code is minted.
 */
async function assertNotSuppressed<DM extends GenericDataModel>(runtime: AuthRuntime<DM>, ctx: Guarded<DM>['ctx'], address: string): Promise<void> {
  if (!runtime.suppressed || !await runtime.suppressed(ctx, address)) return
  throw authRefusal('unavailable', { service: 'email', reason: 'suppressed' })
}

/**
 * The requests that send a code: the sign-in, verification and (with
 * passwords on) reset codes. Better Auth runs the emailOTP
 * `sendVerificationOTP` callback through `runInBackgroundOrAwait`, which
 * catches anything it throws, logs "Failed to run background task" and still
 * answers `{ success: true }` — and the code is stored before the sender even
 * runs. So every limit, the sign-in gate and the delivery check run here, on
 * the request, where a refusal is the 429/403/503 the sign-in UI shows and no
 * code is stored.
 *
 * Answers `'passkey-only'` for a sign-in or reset code to a passkey-only account,
 * once every check passed as for any other address: no code is stored, and
 * the request is answered as if one were.
 */
async function assertCodeSendAllowed<DM extends GenericDataModel>(
  runtime: AuthRuntime<DM> | undefined,
  policy: RequestPolicy,
  request: AuthHookCtx,
): Promise<'passkey-only' | undefined> {
  const viaSend = request.path === SEND_CODE_PATH
  if (!viaSend && !RESET_CODE_PATHS.includes(request.path)) return undefined
  const { email, type } = bodyOf(request)
  if (viaSend && type === 'forget-password' && !policy.passwords) {
    throw authRefusal('invalid_input', { field: 'type', reason: 'no_password' })
  }
  // A request the route refuses on its own spends nothing.
  if (!isEmail(email) || (viaSend && !SEND_CODE_TYPES.includes(type as string))) return undefined
  const ctx = asMutationCtx(runtime?.ctx)
  // Without the request runtime no limit can be spent, but a passkey-only account still gets no code.
  if (!runtime || !ctx) return passkeyOnlyCode(request, policy, type, email)
  const guarded = { runtime, ctx }
  const limit = routeLimit(request.path)
  // The deployment's ceiling first: a code that goes out costs everyone's
  // sending reputation, whichever check refuses it after. A code to a new
  // address spends the sign-up budget instead, while the launch gate is wired.
  const budget = await codeRequestBudget(runtime, ctx, type, email, limit.global)
  await spend(guarded, budget.global)
  // A code that would create an account while sign-ups are paused is
  // refused here, after the ceiling, as the gate below is: either answer
  // says whether an address has an account, so every probe costs one. An
  // existing account still signs in.
  await refuseNewAccountWhilePaused(runtime, ctx, type, email)
  await gateCodeRequest(guarded, type, email, budget.newAddress)
  // After the gate, so an app's own refusal is the one a person reads.
  if (policy.codes) assertDeliverable(runtime, email, 'code')
  // An address the provider stopped delivering to: no code, and none of its budget spent.
  if (policy.codes) await assertNotSuppressed(runtime, ctx, email)
  // Per address last, after the gate: a refused address consumes no quota,
  // so an invitation that arrives later still works.
  await spend(guarded, limit.address, await hashKey(email))
  // A passkey-only account refuses codes: after every limit, so its answer
  // costs what any other does.
  return passkeyOnlyCode(request, policy, type, email)
}

/** Ask the app's gate about a sign-in code's address, with whether it has an account (read once). */
async function gateCodeRequest<DM extends GenericDataModel>(guarded: Pick<Guarded<DM>, 'runtime' | 'ctx'>, type: unknown, email: string, newAddress: boolean | undefined): Promise<void> {
  const { runtime, ctx } = guarded
  if (!runtime.canSignIn || type !== 'sign-in') return
  const isNewUser = newAddress ?? (runtime.userExists ? !(await runtime.userExists(ctx, email)) : true)
  await gate(guarded, { email: email.toLowerCase(), isNewUser, purpose: 'sign-in', ticket: null })
}

/**
 * `'passkey-only'` for a code the package would send to a passkey-only
 * account that opens a way in: a sign-in code, and, in an app that turned
 * passwords on, a password-reset code, which would let the mailbox set a
 * password and sign in without the passkey.
 */
async function passkeyOnlyCode(request: AuthHookCtx, policy: RequestPolicy, type: unknown, email: string): Promise<'passkey-only' | undefined> {
  const signIn = request.path === SEND_CODE_PATH && type === 'sign-in' && policy.codes
  const reset = RESET_CODE_PATHS.includes(request.path) || (request.path === SEND_CODE_PATH && type === 'forget-password')
  if (!signIn && !reset) return undefined
  return await passkeyOnlyAccount(request, email) ? 'passkey-only' : undefined
}

/**
 * A password reset of a passkey-only account, refused before it checks the
 * code: its code request sent none, and a password would be a way in
 * around the passkey. Answered as a wrong code is.
 */
async function assertNoResetForPasskeyOnly(request: AuthHookCtx): Promise<void> {
  if (request.path !== RESET_PASSWORD_PATH) return
  const { email } = bodyOf(request)
  if (isEmail(email) && await passkeyOnlyAccount(request, email)) throw authRefusal('invalid_input', { field: 'otp' })
}

/**
 * Refuse a sign-in code for `email` that would create an account while the
 * sign-ups kill switch is on. Unknown without the account lookup: the
 * account-creation hook refuses then.
 */
async function refuseNewAccountWhilePaused<DM extends GenericDataModel>(runtime: AuthRuntime<DM>, ctx: AuthMutationCtx, type: unknown, email: string): Promise<void> {
  if (type !== 'sign-in' || !runtime.paused || !runtime.userExists) return
  if (!await runtime.paused(ctx, 'signups')) return
  if (!await runtime.userExists(ctx, email)) throw authRefusal('unavailable', pausedData('signups'))
}

/** The routes that check a code without a session. */
async function assertCodeCheckAllowed<DM extends GenericDataModel>(runtime: AuthRuntime<DM> | undefined, request: AuthHookCtx): Promise<void> {
  const type = CODE_CHECKS[request.path]
  if (!type) return
  const ctx = asMutationCtx(runtime?.ctx)
  if (!runtime || !ctx) return
  await spendAttempt({ runtime, ctx, request }, bodyOf(request).email, address => `${type}-otp-${address}`)
}

/**
 * What a route that acts for the signed-in caller asks beyond its row of
 * the sensitive-action table, around the limits the row names. A route's
 * checks run in order: an administrator impersonating the account is
 * refused (on every route whose row does not allow a visit, or that has no
 * row), then a sign-in older than the row takes, then the route's `accepts`
 * (`false` when the route refuses the request on its own, so it spends
 * nothing), then the caller's own bucket, then `then` (the gate, the
 * delivery of what it will email, the attempt at the code it checks), then
 * the deployment's ceiling.
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
 * passkey, an address of the administrator's choosing, a password, a linked
 * sign-in, a workspace invitation, membership or role — or take the
 * account's own away: its other sessions, a sign-in method, its workspaces,
 * the account itself. Every route whose row does not allow a visit refuses
 * an impersonated session with the `forbidden` refusal of reason
 * `impersonating`, which the `errors` labels word.
 */
const ROUTE_CHECKS: Readonly<Record<string, {
  accepts?: <DM extends GenericDataModel>(guarded: Guarded<DM>, session: RequestSession) => Promise<boolean>
  then?: <DM extends GenericDataModel>(guarded: Guarded<DM>, session: RequestSession) => Promise<void>
}>> = {
  [INVITE_PATH]: {
    accepts: async ({ runtime, policy, request }) => {
      const { email } = bodyOf(request)
      if (policy.invitations && typeof email === 'string') assertDeliverable(runtime, email, 'invitation')
      return true
    },
  },
  // The new address, then the current address's code, before the code to
  // the new address goes out. The gate answers for an address the caller
  // typed, so the caller's own bucket is spent before it is asked: every
  // answer costs the caller, and none comes free. The bucket is keyed by
  // the caller, never by the address, so a refused address costs that
  // address nothing.
  [REQUEST_EMAIL_CHANGE_PATH]: {
    accepts: async (guarded, session) => {
      const { newEmail, otp } = bodyOf(guarded.request)
      const current = session.user.email.toLowerCase()
      const checksCode = typeof otp === 'string' && otp !== ''
      // The package's plugin requires the current address's code; Better
      // Auth refuses a change without it, or to the same address.
      if (!isEmail(newEmail) || newEmail.toLowerCase() === current) return false
      return !guarded.policy.codes || (checksCode && await codeWaiting(guarded.request, `email-verification-otp-${current}`))
    },
    then: async (guarded, session) => {
      const { newEmail, otp } = bodyOf(guarded.request) as { newEmail: string, otp?: unknown }
      await gate(guarded, { email: newEmail.toLowerCase(), isNewUser: false, purpose: 'email-change', ticket: null })
      if (guarded.policy.codes) assertDeliverable(guarded.runtime, newEmail, 'code')
      if (guarded.policy.codes) await assertNotSuppressed(guarded.runtime, guarded.ctx, newEmail)
      if (typeof otp === 'string' && otp !== '') await spendAttempt(guarded, session.user.email, address => `email-verification-otp-${address}`)
    },
  },
  // The new address's code, the step that moves the account. Only a pair
  // that came through the request above has one waiting; with none the
  // route refuses on its own, so the gate is asked only about an address
  // the caller already spent a request on.
  [CHANGE_EMAIL_PATH]: {
    accepts: async (guarded, session) => {
      const { newEmail } = bodyOf(guarded.request)
      const current = session.user.email.toLowerCase()
      if (!isEmail(newEmail) || newEmail.toLowerCase() === current) return false
      return codeWaiting(guarded.request, `change-email-otp-${current}-${newEmail.toLowerCase()}`)
    },
    then: async (guarded) => {
      const { newEmail } = bodyOf(guarded.request) as { newEmail: string }
      await gate(guarded, { email: newEmail.toLowerCase(), isNewUser: false, purpose: 'email-change', ticket: null })
      await spend(guarded, routeLimit(CHANGE_EMAIL_PATH).address, await hashKey(newEmail))
    },
  },
  // Deleting the account is immediate and final: after a recent sign-in
  // (its row) and a try of the account's own bucket, the account's address
  // typed to confirm it. A body with a token is a confirmation link of an
  // earlier release, which Better Auth checks on its own. The only owner of
  // a workspace others belong to is refused, so none is left without one.
  '/delete-user': {
    then: async (guarded, session) => {
      const { confirmation, token } = bodyOf(guarded.request)
      const confirmed = typeof confirmation === 'string' && confirmation.trim().toLowerCase() === session.user.email.toLowerCase()
      if (!confirmed && !(typeof token === 'string' && token !== '')) throw authRefusal('invalid_input', { field: 'confirmation' })
      await assertNotSoleOwner(guarded, session.user.id)
    },
  },
  // A confirmation link an earlier release emailed, until it expires: held to the same refusal.
  '/delete-user/callback': {
    then: async (guarded, session) => assertNotSoleOwner(guarded, session.user.id),
  },
  // An administrator deleting an account is held to the same: no workspace left without an owner.
  '/admin/remove-user': {
    then: async (guarded) => {
      const { userId } = bodyOf(guarded.request)
      if (typeof userId === 'string' && userId !== '') await assertNotSoleOwner(guarded, userId)
    },
  },
}

/**
 * An account's own deletion (`/delete-user` with the address typed, which the
 * route's row has checked by now) is scheduled instead of run, when the app's
 * `setupAccount` instance can: the route answers as if it went through and
 * Better Auth never deletes anything. The erasure runs at the end of the
 * grace period. `null` leaves the route to Better Auth: another route, a
 * confirmation link of an earlier release, or no instance to schedule with.
 */
async function deferAccountDeletion<DM extends GenericDataModel>(runtime: AuthRuntime<DM> | undefined, request: AuthHookCtx): Promise<{ success: true, scheduled: true, requestedAt: number, deletesAt: number } | null> {
  if (request.path !== '/delete-user' || !runtime?.account?.scheduleDeletion) return null
  const { confirmation } = bodyOf(request)
  if (typeof confirmation !== 'string' || confirmation === '') return null
  const ctx = asMutationCtx(runtime.ctx)
  const session = await requestSession(request)
  if (!ctx || !session) return null
  const deletion = await runtime.account.scheduleDeletion(ctx as never, session.user.id)
  return { success: true, scheduled: true, ...deletion }
}

/**
 * Refuse deleting an account that is the only owner of a workspace others
 * belong to (`forbidden`, reason `sole_owner`): ownership moves first, or
 * the others leave. Nothing to check without the account instance (a
 * component built before export and erasure).
 */
async function assertNotSoleOwner<DM extends GenericDataModel>({ runtime, ctx }: Pick<Guarded<DM>, 'runtime' | 'ctx'>, userId: string): Promise<void> {
  if (!runtime.account) return
  if ((await runtime.account.soleOwnerships(ctx as never, userId)).length > 0) throw authRefusal('forbidden', { reason: 'sole_owner' })
}

/**
 * The route's session as Better Auth reads it, beyond what {@link RequestSession}
 * names: when the person signed in to it, its token, and its active
 * workspace, which a re-authentication carries over.
 */
type SignedInSession = RequestSession & {
  session: RequestSession['session'] & { token: string, createdAt: Date | string | number, activeOrganizationId?: string | null }
}

/** Refuse an impersonated session a route its row does not open to a visit, or a field it may not write. */
function assertVisitMay(request: AuthHookCtx): void {
  const fields = IMPERSONATION_FIELDS[request.path]
  if (!visitMayUse(request.path) || (fields && Object.keys(bodyOf(request)).some(field => !fields.includes(field)))) {
    throw authRefusal('forbidden', { reason: 'impersonating' })
  }
}

/**
 * Refuse a session whose sign-in is older than `seconds`: the person signs
 * in again (`useReauthentication`), which opens a new session, and retries.
 * Better Auth's own `freshAge` check on the passkey routes counts the same
 * way, from the session's `createdAt`. An impersonated session never gets
 * here: every row that asks for a recent sign-in refuses a visit first.
 */
export function assertRecentSignIn(session: RequestSession, seconds: number): void {
  const signedInAt = new Date((session as SignedInSession).session.createdAt).getTime()
  if (Number.isFinite(signedInAt) && Date.now() - signedInAt <= seconds * 1000) return
  throw authRefusal('reauthentication_required')
}

/** Whether a route's row has anything to check about its caller: a recent sign-in, a caller limit or a check of its own. */
function keysOnCaller(row: SensitiveAction | undefined, path: string): boolean {
  return row?.recentSignIn != null || Boolean(row?.limit?.caller) || Boolean(ROUTE_CHECKS[path])
}

/**
 * The client's address as Better Auth reads it for its own limiter, or
 * `null` when the headers name none it trusts (several hops and no
 * `trustedProxies`, or IP tracking turned off): such a request spends only
 * the ceiling.
 */
function clientAddress(request: AuthHookCtx): string | null {
  const headers = request.request?.headers ?? request.headers
  return headers ? getIp(headers, request.context?.options ?? {}) : null
}

/**
 * Every route's row of the sensitive-action table, for the caller the route
 * will run with (`Authorization: Bearer` included, {@link requestSession}).
 *
 * A route anyone may call without a session spends the limits its row keys
 * on no caller: a bucket keyed by the client's address (an HMAC of it under
 * the auth secret, never the address), which is a best effort — Better Auth
 * reads it from `x-forwarded-for`, as its `advanced.ipAddress` options say,
 * and only a proxy in front of the deployment makes that header true — then
 * the deployment's ceiling, spent only after that bucket allowed the
 * request, so one address's refused excess never eats everyone else's.
 * That is
 * `/passkey/generate-authenticate-options`, the challenge every passkey
 * sign-in starts with, which the server stores until the answer comes: the
 * answer uses its challenge up, so bounding the challenges bounds the
 * answers. The code routes spend theirs where they check the address the
 * code goes to (`assertCodeSendAllowed`, `assertCodeCheckAllowed`).
 *
 * A route that acts for a caller is left to the route when the request
 * carries no credential: it answers 401 itself, and there is nothing to
 * refuse and no bucket to poison.
 */
async function assertRouteAllowed<DM extends GenericDataModel>(
  runtime: AuthRuntime<DM> | undefined,
  policy: RequestPolicy,
  request: AuthHookCtx,
): Promise<void> {
  const path = request.path
  const row = sensitiveRoute(path)
  const open = sessionless(path)
  const keyed = keysOnCaller(row, path)
  // A route a visit may use, with nothing to check of its caller: nobody to read.
  if (!keyed && !open && visitMayUse(path) && !IMPERSONATION_FIELDS[path]) return
  // Off the allowlist, only an impersonated session is refused; a stale
  // credential is refused too, except on a route that needs no session.
  const session = await requestSession(request, { lenient: !keyed && open })
  if (session) assertSessionMay(request, session, row)

  const ctx = asMutationCtx(runtime?.ctx)
  if (!runtime || !ctx) return
  const guarded: Guarded<DM> = { runtime, ctx, policy, request }
  if (open) await spendAnonymous(guarded, row?.limit ?? {})
  else if (session) await spendForCaller(guarded, session, row?.limit ?? {})
}

/** Refuse an administrator's visit off its allowlist, then a sign-in older than the route's row takes. */
function assertSessionMay(request: AuthHookCtx, session: RequestSession, row: SensitiveAction | undefined): void {
  if (session.session.impersonatedBy) assertVisitMay(request)
  if (row?.recentSignIn != null) assertRecentSignIn(session, row.recentSignIn)
}

/**
 * The limits of a route anyone calls without a session: the client's
 * bucket, then the ceiling. The code routes spend theirs beside the address
 * they check.
 */
async function spendAnonymous<DM extends GenericDataModel>(guarded: Guarded<DM>, limit: SensitiveLimit): Promise<void> {
  if (limit.address) return
  const address = limit.client ? clientAddress(guarded.request) : null
  if (limit.client && address) await spend(guarded, limit.client, await addressKey(guarded.request.context.secret, address))
  await spend(guarded, limit.global)
}

/** The route's own checks around the caller's bucket, then the ceiling. */
async function spendForCaller<DM extends GenericDataModel>(guarded: Guarded<DM>, session: RequestSession, limit: SensitiveLimit): Promise<void> {
  const check = ROUTE_CHECKS[guarded.request.path]
  if (await check?.accepts?.(guarded, session) === false) return
  await spend(guarded, limit.caller, session.user.id)
  await check?.then?.(guarded, session)
  // The caller's own budget allowed this one, so it may spend the shared
  // ceiling — never the other way round.
  await spend(guarded, limit.global)
}

// Re-authentication: signing in again, on a browser already signed in, to
// prove the person is still at the keyboard before a sensitive action. It is
// an ordinary sign-in — a passkey, or a code to the account's own address —
// marked with REAUTHENTICATE_HEADER, which holds it to the session the
// request carries:
//
// - before the route runs, the request must carry a live session, of the
//   person's own (never an administrator's visit), and a code may go only
//   to that account's address;
// - when the route opens its new session, it must be for the same account,
//   and it keeps the old one's active workspace;
// - once the new session is open, the old one is signed out: the browser
//   holds only the new one.
//
// The new session's sign-in is now, so its token's `authTime` claim is too:
// the client fetches that token before it retries the action.

/** The sign-in routes a re-authentication passes through, and the body field naming the address, where one does. */
const REAUTHENTICATION_ROUTES: Readonly<Record<string, 'email' | null>> = {
  '/email-otp/send-verification-otp': 'email',
  '/sign-in/email-otp': 'email',
  '/passkey/generate-authenticate-options': null,
  '/passkey/verify-authentication': null,
}

/** The session a re-authentication replaces. */
interface Superseded {
  userId: string
  token: string
  activeOrganizationId: string | null
  /** Signed out already, once the new session opened. */
  revoked?: boolean
}

/**
 * The session each re-authentication replaces, by its request: the raw
 * request over HTTP, else the headers of an in-process call, the same
 * objects every hook of one request is handed.
 */
const superseding = new WeakMap<object, Superseded>()

/** What a hook's context carries of its request. */
interface RequestCarrier {
  request?: Request
  headers?: Headers
  path?: string
}

function requestKey(ctx: RequestCarrier): object | undefined {
  return ctx.request ?? ctx.headers
}

/** Whether a request marks its sign-in as a re-authentication. */
function marked(ctx: RequestCarrier): boolean {
  return Boolean((ctx.request?.headers ?? ctx.headers)?.get(REAUTHENTICATE_HEADER))
}

/**
 * Hold a re-authentication to the session the request carries, before its
 * route runs: refused as `unauthenticated` without one (a stale credential
 * included), as `forbidden` (reason `impersonating`) for an administrator's
 * visit, and as `forbidden` (reason `other_account`) for a code to any
 * address but the account's own. The header on any other route is ignored
 * here, and a session such a route opens is refused before it is written
 * ({@link reauthenticatedWorkspace}).
 */
export async function assertReauthentication(ctx: AuthHookCtx): Promise<void> {
  if (!marked(ctx) || !Object.hasOwn(REAUTHENTICATION_ROUTES, ctx.path)) return
  const session = await requestSession(ctx)
  if (!session) throw authRefusal('unauthenticated')
  if (session.session.impersonatedBy) throw authRefusal('forbidden', { reason: 'impersonating' })
  const field = REAUTHENTICATION_ROUTES[ctx.path]
  if (field) {
    const address = (ctx.body as Record<string, unknown> | undefined)?.[field]
    if (typeof address !== 'string' || address.trim().toLowerCase() !== session.user.email.toLowerCase()) {
      throw authRefusal('forbidden', { reason: 'other_account' })
    }
  }
  const key = requestKey(ctx)
  const replaced = (session as SignedInSession).session
  if (key) superseding.set(key, { userId: session.user.id, token: replaced.token, activeOrganizationId: replaced.activeOrganizationId ?? null })
}

/**
 * Hold the session a re-authentication opens to the account it
 * re-authenticates, before it is written: another account's passkey is
 * refused as `forbidden` (reason `other_account`), and the browser keeps
 * its session. So is a marked sign-in the before-hook recorded no session
 * for (a route that is not one of the re-authentication's, or a request
 * this hook cannot tie to the one the before-hook saw): it fails closed,
 * never as an ordinary sign-in of whichever account answered. Answers the
 * workspace the new session keeps: the old session's active one, while the
 * account still belongs to it; `undefined` for any other sign-in, or when
 * it no longer belongs.
 */
export async function reauthenticatedWorkspace(session: { userId: string }, hookCtx: unknown): Promise<string | undefined> {
  const carrier = (hookCtx ?? {}) as RequestCarrier
  const key = requestKey(carrier)
  const replaced = key ? superseding.get(key) : undefined
  if (!replaced) {
    if (marked(carrier)) throw authRefusal('forbidden', { reason: 'other_account' })
    return undefined
  }
  if (replaced.userId !== session.userId) throw authRefusal('forbidden', { reason: 'other_account' })
  if (!replaced.activeOrganizationId) return undefined
  const member = await hookAdapter(hookCtx)?.findOne({
    model: 'member',
    where: [{ field: 'organizationId', value: replaced.activeOrganizationId }, { field: 'userId', value: session.userId }],
  })
  return member ? replaced.activeOrganizationId : undefined
}

/** Whether a hook runs for a sign-in that re-authenticates the session its request carries. */
export function reauthenticating(hookCtx: unknown): boolean {
  const key = requestKey((hookCtx ?? {}) as RequestCarrier)
  return key ? superseding.has(key) : false
}

/** What the after-hook reads of the route's outcome. */
interface AfterCtx extends RequestCarrier {
  context?: {
    newSession?: { session?: { token?: string, userId?: string } } | null
    internalAdapter?: { deleteSession: (token: string) => Promise<unknown> }
  }
}

/**
 * Sign the replaced session out once a re-authentication opened its new
 * one. A route that refused opened none, and the old session stays.
 */
export async function revokeSuperseded(ctx: AfterCtx): Promise<void> {
  const key = requestKey(ctx)
  const replaced = key ? superseding.get(key) : undefined
  if (!replaced || replaced.revoked) return
  // Kept, marked, rather than dropped: the new session's own after-hook,
  // which Better Auth may run once the request is done, still reads it as
  // a re-authentication (`reauthenticating`). It goes with its request.
  replaced.revoked = true
  const opened = ctx.context?.newSession?.session
  if (!opened?.token || opened.userId !== replaced.userId || opened.token === replaced.token) return
  await ctx.context?.internalAdapter?.deleteSession(replaced.token)
}

// The bot check on the auth routes that send a code or create an account
// (PROTECTED_AUTH_ROUTES). Two ways in, by what the deployment's env sets:
//
// - PROTECTION_PROOF_SECRET: the app's server ran its own bot check (BotID
//   on Vercel) and signed a proof into the request it forwards, for its
//   route, its address and this deployment. Better Auth runs on the
//   deployment's own public URL, which anyone can call without the app's
//   server, so the request guard refuses these routes without a proof that
//   passes.
// - PROTECTION_CHALLENGE_SECRET_KEY: Better Auth's own captcha plugin
//   verifies the challenge answer the browser sends. A request that carries
//   a passing proof needs no answer, so an app behind both takes either.

/**
 * The request's own proof, checked under `secret` against its method and
 * path, the address its body names, and this deployment.
 */
async function proofOf(request: Request, secret: string, body: unknown) {
  return verifyProof(secret, request.headers.get(PROOF_HEADER), {
    method: request.method,
    path: new URL(request.url).pathname,
    audience: deploymentAudience(),
    subject: requestSubject(body),
  })
}

/** Whether a raw request carries a proof that passes; its body is read from a copy, which the route still reads after. */
async function carriesProof(request: Request, secret: string): Promise<boolean> {
  if (!request.headers.has(PROOF_HEADER)) return false
  const body = await request.clone().json().catch(() => null) as unknown
  return (await proofOf(request, secret, body)).ok
}

/**
 * Better Auth's captcha plugin with the challenge provider's secret key, on
 * the protected routes, and a refusal the client reads like every other
 * one: a missing or failed answer is `forbidden` (`bot_check`), a provider
 * that could not be reached `unavailable` (`provider_refused`). A request
 * whose proof passes skips it.
 */
export function challengePlugin(secretKey: string, proofSecret: string | undefined): BetterAuthPlugin {
  const native = captcha({ provider: 'cloudflare-turnstile', secretKey, endpoints: [...PROTECTED_AUTH_ROUTES] })
  return {
    ...native,
    onRequest: async (request, ctx) => {
      if (proofSecret && await carriesProof(request, proofSecret)) return
      const outcome = await native.onRequest(request, ctx)
      if (!outcome) return
      if (outcome.response.status >= 500) {
        logBackend('warn', 'protection.challenge_unavailable', 'The challenge provider could not verify a sign-in answer.')
        return { response: refusalResponse(backendError('unavailable', { service: 'protection', reason: 'provider_refused' })) }
      }
      logBackend('warn', 'protection.refused', `A request to ${new URL(request.url).pathname} carried no challenge answer that passed.`)
      return { response: refusalResponse(backendError('forbidden', { reason: 'bot_check' })) }
    },
  } satisfies BetterAuthPlugin
}

/**
 * The request guard's bot check, for a deployment that takes proofs only:
 * a protected route reached over HTTP without a proof that passes is
 * refused as `forbidden` (`bot_check`). An in-process `auth.api` call has
 * no request, and is the app's own code.
 */
async function assertProofOnProtectedRoute(ctx: AuthHookCtx, proofSecret: string | undefined): Promise<void> {
  const request = ctx.request
  if (!proofSecret || !(request instanceof Request)) return
  if (!(PROTECTED_AUTH_ROUTES as readonly string[]).includes(ctx.path)) return
  const check = await proofOf(request, proofSecret, ctx.body)
  if (check.ok) return
  logBackend('warn', 'protection.refused', `A request to ${new URL(request.url).pathname} was refused: its proof is ${check.reason}.`)
  throw authRefusal('forbidden', { reason: 'bot_check' })
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
        // Before any limit is spent: a request that passed no bot check costs nobody's budget.
        await assertProofOnProtectedRoute(ctx, policy.proof)
        // A sign-in again, held to the session it replaces before it spends anything.
        await assertReauthentication(ctx)
        // A recovery session saves a passkey before anything else.
        await assertRecoveryScope(ctx, sessionless(ctx.path) || NO_SESSION_ROUTES.has(ctx.path))
        // On a sandbox, Better Auth's admin routes are a passkey-only administrator's, as the admin tier is.
        await assertSandboxAdminPasskeyOnly(ctx)
        if (await assertCodeSendAllowed(runtime, policy, ctx) === 'passkey-only') {
          // No code: an email that says the account signs in with a
          // passkey, and the answer and cookie any code request gets.
          await sendPasskeyOnlyNotice(runtime, ctx, String(bodyOf(ctx).email))
          setUnboundCodeCookie(ctx)
          return ctx.json({ success: true })
        }
        await assertNoResetForPasskeyOnly(ctx)
        // A code checked in another browser than the one that asked, before it spends an attempt.
        await assertCodeBrowser(ctx)
        await assertCodeCheckAllowed(runtime, ctx)
        // A new address in a closed launch phase, with no ticket: refused once its code checks, before it is used up.
        await assertTicketBeforeCode(runtime, ctx)
        // A new address under the app's minimum age, or one that has not said: refused once its code checks, before it is used up.
        await assertAgeBeforeCode(runtime, ctx)
        await assertRouteAllowed(runtime, policy, ctx)
        await assertKeepsAPasskey(ctx)
        // An account's own deletion waits out its grace period instead of running.
        const deferred = await deferAccountDeletion(runtime, ctx)
        if (deferred) return ctx.json(deferred)
        // Allowed: what its event will need from before it runs.
        await noteRouteBefore(ctx)
      }
      if (consumerBefore) return consumerBefore(ctx)
    }),
    after: createAuthMiddleware(async (ctx) => {
      if (typeof ctx.path === 'string') {
        await notifyEmailChanged(runtime, ctx)
        await bindCodeToBrowser(ctx)
        clearCodeCookie(ctx)
        stableUserHandle(ctx as never)
        await releaseRecoverySession(ctx as never)
        await revokeSuperseded(ctx as never)
        await recordRouteEvent(runtime, ctx)
      }
      if (consumerAfter) return consumerAfter(ctx)
    }),
  }
}

/**
 * Ask the gate; a refusal becomes the `forbidden` (reason `sign_in_refused`)
 * refusal the sign-in UI shows: with the app's own sentence when its verdict
 * carries one, else worded by the `errors.forbidden_sign_in_refused` label.
 */
export async function assertCanSignIn<DM extends GenericDataModel>(
  canSignIn: CanSignIn<DM>,
  ctx: GenericMutationCtx<DM> | GenericActionCtx<DM>,
  input: CanSignInInput,
): Promise<void> {
  const verdict = await canSignIn(ctx, input)
  if (verdict === true) return
  // The app's own sentence, when it wrote one: anything else reads as the label, never as a crash.
  const message = typeof verdict === 'object' && verdict !== null && typeof verdict.message === 'string' && verdict.message ? verdict.message : undefined
  throw authRefusal('forbidden', { reason: 'sign_in_refused', ...(message ? { message } : {}) })
}

/** Bytes as lower-case hex. */
function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * SHA-256 of a normalized key, hex — so rate-limit rows carry a digest of the
 * address rather than the address itself.
 */
async function hashKey(value: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value.trim().toLowerCase())))
}

/**
 * HMAC-SHA-256 of a client's network address under the auth secret, hex. An
 * address has too few values for a plain digest to hide it (every IPv4
 * address hashes in minutes), so the limiter's rows hold a key only the
 * deployment can compute; the prefix keeps it apart from anything else the
 * secret signs.
 */
async function addressKey(secret: string, address: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return hex(await crypto.subtle.sign('HMAC', key, encoder.encode(`client-address:${address.trim().toLowerCase()}`)))
}
