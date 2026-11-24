import type { createClient } from '@convex-dev/better-auth'
import type { BetterAuthOptions } from 'better-auth/minimal'
import type { admin } from 'better-auth/plugins'
import type { AnyComponents, AuthConfig, GenericActionCtx, GenericDataModel, GenericMutationCtx } from 'convex/server'
import type { Audit } from '../integrations/audit.js'
import type { Account } from '../integrations/account.js'
import type { AccessTicket } from '../access-tickets.js'
import type { Access } from '../integrations/launch.js'
import type { Email } from '../integrations/email.js'
import type { BackendPaths } from '../paths.js'

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
 * the sign-in code, welcome and invitation emails there,
 * with `setupEmail(components, { templates })`.
 */
export type AuthEmail = Pick<Email, 'sendTemplate'> & Partial<Pick<Email, 'lifecycle'>>

/**
 * Where the auth layer records its events (sign-ins, passkeys, workspace
 * invitations and roles, impersonations): the app's
 * `setupAudit` instance, from `nuxt-backend/audit`.
 */
export type AuthAudit = Pick<Audit, 'recordBackendEvent'>

/**
 * What erases an account once it is deleted, and says whose deletion would
 * leave a workspace without an owner: the app's `setupAccount` instance,
 * from `nuxt-backend/account`.
 */
export type AuthAccount = Pick<Account, 'forget' | 'soleOwnerships'> & Partial<Pick<Account, 'gate' | 'scheduleDeletion' | 'keepPath'>>

/**
 * The named rate limits the auth flows consult (a subset of the defaults):
 * code sends — per email (`emailOtp`, keyed by a SHA-256 of the address) and
 * deployment-wide (`emailOtpGlobal`, the backstop against mass probing;
 * `signUpOtpGlobal` in its place for an address with no account, while
 * `access` is wired) —
 * code checks per address (`emailOtpAttempt`, keyed the same way), the
 * privileged routes throttled per caller (`admin`, `invitation`,
 * `workspaceCreate` for a new workspace, `accountDelete` for an account's
 * own deletion, and `emailChange` for the code an email change sends to
 * the new address) with
 * a deployment-wide ceiling behind the last two (`invitationGlobal`,
 * `emailOtpGlobal`), and the routes anyone may call without a session: the passkey sign-in
 * challenge, per client address (`passkeySignIn`) and deployment-wide
 * (`passkeySignInGlobal`).
 */
export type AuthRateLimitName = 'emailOtp' | 'emailOtpGlobal' | 'signUpOtpGlobal' | 'emailOtpAttempt' | 'emailChange' | 'admin' | 'invitation' | 'invitationGlobal' | 'workspaceCreate' | 'accountDelete' | 'passkeySignIn' | 'passkeySignInGlobal'

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
 * Fired after a user is created — e.g. to kick off a welcome workflow.
 * Receives the full request ctx (a mutation or action ctx for your data model),
 * so it can `runMutation`, schedule work, or start a Workflow. Better Auth
 * runs an after-hook a second time when it throws, so make it safe to repeat.
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
 * Fired once after a user account is deleted (`/delete-user`, immediate
 * after a recent sign-in and the account's address typed to confirm) — a
 * side effect of yours: tell a team channel, stop a workflow. Erasing your
 * own tables belongs in `setupAccount({ sources })`, which retries and
 * also runs for a deletion from server code. Runs after a consumer-supplied
 * `user.deleteUser.afterDelete`.
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
  /**
   * At `user-create`, the ticket that admits the address while the app is
   * closed (`setupAuth({ access })`): `invite-code`, `access-link`,
   * `invitation`, `waitlist`, `workspace-invitation`, `gift`, `domain` or
   * `administrator`. `null` in an open phase, without `access`, for an
   * existing account and at the other purposes.
   */
  ticket: AccessTicket | null
}

/**
 * A {@link CanSignIn} verdict: `true` to allow, or a refusal with an optional
 * message shown to the user as written. Without one, the person reads the
 * `errors.forbidden_sign_in_refused` label, in their language (in English,
 * "Sign-in is by invitation right now.").
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
 * with a message the form shows and the setting to change in the logs (a
 * `development` `BACKEND_ENVIRONMENT` echoes codes to the console instead).
 */
export interface AuthIntegrations<DM extends GenericDataModel = GenericDataModel> {
  /** The app's `setupEmail` instance: the sign-in codes and every other auth email go out through it. */
  email: AuthEmail
  rateLimiter?: AuthRateLimiter
  /**
   * Fired after an account is created, after its welcome email. See {@link OnUserCreated}.
   *
   * @guarantee
   * - Runs: in the auth request that created the account (a mutation or action ctx), after its welcome email
   * - Delivery: once, or twice when it throws: Better Auth runs a failed after-hook a second time
   * - Order: after the account is created
   * - When it throws: run again once; a second throw fails the sign-up request, and the account stays created
   * - Idempotency: key what it starts on `user.id`, since it can run twice
   */
  onUserCreated?: OnUserCreated<DM>
  /**
   * Gate sign-in / sign-up (invite-only, allow-list, closed beta). See {@link CanSignIn}.
   *
   * @guarantee
   * - Runs: in the auth request (a mutation or action ctx), before the write it guards
   * - Delivery: every time the gate is asked: a code request, an account creation, each new session, and twice for an email change
   * - Order: before any write, so a refusal leaves nothing behind
   * - When it throws: the error propagates as thrown and fails the request; return `{ allowed: false }` to refuse with `forbidden`, reason `sign_in_refused`
   * - Idempotency: a read only: it runs several times for one sign-in
   */
  canSignIn?: CanSignIn<DM>
  /**
   * Fired after an account is deleted, after any consumer `afterDelete`. See {@link OnUserDeleted}.
   *
   * @guarantee
   * - Runs: in the deletion request (a mutation or action ctx), after the app's own `user.deleteUser.afterDelete`
   * - Delivery: once per deletion
   * - Order: after the account is deleted
   * - When it throws: the deletion request fails; the account is already deleted
   * - Idempotency: make the erasure safe to run again, by `user.id`
   */
  onUserDeleted?: OnUserDeleted<DM>
  /**
   * The app's `setupAudit` instance (`backend/audit.ts`): the auth layer
   * records its events through it, so they reach its `onEvent` action.
   * Every event is recorded without it too, through the component, and
   * never reaches `onEvent`.
   */
  audit?: AuthAudit
  /**
   * The app's `setupAccount` instance (`backend/account.ts`): an
   * account's deletion (`/delete-user`,
   * `/admin/remove-user`) erases everything of it through it, the
   * providers' records and the app's own sources included, and is refused
   * while it is the only owner of a workspace others belong to. Without
   * it, the component's own tables are erased and the refusal holds; the
   * providers' records and the app's tables are left.
   */
  account?: AuthAccount
}

