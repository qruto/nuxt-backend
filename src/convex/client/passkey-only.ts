import type { BetterAuthPlugin } from 'better-auth'
import { createAuthEndpoint, sessionMiddleware } from 'better-auth/api'
import { setSessionCookie } from 'better-auth/cookies'
import { constantTimeEqual, generateRandomString } from 'better-auth/crypto'
import type { GenericDataModel } from 'convex/server'
import * as z from 'zod'
import { DEFAULT_SECURITY_PATH } from '../constants.js'
import { backendEnvironment } from '../delivery.js'
import { requiresPasskeyOnlyAdmins } from '../environment.js'
import { type Administrators, isAdministrator, passkeyOnlyAdminRefusal } from '../integrations/access.js'
import { logBackend } from '../log.js'
import { PASSKEY_ONLY_PLUGIN } from './plugins.js'
import type { AuthHookCtx } from './request-session.js'
import { requestSession } from './request-session.js'
import { requestOrigin } from './request-origin.js'
import { authRefusal } from './refusals.js'
import { type AuthLibrarySecretConfig, contextSecrets } from '../auth-secrets.js'
import { type AuthRuntime, asMutationCtx, readEnv } from './runtime.js'
import { sha256Hex, toHex } from '../tokens.js'

// Passkey-only accounts. A person with a passkey can turn sign-in codes off
// for their account, so a stolen mailbox can't sign in to it; a code request
// for the account then sends no code, but an email saying it signs in with a
// passkey. Turning it on answers with a recovery code, shown once: the way
// back in without a passkey ("Lost your passkey?"). A recovery opens a
// session that can do one thing, save a new passkey, before anything else,
// and it uses the code up: the person gets a new one at once, and an email
// that says the recovery happened, from where.
//
// Better Auth keeps the passkeys; nothing of it covers passkey-only
// accounts, so this plugin adds the account fields and three routes:
//
// - `POST /passkey-only/set` `{ enabled }`: the account's own switch, behind
//   a recent sign-in (its row of the sensitive-action table). Turning it on
//   signs every other session of the account out.
// - `POST /sign-in/recovery-code` `{ email, recoveryCode }`: the recovery.
// - `POST /admin/disable-passkey-only` `{ userId }`: an administrator turns
//   codes back on for a person who lost every passkey and the code.

/** How long a recovery session lasts before a passkey is saved: enough to save one, no more. */
export const RECOVERY_SESSION_SECONDS = 15 * 60

/** The routes a recovery session may use: reading itself, signing out, and saving a passkey. */
const RECOVERY_ROUTES = new Set([
  '/get-session',
  '/sign-out',
  '/passkey/generate-register-options',
  '/passkey/verify-registration',
  '/passkey/list-user-passkeys',
])

/** The account and session as this plugin's fields extend them. */
interface PasskeyOnlyUser {
  id: string
  email: string
  name?: string
  role?: unknown
  locale?: string | null
  passkeyOnly?: boolean | null
  recoveryCodeHash?: string | null
}

const encoder = new TextEncoder()

/** Twenty characters of Crockford's base32 (100 bits), in groups of five: `7K2QM-…`. */
function newRecoveryCode(): string {
  const raw = generateRandomString(20, 'A-Z', '0-9').replace(/[ILOU]/g, letter => ({ I: '1', L: '1', O: '0', U: 'V' })[letter]!)
  return raw.match(/.{5}/g)!.join('-')
}

/** A recovery code as typed: upper case, without spaces or dashes, look-alike characters read as Crockford's base32 reads them. */
function normalizeRecoveryCode(code: string): string {
  return code.toUpperCase().replace(/[\s-]/g, '').replace(/[IL]/g, '1').replace(/O/g, '0')
}

/** What a recovery code's hash is taken over: tagged for recovery and bound to the account, so it can be no sign-in code and no other account's. */
function recoveryMessage(userId: string, code: string): string {
  return `passkey-recovery:${userId}:${normalizeRecoveryCode(code)}`
}

/**
 * The stored form of a recovery code: the SHA-256 of its tagged message.
 * The code carries 100 random bits, so it needs no key, and no auth secret
 * rotation can make it stop matching: a passkey-only account keeps its way
 * back in however long the code sits unused.
 */
