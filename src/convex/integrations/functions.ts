import { customAction, customCtx, customMutation, customQuery } from 'convex-helpers/server/customFunctions'
import type { ActionBuilder, GenericDataModel, MutationBuilder, QueryBuilder } from 'convex/server'
import { refuseStaleSignIn } from './access.js'
import { type AuthorizationComponents, type AuthorizationCtx, type AuthorizationUser, type CallerRule, createAuthorization, defineSetUserRole } from './authorization.js'
import { RECENT_SIGN_IN_SECONDS } from '../constants.js'
import { backendError } from '../errors.js'
import { logBackend } from '../log.js'
import { CALL_METHOD, deploymentAudience, isActionName, isProofFormat, proofSubject, proofVisitor, protectionEnv, TEST_CHALLENGE_SECRET_KEYS, verifyProof, VISITOR_METHOD } from '../proof.js'
import { rememberVisitor } from '../visitor.js'
import { reportingErrors } from './monitoring.js'

// The error catalog: throw a refusal by code, read one back from anything a call threw.
export { BACKEND_ERRORS, backendError, getBackendError } from '../errors.js'
export type { BackendError, BackendErrorArgs, BackendErrorCode, BackendErrorData, BackendErrorPayload } from '../errors.js'

/**
 * The sensitive-action table, and the one window a recent sign-in counts
 * in: every auth route and every public write the scaffold ships, with how
 * recent a sign-in it takes, whether an administrator impersonating the
 * account may, and the limits it spends.
 */
export { RECENT_SIGN_IN_SECONDS } from '../constants.js'
export { SENSITIVE_ACTIONS } from '../sensitive-actions.js'

// Data that ages out, and the token helpers: a secret in a table is stored as its hash.
export { defineRetention } from './retention.js'
export type { RetentionArgs, RetentionOptions, RetentionResult } from './retention.js'
export { normalizeEmail, randomToken, sha256Hex } from '../tokens.js'
export type { SensitiveAction, SensitiveLimit } from '../sensitive-actions.js'
export type { AuthorizationComponents, AuthorizationCtx, AuthorizationUser as FunctionUser, AuthorizationWorkspace, CallerRule } from './authorization.js'

/** The workspace context the `workspace` tier injects as `ctx.workspace`. */
export interface FunctionWorkspace {
  id: string
  slug: string
  name: string
  /** The caller's role within the workspace: `owner`, `admin` or `member`. */
  role: string
}

/**
 * What a tier's function may declare beside `args` and `handler`: how
 * recent a sign-in it takes, and whether an administrator's visit to the
 * account may call it.
 */
export interface FunctionDeclaration {
  /**
   * A sensitive action: `true` takes a sign-in from the last ten minutes
   * (`RECENT_SIGN_IN_SECONDS`), a number from the last that many seconds.
   * An older one is refused as `reauthentication_required`, which
   * `useReauthentication` answers by asking the person to sign in again; an
   * administrator's visit never passes. The `admin`
   * tier's mutations and actions take a recent sign-in unless they say
   * `false`. A query cannot take one: it is not rerun as time passes, so
   * its window would not hold, and defining one that says so throws.
   */
  recentSignIn?: boolean | number
  /**
   * `'refused'` refuses a session an administrator opened by impersonating
   * the account (`forbidden`, reason `impersonating`): for a function where
   * a person's money or access is at stake. `'allowed'`, the default, lets
   * the visit in. The `admin` tier's mutations and actions refuse it always.
   */
  impersonation?: 'allowed' | 'refused'
}

/** How recent a sign-in a function declared, in seconds, or none; `fallback` when it declared nothing. */
function signInWindow(declared: boolean | number | undefined, fallback: number | undefined): number | undefined {
  if (declared === undefined) return fallback
  if (declared === false) return undefined
  if (declared === true) return RECENT_SIGN_IN_SECONDS
  if (!Number.isFinite(declared) || declared <= 0) {
    throw new TypeError(`[nuxt-backend] recentSignIn is true, false or a number of seconds above 0, not ${String(declared)}.`)
  }
  return declared
}

/** The caller rule a function's declaration asks for, beside its tier's own. */
function declaredRule({ recentSignIn, impersonation }: FunctionDeclaration, writesSignIn: number | undefined): CallerRule {
  const within = signInWindow(recentSignIn, writesSignIn)
  return {
    ...(within === undefined ? {} : { recentSignIn: within }),
    ...(impersonation === 'refused' ? { impersonation } : {}),
  }
}

