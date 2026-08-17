import { createClient, type GenericCtx } from '@convex-dev/better-auth'
import { convex } from '@convex-dev/better-auth/plugins'
import { passkey } from '@better-auth/passkey'
import { betterAuth, type BetterAuthOptions } from 'better-auth/minimal'
import { admin, emailOTP, organization } from 'better-auth/plugins'
import type { AnyComponents, AuthConfig, FunctionReference, GenericActionCtx, GenericDataModel, GenericMutationCtx, GenericSchema, QueryBuilder, SchemaDefinition } from 'convex/server'
import authConfig from '../auth.config'
import { DEFAULT_AUTH_ROUTE, DEFAULT_INVITATION_PATH } from '../constants'
import { authSchema } from '../components/backend/schema'

/**
 * Default passkey plugin. Registration requires an authenticated session (the
 * plugin's default), so a passkey can only be added to an account whose email
 * has already been proven via the OTP sign-in flow.
 *
 * This deliberately omits passkey-first (pre-auth) account creation: minting an
 * account + session from a WebAuthn ceremony over an unverified, client-typed
 * email lets an attacker squat on or pre-hijack a victim's email (they plant a
 * passkey before the victim signs up, then the victim's later OTP sign-in
 * verifies the email while the attacker's passkey persists — account takeover).
 * New users sign up with OTP, then add a passkey from their authenticated
 * session (the `add-passkey` step of `useLoginFlow`).
 *
 * Override by passing your own `passkey(...)` plugin in `authOptions.plugins`.
 */
function defaultPasskey() {
  return passkey()
}

type DefaultAuthSchema = typeof authSchema

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

/** A single transactional email, as understood by the auth flows. */
export interface AuthEmailMessage {
  to: string
  subject: string
  html?: string
  text?: string
}

/**
 * Sends an auth-related email. By default this is wired automatically to the
 * `backend` component's email module (`components.backend.email.send`), so
 * auth OTP / verification / reset email works out of the box — but any
 * compatible function can be supplied via `integrations.email` to override it.
 */
export type AuthEmailSender = (ctx: AuthMutationCtx, message: AuthEmailMessage) => Promise<unknown>

/** The named rate limits the auth flows consult (a subset of the defaults). */
export type AuthRateLimitName = 'emailOtp' | 'signIn' | 'signUp' | 'passwordReset'

/**
 * Guards auth-sensitive flows. Satisfied by `setupRateLimiter(...)` from
 * `nuxt-backend/rate-limit` (which seeds these named limits).
 */
export interface AuthRateLimiter {
  limit: (
    ctx: AuthMutationCtx,
    name: AuthRateLimitName,
    options?: { key?: string, throws?: boolean },
  ) => Promise<{ ok: boolean, retryAfter?: number }>
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

/**
 * Cross-component wiring for Better Auth. All optional: with no `email`
 * transport, OTP requests fail loudly (set `NUXT_BACKEND_LOG_OTP=1` to echo
 * codes to the console during local dev instead). Provide an `email` transport
 * to deliver OTP / verification / reset emails, a `rateLimiter` to throttle
 * OTP sends, and `onUserCreated` to run side effects (durable workflows,
 * analytics) on signup.
 */
export interface AuthIntegrations<DM extends GenericDataModel = GenericDataModel> {
  email?: AuthEmailSender
  rateLimiter?: AuthRateLimiter
  onUserCreated?: OnUserCreated<DM>
  /** Override any of the default auth-email templates (welcome/otp/verify/change/delete/invite). */
  emailTemplates?: Partial<AuthEmailTemplates>
}

/** Per-request runtime carrying the ctx and resolved integrations. */
interface AuthRuntime<DM extends GenericDataModel = GenericDataModel> {
  ctx?: GenericCtx<DM>
  email?: AuthEmailSender
  rateLimiter?: AuthRateLimiter
  onUserCreated?: OnUserCreated<DM>
  emailTemplates?: Partial<AuthEmailTemplates>
}

type OtpPurpose = 'sign-in' | 'email-verification' | 'forget-password' | 'change-email'

/** Narrow the request ctx to one that can run mutations, or `undefined`. */
function asMutationCtx<DM extends GenericDataModel>(
  ctx?: GenericCtx<DM>,
): GenericMutationCtx<DM> | GenericActionCtx<DM> | undefined {
  return ctx && 'runMutation' in ctx ? ctx : undefined
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c] ?? c
  ))
}

