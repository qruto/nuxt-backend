import type { GenericDataModel } from 'convex/server'
import type { AppEventType, BackendEventInput } from '../integrations/audit.js'
import type { DatabaseHooks } from './hooks.js'
import { type BackendEventType, eventRole } from '../events.js'
import { logBackend } from '../log.js'
import { type AuthHookCtx, requestSession } from './request-session.js'
import { type AuthRuntime, asMutationCtx, hookAdapter } from './runtime.js'

// The auth layer's write points on the shared event path: what a sign-in,
// a sign-out, a passkey, an email or a session change, a workspace's
// invitations, memberships and roles, an administrator's impersonation,
// role change and ban record on the audit trail. Sessions
// are read where Better Auth writes them (the session table's database
// hooks); every other event where its route answers (the package's
// after-hook), only once it went through. Recording never fails what it
// records: a failure is logged, and the request answers as it would have.

/** One event the auth layer records. */
type AuthEvent = BackendEventInput<BackendEventType | AppEventType>

/** Record an event through the app's audit instance, never failing the request. */
async function record<DM extends GenericDataModel>(runtime: AuthRuntime<DM> | undefined, event: AuthEvent | null): Promise<void> {
  const ctx = asMutationCtx(runtime?.ctx)
  if (!event || !runtime?.audit || !ctx) return
  try {
    await runtime.audit.recordBackendEvent(ctx as never, event)
  }
  catch (error) {
    logBackend('warn', 'audit.record_failed', `A ${event.type} event was not recorded; what it records went through.`, error)
  }
}

/**
 * A new account's sign-up on the activity trail, `account.created`: the
 * growth funnel's sign-up step, with the invite that admitted it. Never
 * fails the sign-up.
 */
export async function recordSignedUp<DM extends GenericDataModel>(runtime: AuthRuntime<DM> | undefined, user: { id: string }, invite: string | undefined): Promise<void> {
  await record(runtime, { type: 'account.created', actor: { userId: user.id }, subjectId: user.id, data: invite ? { invite: invite.slice(0, 64) } : {} })
}

/** What a hook's context carries of its request: the route's path, its request, its session. */
interface HookCarrier {
  path?: string
  request?: Request
  headers?: Headers
  body?: unknown
  context?: {
    session?: { user?: { id?: string }, session?: { impersonatedBy?: string | null } } | null
    returned?: unknown
  }
}

/** The object every hook of one request is handed: the raw request over HTTP, else the headers of an in-process call. */
function requestKey(ctx: HookCarrier): object | undefined {
  return ctx.request ?? ctx.headers
}

/** A route's signed-in caller, as the event's actor: the account, and the administrator behind an impersonated session. */
function actorOf(session: NonNullable<HookCarrier['context']>['session']): AuthEvent['actor'] | undefined {
  const userId = session?.user?.id
  if (!userId) return undefined
  const impersonatorId = session.session?.impersonatedBy
  return { userId, ...(impersonatorId ? { impersonatorId } : {}) }
}

/** The caller of the route a hook runs for, as the session the route read holds it. */
function callerOf(ctx: HookCarrier): AuthEvent['actor'] | undefined {
  return actorOf(ctx.context?.session)
}

/** How a route signs in, as the account's last sign-in method records it. */
const SIGN_IN_METHODS: Readonly<Record<string, string>> = {
  '/sign-in/email-otp': 'email-otp',
  '/email-otp/verify-email': 'email-otp',
  '/passkey/verify-authentication': 'passkey',
  '/sign-in/recovery-code': 'recovery-code',
}

/** A session row, as a database hook hands it. */
interface SessionRow {
  id?: string
  userId: string
  impersonatedBy?: string | null
}

/**
 * The event a new session records: an administrator's impersonation, a
 * re-authentication (`reauthenticating`, the request guard's answer), or a
 * sign-in by the route's method, else the account's last sign-in method.
 */