async function recoveryHash(userId: string, code: string): Promise<string> {
  return sha256Hex(recoveryMessage(userId, code))
}

/**
 * A recovery code's hash as codes issued before plain hashes were stored
 * it: a MAC under an auth secret. Checked against every live secret, so such
 * a code works for as long as the secret it was made under does.
 */
async function keyedRecoveryHash(secret: string, userId: string, code: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return toHex(await crypto.subtle.sign('HMAC', key, encoder.encode(recoveryMessage(userId, code))))
}

/** Whether `code` is the one `stored` holds the hash of: the plain hash, or a keyed one under a live secret. */
async function recoveryCodeMatches(ctx: Pick<EndpointCtx, 'context'>, userId: string, code: string, stored: string | null | undefined): Promise<boolean> {
  // Every hash is computed whether or not one matches, so the answer takes as long either way.
  let matched = constantTimeEqual(await recoveryHash(userId, code), stored ?? '')
  for (const secret of contextSecrets(ctx.context)) {
    if (constantTimeEqual(await keyedRecoveryHash(secret, userId, code), stored ?? '')) matched = true
  }
  return Boolean(stored) && matched
}

/** The part of an endpoint's or hook's context the helpers here use. */
interface EndpointCtx {
  context: {
    secret: string
    secretConfig?: AuthLibrarySecretConfig
    adapter: { findMany: (args: { model: string, where: Array<{ field: string, value: unknown }>, limit?: number }) => Promise<unknown[]> }
    internalAdapter: { updateUser: (userId: string, data: Record<string, unknown>) => Promise<unknown> }
  }
}

/** How many passkeys an account holds, counted up to two: all a check here needs. */
async function passkeyCount(ctx: Pick<EndpointCtx, 'context'>, userId: string): Promise<number> {
  return (await ctx.context.adapter.findMany({ model: 'passkey', where: [{ field: 'userId', value: userId }], limit: 2 })).length
}

/** The part of an endpoint's context that ends sessions. */
interface SessionsCtx {
  context: {
    internalAdapter: {
      listSessions: (userId: string) => Promise<Array<{ token: string }>>
      deleteSession: (token: string) => Promise<unknown>
    }
  }
}

/** End every session of an account but the one making the request. */
async function revokeOtherSessions(ctx: SessionsCtx, userId: string, keep: string): Promise<void> {
  for (const session of await ctx.context.internalAdapter.listSessions(userId)) {
    if (session.token !== keep) await ctx.context.internalAdapter.deleteSession(session.token)
  }
}

/** Issue a new recovery code for an account: stored as its hash, the earlier one gone. */
async function issueRecoveryCode(ctx: EndpointCtx, userId: string): Promise<string> {
  const code = newRecoveryCode()
  await ctx.context.internalAdapter.updateUser(userId, { passkeyOnly: true, recoveryCodeHash: await recoveryHash(userId, code) })
  return code
}

/** Tell a recovered account where its recovery code signed in, linking to the security page. Best effort. */
async function notifyRecovery<DM extends GenericDataModel>(runtime: AuthRuntime<DM> | undefined, user: PasskeyOnlyUser, endpoint: unknown): Promise<void> {
  const ctx = asMutationCtx(runtime?.ctx)
  if (!runtime?.email || !ctx) return
  const site = readEnv('SITE_URL') ?? ''
  try {
    await runtime.email.sendTemplate(ctx, 'passkeyRecovered', { email: user.email, requestedFrom: requestOrigin(endpoint), url: `${site}${runtime?.paths?.security ?? DEFAULT_SECURITY_PATH}` }, { locale: user.locale })
  }
  catch (error) {
    logBackend('warn', 'auth.recovery_notice_unsent', 'A passkey-only account was recovered, and its notice was not sent.', error)
  }
}

/** The plugin's options: whom the administrator route serves, and the request runtime the notice goes out through. */
export interface PasskeyOnlyOptions<DM extends GenericDataModel = GenericDataModel> {
  administrators: Administrators
  runtime?: AuthRuntime<DM>
}

/**
 * The passkey-only plugin: the account fields (`passkeyOnly`, and the
 * recovery code's hash, never returned), the recovery session's mark, and
 * the three routes.
 *
 * @internal
 */