const OTP_SUBJECTS: Record<OtpPurpose, string> = {
  'sign-in': 'Your sign-in code',
  'email-verification': 'Verify your email',
  'forget-password': 'Reset your password',
  'change-email': 'Confirm your new email',
}

/** Minimal, dependency-free default templates. Override by supplying your own plugins. */
function otpEmail(data: { email: string, otp: string, type: OtpPurpose }): AuthEmailMessage {
  const subject = OTP_SUBJECTS[data.type] ?? 'Your verification code'
  const code = escapeHtml(data.otp)
  return {
    to: data.email,
    subject,
    text: `${subject}: ${data.otp}\n\nThis code expires shortly. If you didn't request it, you can ignore this email.`,
    html: `<div style="font-family:system-ui,sans-serif;font-size:16px;line-height:1.5">`
      + `<p>${subject}:</p>`
      + `<p style="font-size:28px;font-weight:700;letter-spacing:4px">${code}</p>`
      + `<p style="color:#666">This code expires shortly. If you didn't request it, you can ignore this email.</p>`
      + `</div>`,
  }
}

function linkEmail(to: string, subject: string, intro: string, url: string, cta: string): AuthEmailMessage {
  const safeUrl = escapeHtml(url)
  return {
    to,
    subject,
    text: `${intro}\n\n${url}`,
    html: `<div style="font-family:system-ui,sans-serif;font-size:16px;line-height:1.5">`
      + `<p>${escapeHtml(intro)}</p>`
      + `<p><a href="${safeUrl}" style="display:inline-block;padding:10px 16px;background:#111;color:#fff;border-radius:8px;text-decoration:none">${escapeHtml(cta)}</a></p>`
      + `<p style="color:#666">Or paste this link into your browser:<br>${safeUrl}</p>`
      + `</div>`,
  }
}

/**
 * The default transactional auth-email templates, all delivered through the
 * nested Resend component. Override any of them via
 * `integrations.emailTemplates` to restyle without replacing the transport.
 */
export interface AuthEmailTemplates {
  /** OTP code email (sign-in / email-verification / change-email). */
  otp: (data: { email: string, otp: string, type: OtpPurpose }) => AuthEmailMessage
  /** Welcome email sent once, right after a user is created. */
  welcome: (data: { email: string, name: string }) => AuthEmailMessage
  /** Email-verification link (when verification is enabled). */
  verify: (data: { email: string, url: string }) => AuthEmailMessage
  /** Confirmation sent to the current address when changing email. */
  changeEmail: (data: { email: string, newEmail: string, url: string }) => AuthEmailMessage
  /** Confirmation link for account deletion. */
  deleteAccount: (data: { email: string, url: string }) => AuthEmailMessage
  /** Workspace invitation with an accept link (organization plugin). */
  invite: (data: {
    email: string
    url: string
    inviterName: string
    inviterEmail: string
    organizationName: string
    role: string
  }) => AuthEmailMessage
}

const defaultEmailTemplates: AuthEmailTemplates = {
  otp: otpEmail,
  welcome: ({ email, name }) => ({
    to: email,
    subject: 'Welcome aboard',
    text: `Welcome${name ? `, ${name}` : ''}! Your account is ready.`,
    html: `<div style="font-family:system-ui,sans-serif;font-size:16px;line-height:1.5">`
      + `<p>Welcome${name ? `, ${escapeHtml(name)}` : ''}! 🎉</p>`
      + `<p>Your account is ready — thanks for joining us.</p>`
      + `</div>`,
  }),
  verify: ({ email, url }) => linkEmail(
    email,
    'Verify your email',
    'Confirm your email address to finish setting up your account.',
    url,
    'Verify email',
  ),
  changeEmail: ({ email, newEmail, url }) => linkEmail(
    email,
    'Confirm your new email',
    `Confirm changing your account email to ${newEmail}.`,
    url,
    'Confirm change',
  ),
  deleteAccount: ({ email, url }) => linkEmail(
    email,
    'Confirm account deletion',
    'Confirm you want to permanently delete your account. This cannot be undone.',
    url,
    'Delete account',
  ),
  invite: ({ email, url, inviterName, inviterEmail, organizationName, role }) => linkEmail(
    email,
    `Join ${organizationName}`,
    `${inviterName || inviterEmail} invited you to join ${organizationName} as ${role}.`,
    url,
    'Accept invitation',
  ),
}

