import type { Auth, FunctionReference, GenericActionCtx, GenericDataModel } from 'convex/server'
import { AUTH_TIME_CLAIM, IMPERSONATED_BY_CLAIM, RECENT_SIGN_IN_SECONDS, SIGN_IN_METHOD_CLAIM } from '../constants.js'
import { backendEnvironment } from '../delivery.js'
import { requiresPasskeyOnlyAdmins } from '../environment.js'
import { backendError } from '../errors.js'

// Who may call what. Every gated function of the package names its row —
// the access it needs, whether an administrator impersonating the caller may
// call it, and how recent a sign-in it takes (its row of the
// sensitive-action table) — and refuses through
// here, so a refusal reads the same wherever it comes from. Membership and
// roles are read fresh from the component's tables, never from the token: a
// removed member or a demoted admin is refused on their next call, not when
// their token expires. The runtime rows live beside the functions they gate
// (`BILLING_ACCESS` and `ADMIN_WRITE` in billing, the tiers of
// `createFunctions`, each auth function's own); the probe suite's registry
// (test/convex-component/authorization-policies.ts) mirrors them for every
// public function the scaffold ships, and calls each one as every kind of
// caller.

/**
 * How a session was opened, for the functions that refuse some kinds. An
 * impersonated session may read but not spend or change billing.
 */
export interface CallerRule {
  /** A session an administrator opened by impersonating the caller: `'allowed'` unless refused. */
  impersonation?: 'allowed' | 'refused'
  /**
   * How recent a sign-in it takes, in seconds since the person signed in to
   * the session (`RECENT_SIGN_IN_SECONDS`, the package's ten minutes, for
   * its own). An older one is refused as `reauthentication_required`, and
   * so is a token that names no session or carries no `authTime`; an
   * administrator's visit is refused as `forbidden` (reason
   * `impersonating`): no sign-in of the person's own stands behind it. A
   * mutation's or an action's rule only: a query is not rerun as time passes.
   */
  recentSignIn?: number
}

type AdapterWhere = Array<{ field: string, value: string | number | boolean | null }>
/** The component adapter's `findOne`, the read every fresh check goes through. */
export type AdapterFindOne = FunctionReference<'query', 'internal', { model: string, where?: AdapterWhere }, unknown>

/** A context that can run the adapter's queries. */
type ReadCtx = { runQuery: GenericActionCtx<GenericDataModel>['runQuery'] }

/** Whether a role list (Better Auth stores several comma-separated) holds one of `required`. */
export function hasAnyRole(roles: string, required: string | readonly string[]): boolean {
  const wanted = typeof required === 'string' ? [required] : required
  return roles.split(',').some(role => wanted.includes(role.trim()))
}

/** Who the admin plugin counts as an administrator: its admin roles, and the accounts it names by id. */
export interface Administrators {
  roles: readonly string[]
  userIds: readonly string[]
}

/** Whether an account is an administrator: it holds one of the admin roles, or the admin plugin names it by id. */
export function isAdministrator(account: { id: string, role?: unknown }, administrators: Administrators): boolean {
  if (administrators.userIds.includes(account.id)) return true
  return typeof account.role === 'string' && hasAnyRole(account.role, administrators.roles)
}

/**
 * The refusal of a caller the rule refuses, by the claims of its token: a
 * session an administrator opened by impersonating them (`forbidden`,
 * reason `impersonating`); `null` for anyone it lets through. `what` names
 * the call in the deployment log.
 */
export function callerRefusal(claims: Record<string, unknown>, rule: CallerRule, what: string): Error | null {
  // Anything but an explicit 'allowed' refuses: a misspelt rule fails closed.
  const refusesImpersonation = rule.impersonation !== undefined && rule.impersonation !== 'allowed'
  if (refusesImpersonation && typeof claims[IMPERSONATED_BY_CLAIM] === 'string') {
    return backendError('forbidden', { reason: 'impersonating' }, `[nuxt-backend] ${what}: an administrator acting as this account cannot do this.`)
  }
  return rule.recentSignIn === undefined ? null : signInRefusal(claims, rule.recentSignIn, what)
}

/**
 * The refusal of a caller whose sign-in is older than `seconds`, by the
 * claims of its token; `null` for a recent one. Fails closed: an
 * administrator's visit, a token that names no session and one without
 * `authTime` are never a recent sign-in.
 */
export function signInRefusal(claims: Record<string, unknown>, seconds: number, what: string): Error | null {
  if (typeof claims[IMPERSONATED_BY_CLAIM] === 'string') {
    return backendError('forbidden', { reason: 'impersonating' }, `[nuxt-backend] ${what}: needs the account's own recent sign-in, which an administrator acting as it cannot give.`)
  }
  const authTime = claims[AUTH_TIME_CLAIM]
  const fresh = typeof claims.sessionId === 'string' && typeof authTime === 'number' && Number.isFinite(authTime)
    && Date.now() - authTime <= seconds * 1000
  if (fresh) return null
  return backendError('reauthentication_required', {}, `[nuxt-backend] ${what}: needs a sign-in from the last ${seconds} seconds; sign in again, then retry.`)
}