export function passkeyOnlyPlugin<DM extends GenericDataModel>({ administrators, runtime }: PasskeyOnlyOptions<DM>) {
  return {
    id: PASSKEY_ONLY_PLUGIN.id,
    schema: PASSKEY_ONLY_PLUGIN.schema,
    endpoints: {
      setPasskeyOnly: createAuthEndpoint('/passkey-only/set', {
        method: 'POST',
        body: z.object({ enabled: z.boolean() }),
        use: [sessionMiddleware],
      }, async (ctx) => {
        const user = ctx.context.session.user as PasskeyOnlyUser
        if (!ctx.body.enabled) {
          await ctx.context.internalAdapter.updateUser(user.id, { passkeyOnly: false, recoveryCodeHash: null })
          return ctx.json({ recoveryCode: null })
        }
        if (await passkeyCount(ctx as unknown as EndpointCtx, user.id) === 0) throw authRefusal('invalid_input', { field: 'passkeys' })
        // On again: a new code, and the old one stops working.
        const recoveryCode = await issueRecoveryCode(ctx as unknown as EndpointCtx, user.id)
        // Every other session goes: one a code opened, maybe from a stolen
        // mailbox, must not outlive the switch that stops codes.
        await revokeOtherSessions(ctx as unknown as SessionsCtx, user.id, ctx.context.session.session.token)
        return ctx.json({ recoveryCode })
      }),
      signInWithRecoveryCode: createAuthEndpoint('/sign-in/recovery-code', {
        method: 'POST',
        body: z.object({ email: z.string(), recoveryCode: z.string() }),
      }, async (ctx) => {
        const address = ctx.body.email.trim().toLowerCase()
        const found = await ctx.context.internalAdapter.findUserByEmail(address)
        const user = found?.user as PasskeyOnlyUser | undefined
        // The same refusal whatever was wrong, and a MAC computed either way:
        // nobody learns whether the address has an account, or how it signs in.
        const matched = await recoveryCodeMatches(ctx as unknown as EndpointCtx, user?.id ?? 'none', ctx.body.recoveryCode, user?.recoveryCodeHash)
        if (!user?.passkeyOnly || !user.recoveryCodeHash || !matched) {
          throw authRefusal('invalid_input', { field: 'recoveryCode' })
        }
        // The code is used up before the session opens: a second use finds a new hash.
        const recoveryCode = await issueRecoveryCode(ctx as unknown as EndpointCtx, user.id)
        const session = await ctx.context.internalAdapter.createSession(user.id, true, {
          passkeyRecovery: true,
          expiresAt: new Date(Date.now() + RECOVERY_SESSION_SECONDS * 1000),
        }, true)
        // A hook that refuses throws; a session that still did not open is refused all the same.
        if (!session) throw authRefusal('forbidden', { reason: 'sign_in_refused' })
        await setSessionCookie(ctx, { session, user: user as never }, true)
        await notifyRecovery(runtime, user, ctx)
        return ctx.json({ token: session.token, user: { id: user.id, email: user.email, name: user.name }, recoveryCode })
      }),
      disablePasskeyOnly: createAuthEndpoint('/admin/disable-passkey-only', {
        method: 'POST',
        body: z.object({ userId: z.string() }),
        use: [sessionMiddleware],
      }, async (ctx) => {
        const caller = ctx.context.session.user as PasskeyOnlyUser
        if (!isAdministrator({ id: caller.id, role: caller.role }, administrators)) throw authRefusal('forbidden', { reason: 'role' })
        const target = await ctx.context.internalAdapter.findUserById(ctx.body.userId)
        if (!target) throw authRefusal('invalid_input', { field: 'userId' })
        // Another administrator's defence stays theirs, as their account is never visited.
        if (isAdministrator({ id: target.id, role: (target as PasskeyOnlyUser).role }, administrators)) throw authRefusal('forbidden', { reason: 'admin_target' })
        await ctx.context.internalAdapter.updateUser(target.id, { passkeyOnly: false, recoveryCodeHash: null })
        return ctx.json({ passkeyOnly: false })
      }),
    },
  } satisfies BetterAuthPlugin
}

/**
 * Tell the address a code was asked for that the account signs in with a
 * passkey, and how to recover without one: the `otp` email with reason
 * `passkey-only` and no code. Best effort: the answer the request gets is
 * the same either way.
 */
