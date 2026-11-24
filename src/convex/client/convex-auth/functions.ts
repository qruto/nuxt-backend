import type { GenericCtx } from '@convex-dev/better-auth'
import {
  actionGeneric,
  type FunctionReference,
  type GenericActionCtx,
  type GenericDataModel,
  type GenericMutationCtx,
  mutationGeneric,
  queryGeneric,
} from 'convex/server'
import { type Infer, v } from 'convex/values'
import { REAUTHENTICATE_HEADER } from '../../constants.js'
import { CHALLENGE_HEADER, CLIENT_ADDRESS_HEADER, PROOF_HEADER } from '../../proof.js'
import { sessionClaims } from '../better-auth-options.js'
import { identitySessionId } from '../identity.js'
import { type ConvexAuthCore, type CoreTokenBundle, type CoreTtl, coreSessionIdOf } from './core.js'
import { type EngineFactory, type EngineResponse, jarCookieHeader, runEngine } from './engine.js'
import { ENGINE_SIGN_IN_PATHS, isEngineSignInPath, refusesEnginePath, scrubSessionTokens } from './paths.js'

// The functions a Convex Auth app exports from `backend/auth.ts`, which
// `setupAuth({ provider: 'convex-auth' })` builds:
//
// - `refreshSession`, `signOut` and `isAuthenticated`, the three Convex Auth
//   reads and writes `server/convex-auth.ts` names (`ConvexAuthApi`);
// - `signIn`, the one sign-in function, listed in `server/convex-auth.ts`'s
//   `signIn`: it runs an engine route that opens a session (a code, a
//   passkey, the recovery code, an administrator's visit) and answers the
//   Convex Auth session it opened, so the auth proxy keeps its refresh
//   token in an HttpOnly cookie;
// - `authRequest`, every other engine route, for the signed-in caller (or
//   nobody), with the same answer the route gives over HTTP.
//
// Each session the engine opens stands beside one of Convex Auth's core:
// the engine's session row names the core's (`authSessionId`), the core
// holds the refresh tokens and their rotation, and the access token is the
// backend component's, with the claims the engine's session gives.

/** What the browser sends of itself with every engine call. */
const vEngineClient = v.object({
  /** The browser's `navigator.userAgent`: the device the sessions list and the new-device alert name. */
  userAgent: v.optional(v.string()),
  /** The browser's languages, as an `Accept-Language` header. */
  language: v.optional(v.string()),
  /** The client's address, signed by the app's server (`/api/human-proof`): what the per-address limits key on. */
  address: v.optional(v.string()),
  /** The bot check's proof for this route, signed by the app's server. */
  proof: v.optional(v.string()),
  /** The challenge's answer, when the app shows one. */
  challenge: v.optional(v.string()),
})

/** One engine call, as the browser's transport makes it. */
export const vEngineCall = {
  method: v.union(v.literal('GET'), v.literal('POST')),
  path: v.string(),
  query: v.optional(v.record(v.string(), v.string())),
  body: v.optional(v.any()),
  /** The engine's cookies the browser holds (never a session's): a sign-in code's binding, the last sign-in method. */
  jar: v.optional(v.record(v.string(), v.string())),
  client: v.optional(vEngineClient),
  /** A sign-in again, held to the session the call carries. */
  reauthenticate: v.optional(v.boolean()),
  /** A passkey-only account's recovery session, which saves a passkey before it gets a Convex Auth session. */
  recoveryToken: v.optional(v.string()),
}

type EngineCall = Infer<ReturnType<typeof v.object<typeof vEngineCall>>>

/** What an engine call answers the browser: the route's status, body and the cookies it set. */
export interface EngineAnswer {
  status: number
  body: unknown
  cookies: Array<{ name: string, value: string, maxAge?: number }>
}

/** The backend component's functions the Convex Auth session layer calls. */
interface BackendRefs {
  adapter: {
    findOne: FunctionReference<'query', 'internal', { model: string, where?: Array<{ field: string, value: unknown, operator?: string }> }, unknown>
    updateOne: FunctionReference<'mutation', 'internal', { input: { model: string, where?: Array<{ field: string, value: unknown }>, update: Record<string, unknown> } }, unknown>
    create: FunctionReference<'mutation', 'internal', { input: { model: string, data: Record<string, unknown> } }, unknown>
    deleteOne: FunctionReference<'mutation', 'internal', { input: { model: string, where?: Array<{ field: string, value: unknown }> } }, unknown>
  }
  sessionTokens: {
    mint: FunctionReference<'mutation', 'internal', { subject: string, claims: Record<string, unknown>, expiresInSeconds: number }, string>
  }
}