async function recordSessionCreated<DM extends GenericDataModel>(runtime: AuthRuntime<DM> | undefined, session: SessionRow, hookCtx: unknown, reauthenticating: boolean): Promise<void> {
  const target = session.id ? { targetId: session.id } : {}
  if (session.impersonatedBy) {
    await record(runtime, { type: 'admin.impersonation_started', actor: { userId: session.impersonatedBy }, subjectId: session.userId, ...target })
    return
  }
  const path = (hookCtx as HookCarrier | null)?.path ?? ''
  const method = SIGN_IN_METHODS[path] ?? await lastSignInMethod(hookCtx, session.userId)
  await record(runtime, {
    type: reauthenticating ? 'auth.reauthenticated' : 'auth.signed_in',
    actor: { userId: session.userId },
    ...target,
    data: method ? { method } : {},
  })
}

/** The account's last sign-in method, as Better Auth's `lastLoginMethod` plugin records it; `null` when it holds none. */
async function lastSignInMethod(hookCtx: unknown, userId: string): Promise<string | null> {
  const user = await hookAdapter(hookCtx)?.findOne({ model: 'user', where: [{ field: 'id', value: userId }] }) as { lastLoginMethod?: string | null } | null | undefined
  return user?.lastLoginMethod ?? null
}

/** The routes that sign a session out from elsewhere, by its owner. */
const OWNER_REVOKE_ROUTES = new Set(['/revoke-session', '/revoke-sessions', '/revoke-other-sessions'])

/** The routes that sign a session out from elsewhere, by an administrator. */
const ADMIN_REVOKE_ROUTES = new Set(['/admin/revoke-user-session', '/admin/revoke-user-sessions'])

/**
 * The event a session's end records, by the route that ended it: signing
 * out, being signed out from elsewhere, or an administrator's visit ending.
 * Anything else (a re-authentication replacing its session, an account's
 * deletion, an expired session swept) records nothing.
 */
async function recordSessionDeleted<DM extends GenericDataModel>(runtime: AuthRuntime<DM> | undefined, session: SessionRow, hookCtx: unknown): Promise<void> {
  const carrier = (hookCtx ?? {}) as HookCarrier
  const path = carrier.path ?? ''
  const target = session.id ? { targetId: session.id } : {}
  if (session.impersonatedBy) {
    if (path === '/admin/stop-impersonating' || path === '/sign-out') {
      await record(runtime, { type: 'admin.impersonation_stopped', actor: { userId: session.impersonatedBy }, subjectId: session.userId, ...target })
    }
    return
  }
  if (path === '/sign-out') {
    await record(runtime, { type: 'auth.signed_out', actor: { userId: session.userId }, ...target })
    return
  }
  if (OWNER_REVOKE_ROUTES.has(path)) {
    await record(runtime, { type: 'auth.session_revoked', actor: callerOf(carrier) ?? { userId: session.userId }, subjectId: session.userId, ...target })
    return
  }
  if (ADMIN_REVOKE_ROUTES.has(path)) {
    // The administrator, as the route's own session names them: never the
    // account itself, which would read as its owner signing it out.
    const administrator = callerOf(carrier)
    if (!administrator) {
      logBackend('warn', 'audit.record_failed', `An auth.session_revoked event of ${path} named no administrator, so it was not recorded; the session was signed out.`)
      return
    }
    await record(runtime, { type: 'auth.session_revoked', actor: administrator, subjectId: session.userId, ...target })
  }
}

/** What the before-hook noted of a request, for its route's event: who calls it, the role it changes. */
interface Noted {
  caller?: AuthEvent['actor']
  previousRole?: string | null
}

const noted = new WeakMap<object, Noted>()

/** Note what a request's event needs from before its route runs. */
function note(ctx: HookCarrier, value: Noted): void {
  const key = requestKey(ctx)
  if (key) noted.set(key, { ...noted.get(key), ...value })
}

/** The request's JSON body, or nothing. */
function bodyOf(ctx: HookCarrier): Record<string, unknown> {
  return ctx.body && typeof ctx.body === 'object' ? ctx.body as Record<string, unknown> : {}
}

/**
 * Before a route that records an event runs, note its caller and, for a
 * role-changing route, the role it replaces, so a change to the role
 * already held records nothing: the member's in the workspace, the
 * account's app-wide one. Like recording, noting never fails the route: a
 * failure is logged, and the event is recorded with what is known.
 */