export async function sendPasskeyOnlyNotice<DM extends GenericDataModel>(runtime: AuthRuntime<DM> | undefined, ctx: AuthHookCtx, address: string): Promise<void> {
  const mutationCtx = asMutationCtx(runtime?.ctx)
  if (!runtime?.email || !mutationCtx) return
  const found = await ctx.context?.internalAdapter?.findUserByEmail(address.trim().toLowerCase())
  const locale = (found?.user as PasskeyOnlyUser | undefined)?.locale
  try {
    await runtime.email.sendTemplate(mutationCtx, 'otp', { email: address, otp: '', type: 'sign-in', reason: 'passkey-only', requestedFrom: requestOrigin(ctx) }, { locale })
  }
  catch (error) {
    logBackend('warn', 'auth.passkey_only_notice_unsent', 'A sign-in code was asked for a passkey-only account; the email saying so was not sent, and no code was.', error)
  }
}

/** Whether the account behind an address signs in with passkeys only. */
export async function passkeyOnlyAccount(ctx: AuthHookCtx, address: string): Promise<boolean> {
  // An in-process call without Better Auth's context reaches no account.
  const found = await ctx.context?.internalAdapter?.findUserByEmail(address.trim().toLowerCase())
  return (found?.user as PasskeyOnlyUser | undefined)?.passkeyOnly === true
}

/**
 * Hold a recovery session to saving a passkey: every other route is refused
 * as `forbidden`, reason `passkey_required` — the Convex token route
 * included, so no function runs as the account until a passkey is saved.
 * The session is read as the request guard reads it (`lenient` on the
 * routes that need none), and Better Auth caches it for the route.
 */
export async function assertRecoveryScope(ctx: AuthHookCtx, lenient: boolean): Promise<void> {
  if (RECOVERY_ROUTES.has(ctx.path)) return
  const session = await requestSession(ctx, { lenient }) as (Awaited<ReturnType<typeof requestSession>> & { session: { passkeyRecovery?: boolean | null } }) | null
  if (session?.session.passkeyRecovery) throw authRefusal('forbidden', { reason: 'passkey_required' })
}

/** The administrator's way out of a visit: it only gives power back, so a sandbox never holds it. */
const STOP_VISIT_PATH = '/admin/stop-impersonating'

/** A session row as the sandbox rule reads it. */
interface AdminSessionRow {
  userId?: string
  signInMethod?: string | null
  impersonatedBy?: string | null
}

/**
 * The administrator's own session behind a visit: the one Better Auth's
 * `admin_session` cookie names (signed, set when the visit began), when it
 * is still there and belongs to the visiting administrator. `null`
 * otherwise, which the rule refuses.
 */
async function visitingAdminSession(ctx: AuthHookCtx, adminId: string): Promise<AdminSessionRow | null> {
  const context = ctx.context as unknown as {
    secret?: string
    createAuthCookie?: (name: string) => { name: string }
    internalAdapter?: { findSession?: (token: string) => Promise<{ session: AdminSessionRow } | null> }
  } | undefined
  const getSignedCookie = (ctx as unknown as { getSignedCookie?: (name: string, secret: string) => Promise<string | null | false> }).getSignedCookie
  if (!context?.secret || !context.createAuthCookie || !context.internalAdapter?.findSession || !getSignedCookie) return null
  const signed = await getSignedCookie.call(ctx, context.createAuthCookie('admin_session').name, context.secret)
  const token = typeof signed === 'string' ? signed.split(':')[0] : ''
  if (!token) return null
  const found = await context.internalAdapter.findSession(token)
  return found?.session.userId === adminId ? found.session : null
}

/**
 * Refuse Better Auth's admin routes (`/admin/impersonate-user`,
 * `/admin/ban-user`, `/admin/set-role` and every other `/admin/*`, the
 * package's `/admin/disable-passkey-only` included) on a `sandbox`
 * deployment, by the rule the admin tier and the console refuse with
 * (`passkeyOnlyAdminRefusal`): the account passkey-only, read fresh, and
 * the session signed in to with a passkey (`session.signInMethod`) —
 * `forbidden`, reason `passkey_only_admin`, otherwise. A sandbox is a
 * public demo whose dev inbox anyone may read, so a sign-in code read there
 * must never reach admin, not even through a session the code opened before
 * the account turned passkey-only. During a visit it is the administrator's
 * own account and session that are checked (the visit's session was opened
 * by no sign-in). `/admin/stop-impersonating` stays open: it only gives
 * power back. A request with no session is left to the route, which
 * answers 401.
 */