/** A session row of the engine, as the adapter returns it. */
interface SessionRow {
  _id: string
  token: string
  userId: string
  expiresAt: number
  passkeyRecovery?: boolean | null
  impersonatedBy?: string | null
  authSessionId?: string | null
}

/** What `setupAuth` hands the Convex Auth session layer. */
export interface ConvexAuthSetup<DM extends GenericDataModel> {
  core: ConvexAuthCore
  backend: BackendRefs
  createAuth: EngineFactory<DM>
  ttl: CoreTtl
}

/** The `componentPath` the backend's core sessions record: the component whose engine signed the person in. */
const SESSION_COMPONENT = 'backend'

/** How long the administrator's own session waits aside during a visit: as long as a visit may last. */
const ADMIN_SESSION_SECONDS = 60 * 60

/** The verification row holding the administrator's session aside, by the visit's session. */
const adminSessionKey = (visitSessionId: string) => `convex-auth:admin-session:${visitSessionId}`

/** What runs functions: an action's ctx, or a mutation's, which takes more. */
type RunCtx = Pick<GenericActionCtx<GenericDataModel>, 'runQuery' | 'runMutation'>

/** The engine's session row for one of its tokens, or of one id. */
async function sessionRow(ctx: Pick<RunCtx, 'runQuery'>, backend: BackendRefs, field: '_id' | 'token' | 'authSessionId', value: string): Promise<SessionRow | null> {
  return await ctx.runQuery(backend.adapter.findOne, { model: 'session', where: [{ field, value }] }) as SessionRow | null
}

/** Claims as JSON: dates as ISO strings, as the engine's own tokens carried them. */
function asJson(claims: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(claims)) as Record<string, unknown>
}

/**
 * The access token of one engine session: the backend component's, with
 * the claims the session gives (`sessionClaims`) and its id. `null` when the
 * session or its account is gone, or the session may hold no token (a
 * recovery session, which saves a passkey first).
 */
async function mintAccessToken<DM extends GenericDataModel>(
  ctx: GenericMutationCtx<DM> | GenericActionCtx<DM>,
  setup: ConvexAuthSetup<DM>,
  sessionToken: string,
): Promise<string | null> {
  const auth = setup.createAuth(ctx as unknown as GenericCtx<DM>) as unknown as { $context: Promise<{ internalAdapter: { findSession: (token: string) => Promise<{ session: Record<string, unknown> & { id: string, expiresAt: Date }, user: Record<string, unknown> & { id: string } } | null> } }> }
  const found = await (await auth.$context).internalAdapter.findSession(sessionToken)
  if (!found || new Date(found.session.expiresAt).getTime() <= Date.now() || found.session.passkeyRecovery) return null
  let claims: Record<string, unknown>
  try {
    claims = sessionClaims(found)
  }
  catch {
    return null
  }
  return await ctx.runMutation(setup.backend.sessionTokens.mint, {
    subject: found.user.id,
    claims: asJson({ ...claims, sessionId: found.session.id }),
    expiresInSeconds: setup.ttl.accessTokenTtlSeconds,
  })
}

/**
 * Open the core session beside an engine session the engine just opened,
 * and answer its tokens with the backend's access token. `null` for a
 * session that may hold no token yet (a recovery session).
 */
async function openCoreSession<DM extends GenericDataModel>(
  ctx: GenericActionCtx<DM>,
  setup: ConvexAuthSetup<DM>,
  sessionToken: string,
): Promise<CoreTokenBundle | null> {
  const row = await sessionRow(ctx, setup.backend, 'token', sessionToken)
  if (!row || row.passkeyRecovery) return null
  // A session that stood beside a core session already (an administrator's own, back from a visit) leaves that one behind.
  if (row.authSessionId) await ctx.runMutation(setup.core.public.revokeSessions, { sessionIds: [row.authSessionId] })
  const opened = await ctx.runMutation(setup.core.public._internal_dangerous_signIn, {
    claims: { method: 'backend', profile: {} },
    componentPath: SESSION_COMPONENT,
    userId: row.userId,
    ...setup.ttl,
  })
  const authSessionId = coreSessionIdOf(opened.accessToken)
  if (!authSessionId) throw new Error('[nuxt-backend] Convex Auth answered an access token without a session.')
  await ctx.runMutation(setup.backend.adapter.updateOne, {
    input: { model: 'session', where: [{ field: '_id', value: row._id }], update: { authSessionId, expiresAt: opened.refreshTokenExpiresAt, updatedAt: Date.now() } },
  })
  const accessToken = await mintAccessToken(ctx, setup, sessionToken)
  if (!accessToken) {
    await ctx.runMutation(setup.core.public.revokeSessions, { sessionIds: [authSessionId] })
    return null
  }
  return { ...opened, accessToken }
}