export async function noteRouteBefore(ctx: AuthHookCtx): Promise<void> {
  if (!Object.hasOwn(ROUTE_EVENTS, ctx.path)) return
  try {
    await noteRoute(ctx)
  }
  catch (error) {
    logBackend('warn', 'audit.record_failed', `What the event of ${ctx.path} needs from before the route could not be read; the route runs.`, error)
  }
}

/** What {@link noteRouteBefore} notes, read as the route will read it. */
async function noteRoute(ctx: AuthHookCtx): Promise<void> {
  const carrier = ctx as unknown as HookCarrier
  // The after-hook's context does not carry the session a route's own
  // middleware read, so the caller is read here, as the route will read it.
  const caller = actorOf(await requestSession(ctx, { lenient: true }) as never)
  if (caller) note(carrier, { caller })
  const body = bodyOf(carrier)
  if (ctx.path === '/organization/update-member-role' && typeof body.memberId === 'string') {
    const member = await ctx.context.adapter.findOne<{ role?: unknown }>({ model: 'member', where: [{ field: 'id', value: body.memberId }] })
    note(carrier, { previousRole: eventRole(member?.role) })
  }
  else if (ctx.path === '/admin/set-role' && typeof body.userId === 'string') {
    const user = await ctx.context.adapter.findOne<{ role?: unknown }>({ model: 'user', where: [{ field: 'id', value: body.userId }] })
    note(carrier, { previousRole: eventRole(user?.role) ?? 'user' })
  }
}

type Returned = Record<string, unknown>
type RouteEvent = (returned: Returned, caller: NonNullable<AuthEvent['actor']>, request: { body: Record<string, unknown>, noted: Noted }) => AuthEvent | null

/** A field of a route's answer, as a string. */
function idOf(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined
}

/** A record within a route's answer. */
function recordOf(value: unknown): Returned {
  return value && typeof value === 'object' ? value as Returned : {}
}

/** A positive number of seconds, or none. */
function secondsOf(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined
}

/** How long a ban the route answered lasts from now, in whole seconds; none for a ban until lifted. */
function banLength(user: Returned): number | undefined {
  const ends = user.banExpires
  const at = ends instanceof Date || typeof ends === 'string' || typeof ends === 'number' ? new Date(ends).getTime() : Number.NaN
  return secondsOf(Math.round((at - Date.now()) / 1000))
}

