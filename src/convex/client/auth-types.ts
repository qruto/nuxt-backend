import type { createClient } from '@convex-dev/better-auth'
import type { BetterAuthOptions } from 'better-auth/minimal'
import type { admin, organization } from 'better-auth/plugins'
import type { AnyComponents, AuthConfig, GenericActionCtx, GenericDataModel, GenericMutationCtx } from 'convex/server'
import type { Email } from '../integrations/email.js'

// The public types of `nuxt-backend/auth`, which the entry re-exports, plus
// the unexported helper types a public signature mentions
// (`PublicAuthComponentRef`). One file, in the order the API reference lists
// them: TypeDoc orders a page by declaring file, then position.

/**
 * A DataModel-independent Convex context that can run mutations / queries and
 * schedule work — what the auth email / rate-limit / lifecycle integrations
 * receive. Auth email flows execute inside a mutation/action, so the request
 * ctx is narrowed to one of these. Kept structural (rather than
 * `GenericMutationCtx<DM>`) so a context for *any* data model is assignable.
 */
export interface AuthMutationCtx {
  runMutation: GenericActionCtx<GenericDataModel>['runMutation']
  runQuery: GenericActionCtx<GenericDataModel>['runQuery']
  scheduler: GenericActionCtx<GenericDataModel>['scheduler']
}

/**
 * What the auth flows send their email through: the app's `setupEmail`
 * instance, which holds the templates and sends through the package's own
 * transport (the `backend` component's email module, on Resend). Restyle
 * the sign-in code, welcome, account-deletion and invitation emails there,
 * with `setupEmail(components, { templates })`.
 */
export type AuthEmail = Pick<Email, 'sendTemplate'>

/**
 * The named rate limits the auth flows consult (a subset of the defaults):
 * code sends — per email (`emailOtp`, keyed by a SHA-256 of the address) and
 * deployment-wide (`emailOtpGlobal`, the backstop against mass probing) —
 * code checks per address (`emailOtpAttempt`, keyed the same way), the
 * agent token exchange `setupAuth` wires from the same options, the
 * privileged routes throttled per caller (`admin`, `invitation`, and
 * `emailChange` for the code an email change sends to the new address) with
 * a deployment-wide ceiling behind the last two (`invitationGlobal`,
 * `emailOtpGlobal`), and the anonymous agent registration route
 * (`agentRegistrationGlobal`).
 */
export type AuthRateLimitName = 'emailOtp' | 'emailOtpGlobal' | 'emailOtpAttempt' | 'emailChange' | 'mcp' | 'admin' | 'invitation' | 'invitationGlobal' | 'agentRegistrationGlobal'

/**
 * Guards auth-sensitive flows. Satisfied by `setupRateLimiter(...)` from
 * `nuxt-backend/rate-limit` (which seeds these named limits).
 */
export interface AuthRateLimiter {
  // A method signature, not a function-typed property: methods are compared
  // bivariantly, so a limiter whose `ctx` is upstream's own union of
  // mutation and action contexts still assigns to this shape. The limiter
  // only runs functions, so it is not owed the scheduler.
  limit(
    ctx: Pick<AuthMutationCtx, 'runQuery' | 'runMutation'>,
    name: AuthRateLimitName,
    options?: { key?: string, throws?: boolean },
  ): Promise<{ ok: boolean, retryAfter?: number }>
}

/** The newly-created user passed to {@link AuthIntegrations.onUserCreated}. */
export interface AuthCreatedUser {
  id: string
  email: string
  name: string
}

/**
 * Fired once after a user is created — e.g. to kick off a welcome workflow.
 * Receives the full request ctx (a mutation or action ctx for your data model),
 * so it can `runMutation`, schedule work, or start a Workflow.
 */
export type OnUserCreated<DM extends GenericDataModel = GenericDataModel>
  = (ctx: GenericMutationCtx<DM> | GenericActionCtx<DM>, user: AuthCreatedUser) => Promise<void>

/** The user just deleted, passed to {@link AuthIntegrations.onUserDeleted}. */
export interface AuthDeletedUser {
  id: string
  email: string
  name: string
}