/** The engine session the caller's identity names, read fresh. */
async function callerSession(ctx: Pick<GenericActionCtx<GenericDataModel>, 'auth' | 'runQuery'>, backend: BackendRefs): Promise<SessionRow | null> {
  const sessionId = identitySessionId(await ctx.auth.getUserIdentity())
  return sessionId ? await sessionRow(ctx, backend, '_id', sessionId) : null
}

/** The headers of an engine call: the session it runs as, and what the browser sent of itself. */
function engineHeaders(call: EngineCall, sessionToken: string | null, extraCookies?: string): Headers {
  const headers = new Headers()
  if (sessionToken) headers.set('authorization', `Bearer ${sessionToken}`)
  const client = call.client ?? {}
  if (client.userAgent) headers.set('user-agent', client.userAgent.slice(0, 512))
  if (client.language) headers.set('accept-language', client.language.slice(0, 256))
  if (client.address) headers.set(CLIENT_ADDRESS_HEADER, client.address)
  if (client.proof) headers.set(PROOF_HEADER, client.proof)
  if (client.challenge) headers.set(CHALLENGE_HEADER, client.challenge)
  if (call.reauthenticate) headers.set(REAUTHENTICATE_HEADER, '1')
  const cookie = [jarCookieHeader(call.jar), extraCookies].filter(Boolean).join('; ')
  if (cookie) headers.set('cookie', cookie)
  return headers
}

/** The answer of a route, its session tokens taken out: the browser holds the Convex Auth session, never the engine's. */
function answerOf(response: EngineResponse): EngineAnswer {
  return { status: response.status, body: scrubSessionTokens(response.body), cookies: response.cookies }
}

/**
 * The session an engine call runs as: the caller's, or the recovery
 * session the call names, which counts only while it is one. Signed out,
 * none.
 */
async function sessionTokenFor(ctx: GenericActionCtx<GenericDataModel>, backend: BackendRefs, call: EngineCall): Promise<string | null> {
  if (call.recoveryToken) {
    const row = await sessionRow(ctx, backend, 'token', call.recoveryToken)
    return row?.passkeyRecovery && row.expiresAt > Date.now() ? row.token : null
  }
  return (await callerSession(ctx, backend))?.token ?? null
}

type Ctx<DM extends GenericDataModel> = GenericActionCtx<DM>

/** Run one call through the engine as `sessionToken`'s session (or nobody), with a cookie the deployment adds. */
async function runCall<DM extends GenericDataModel>(ctx: Ctx<DM> | GenericMutationCtx<DM>, setup: ConvexAuthSetup<DM>, call: EngineCall, sessionToken: string | null, extraCookie?: string): Promise<EngineResponse> {
  return await runEngine(ctx as unknown as GenericCtx<DM>, setup.createAuth, {
    method: call.method,
    path: call.path,
    ...(call.query ? { query: call.query } : {}),
    body: call.body,
    headers: engineHeaders(call, sessionToken, extraCookie),
  })
}

/** Delete one row of the engine's, by id. */
async function deleteRow(ctx: RunCtx, backend: BackendRefs, model: 'session' | 'verification', id: string): Promise<void> {
  await ctx.runMutation(backend.adapter.deleteOne, { input: { model, where: [{ field: '_id', value: id }] } })
}

/**
 * Exchange a refresh token for a fresh session: the core rotates its
 * refresh token, and the access token is minted anew from the engine's
 * session, so a workspace switched or a field changed reaches the claims
 * at the next refresh. A core session whose engine session is gone
 * (signed out on another device, revoked, banned, deleted, expired) ends
 * here too.
 */
async function refresh<DM extends GenericDataModel>(ctx: GenericMutationCtx<DM>, setup: ConvexAuthSetup<DM>, refreshToken: string) {
  const { core, backend, ttl } = setup
  const result = await ctx.runMutation(core.public.refresh, { refreshToken, ...ttl })
  if (result.kind === 'noSession') return result
  const authSessionId = coreSessionIdOf(result.tokens.accessToken)
  const row = authSessionId ? await sessionRow(ctx, backend, 'authSessionId', authSessionId) : null
  const accessToken = row && row.expiresAt > Date.now() ? await mintAccessToken(ctx, setup, row.token) : null
  if (!row || !accessToken) {
    if (authSessionId) await ctx.runMutation(core.public.revokeSessions, { sessionIds: [authSessionId] })
    return { kind: 'noSession' as const }
  }
  // The engine's session lasts as long as the core's does now.
  await ctx.runMutation(backend.adapter.updateOne, {
    input: { model: 'session', where: [{ field: '_id', value: row._id }], update: { expiresAt: result.tokens.refreshTokenExpiresAt, updatedAt: Date.now() } },
  })
  return { kind: 'rotated' as const, tokens: { ...result.tokens, accessToken } }
}