/** Resolve the active template set (defaults overlaid with consumer overrides). */
function resolveTemplates<DM extends GenericDataModel>(runtime?: AuthRuntime<DM>): AuthEmailTemplates {
  return { ...defaultEmailTemplates, ...runtime?.emailTemplates }
}

/** Build the emailOTP `sendVerificationOTP` handler, routed through the integrations. */
function makeSendVerificationOTP<DM extends GenericDataModel>(runtime?: AuthRuntime<DM>) {
  return async (data: { email: string, otp: string, type: OtpPurpose }): Promise<void> => {
    const ctx = asMutationCtx(runtime?.ctx)
    if (!runtime?.email || !ctx) {
      // The OTP is a live credential and Convex logs are durable — never echo it
      // to logs unless a deployment explicitly opts in (local dev without email).
      if (readEnv('NUXT_BACKEND_LOG_OTP')) {
        console.warn(
          `[nuxt-backend] No email transport configured. Email OTP (${data.type}) for ${data.email}: ${data.otp}`,
        )
        return
      }
      // Failing loudly beats a login screen waiting for an email that will
      // never arrive — the thrown message surfaces in the sign-in UI.
      throw new Error(
        `[nuxt-backend] OTP not delivered — the backend component has no email transport. `
        + `Set the required EMAIL_API_KEY env var to send email, or NUXT_BACKEND_LOG_OTP=1 to echo codes to the console during local dev.`,
      )
    }
    if (runtime.rateLimiter) {
      const { ok } = await runtime.rateLimiter.limit(ctx, 'emailOtp', { key: data.email })
      if (!ok) throw new Error('Too many verification requests. Please try again in a moment.')
    }
    await runtime.email(ctx, resolveTemplates(runtime).otp(data))
  }
}

/** Options for the bundled admin plugin (roles, permissions, ban, impersonation). */
export type AdminPluginOptions = Parameters<typeof admin>[0]

/**
 * Options for the bundled organization plugin (workspaces), plus:
 *
 * - `personal` — when `true` (the default), a personal workspace is
 *   auto-created on a user's first sign-in and set active, so
 *   `activeOrganizationId` is never null.
 * - `invitationPath` — the app page invitation emails link to (default
 *   `/accept-invitation`, registered automatically by the Nuxt module). The
 *   emailed URL is `{SITE_URL}{invitationPath}?id=<invitationId>`.
 */
export type OrganizationPluginOptions = Parameters<typeof organization>[0] & {
  personal?: boolean
  invitationPath?: string
}

export interface CreateBetterAuthOptions {
  /** Override the default auth config (e.g. to add custom providers) */
  authConfig?: AuthConfig
  /** Override Better Auth options (merged with defaults) */
  authOptions?: BetterAuthOptions
  /** Override Better Auth basePath and matching Convex auth route */
  basePath?: string
  /**
   * Admin plugin options (roles via `adminRoles`/`ac`, ban, impersonation).
   * Enabled by default; pass `false` to disable — a disabled plugin still
   * leaves its (optional) schema fields in place.
   */
  admin?: AdminPluginOptions | false
  /**
   * Organization (workspace) plugin options. Enabled by default with a
   * personal workspace per user (`personal: true`); pass `false` to disable.
   */
  organization?: OrganizationPluginOptions | false
}

export interface SetupAuthOptions<
  DM extends GenericDataModel = GenericDataModel,
  Schema extends SchemaDefinition<GenericSchema, true> = DefaultAuthSchema,
> extends CreateBetterAuthOptions {
  /** Local Better Auth schema for hybrid/local component installs */
  schema?: Schema
  /** Enable verbose logs in the Better Auth Convex component client */
  verbose?: boolean
  /**
   * Cross-component wiring: an email transport for auth emails, a rate limiter
   * for OTP sends, and an `onUserCreated` hook. See {@link AuthIntegrations}.
   */
  integrations?: AuthIntegrations<DM>
}

/** Component API shape expected by the Better Auth client. */
type AuthComponentApi = Parameters<typeof createClient>[0]
type PublicAuthComponentRef = AuthComponentApi | AnyComponents[string]