/**
 * Fired once after a user account is deleted (the `deleteUser` flow, confirmed
 * via email when a transport is wired) — e.g. to erase the app's own rows for
 * that user, or the billing cache via `billing.forgetEntity`. Runs after a
 * consumer-supplied `user.deleteUser.afterDelete`.
 */
export type OnUserDeleted<DM extends GenericDataModel = GenericDataModel>
  = (ctx: GenericMutationCtx<DM> | GenericActionCtx<DM>, user: AuthDeletedUser) => Promise<void>

/**
 * Where a {@link CanSignIn} verdict is being asked for:
 *
 * - `'sign-in'` — an OTP sign-in code was requested for the address, before
 *   anything is sent. `isNewUser` says whether the address has an account.
 * - `'user-create'` — an account is about to be created (any path).
 *   `isNewUser` is always `true`.
 * - `'session'` — a session is about to be created for an existing account
 *   (OTP verification, passkey sign-in, …). `isNewUser` is always `false`.
 * - `'email-change'` — a signed-in account asks to move to `email`, its new
 *   address: before a code goes to it, and again before the account moves.
 *   `isNewUser` is always `false`: the person already has an account.
 */
export type CanSignInPurpose = 'sign-in' | 'user-create' | 'session' | 'email-change'

/** What {@link CanSignIn} is asked about. */
export interface CanSignInInput {
  /** The address, as Better Auth holds it (lower-cased). */
  email: string
  /** `true` when no account exists for the address yet. */
  isNewUser: boolean
  purpose: CanSignInPurpose
}

/**
 * A {@link CanSignIn} verdict: `true` to allow, or a refusal with an optional
 * message shown to the user (default: "Sign-in is by invitation right now.").
 */
export type CanSignInVerdict = true | { allowed: false, message?: string }

/**
 * Gate sign-in and account creation — e.g. an invite-only launch, an
 * allow-list, or a closed beta. Consulted (with the full request ctx, so it
 * can query the app's own tables) before an OTP is sent for a sign-in
 * request, before any account is created, before a session is created for an
 * existing account, and before an account moves to a new address (see
 * {@link CanSignInPurpose}). A refusal surfaces as a `FORBIDDEN` `APIError`
 * with the verdict's message — `useLoginFlow().error` shows it.
 *
 * A refusal at `'sign-in'` answers whoever typed the address, so a gate that
 * refuses new addresses there tells anyone which addresses have an account.
 * To keep that private, allow every `'sign-in'` and refuse at
 * `'user-create'`: only the person holding the mailbox, who has the code,
 * reads that refusal.
 */
export type CanSignIn<DM extends GenericDataModel = GenericDataModel>
  = (ctx: GenericMutationCtx<DM> | GenericActionCtx<DM>, input: CanSignInInput) => Promise<CanSignInVerdict>

/**
 * The cross-component part of {@link SetupAuthOptions}: the `email`
 * instance every auth email goes out through (required), a `rateLimiter` to
 * throttle sending and checking codes and the privileged routes, `canSignIn`
 * to gate who may sign in or sign up, and `onUserCreated` / `onUserDeleted`
 * to run side effects (durable workflows, analytics, erasure) around the
 * account lifecycle. A code or an invitation the deployment cannot deliver —
 * no `EMAIL_API_KEY`, test mode, no `EMAIL_FROM` — is refused on the request,
 * with a message the form shows and the setting to change in the logs (set
 * `NUXT_BACKEND_LOG_OTP=1` to echo codes to the console during local dev
 * instead).
 */
export interface AuthIntegrations<DM extends GenericDataModel = GenericDataModel> {
  /** The app's `setupEmail` instance: the sign-in codes and every other auth email go out through it. */
  email: AuthEmail
  rateLimiter?: AuthRateLimiter
  onUserCreated?: OnUserCreated<DM>
  /** Gate sign-in / sign-up (invite-only, allow-list, closed beta). See {@link CanSignIn}. */
  canSignIn?: CanSignIn<DM>
  /** Fired after an account is deleted, after any consumer `afterDelete`. See {@link OnUserDeleted}. */
  onUserDeleted?: OnUserDeleted<DM>
}