/**
 * End the session of a refresh token: the engine signs its session out
 * (its hooks record it), and the core's goes. The core names its session
 * only through a refresh, so the token is refreshed once first; a token
 * that no longer refreshes has no session left to end.
 */
async function endSession<DM extends GenericDataModel>(ctx: GenericMutationCtx<DM>, setup: ConvexAuthSetup<DM>, refreshToken: string): Promise<null> {
  const { core, backend, ttl } = setup
  const result = await ctx.runMutation(core.public.refresh, { refreshToken, ...ttl })
  if (result.kind === 'noSession') return null
  const authSessionId = coreSessionIdOf(result.tokens.accessToken)
  await ctx.runMutation(core.public.signOut, { refreshToken: result.tokens.refreshToken })
  const row = authSessionId ? await sessionRow(ctx, backend, 'authSessionId', authSessionId) : null
  if (!row) return null
  const answer = await runCall(ctx, setup, { method: 'POST', path: '/sign-out' }, row.token)
  // An engine that could not sign it out still loses the session: the core's is gone already.
  if (answer.status >= 400) await deleteRow(ctx, backend, 'session', row._id)
  return null
}

/** The administrator's own session, kept aside while they visit, for the call that ends the visit. */
async function asideFor(ctx: RunCtx, backend: BackendRefs, call: EngineCall, caller: SessionRow | null): Promise<{ _id: string, value: string } | null> {
  if (call.path !== '/admin/stop-impersonating' || !caller) return null
  return await ctx.runQuery(backend.adapter.findOne, { model: 'verification', where: [{ field: 'identifier', value: adminSessionKey(caller._id) }] }) as { _id: string, value: string } | null
}

/** The sign-in's answer when the session it opened holds no token yet: a recovery session's, with its token for the passkey it saves. */
async function pendingSession(ctx: RunCtx, backend: BackendRefs, answer: EngineAnswer, sessionToken: string) {
  const row = await sessionRow(ctx, backend, 'token', sessionToken)
  return { status: 'error' as const, userError: { response: answer, ...(row?.passkeyRecovery ? { recoveryToken: row.token } : {}) } }
}

/**
 * Run an engine route that opens a session, and answer the Convex Auth
 * session it opened (`{ status: 'complete', tokens }`), with the route's
 * own answer beside it (`response`). A route that refused, or opened a
 * session that holds no token yet, answers `{ status: 'error',
 * userError }` with the route's answer: the recovery session's token
 * rides there, for the passkey it saves.
 */
async function signInWith<DM extends GenericDataModel>(ctx: Ctx<DM>, setup: ConvexAuthSetup<DM>, call: EngineCall) {
  const { core, backend } = setup
  if (!isEngineSignInPath(call.path)) throw new Error(`[nuxt-backend] signIn runs the routes that open a session (${[...ENGINE_SIGN_IN_PATHS].join(', ')}); ${call.path} goes through authRequest.`)
  const caller = await callerSession(ctx, backend)
  const aside = await asideFor(ctx, backend, call, caller)
  const response = await runCall(ctx, setup, call, await sessionTokenFor(ctx as never, backend, call), aside ? asideCookie(aside.value) : undefined)
  const answer = answerOf(response)
  if (response.status >= 400 || !response.sessionToken) return { status: 'error' as const, userError: { response: answer } }
  // A visit keeps the administrator's session aside, on the deployment, until it stops.
  if (call.path === '/admin/impersonate-user') await setAside(ctx, setup, response, caller)
  if (aside) await deleteRow(ctx, backend, 'verification', aside._id)
  const tokens = await openCoreSession(ctx, setup, response.sessionToken)
  if (!tokens) return await pendingSession(ctx, backend, answer, response.sessionToken)
  // The session a re-authentication, a visit or its end, or turning the authenticator app on replaced: its core session goes with it.
  if (caller?.authSessionId && caller.token !== response.sessionToken && (call.reauthenticate || call.path.startsWith('/admin/') || call.path.startsWith('/two-factor/'))) {
    await ctx.runMutation(core.public.revokeSessions, { sessionIds: [caller.authSessionId] })
  }
  return { status: 'complete' as const, tokens, response: answer }
}