/**
 * A tier's builder that checks the definition's `recentSignIn` and
 * `impersonation` when the function is defined, so a wrong one fails the
 * push rather than its first call: a window is `true`, `false` or seconds
 * above 0, and a query takes none (it is not rerun as time passes, and must
 * not read the clock); `impersonation` is `'allowed'` or `'refused'`.
 */
function checkingDeclaration<Builder>(builder: Builder, kind: 'query' | 'write'): Builder {
  const build = builder as unknown as (definition: unknown) => unknown
  return ((definition: unknown) => {
    const declared: FunctionDeclaration = typeof definition === 'object' && definition !== null ? definition as FunctionDeclaration : {}
    if (kind === 'query' && declared.recentSignIn !== undefined && declared.recentSignIn !== false) {
      throw new TypeError('[nuxt-backend] recentSignIn is for mutations and actions: a query is not rerun as time passes, so it cannot hold a window. Ask in the mutation or action the sensitive step runs in.')
    }
    signInWindow(declared.recentSignIn, undefined)
    if (declared.impersonation !== undefined && declared.impersonation !== 'allowed' && declared.impersonation !== 'refused') {
      throw new TypeError(`[nuxt-backend] impersonation is 'allowed' or 'refused', not ${JSON.stringify(declared.impersonation)}.`)
    }
    return build(definition)
  }) as unknown as Builder
}

/** A rate limiter compatible with `setupRateLimiter(...)` from `nuxt-backend/rate-limit`. */
export interface FunctionsRateLimiter {
  // A method signature, not a function-typed property: methods are compared
  // bivariantly, so `setupRateLimiter`'s limiter, whose names and options are
  // typed by its own limits, still assigns to this shape.
  limit(ctx: never, name: never, options?: never): Promise<unknown>
}

/**
 * What the `withFeature` tier needs of the app's billing: `setupBilling`'s
 * return satisfies it.
 */
export interface FunctionsBilling {
  requireFeature(ctx: AuthorizationCtx, feature: string): Promise<void>
}

/** The generated `components` the tiers read the `backend` component's tables through. */
export type FunctionsComponents = AuthorizationComponents

export interface CreateFunctionsOptions {
  /** Your generated `components` (`./_generated/api`): the tiers read the `backend` component's tables. */
  components: FunctionsComponents
  /**
   * Your `setupBilling` instance (`./billing`). It enables `withFeature`,
   * which checks a plan's features against it. `billing.ts` imports nothing
   * from `functions.ts`, so the two files never import each other.
   */
  billing?: FunctionsBilling
  /** Your `setupRateLimiter` instance, to guard the tiers' writes with `limits`. */
  rateLimiter?: FunctionsRateLimiter
  /**
   * A named rate limit per tier, spent on its **mutations and actions**
   * (keyed by user id; queries are reads and spend none). `{ authed: 'write' }`
   * with a matching limit in `setupRateLimiter`. `withRole` spends `authed`'s,
   * and `withFeature` `workspace`'s.
   */
  limits?: Partial<Record<'authed' | 'workspace' | 'admin', string>>
  /** App-wide roles that pass the `admin` tier. Default `['admin']`. */
  adminRoles?: string[]
}

type Builders<DM extends GenericDataModel> = {
  query: QueryBuilder<DM, 'public'>
  mutation: MutationBuilder<DM, 'public'>
  action: ActionBuilder<DM, 'public'>
}

type ActionHandler = (ctx: unknown, ...args: unknown[]) => Promise<unknown>

/**
 * A tier's action builder whose handlers report what they throw to the
 * monitoring service (`reportingErrors`), then rethrow it. Only an action
 * can post a report; the tier's own refusals happen before the handler and
 * are never reported. The builder's types pass through untouched.
 */
function reportingActions<Builder>(builder: Builder): Builder {
  const build = builder as unknown as (definition: unknown) => unknown
  return ((definition: ActionHandler | { handler: ActionHandler }) => typeof definition === 'function'
    ? build(reportingErrors(definition))
    : build({ ...definition, handler: reportingErrors(definition.handler) })) as unknown as Builder
}