/**
 * Throw {@link signInRefusal}'s refusal when `seconds` names a window and
 * the caller's sign-in is older. The checks that read a role or a
 * membership make this one last: someone who may not act at all is told so,
 * never asked to sign in again first.
 */
export function refuseStaleSignIn(claims: Record<string, unknown>, seconds: number | undefined, what: string): void {
  const refused = seconds === undefined ? null : signInRefusal(claims, seconds, what)
  if (refused) throw refused
}

/**
 * The id of the account an account's own call is for, or the refusal: nobody
 * signed in (`unauthenticated`), or an administrator acting as the account
 * (`forbidden`, `impersonating`). `what` names the call in the message.
 */
export async function ownCaller(ctx: { auth: { getUserIdentity: () => Promise<{ subject: string } | null> } }, what: string): Promise<string> {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) throw backendError('unauthenticated', {}, `[nuxt-backend] ${what}: sign in first.`)
  refuseCaller(identity as unknown as Record<string, unknown>, { impersonation: 'refused' }, what)
  return identity.subject
}

/** Throw {@link callerRefusal}'s refusal, if the rule refuses the caller. */
export function refuseCaller(claims: Record<string, unknown>, rule: CallerRule, what: string): void {
  const refused = callerRefusal(claims, rule, what)
  if (refused) throw refused
}

/** An account as a fresh check reads it. */
export interface AccountNow {
  role: string
  banned: boolean
  /** Whether it signs in with passkeys only, refusing sign-in codes. */
  passkeyOnly: boolean
}

/**
 * The refusal of an administrator who may not act as one here: on a
 * `sandbox` deployment, a public demo whose dev inbox anyone may read, an
 * administrator's account must be passkey-only AND this very session must
 * have been signed in to with a passkey (the `signInMethod` claim, the
 * session's own) — `forbidden`, reason `passkey_only_admin`. A session a
 * code opened before the account turned passkey-only stays a code's
 * session, so a code read from that inbox never reaches admin. `null`
 * everywhere else. Every admin gate of the package asks this one rule:
 * the tiers, the console's reads and writes, billing's, the audit trail's,
 * the health detail's, and (by the session row) Better Auth's `/admin/*`.
 */
export function passkeyOnlyAdminRefusal(account: { passkeyOnly?: boolean | null }, signInMethod: unknown, what: string): Error | null {
  if (!requiresPasskeyOnlyAdmins(backendEnvironment())) return null
  if (account.passkeyOnly === true && signInMethod === 'passkey') return null
  return backendError('forbidden', { reason: 'passkey_only_admin' }, `[nuxt-backend] ${what}: on a sandbox deployment, an administrator signs in with a passkey, on an account that signs in with passkeys only. Turn on passkey-only sign-in for this account, then sign in with the passkey.`)
}

/** The session's own sign-in method, as its token's claims say; none for an administrator's visit. */
export function claimedSignInMethod(claims: Record<string, unknown>): unknown {
  return typeof claims[IMPERSONATED_BY_CLAIM] === 'string' ? null : claims[SIGN_IN_METHOD_CLAIM]
}

/**
 * The sandbox rule ({@link passkeyOnlyAdminRefusal}) for a caller a gate
 * already found to be an administrator, reading their account fresh: for
 * the gates that decide the role their own way (billing's, the audit
 * trail's). `null` off a sandbox, without a read.
 */
export async function sandboxAdminRefusal(
  ctx: ReadCtx,
  reads: Pick<ReturnType<typeof createAccessReads>, 'account'>,
  identity: { subject: string },
  what: string,
): Promise<Error | null> {
  if (!requiresPasskeyOnlyAdmins(backendEnvironment())) return null
  const account = await reads.account(ctx, identity.subject)
  return passkeyOnlyAdminRefusal(account ?? {}, claimedSignInMethod(identity as unknown as Record<string, unknown>), what)
}

/**
 * The reads a fresh check makes, through the component's auth adapter. Each
 * is made once per function invocation: a function that checks the same
 * caller twice (a checkout checks who is asking before and after its input)
 * reads the member table once, and sees the row as it was at that first
 * read. Pass `reread: true` to read again, after the same call changed the
 * membership or the role it checks.
 */