/**
 * The component handles the auth setup reads from your generated `components`
 * object. Pass the whole object — the `backend` key is picked structurally.
 *
 * `backend` is the package's all-in-one component: its `adapter` module is the
 * Better Auth CRUD surface, and its `email` module (when present in the
 * component build) delivers auth OTP / verification / welcome / invitation
 * emails automatically via `components.backend.email.send`. Without an email
 * module, OTP delivery no-ops (see {@link AuthIntegrations}).
 */
export interface AuthSetupComponents {
  backend: PublicAuthComponentRef
}

type EnvHost = typeof globalThis & {
  process?: {
    env?: Record<string, string | undefined>
  }
}

function toAuthComponentApi(componentRef: PublicAuthComponentRef): AuthComponentApi {
  return componentRef as AuthComponentApi
}

/**
 * The email-send function the `backend` component exposes via its nested email
 * provider (see `src/convex/components/backend/email.ts`).
 */
type ComponentEmailRef = FunctionReference<
  'mutation',
  'internal',
  { to: string, subject: string, html?: string, text?: string, from?: string },
  string | null
>

/**
 * Build an {@link AuthEmailSender} that routes auth emails through the
 * `backend` component's email module. This is what makes transactional email
 * work out of the box — `installBackend` mounts `backend`, and the consumer
 * just sets `EMAIL_API_KEY`.
 *
 * Returns `undefined` if the component ref has no `email` module (e.g. a
 * stripped-down locally installed component), in which case OTP requests
 * throw unless `NUXT_BACKEND_LOG_OTP=1` is set (see {@link AuthIntegrations}).
 */
function componentEmailSender(components: AuthSetupComponents): AuthEmailSender | undefined {
  // The backend component exposes `email.send`, but the loose component-ref
  // type doesn't surface it; read it structurally.
  const send = (components.backend as { email?: { send?: ComponentEmailRef } } | undefined)?.email?.send
  if (!send) return undefined
  return async (ctx, message) => {
    await ctx.runMutation(send, {
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    })
  }
}

/**
 * Merge the auto component-email transport with consumer-provided integrations.
 * A consumer-supplied `email` wins, so custom transports still override the
 * built-in one.
 */
function resolveIntegrations<DM extends GenericDataModel>(
  components: AuthSetupComponents,
  integrations?: AuthIntegrations<DM>,
): AuthIntegrations<DM> {
  const email = componentEmailSender(components)
  return email ? { email, ...integrations } : { ...integrations }
}

function readEnv(name: string) {
  return (globalThis as EnvHost).process?.env?.[name]
}

function createAuthComponent<DM extends GenericDataModel, Schema extends SchemaDefinition<GenericSchema, true> = DefaultAuthSchema>(
  componentRef: PublicAuthComponentRef,
  options?: SetupAuthOptions<DM, Schema>,
) {
  const schema = options?.schema ?? authSchema
  const config = {
    local: { schema },
    ...(options?.verbose !== undefined ? { verbose: options.verbose } : {}),
  }

  return createClient<DM, Schema>(
    toAuthComponentApi(componentRef),
    config as never,
  )
}