/** Options for the bundled admin plugin (roles, permissions, ban, impersonation). */
export type AdminPluginOptions = Parameters<typeof admin>[0]

/**
 * Options for the bundled organization plugin (workspaces). Every user gets a
 * personal workspace on first sign-in, set active, so `activeOrganizationId`
 * is never null. Beyond the plugin's own options:
 *
 * - `invitationPath` — the app page invitation emails link to (default
 *   `/accept-invitation`, registered automatically by the Nuxt module). The
 *   emailed URL is `{SITE_URL}{invitationPath}?id=<invitationId>`.
 *   ⚠ Declared in two places by necessity: keep it aligned with the Nuxt
 *   side's `backend.pages.acceptInvitation` (nuxt.config) — a mismatch 404s
 *   invitees, and `nuxt-backend doctor` cross-checks both.
 */
export type OrganizationPluginOptions = Parameters<typeof organization>[0] & {
  invitationPath?: string
}

/**
 * Options for the agent (MCP) OAuth provider — better-auth's `mcp` plugin.
 * Agents obtain access via dynamic client registration + the OAuth
 * authorization-code flow with PKCE, and every authorization goes through
 * the consent page, where the person approves or denies. All of it is mounted
 * under the auth base path and reachable on the app origin through the base
 * module's auth proxy.
 */
export interface McpAuthOptions {
  /**
   * Extra OAuth scopes on top of the built-in set, `BACKEND_MCP_SCOPES` (identity scopes
   * plus the built-in tool scopes, always offered).
   */
  scopes?: string[]
  /**
   * The app page a person signs in on mid-authorization. Default `/login`;
   * keep it equal to `backend.pages.login` (`nuxt-backend doctor` compares
   * the two).
   */
  loginPath?: string
  /**
   * The app page a person approves or denies an agent on. Default
   * `/oauth/consent`; keep it equal to `backend.pages.agentConsent`
   * (`nuxt-backend doctor` compares the two).
   */
  consentPath?: string
}

/**
 * Everything `setupAuth` takes: the auth library's own options, the bundled
 * plugins' options, and the cross-component wiring of {@link AuthIntegrations}.
 */
export interface SetupAuthOptions<
  DM extends GenericDataModel = GenericDataModel,
> extends AuthIntegrations<DM> {
  /** Override the default auth config (e.g. to add custom providers) */
  authConfig?: AuthConfig
  /** Override Better Auth options (merged with defaults) */
  authOptions?: BetterAuthOptions
  /** Override Better Auth basePath and matching Convex auth route */
  basePath?: string
  /** Admin plugin options: roles via `adminRoles`/`ac`, ban, impersonation. */
  admin?: AdminPluginOptions
  /** Organization (workspace) plugin options. */
  organization?: OrganizationPluginOptions
  /**
   * Agent (MCP) OAuth provider options: the provider behind the app's
   * OAuth-protected MCP endpoint and the `/mcp/exchange` token mint.
   */
  mcp?: McpAuthOptions
}

/**
 * The options `setupAuth` builds the auth instance from, apart from the
 * cross-component wiring it resolves separately.
 *
 * @internal
 */
export type AuthBuildOptions = Omit<SetupAuthOptions, keyof AuthIntegrations>

/** Component API shape expected by the Better Auth client. */
export type AuthComponentApi = Parameters<typeof createClient>[0]
export type PublicAuthComponentRef = AuthComponentApi | AnyComponents[string]

/**
 * The component handles the auth setup reads from your generated `components`
 * object. Pass the whole object — the `backend` key is picked structurally.
 *
 * `backend` is the package's all-in-one component: its `adapter` module is the
 * Better Auth CRUD surface. Auth email goes out through the `email` option
 * (see {@link AuthIntegrations}).
 */
export interface AuthSetupComponents {
  backend: PublicAuthComponentRef
}

/** One of the caller's device sessions, as `listSessions` returns it. */
export interface DeviceSession {
  id: string
  userAgent: string | null
  createdAt: number
  updatedAt: number
  /** Epoch ms; a session past it no longer signs anyone in. */
  expiresAt: number
  /** Whether this is the session the caller is signed in with. */
  current: boolean
}