/**
 * Every access tier of your backend, from one call in `backend/functions.ts`:
 * each a drop-in `{ query, mutation, action }` that checks the caller before
 * the handler runs.
 *
 * ```ts
 * // backend/functions.ts
 * import { createFunctions } from 'nuxt-backend/functions'
 * import { billing } from './billing'
 * import { rateLimiter } from './rateLimiter'
 * import { components } from './_generated/api'
 * import { action, mutation, query } from './_generated/server'
 *
 * export const { authed, workspace, admin, withRole, withFeature, setUserRole } = createFunctions(
 *   { query, mutation, action },
 *   { components, billing, rateLimiter, limits: { authed: 'write', workspace: 'write' } },
 * )
 *
 * // backend/strips.ts
 * export const create = workspace.mutation({ // ctx.user + ctx.workspace (fresh membership)
 *   args: { title: v.string() },
 *   handler: async (ctx, { title }) =>
 *     ctx.db.insert('strips', { title, workspaceId: ctx.workspace.id }),
 * })
 * ```
 *
 * The `workspace` tier verifies membership with a fresh member-table read on every
 * call (a removed member is locked out immediately, not at token expiry). The
 * `admin` tier reads the role fresh too, so a demoted admin is refused on
 * their next call, and its mutations and actions refuse a session an
 * administrator opened by impersonating someone (`forbidden`, reason
 * `impersonating`): an admin write is a person's own act. The mutations
 * and actions of every tier read the account fresh, so a ban, a deletion
 * or (for `withRole`) a role change lands on the next write; `authed` and
 * `withRole` queries read the token's claims, which can lag by up to its
 * 15-minute lifetime.
 *
 * Every tier's action reports a crash of its handler, or an `unavailable`
 * refusal, to the monitoring service `MONITORING_DSN` names
 * (`nuxt-backend/monitoring`), then rethrows it. Pass your
 * trigger-wrapped `mutation` to keep aggregate triggers composing.
 *
 * A function declares `recentSignIn` beside `args` for a sign-in from the
 * last ten minutes (`true`) or a number of seconds, and
 * `impersonation: 'refused'` to refuse an administrator's visit. The
 * `admin` tier's mutations and actions take a recent sign-in by default.
 *
 * `setUserRole` is the internal mutation that sets an app-wide role by
 * email: `npx nuxt-backend doctor --fix` runs it to make your first
 * administrator.
 */