export function createBetterAuthOptions<DM extends GenericDataModel = GenericDataModel>(
  database: ReturnType<ReturnType<typeof createClient>['adapter']>,
  options: CreateBetterAuthOptions = {},
  runtime?: AuthRuntime<DM>,
) {
  const resolvedAuthConfig = options.authConfig ?? authConfig
  const resolvedAuthOptions = options.authOptions ?? {}
  const resolvedBasePath = options.basePath ?? resolvedAuthOptions.basePath ?? DEFAULT_AUTH_ROUTE
  // Better Auth needs an explicit baseURL or it warns and derives the origin
  // from each incoming request. The app proxies /api/auth to the Convex site,
  // so default to CONVEX_SITE_URL (always present on a Convex deployment) when
  // the consumer hasn't set an app URL. Override precedence: explicit
  // authOptions.baseURL > SITE_URL > CONVEX_SITE_URL.
  const siteUrl = resolvedAuthOptions.baseURL
    ?? readEnv('SITE_URL')
    ?? readEnv('CONVEX_SITE_URL')
  const secret = resolvedAuthOptions.secret ?? readEnv('AUTH_SECRET')

  const adminOptions = options.admin
  const organizationOptions = options.organization
  const organizationEnabled = organizationOptions !== false
  const {
    personal: personalWorkspace = true,
    invitationPath = DEFAULT_INVITATION_PATH,
    ...organizationPluginOptions
  } = typeof organizationOptions === 'object' ? organizationOptions : {}

  // When an email transport is wired, deliver verification, email-change,
  // delete-account, welcome, and workspace-invitation emails through it (with
  // default templates, overridable via integrations.emailTemplates).
  // User-supplied options win.
  // Note: this package is passwordless (passkey + OTP) — no password-reset flow.
  const emailSender = runtime?.email
  const emailCtx = asMutationCtx(runtime?.ctx)
  const canSendEmail = Boolean(emailSender && emailCtx)
  const templates = resolveTemplates(runtime)

  // Workspace invitations: email the invitee an accept link pointing at the
  // app's invitation page. A consumer-supplied `sendInvitationEmail` wins.
  const sendInvitationEmail = canSendEmail && !organizationPluginOptions.sendInvitationEmail
    ? async (data: {
      id: string
      role: string
      email: string
      organization: { name: string }
      inviter: { user: { name: string, email: string } }
    }) => {
      // Accept links must open the app (SITE_URL), never the Convex site URL.
      const appUrl = readEnv('SITE_URL') ?? siteUrl ?? ''
      const url = `${appUrl}${invitationPath}?id=${data.id}`
      await emailSender!(emailCtx!, templates.invite({
        email: data.email,
        url,
        inviterName: data.inviter.user.name,
        inviterEmail: data.inviter.user.email,
        organizationName: data.organization.name,
        role: data.role,
      }))
    }
    : undefined

  const userPlugins = resolvedAuthOptions.plugins ?? []
  const userPluginIds = new Set(userPlugins.map(p => p.id))
  const defaultPlugins = [
    emailOTP({ sendVerificationOTP: makeSendVerificationOTP(runtime) }),
    defaultPasskey(),
    ...(adminOptions === false ? [] : [admin(adminOptions)]),
    ...(organizationEnabled
      ? [organization({
          ...organizationPluginOptions,
          ...(sendInvitationEmail ? { sendInvitationEmail } : {}),
        })]
      : []),
  ].filter(plugin => !userPluginIds.has(plugin.id))

  const sendVerificationEmail = canSendEmail
    ? async ({ user, url }: { user: { email: string }, url: string }) => {
      await emailSender!(emailCtx!, templates.verify({ email: user.email, url }))
    }
    : undefined

  const sendChangeEmailConfirmation = canSendEmail
    ? async ({ user, newEmail, url }: { user: { email: string }, newEmail: string, url: string }) => {
      await emailSender!(emailCtx!, templates.changeEmail({ email: user.email, newEmail, url }))
    }
    : undefined

  const sendDeleteAccountVerification = canSendEmail
    ? async ({ user, url }: { user: { email: string }, url: string }) => {
      await emailSender!(emailCtx!, templates.deleteAccount({ email: user.email, url }))
    }
    : undefined

  const onUserCreated = runtime?.onUserCreated
  // After a user is created: send the welcome email (if a transport is wired)
  // and run the consumer's onUserCreated hook (workflows, analytics).
  const createAfterHook = emailCtx
    ? async (user: { id: string, email: string, name: string }) => {
      if (canSendEmail) {
        await emailSender!(emailCtx, templates.welcome({ email: user.email, name: user.name }))
      }
      if (onUserCreated) {
        await onUserCreated(emailCtx, { id: user.id, email: user.email, name: user.name })
      }
    }
    : undefined

  return {
    ...resolvedAuthOptions,
    ...(siteUrl ? { baseURL: siteUrl } : {}),
    ...(secret ? { secret } : {}),
    basePath: resolvedBasePath,
    database,
    // Passwordless by default; consumers may still enable email+password here.
    emailAndPassword: {
      enabled: false,
      ...resolvedAuthOptions.emailAndPassword,
    },
    // Email change (confirmed via email) + account deletion (confirmed via email)
    // are enabled by default so the account system is complete out of the box.
    user: {
      ...resolvedAuthOptions.user,
      ...(sendChangeEmailConfirmation && !resolvedAuthOptions.user?.changeEmail
        ? { changeEmail: { enabled: true, sendChangeEmailConfirmation } }
        : {}),
      ...(sendDeleteAccountVerification && !resolvedAuthOptions.user?.deleteUser
        ? { deleteUser: { enabled: true, sendDeleteAccountVerification } }
        : {}),
    },
    ...(sendVerificationEmail && !resolvedAuthOptions.emailVerification
      ? { emailVerification: { sendVerificationEmail } }
      : {}),
    // Consumer-supplied databaseHooks win entirely (documented behavior).
    ...(!resolvedAuthOptions.databaseHooks && (createAfterHook || organizationEnabled)
      ? {
          databaseHooks: {
            ...(createAfterHook ? { user: { create: { after: createAfterHook } } } : {}),
            ...(organizationEnabled
              ? {
                  session: {
                    create: {
                      // Every new session gets an active workspace: the user's
                      // first membership, or (with `personal`) a workspace
                      // auto-created on first sign-in.
                      before: async (session: { userId: string } & Record<string, unknown>, hookCtx: unknown) => {
                        const activeOrganizationId = await ensureActiveOrganization(session.userId, hookCtx, personalWorkspace)
                        return activeOrganizationId ? { data: { ...session, activeOrganizationId } } : undefined
                      },
                    },
                  },
                }
              : {}),
          },
        }
      : {}),
    plugins: [
      convex({
        authConfig: resolvedAuthConfig,
        options: {
          basePath: resolvedBasePath,
        },
        jwt: {
          // Default payload (the user sans id/image) + the active workspace, so
          // Convex functions read org context straight from identity claims.
          definePayload: ({ user, session }) => {
            const { id: _id, image: _image, ...claims } = user
            if (!organizationEnabled) return claims
            const activeOrganizationId = (session as { activeOrganizationId?: string | null }).activeOrganizationId
            return activeOrganizationId ? { ...claims, activeOrganizationId } : claims
          },
        },
      }),
      ...defaultPlugins,
      ...userPlugins,
    ],
  } satisfies BetterAuthOptions
}