/** What `setupAuth` reads of the `setupAccess` instance. */
export type AuthAccess = Pick<Access, 'gate'>

/** Options for the bundled admin plugin (roles, permissions, ban, impersonation). */
export type AdminPluginOptions = Parameters<typeof admin>[0]

/** A workspace as the workspace hooks receive it. */
export interface WorkspaceHookWorkspace {
  id: string
  name: string
  slug: string
}

/** What {@link WorkspaceOptions.onCreate} receives: the new workspace and the account that made it, its first owner. */
export interface WorkspaceCreatedEvent {
  workspace: WorkspaceHookWorkspace
  userId: string
}

/** What {@link WorkspaceOptions.onMemberAdded} and {@link WorkspaceOptions.onMemberRemoved} receive. */
export interface WorkspaceMemberEvent {
  workspace: WorkspaceHookWorkspace
  userId: string
  /** The member's role: `owner`, `admin` or `member`. */
  role: string
}

/** What {@link WorkspaceOptions.canInvite} is asked about. */
export interface WorkspaceInviteInput {
  /** The address invited, lower-cased. */
  email: string
  role: string
  workspaceId: string
  /** The account that invites. */
  inviterId: string
}

/** A workspace hook: the request's Convex ctx (a mutation or action ctx), and the event. */
export type WorkspaceHook<E, DM extends GenericDataModel = GenericDataModel>
  = (ctx: GenericMutationCtx<DM> | GenericActionCtx<DM>, event: E) => Promise<void>

/**
 * Workspace options. Every account gets a personal workspace on its first
 * sign-in, set active, so a session always has an active workspace. The
 * roles are the built-in `owner`, `admin` and `member`.
 */
export interface WorkspaceOptions<DM extends GenericDataModel = GenericDataModel> {
  /** How long an invitation can be accepted, in seconds. Default 48 hours. */
  invitationExpiresIn?: number
  /**
   * Refuse an invitation before it is stored or emailed: `true` to allow,
   * or `{ allowed: false, message? }`, refused as `forbidden` with reason
   * `invitation_refused`, carrying your message.
   */
  canInvite?: (ctx: GenericMutationCtx<DM> | GenericActionCtx<DM>, input: WorkspaceInviteInput) => Promise<CanSignInVerdict>
  /** After a workspace is created, a personal one included. Runs again when it throws, like every after-hook: make it safe to repeat. */
  onCreate?: WorkspaceHook<WorkspaceCreatedEvent, DM>
  /** After an account joins a workspace: its creator, an accepted invitation, an owner or admin adding it. */
  onMemberAdded?: WorkspaceHook<WorkspaceMemberEvent, DM>
  /** After a member is removed from a workspace. */
  onMemberRemoved?: WorkspaceHook<WorkspaceMemberEvent, DM>
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
  /**
   * The app's paths, from the `paths.generated.ts` the Nuxt module writes
   * from nuxt.config (`backend.authRoute`, `backend.pages`): the auth
   * routes' base path, and the pages the auth emails link to (an invitation,
   * a recovered passkey-only account, a waitlist place). A key left out takes
   * its page's default path.
   */
  paths?: Partial<BackendPaths>
  /** Admin plugin options: roles via `adminRoles`/`ac`, ban, impersonation. */
  admin?: AdminPluginOptions
  /** Workspace options: where invitation emails link, how long an invitation lasts, and the workspace hooks. */
  workspaces?: WorkspaceOptions<DM>
  /**
   * The app's `setupAccess` instance (`backend/access.ts`): the launch
   * phase and the tickets that admit a new address. Existing accounts
   * always sign in; `canSignIn` still runs after it, as your own veto.
   */
  access?: AuthAccess
}

/**
 * The options `setupAuth` builds the auth instance from, apart from the
 * cross-component wiring it resolves separately.
 *
 * @internal
 */
export type AuthBuildOptions<DM extends GenericDataModel = GenericDataModel> = Omit<SetupAuthOptions<DM>, keyof AuthIntegrations | 'access'>

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

/** One of the caller's latest sign-ins from a new device, as `listSignInAlerts` returns it. */
export interface SignInAlert {
  /** When the device signed in, epoch ms. */
  at: number
  /** The browser and the system, when the user agent named them. */
  browser?: string
  os?: string
  /** It signed in with the account's recovery code, which always counts as a new device. */
  recovery: boolean
  /** The session it opened: compare with `listSessions` to sign it out while it lasts. */
  sessionId?: string
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