export function createFunctions<DM extends GenericDataModel>(
  builders: Builders<DM>,
  options: CreateFunctionsOptions,
) {
  if (!options?.components?.backend?.adapter) {
    throw new TypeError('[nuxt-backend] createFunctions takes your generated components: createFunctions({ query, mutation, action }, { components }), with components from ./_generated/api.')
  }
  // The type allows leaving billing out, but a `billing` key whose value is
  // `undefined` is an import cycle: billing.ts (or a file it imports, such as
  // email.ts or audit.ts) imports functions.ts, so `billing` is not set yet
  // as this call runs. Left alone, withFeature would refuse every function
  // at the push, naming an option that is there.
  if ('billing' in options && options.billing === undefined) {
    throw new TypeError('[nuxt-backend] createFunctions got `billing` as undefined: an import cycle runs through billing.ts. functions.ts imports billing.ts, so billing.ts and the files it imports (email.ts, audit.ts) must not import functions.ts. Move what they build on the tiers into a file of its own.')
  }
  const authorization = createAuthorization(options.components)
  const adminRoles = options.adminRoles ?? ['admin']

  const consumeLimit = async (ctx: AuthorizationCtx, tierName: keyof NonNullable<CreateFunctionsOptions['limits']>, user: AuthorizationUser) => {
    const name = options.limits?.[tierName]
    if (!name || !options.rateLimiter) return
    await options.rateLimiter.limit(ctx as never, name as never, { key: user.id, throws: true } as never)
  }

  // `write` is set for mutations and actions: a tier may hold them to more
  // than its reads. The rule is the function's own declaration, beside `args`
  // and `handler`: how recent a sign-in it takes (`writesSignIn` when a
  // write says nothing) and whether an administrator's visit may call it.
  const tier = <Extra extends { user: AuthorizationUser }>(
    tierName: keyof NonNullable<CreateFunctionsOptions['limits']>,
    resolve: (ctx: AuthorizationCtx, write: boolean, rule: CallerRule) => Promise<Extra>,
    writesSignIn?: number,
  ) => {
    const write = async (ctx: unknown, declared: FunctionDeclaration) => {
      const extra = await resolve(ctx as AuthorizationCtx, true, declaredRule(declared, writesSignIn))
      await consumeLimit(ctx as AuthorizationCtx, tierName, extra.user)
      return extra
    }
    const read = (ctx: unknown, declared: FunctionDeclaration) => resolve(ctx as AuthorizationCtx, false, declaredRule({ impersonation: declared.impersonation }, undefined))
    return {
      query: checkingDeclaration(customQuery(builders.query, customCtx((ctx, declared: FunctionDeclaration) => read(ctx, declared))), 'query'),
      mutation: checkingDeclaration(customMutation(builders.mutation, customCtx((ctx, declared: FunctionDeclaration) => write(ctx, declared))), 'write'),
      action: checkingDeclaration(reportingActions(customAction(builders.action, customCtx((ctx, declared: FunctionDeclaration) => write(ctx, declared)))), 'write'),
    }
  }

  return {
    /**
     * Signed-in (and not banned): injects `ctx.user`. Its mutations and
     * actions read the account fresh, so a ban lands at once; its queries
     * read the token's claims.
     */
    authed: tier('authed', async (ctx, write, rule) => ({ user: await authorization.requireUser(ctx, { ...rule, fresh: write }) })),
    /**
     * Workspace member (fresh check): injects `ctx.user` + `ctx.workspace`
     * (`{ id, slug, name, role }`). Its writes read the account fresh too.
     */
    workspace: tier('workspace', async (ctx, write, rule) => {
      const { user, workspace } = await authorization.requireWorkspace(ctx, { ...rule, fresh: write })
      return { user, workspace: workspace satisfies FunctionWorkspace }
    }),
    /**
     * App-wide admin (`adminRoles`, read fresh): injects `ctx.user`. Its
     * mutations and actions refuse impersonated sessions, and take a sign-in
     * from the last ten minutes unless the function says
     * `recentSignIn: false` (`reauthentication_required`). On a `sandbox`
     * deployment it refuses an administrator whose account is not
     * passkey-only (`forbidden`, reason `passkey_only_admin`).
     */
    admin: tier('admin', async (ctx, write, rule) => {
      const user = await authorization.requireRole(ctx, adminRoles, { fresh: true, ...rule, ...(write ? { impersonation: 'refused' as const } : {}) })
      // A sandbox's administrator signs in with passkeys only: its public inbox shows codes.
      await authorization.requireAdminSignIn(ctx, user)
      return { user }
    }, RECENT_SIGN_IN_SECONDS),
    /** Custom app-wide role tier: `withRole('editor').query(...)`. Its writes read the role and the ban fresh. */
    withRole: (role: string | string[]) =>
      tier('authed', async (ctx, write, rule) => ({ user: await authorization.requireRole(ctx, role, { ...rule, fresh: write }) })),
    /**
     * The `workspace` tier for a plan's feature: `withFeature('reports').query(...)`.
     * A workspace member (read fresh) whose billing entity's plan grants the
     * feature, as `billing.requireFeature` checks it: from the entitlement
     * cache, matched by its catalog key. Anyone else is refused
     * `feature_required`, its `plans` the plans on sale that include it.
     * Injects `ctx.user` and `ctx.workspace`; its `recentSignIn` is asked
     * last, of a caller the feature already lets in. Its writes spend
     * `limits.workspace`. Needs `billing` in `createFunctions`' options:
     * without it, defining a function throws.
     *
     * The plan checked is the billing entity's, as billing resolves it: the
     * active workspace, `ctx.workspace`, by default; the one your
     * `setupBilling({ resolveEntity })` names when you have one. With
     * `billTo: 'user'` it is the caller's own plan, and the tier still asks
     * for a workspace member: gate a function on a user's plan, or behind
     * another tier, with `billing.requireFeature(ctx, key)` in its handler.
     *
     * @guarantee Refuses a caller who may not act at all (signed out, no member) as the `workspace` tier does, before the feature is read.
     */
    withFeature: (feature: string) => {
      const { billing } = options
      if (!billing) {
        throw new TypeError('[nuxt-backend] withFeature needs billing: pass your setupBilling instance to createFunctions in backend/functions.ts — createFunctions({ query, mutation, action }, { components, billing }) (see https://nuxt-backend.dev/docs/build/billing/subscriptions/feature-gating#enforce-it-on-the-server).')
      }
      if (typeof feature !== 'string' || feature === '') {
        throw new TypeError(`[nuxt-backend] withFeature takes a feature's catalog key, a non-empty string, not ${JSON.stringify(feature) ?? String(feature)}.`)
      }
      return tier('workspace', async (ctx, write, { recentSignIn, ...rule }) => {
        const { user, workspace } = await authorization.requireWorkspace(ctx, { ...rule, fresh: write })
        await billing.requireFeature(ctx, feature)
        // Last, as every tier asks it: only of a caller the feature lets in.
        refuseStaleSignIn(user.claims, recentSignIn, 'This function')
        return { user, workspace: workspace satisfies FunctionWorkspace }
      })
    },
    /**
     * The internal mutation that sets an app-wide role by email, never
     * callable from a browser: `npx nuxt-backend doctor --fix` runs it to
     * make your first administrator. A role it changes is recorded on the
     * activity trail as `admin.role_changed`.
     */
    setUserRole: defineSetUserRole(options.components),
  }
}