/** The event each route records once it went through, from what it answered. */
const ROUTE_EVENTS: Readonly<Record<string, RouteEvent>> = {
  '/passkey/verify-registration': (passkey, actor) => {
    const targetId = idOf(passkey.id)
    return targetId ? { type: 'auth.passkey_added', actor, targetId } : null
  },
  '/passkey/delete-passkey': (_, actor, { body }) => ({ type: 'auth.passkey_removed', actor, ...(idOf(body.id) ? { targetId: idOf(body.id) } : {}) }),
  '/passkey-only/set': (_, actor, { body }) => typeof body.enabled === 'boolean' ? { type: 'auth.passkey_only_changed', actor, data: { enabled: body.enabled } } : null,
  // An administrator's turn of another account's codes is about that account: its owner reads it, and gets the email.
  '/admin/disable-passkey-only': (_, actor, { body }) => {
    const subjectId = idOf(body.userId)
    return subjectId ? { type: 'auth.passkey_only_changed', actor, subjectId, data: { enabled: false } } : null
  },
  '/email-otp/change-email': (_, actor) => ({ type: 'auth.email_changed', actor }),
  '/organization/create': (workspace, actor) => {
    const entityId = idOf(workspace.id)
    return entityId ? { type: 'workspace.created', actor, entityId } : null
  },
  '/organization/invite-member': (invitation, actor) => {
    const entityId = idOf(invitation.organizationId)
    const role = eventRole(invitation.role)
    return entityId && role ? { type: 'workspace.member_invited', actor, entityId, ...(idOf(invitation.id) ? { targetId: idOf(invitation.id) } : {}), data: { role } } : null
  },
  '/organization/accept-invitation': (answer, actor) => {
    const member = recordOf(answer.member)
    const entityId = idOf(member.organizationId)
    const role = eventRole(member.role)
    const invitationId = idOf(recordOf(answer.invitation).id)
    return entityId && role ? { type: 'workspace.invitation_accepted', actor, entityId, ...(invitationId ? { targetId: invitationId } : {}), data: { role } } : null
  },
  '/organization/remove-member': (answer, actor) => {
    const member = recordOf(answer.member)
    const entityId = idOf(member.organizationId)
    const subjectId = idOf(member.userId)
    return entityId && subjectId ? { type: 'workspace.member_removed', actor, subjectId, entityId, ...(idOf(member.id) ? { targetId: idOf(member.id) } : {}) } : null
  },
  '/organization/update-member-role': (member, actor, { noted }) => {
    const entityId = idOf(member.organizationId)
    const subjectId = idOf(member.userId)
    const role = eventRole(member.role)
    if (!entityId || !subjectId || !role || role === noted.previousRole) return null
    return { type: 'workspace.member_role_changed', actor, subjectId, entityId, ...(idOf(member.id) ? { targetId: idOf(member.id) } : {}), data: { role } }
  },
  '/admin/set-role': (_, actor, { body, noted }) => {
    const subjectId = idOf(body.userId)
    const role = eventRole(body.role)
    if (!subjectId || !role || role === noted.previousRole) return null
    return { type: 'admin.role_changed', actor, subjectId, data: { role } }
  },
  // The reason an administrator gives is free text, and stays off the trail.
  // A ban the request left open still ends when the app's defaultBanExpiresIn
  // says: its length is then read off the account the route answered.
  '/admin/ban-user': (answer, actor, { body }) => {
    const subjectId = idOf(body.userId)
    const expiresIn = secondsOf(body.banExpiresIn) ?? banLength(recordOf(answer.user))
    return subjectId ? { type: 'admin.user_banned', actor, subjectId, data: expiresIn ? { expiresIn } : {} } : null
  },
  '/admin/unban-user': (_, actor, { body }) => {
    const subjectId = idOf(body.userId)
    return subjectId ? { type: 'admin.user_unbanned', actor, subjectId } : null
  },
}

/**
 * Record the event of a route that went through, once it answered. A route
 * that refused records nothing, and neither does one with no signed-in
 * caller to name.
 */
export async function recordRouteEvent<DM extends GenericDataModel>(runtime: AuthRuntime<DM> | undefined, ctx: AuthHookCtx): Promise<void> {
  const carrier = ctx as unknown as HookCarrier
  const event = ROUTE_EVENTS[ctx.path]
  const key = requestKey(carrier)
  const request = { body: bodyOf(carrier), noted: (key && noted.get(key)) || {} }
  if (key) noted.delete(key)
  const returned = carrier.context?.returned
  if (!event || returned === undefined || returned instanceof Error) return
  const caller = request.noted.caller ?? callerOf(carrier)
  if (!caller) return
  await record(runtime, event(recordOf(returned), caller, request))
}

/**
 * The audit trail's database hooks, in a request that can record (an audit
 * instance and a ctx that runs mutations): a session opened or ended, by
 * the route that did it. A deleted account's rows are erased with the rest
 * of it (`setupAccount`, the package's own hook).
 * `reauthenticating` is the request guard's answer to whether a hook runs
 * for a re-authentication. `undefined` when nothing can be recorded.
 */
export function auditDatabaseHooks<DM extends GenericDataModel>(runtime: AuthRuntime<DM> | undefined, reauthenticating: (hookCtx: unknown) => boolean): DatabaseHooks | undefined {
  if (!runtime?.audit || !asMutationCtx(runtime.ctx)) return undefined
  return {
    session: {
      create: { after: async (session, hookCtx) => recordSessionCreated(runtime, session as SessionRow, hookCtx, reauthenticating(hookCtx)) },
      delete: { after: async (session, hookCtx) => recordSessionDeleted(runtime, session as SessionRow, hookCtx) },
    },
  }
}