export function createAccessReads(findOne: AdapterFindOne) {
  const reads = new WeakMap<object, Map<string, Promise<unknown>>>()
  const once = <T>(ctx: ReadCtx, key: string, reread: boolean | undefined, read: () => Promise<T>): Promise<T> => {
    let byKey = reads.get(ctx)
    if (!byKey) reads.set(ctx, byKey = new Map())
    if (reread || !byKey.has(key)) byKey.set(key, read())
    return byKey.get(key) as Promise<T>
  }

  return {
    /** The caller's role in a workspace, as the member table holds it now; `null` when they are no member of it. */
    memberRole: (ctx: ReadCtx, userId: string, workspaceId: string, reread?: boolean): Promise<string | null> =>
      once(ctx, `member:${workspaceId}:${userId}`, reread, async () => {
        const member = await ctx.runQuery(findOne, {
          model: 'member',
          where: [{ field: 'organizationId', value: workspaceId }, { field: 'userId', value: userId }],
        }) as { role?: string | null } | null
        return member ? member.role || 'member' : null
      }),
    /** A workspace's slug and name, as the workspace table holds them now; `null` once it is deleted. */
    workspace: (ctx: ReadCtx, workspaceId: string, reread?: boolean): Promise<{ slug: string, name: string } | null> =>
      once(ctx, `workspace:${workspaceId}`, reread, async () => {
        const workspace = await ctx.runQuery(findOne, { model: 'organization', where: [{ field: '_id', value: workspaceId }] }) as { slug?: string | null, name?: string | null } | null
        return workspace ? { slug: workspace.slug ?? '', name: workspace.name ?? '' } : null
      }),
    /** The account as the user table holds it now: its app-wide role (`'user'` when unset), ban and passkey-only switch; `null` once it is deleted. */
    account: (ctx: ReadCtx, userId: string, reread?: boolean): Promise<AccountNow | null> =>
      once(ctx, `user:${userId}`, reread, async () => {
        const user = await ctx.runQuery(findOne, { model: 'user', where: [{ field: '_id', value: userId }] }) as { role?: string | null, banned?: boolean | null, passkeyOnly?: boolean | null } | null
        return user ? { role: user.role || 'user', banned: user.banned === true, passkeyOnly: user.passkeyOnly === true } : null
      }),
  }
}

/**
 * Whether the caller is an administrator now, in person: a person's own
 * session (never an administrator acting as someone), whose account is live and is an administrator, its role read
 * fresh, and on a sandbox deployment passkey-only and signed in to with a passkey ({@link passkeyOnlyAdminRefusal}). The admin console's reads and the flags' list answer `null` to
 * anyone else.
 */
export async function isAdministratorNow(
  ctx: ReadCtx & { auth: Auth },
  reads: Pick<ReturnType<typeof createAccessReads>, 'account'>,
  administrators: Administrators,
  what: string,
): Promise<boolean> {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) return false
  if (callerRefusal(identity as unknown as Record<string, unknown>, { impersonation: 'refused' }, what)) return false
  const account = await reads.account(ctx, identity.subject)
  return Boolean(account && !account.banned && isAdministrator({ id: identity.subject, role: account.role }, administrators) && !passkeyOnlyAdminRefusal(account, claimedSignInMethod(identity as unknown as Record<string, unknown>), what))
}

/**
 * Refuse a read by anyone but an administrator now, in person:
 * `unauthenticated`; `forbidden` for an administrator acting as someone
 * (`impersonating`) and anyone without an admin role (`admin_only`), or
 * an administrator a sandbox refuses (`passkey_only_admin`). No
 * recent sign-in: a read changes nothing. Answers the administrator's
 * account id.
 */
export async function requireAdministratorNow(
  ctx: ReadCtx & { auth: Auth },
  reads: Pick<ReturnType<typeof createAccessReads>, 'account'>,
  administrators: Administrators,
  what: string,
): Promise<string> {
  if (!await ctx.auth.getUserIdentity()) throw backendError('unauthenticated', {}, `[nuxt-backend] ${what} is for administrators: sign in as one.`)
  // In person first: a visit is refused as `impersonating`, whoever's account it is.
  const userId = await ownCaller(ctx, what)
  if (!await isAdministratorNow(ctx, reads, administrators, what)) {
    // An administrator a sandbox refuses is told why: the read is the one isAdministratorNow made.
    const account = await reads.account(ctx, userId)
    const claims = ((await ctx.auth.getUserIdentity()) ?? {}) as Record<string, unknown>
    const passkey = account && !account.banned && isAdministrator({ id: userId, role: account.role }, administrators) ? passkeyOnlyAdminRefusal(account, claimedSignInMethod(claims), what) : null
    throw passkey ?? backendError('forbidden', { reason: 'admin_only' }, `[nuxt-backend] ${what} is for administrators.`)
  }
  return userId
}

/**
 * Refuse a change by anyone but an administrator now, in person and
 * recently signed in: `unauthenticated`; `forbidden` for an administrator
 * acting as someone (`impersonating`) and anyone without an admin role
 * (`admin_only`); then, for an administrator, `reauthentication_required`.
 * Answers the administrator's account id.
 */
export async function requireAdministratorInPerson(
  ctx: ReadCtx & { auth: Auth },
  reads: Pick<ReturnType<typeof createAccessReads>, 'account'>,
  administrators: Administrators,
  what: string,
): Promise<string> {
  const userId = await requireAdministratorNow(ctx, reads, administrators, what)
  refuseStaleSignIn(((await ctx.auth.getUserIdentity()) ?? {}) as Record<string, unknown>, RECENT_SIGN_IN_SECONDS, what)
  return userId
}