/**
 * Run any other engine route for the caller: the account, its workspaces
 * and invitations, its passkeys, the administrator's console. Answers the
 * route's status, body and cookies, as the auth client reads them. The
 * routes that open or end a session are refused here.
 */
async function request<DM extends GenericDataModel>(ctx: Ctx<DM>, setup: ConvexAuthSetup<DM>, call: EngineCall): Promise<EngineAnswer> {
  const refused = refusesEnginePath(call.path)
  if (refused) return { status: 404, body: { code: 'NOT_FOUND', message: refused }, cookies: [] }
  const sessionToken = await sessionTokenFor(ctx as never, setup.backend, call)
  const response = await runCall(ctx, setup, call, sessionToken)
  // A session no route here should open is ended, never handed out.
  if (response.sessionToken && response.sessionToken !== sessionToken) {
    const opened = await sessionRow(ctx, setup.backend, 'token', response.sessionToken)
    if (opened) await deleteRow(ctx, setup.backend, 'session', opened._id)
  }
  return answerOf(response)
}

/**
 * The Convex Auth functions of the app: built once by `setupAuth`, and
 * re-exported from `backend/auth.ts`.
 */
export function convexAuthFunctions<DM extends GenericDataModel>(setup: ConvexAuthSetup<DM>) {
  return {
    refreshSession: mutationGeneric({
      args: { refreshToken: v.string() },
      handler: async (ctx, { refreshToken }) => await refresh(ctx as GenericMutationCtx<DM>, setup, refreshToken),
    }),
    signOut: mutationGeneric({
      args: { refreshToken: v.string() },
      handler: async (ctx, { refreshToken }) => await endSession(ctx as GenericMutationCtx<DM>, setup, refreshToken),
    }),
    /**
     * Whether the caller's access token names a live session: the engine's
     * session row, unexpired, and the core's beside it. The browser
     * subscribes to it, so a session ended anywhere signs it out at once.
     */
    isAuthenticated: queryGeneric({
      args: {},
      handler: async (ctx) => {
        const row = await callerSession(ctx, setup.backend)
        if (!row?.authSessionId || row.expiresAt <= Date.now()) return false
        return await ctx.runQuery(setup.core.public.getSession, { sessionId: row.authSessionId }) !== null
      },
    }),
    signIn: actionGeneric({ args: vEngineCall, handler: async (ctx, call) => await signInWith(ctx as Ctx<DM>, setup, call) }),
    // fallow-ignore-next-line security-sink -- `request` is the in-process Better Auth engine call below, not an outbound request; verified 2026-11-24
    authRequest: actionGeneric({ args: vEngineCall, handler: async (ctx, call): Promise<EngineAnswer> => await request(ctx as Ctx<DM>, setup, call) }),
  }
}

/** The administrator's session cookie kept aside (`{ name, value }` as JSON), as a `Cookie` header pair. */
function asideCookie(stored: string): string | undefined {
  try {
    const { name, value } = JSON.parse(stored) as { name?: unknown, value?: unknown }
    return typeof name === 'string' && typeof value === 'string' && /^[\w.-]+$/.test(name) ? `${name}=${encodeURIComponent(value)}` : undefined
  }
  catch {
    return undefined
  }
}

/** Keep the administrator's session aside while they visit an account: what ends the visit hands it back. */
async function setAside<DM extends GenericDataModel>(ctx: GenericActionCtx<DM>, setup: ConvexAuthSetup<DM>, response: EngineResponse, caller: SessionRow | null): Promise<void> {
  const cookie = [...response.allCookies.values()].find(entry => entry.name.endsWith('admin_session') && entry.value)
  const visit = response.sessionToken ? await sessionRow(ctx, setup.backend, 'token', response.sessionToken) : null
  if (!cookie || !visit) return
  const now = Date.now()
  await ctx.runMutation(setup.backend.adapter.create, {
    input: { model: 'verification', data: { identifier: adminSessionKey(visit._id), value: JSON.stringify({ name: cookie.name, value: cookie.value }), expiresAt: now + ADMIN_SESSION_SECONDS * 1000, createdAt: now, updatedAt: now } },
  })
  // The administrator's browser now holds the visit: their own core session waits, unreachable, until the visit ends.
  if (caller?.authSessionId) {
    await ctx.runMutation(setup.core.public.revokeSessions, { sessionIds: [caller.authSessionId] })
    await ctx.runMutation(setup.backend.adapter.updateOne, { input: { model: 'session', where: [{ field: '_id', value: caller._id }], update: { authSessionId: null } } })
  }
}