/** The minimal Better Auth adapter surface the workspace session hook needs. */
interface AuthHookAdapter {
  findOne: (args: { model: string, where: Array<{ field: string, value: unknown }> }) => Promise<unknown>
  create: (args: { model: string, data: Record<string, unknown> }) => Promise<unknown>
}

/**
 * Resolve the workspace a new session should activate: the user's first
 * membership, or — when `createPersonal` — a personal workspace created on the
 * spot (organization + owner membership rows via the Better Auth adapter).
 */
async function ensureActiveOrganization(
  userId: string,
  hookCtx: unknown,
  createPersonal: boolean,
): Promise<string | undefined> {
  const adapter = (hookCtx as { context?: { adapter?: AuthHookAdapter } } | undefined)?.context?.adapter
  if (!adapter) return undefined

  const membership = await adapter.findOne({
    model: 'member',
    where: [{ field: 'userId', value: userId }],
  }) as { organizationId?: string } | null
  if (membership?.organizationId) return membership.organizationId
  if (!createPersonal) return undefined

  const user = await adapter.findOne({
    model: 'user',
    where: [{ field: 'id', value: userId }],
  }) as { name?: string } | null
  const now = new Date()
  const workspace = await adapter.create({
    model: 'organization',
    data: {
      name: user?.name ? `${user.name}'s workspace` : 'Personal workspace',
      slug: `personal-${userId.toLowerCase()}`,
      createdAt: now,
    },
  }) as { id: string }
  await adapter.create({
    model: 'member',
    data: { organizationId: workspace.id, userId, role: 'owner', createdAt: now },
  })
  return workspace.id
}

/**
 * Shared factory that creates a Better Auth instance from a database adapter.
 *
 * Used by the public client bridge and by the component HTTP router so the
 * packaged component and app-facing wrapper stay aligned.
 */
export function createBetterAuth(
  database: ReturnType<ReturnType<typeof createClient>['adapter']>,
  options: CreateBetterAuthOptions = {},
) {
  return betterAuth(createBetterAuthOptions(database, options))
}

export function createAuthOptions<
  DM extends GenericDataModel,
  Schema extends SchemaDefinition<GenericSchema, true> = DefaultAuthSchema,