export async function assertSandboxAdminPasskeyOnly(ctx: AuthHookCtx): Promise<void> {
  if (!ctx.path.startsWith('/admin/') || ctx.path === STOP_VISIT_PATH || !requiresPasskeyOnlyAdmins(backendEnvironment())) return
  const session = await requestSession(ctx, { lenient: true }) as (Awaited<ReturnType<typeof requestSession>> & { session: AdminSessionRow }) | null
  if (!session) return
  const visitBy = session.session.impersonatedBy
  const own = visitBy ? await visitingAdminSession(ctx, visitBy) : session.session
  const accountId = visitBy || session.user.id
  const internalAdapter = ctx.context?.internalAdapter as { findUserById?: (id: string) => Promise<unknown> } | undefined
  const account = (internalAdapter?.findUserById ? await internalAdapter.findUserById(accountId) : session.user) as PasskeyOnlyUser | null
  if (!own || passkeyOnlyAdminRefusal(account ?? {}, own.signInMethod, ctx.path)) throw authRefusal('forbidden', { reason: 'passkey_only_admin' })
}

/**
 * Refuse removing the last passkey of a passkey-only account, before the
 * route runs: `invalid_input` on `passkeys`. The account would lock itself
 * out; it allows codes again first.
 */
export async function assertKeepsAPasskey(ctx: AuthHookCtx): Promise<void> {
  if (ctx.path !== '/passkey/delete-passkey') return
  const session = await requestSession(ctx, { lenient: true })
  const user = session?.user as PasskeyOnlyUser | undefined
  if (!user?.passkeyOnly) return
  if (await passkeyCount(ctx as unknown as EndpointCtx, user.id) <= 1) throw authRefusal('invalid_input', { field: 'passkeys' })
}

/** What an after-hook reads of the route it ran for. */
interface AfterRoute {
  path?: string
  context: AuthHookCtx['context'] & { returned?: unknown, session?: { session?: { token?: string, passkeyRecovery?: boolean | null } } | null }
}

/**
 * Once a recovery session saved its passkey, it becomes an ordinary
 * session: the mark goes, and it lasts as long as any other.
 */
export async function releaseRecoverySession(ctx: AfterRoute): Promise<void> {
  if (ctx.path !== '/passkey/verify-registration') return
  const { returned, session } = ctx.context
  if (returned === undefined || returned instanceof Error || !session?.session?.passkeyRecovery || !session.session.token) return
  const seconds = ctx.context.options.session?.expiresIn ?? 7 * 24 * 60 * 60
  await ctx.context.internalAdapter.updateSession(session.session.token, { passkeyRecovery: false, expiresAt: new Date(Date.now() + seconds * 1000) })
}

/** Base64url of text, as WebAuthn writes a user handle. */
function base64url(text: string): string {
  return btoa(String.fromCharCode(...encoder.encode(text))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * The account's WebAuthn user handle: its id, base64url-encoded. Better Auth
 * gives every new passkey a random handle it never stores, so a browser
 * could not be told which passkeys the account still holds; one stable
 * handle per account is what the WebAuthn Signal API keys its signals on
 * (`signalAllAcceptedCredentials`, `signalCurrentUserDetails`), and what the
 * client sends them with.
 */
export function userHandleOf(userId: string): string {
  return base64url(userId)
}

/**
 * Give the registration options the account's stable user handle in place
 * of Better Auth's random one. The server never checks the handle when it
 * verifies the registration, so only the authenticator's record changes.
 */
export function stableUserHandle(ctx: AfterRoute): void {
  if (ctx.path !== '/passkey/generate-register-options') return
  const returned = ctx.context.returned as { user?: { id?: string } } | undefined
  const userId = (ctx.context.session as { user?: { id?: string } } | null | undefined)?.user?.id
  if (returned?.user && userId) returned.user.id = userHandleOf(userId)
}