// --- Bot protection ----------------------------------------------------------
// For the calls that never pass through the app's server: the challenge
// answer the deployment verifies with the provider, and `verifyHuman`. The
// proof itself lives in ../proof.ts, which the app's server shares.

/** Where the challenge provider verifies an answer. */
const CHALLENGE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

/** How long a challenge verification may take before it counts as unavailable. */
const CHALLENGE_VERIFY_TIMEOUT_MS = 10_000

/** How the challenge provider answered, or that it could not be asked. */
type ChallengeCheck = { ok: true } | { ok: false, reason: 'refused' | 'action' | 'unavailable', codes?: string[] }

/**
 * Verify a challenge answer with the provider (a `fetch`, so a Convex action
 * or HTTP action, never a query or mutation). With `action`, the answer must
 * have been given by a widget for that action (the provider's test keys
 * answer without one, so they skip it). A provider that cannot be
 * reached, or answers nothing readable, is `unavailable`, and the answer is
 * not taken.
 */
async function verifyChallenge(secretKey: string, token: string, { action, remoteIp }: { action?: string, remoteIp?: string } = {}): Promise<ChallengeCheck> {
  let answer: { 'success'?: unknown, 'action'?: unknown, 'error-codes'?: unknown }
  try {
    const response = await fetch(CHALLENGE_VERIFY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ secret: secretKey, response: token, ...(remoteIp ? { remoteip: remoteIp } : {}) }),
      ...(typeof AbortSignal.timeout === 'function' ? { signal: AbortSignal.timeout(CHALLENGE_VERIFY_TIMEOUT_MS) } : {}),
    })
    if (!response.ok) return { ok: false, reason: 'unavailable' }
    answer = await response.json() as typeof answer
  }
  catch {
    return { ok: false, reason: 'unavailable' }
  }
  const codes = Array.isArray(answer['error-codes']) ? answer['error-codes'].filter((code): code is string => typeof code === 'string') : []
  if (answer.success !== true) return { ok: false, reason: 'refused', codes }
  // The provider's test keys answer for every widget with no action of its own.
  if (action && answer.action !== action && !TEST_CHALLENGE_SECRET_KEYS.includes(secretKey)) return { ok: false, reason: 'action' }
  return { ok: true }
}

/** Whether a function's ctx may `fetch`: an action's or an HTTP action's, which can run other actions. */
function canFetch(ctx: object): boolean {
  return typeof (ctx as { runAction?: unknown }).runAction === 'function'
}

/**
 * Check a proof for a call, or refuse it. A proof for a call that named no
 * subject is bound to the browser: its visitor, kept for `jobs.enqueue` in
 * the same call. It never passes for a named subject, nor a subject's for
 * a visitor (each is signed under its own method).
 */