>(
  ctx: GenericCtx<DM>,
  components: AuthSetupComponents,
  options?: SetupAuthOptions<DM, Schema>,
) {
  const authComponent = createAuthComponent<DM, Schema>(components.backend, options)
  return createBetterAuthOptions(authComponent.adapter(ctx), {
    authConfig: options?.authConfig,
    authOptions: options?.authOptions,
    basePath: options?.basePath,
    admin: options?.admin,
    organization: options?.organization,
  }, { ctx, ...resolveIntegrations(components, options?.integrations) })
}

/**
 * Simple wrapper around the packaged auth component that runs in the app
 * environment.
 *
 * This follows Convex's simple function wrapper pattern: app code can pass the
 * component reference and Convex context in directly, while this helper handles
 * the cross-boundary adapter wiring and environment-backed auth creation.
 */
export function createAuth<
  DM extends GenericDataModel,
  Schema extends SchemaDefinition<GenericSchema, true> = DefaultAuthSchema,
>(
  ctx: GenericCtx<DM>,
  components: AuthSetupComponents,
  options?: SetupAuthOptions<DM, Schema>,
) {
  return betterAuth(createAuthOptions(ctx, components, options))
}

/**
 * Ready-made app query wrappers for re-exporting component functionality.
 *
 * This follows Convex's API remounting pattern for component client code.
 */
export function makeAuthApi<
  DM extends GenericDataModel,
  Schema extends SchemaDefinition<GenericSchema, true> = DefaultAuthSchema,
>(
  components: AuthSetupComponents,
  queryBuilder: QueryBuilder<DM, 'public'>,
  options?: SetupAuthOptions<DM, Schema>,
) {
  const authComponent = createAuthComponent<DM, Schema>(components.backend, options)

  const getAuthUser = queryBuilder({
    args: {},
    handler: async (ctx) => {
      return authComponent.getAuthUser(ctx)
    },
  })

  // Deployment-side view of cross-boundary auth config, for diagnostics: the
  // Convex-side `invitationPath` and the Nuxt-side `pages.acceptInvitation`
  // must point at the same route, and only `nuxt-backend doctor` can see both
  // sides to compare them.
  const organizationOptions = options?.organization
  const invitationPath = organizationOptions === false
    ? null
    : (typeof organizationOptions === 'object' ? organizationOptions.invitationPath : undefined) ?? DEFAULT_INVITATION_PATH
  const authConfig = queryBuilder({
    args: {},
    handler: async () => ({ invitationPath }),
  })

  return {
    getAuthUser,
    authConfig,
  }
}

/**
 * App-facing client bridge for the packaged Convex component.
 *
 * This convenience helper composes the simple wrapper and API remounting
 * patterns exported from this module.
 *
 * @example
 * ```ts
 * import { setupAuth } from 'nuxt-backend/auth'
 * import { components } from './_generated/api'
 * import { query } from './_generated/server'
 *
 * export const { authComponent, createAuth, getAuthUser } = setupAuth(
 *   components, query,
 * )
 * ```
 */
export function setupAuth<
  DM extends GenericDataModel,
  Schema extends SchemaDefinition<GenericSchema, true> = DefaultAuthSchema,
>(
  components: AuthSetupComponents,
  queryBuilder: QueryBuilder<DM, 'public'>,
  options?: SetupAuthOptions<DM, Schema>,
) {
  const authComponent = createAuthComponent<DM, Schema>(components.backend, options)
  const { getAuthUser, authConfig } = makeAuthApi(components, queryBuilder, options)

  const resolvedIntegrations = resolveIntegrations(components, options?.integrations)

  const createAuthOptionsForContext = (ctx: GenericCtx<DM>) => {
    return createBetterAuthOptions(authComponent.adapter(ctx), {
      authConfig: options?.authConfig,
      authOptions: options?.authOptions,
      basePath: options?.basePath,
      admin: options?.admin,
      organization: options?.organization,
    }, { ctx, ...resolvedIntegrations })
  }

  const createAuthForContext = (ctx: GenericCtx<DM>) => {
    return betterAuth(createAuthOptionsForContext(ctx))
  }

  return {
    authComponent,
    createAuthOptions: createAuthOptionsForContext,
    options: createAuthOptionsForContext({} as GenericCtx<DM>),
    createAuth: createAuthForContext,
    getAuthUser,
    authConfig,
  }
}