async function verifyCallProof(ctx: object, proofSecret: string | undefined, token: string, { action, subject }: { action: string, subject?: string }): Promise<void> {
  const visitor = proofVisitor(token)
  const audience = deploymentAudience()
  const target = visitor
    ? { method: VISITOR_METHOD, path: action, audience, subject: visitor }
    : { method: CALL_METHOD, path: action, audience, subject: proofSubject(subject) }
  const refusal = !proofSecret ? 'no PROTECTION_PROOF_SECRET' : visitor && proofSubject(subject) ? 'bound to a browser, not to the subject' : undefined
  const check = refusal ? null : await verifyProof(proofSecret!, token, target)
  if (check?.ok) {
    if (visitor) rememberVisitor(ctx, visitor)
    return
  }
  logBackend('warn', 'protection.refused', `A ${action} call's proof was refused (${check ? check.reason : refusal}).`)
  throw notHuman(`The ${action} call's proof was refused.`)
}

/** The refusal of a call that passed no bot check, as a person reads it. */
function notHuman(detail: string) {
  return backendError('forbidden', { reason: 'bot_check' }, detail)
}

/**
 * Check that a call comes from a person, in a function of your own: a
 * waitlist join, a contact form, a referral claim, any call that reaches the
 * deployment over the live connection and never through the app's server.
 * The client gets the token from `useHumanCheck().token(action, subject)`
 * and passes it along with the call.
 *
 * It accepts either:
 * - a proof the app's server signed for this `action` (and `subject`, when
 *   one is named) and this deployment after its own bot check passed (on
 *   Vercel, BotID), under `PROTECTION_PROOF_SECRET`, at most a minute old;
 * - a challenge answer, given for this `action` and verified with the
 *   provider under `PROTECTION_CHALLENGE_SECRET_KEY`. That takes a `fetch`,
 *   which Convex runs in actions only, and off Vercel no proof is signed:
 *   check in an action, as below, which works on every host.
 *
 * A proof for a call that names no subject is bound to the browser that
 * asked for it, by the visitor cookie the proof route sets: `jobs.enqueue`
 * in the same function puts a signed-out caller's guest job under that
 * visitor (`defineJobQueue({ guest })`).
 *
 * With neither secret set, the deployment checks nobody and every call
 * passes: bot protection is missing (`nuxt-backend doctor --prod` says so).
 * Anything else is refused as `forbidden` with reason `bot_check`; a
 * provider that cannot be reached as `unavailable` (`provider_refused`).
 *
 * @guarantee A token passes for the one action (and subject) it was given for, and a proof for a minute on its own deployment.
 * @guarantee Without a secret on the deployment, no token is ever required.
 *
 * @example
 * ```ts
 * import { verifyHuman } from 'nuxt-backend/functions'
 *
 * export const joinWaitlist = action({
 *   args: { email: v.string(), human: v.optional(v.union(v.string(), v.null())) },
 *   handler: async (ctx, { email, human }) => {
 *     await verifyHuman(ctx, human, { action: 'waitlist', subject: email })
 *     await ctx.runMutation(internal.waitlist.insert, { email })
 *   },
 * })
 * ```
 */
export async function verifyHuman(ctx: object, token: string | null | undefined, { action, subject }: { action: string, subject?: string }): Promise<void> {
  if (!isActionName(action)) {
    throw new TypeError(`[nuxt-backend] verifyHuman: "${action}" is no action name — up to 32 letters, digits, "_" and "-".`)
  }
  const { proofSecret, challengeSecretKey } = protectionEnv()
  if (!proofSecret && !challengeSecretKey) return
  if (!token) throw notHuman(`The ${action} call carried no bot-check token.`)
  if (isProofFormat(token)) return await verifyCallProof(ctx, proofSecret, token, { action, subject })
  if (!challengeSecretKey) throw notHuman(`The ${action} call carried a challenge answer, and the deployment verifies none.`)
  if (!canFetch(ctx)) {
    logBackend('warn', 'protection.refused', `A ${action} challenge answer reached a query or mutation, which cannot verify one: verify it in an action, or pass a proof.`)
    throw notHuman(`The ${action} call's challenge answer cannot be verified here.`)
  }
  const check = await verifyChallenge(challengeSecretKey, token, { action })
  if (check.ok) return
  if (check.reason === 'unavailable') {
    logBackend('warn', 'protection.challenge_unavailable', `The challenge provider could not verify a ${action} answer.`)
    throw backendError('unavailable', { service: 'protection', reason: 'provider_refused' }, 'The challenge provider could not be reached.')
  }
  logBackend('warn', 'protection.refused', `A ${action} challenge answer was refused (${check.reason}).`)
  throw notHuman(`The ${action} call's challenge answer was refused.`)
}
