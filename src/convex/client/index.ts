import { createClient, type GenericCtx } from '@convex-dev/better-auth'
import { convex } from '@convex-dev/better-auth/plugins'
import { passkey } from '@better-auth/passkey'
import { APIError, getSessionFromCtx } from 'better-auth/api'
import { setSessionCookie } from 'better-auth/cookies'
import { betterAuth, type BetterAuthOptions } from 'better-auth/minimal'
import { emailOTP } from 'better-auth/plugins'
import type { AnyComponents, AuthConfig, FunctionReference, GenericActionCtx, GenericDataModel, GenericMutationCtx, GenericSchema, QueryBuilder, SchemaDefinition } from 'convex/server'
import authConfig from '../auth.config'
import { DEFAULT_AUTH_ROUTE } from '../component/constants'
import { authSchema } from '../component/schema'

/**
 * Client-supplied details for passkey-first registration.
 *
 * The Better Auth passkey endpoint forwards this as an opaque `context`
 * string. We default to a small JSON shape: `{ email, name }`.
 */
interface PasskeyRegistrationContext {
  email: string
  name: string
}

function parsePasskeyContext(context?: string | null): PasskeyRegistrationContext {
  if (!context) {
    throw APIError.from('BAD_REQUEST', {
      code: 'INVALID_PASSKEY_REGISTRATION',
      message: 'Passkey registration details are missing.',
    })
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(context)
  }
  catch {
    throw APIError.from('BAD_REQUEST', {
      code: 'INVALID_PASSKEY_REGISTRATION',
      message: 'Passkey registration details are invalid.',
    })
  }
  const { email, name } = (parsed ?? {}) as Partial<PasskeyRegistrationContext>
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : ''
  const normalizedName = typeof name === 'string' ? name.trim() : ''
  if (!normalizedEmail || !normalizedEmail.includes('@')) {
    throw APIError.from('BAD_REQUEST', {
      code: 'INVALID_PASSKEY_REGISTRATION',
      message: 'Enter a valid email address.',
    })
  }
  if (!normalizedName) {
    throw APIError.from('BAD_REQUEST', {
      code: 'INVALID_PASSKEY_REGISTRATION',
      message: 'Enter your name to register a passkey.',
    })
  }
  return { email: normalizedEmail, name: normalizedName }
}

function accountExistsError() {
  return APIError.from('UNPROCESSABLE_ENTITY', {
    code: 'PASSKEY_REGISTRATION_ACCOUNT_EXISTS',
    message: 'An account already exists for this email. Sign in first, then add a passkey.',
  })
}

/**
 * Default passkey plugin: enables passkey-first (pre-auth) registration so
 * users can create an account with just a passkey. When unauthenticated, the
 * client passes `{ email, name }` as the `context` argument when calling
 * `addPasskey`. When the user already has a session, the passkey is attached
 * to the current user and `context` is ignored.
 *
 * Override by passing your own `passkey(...)` plugin in `authOptions.plugins`.
 */
function defaultPasskey() {
  return passkey({
    registration: {
      requireSession: false,
      resolveUser: async ({ ctx, context }) => {
        const { email, name } = parsePasskeyContext(context)
        const existing = await ctx.context.internalAdapter.findUserByEmail(email)
        if (existing) throw accountExistsError()
        return { id: `passkey-registration:${email}`, name: email, displayName: name }
      },
      afterVerification: async ({ ctx, context }) => {
        // If a session already exists, this is an "add passkey to current
        // user" flow — the plugin will associate the new passkey with the
        // session user, so we have nothing to do here.
        const existingSession = await getSessionFromCtx(ctx)
        if (existingSession?.user?.id) return

        const { email, name } = parsePasskeyContext(context)
        const existing = await ctx.context.internalAdapter.findUserByEmail(email)
        if (existing) throw accountExistsError()
        const user = await ctx.context.internalAdapter.createUser({
          email,
          emailVerified: false,
          name,
        })
        const session = await ctx.context.internalAdapter.createSession(user.id)
        await setSessionCookie(ctx, { session, user })
        return { userId: user.id }
      },
    },
  })
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
 * Resend component nested inside `backend` (`components.backend.email.send`),
 * so auth OTP / verification / reset email works out of the box — but any
 * compatible function can be supplied via `integrations.email` to override it.
 */
export type AuthEmailSender = (ctx: AuthMutationCtx, message: AuthEmailMessage) => Promise<unknown>

/** The named rate limits the auth flows consult (a subset of the defaults). */
export type AuthRateLimitName = 'emailOtp' | 'signIn' | 'signUp' | 'passwordReset'

/**
 * Guards auth-sensitive flows. Satisfied by `setupRateLimiter(...)` from
 * `nuxt-backend/convex/rate-limit` (which seeds these named limits).
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
 * Cross-component wiring for Better Auth. All optional and fully backward
 * compatible: with none supplied, auth behaves exactly as before (OTP logs to
 * the console). Provide an `email` transport to deliver OTP / verification /
 * reset emails, a `rateLimiter` to throttle OTP sends, and `onUserCreated` to
 * run side effects (durable workflows, analytics) on signup.
 */
export interface AuthIntegrations<DM extends GenericDataModel = GenericDataModel> {
  email?: AuthEmailSender
  rateLimiter?: AuthRateLimiter
  onUserCreated?: OnUserCreated<DM>
  /** Override any of the default auth-email templates (welcome/otp/verify/change/delete). */
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
      console.warn(
        `[nuxt-backend] No email transport configured. Email OTP (${data.type}) for ${data.email}: ${data.otp}`,
      )
      return
    }
    if (runtime.rateLimiter) {
      const { ok } = await runtime.rateLimiter.limit(ctx, 'emailOtp', { key: data.email })
      if (!ok) throw new Error('Too many verification requests. Please try again in a moment.')
    }
    await runtime.email(ctx, resolveTemplates(runtime).otp(data))
  }
}

export interface CreateBetterAuthOptions {
  /** Override the default auth config (e.g. to add custom providers) */
  authConfig?: AuthConfig
  /** Override Better Auth options (merged with defaults) */
  authOptions?: BetterAuthOptions
  /** Override Better Auth basePath and matching Convex auth route */
  basePath?: string
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

type EnvHost = typeof globalThis & {
  process?: {
    env?: Record<string, string | undefined>
  }
}

function toAuthComponentApi(componentRef: PublicAuthComponentRef): AuthComponentApi {
  return componentRef as AuthComponentApi
}

/**
 * The email-send function the `backend` component exposes via its nested Resend
 * child (see `src/convex/component/email.ts`).
 */
type ComponentEmailRef = FunctionReference<
  'mutation',
  'internal',
  { to: string, subject: string, html?: string, text?: string, from?: string },
  string | null
>

/**
 * Build an {@link AuthEmailSender} that routes auth emails through the backend
 * component's nested Resend. This is what makes transactional email work out of
 * the box — the consumer just mounts `backend` and sets `RESEND_API_KEY`.
 *
 * Returns `undefined` only if the component ref doesn't expose `email.send`
 * (older component builds), in which case auth falls back to logging OTPs.
 */
function componentEmailSender(componentRef: PublicAuthComponentRef): AuthEmailSender | undefined {
  // The backend component exposes `email.send`, but the loose `PublicAuthComponentRef`
  // type doesn't surface it; read it structurally.
  const send = (componentRef as { email?: { send?: ComponentEmailRef } }).email?.send
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
  componentRef: PublicAuthComponentRef,
  integrations?: AuthIntegrations<DM>,
): AuthIntegrations<DM> {
  const email = componentEmailSender(componentRef)
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
  // authOptions.baseURL > SITE_URL > BETTER_AUTH_URL > CONVEX_SITE_URL.
  const siteUrl = resolvedAuthOptions.baseURL
    ?? readEnv('SITE_URL')
    ?? readEnv('BETTER_AUTH_URL')
    ?? readEnv('CONVEX_SITE_URL')
  const secret = resolvedAuthOptions.secret ?? readEnv('BETTER_AUTH_SECRET')

  const userPlugins = resolvedAuthOptions.plugins ?? []
  const userPluginIds = new Set(userPlugins.map(p => p.id))
  const defaultPlugins = [
    emailOTP({ sendVerificationOTP: makeSendVerificationOTP(runtime) }),
    defaultPasskey(),
  ].filter(plugin => !userPluginIds.has(plugin.id))

  // When an email transport is wired, deliver verification, email-change,
  // delete-account, and welcome emails through it (with default templates,
  // overridable via integrations.emailTemplates). User-supplied options win.
  // Note: this package is passwordless (passkey + OTP) — no password-reset flow.
  const emailSender = runtime?.email
  const emailCtx = asMutationCtx(runtime?.ctx)
  const canSendEmail = Boolean(emailSender && emailCtx)
  const templates = resolveTemplates(runtime)

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
    ...(createAfterHook && !resolvedAuthOptions.databaseHooks
      ? { databaseHooks: { user: { create: { after: createAfterHook } } } }
      : {}),
    plugins: [
      convex({
        authConfig: resolvedAuthConfig,
        options: {
          basePath: resolvedBasePath,
        },
      }),
      ...defaultPlugins,
      ...userPlugins,
    ],
  } satisfies BetterAuthOptions
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
  componentRef: PublicAuthComponentRef,
  options?: SetupAuthOptions<DM, Schema>,
) {
  const authComponent = createAuthComponent<DM, Schema>(componentRef, options)
  return createBetterAuthOptions(authComponent.adapter(ctx), {
    authConfig: options?.authConfig,
    authOptions: options?.authOptions,
    basePath: options?.basePath,
  }, { ctx, ...resolveIntegrations(componentRef, options?.integrations) })
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
  componentRef: PublicAuthComponentRef,
  options?: SetupAuthOptions<DM, Schema>,
) {
  return betterAuth(createAuthOptions(ctx, componentRef, options))
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
  componentRef: PublicAuthComponentRef,
  queryBuilder: QueryBuilder<DM, 'public'>,
  options?: SetupAuthOptions<DM, Schema>,
) {
  const authComponent = createAuthComponent<DM, Schema>(componentRef, options)

  const getAuthUser = queryBuilder({
    args: {},
    handler: async (ctx) => {
      return authComponent.getAuthUser(ctx)
    },
  })

  return {
    getAuthUser,
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
 * import { setupAuth } from 'nuxt-backend/convex'
 * import { components } from './_generated/api'
 * import { query } from './_generated/server'
 *
 * export const { authComponent, createAuth, getAuthUser } = setupAuth(
 *   components.backend, query,
 * )
 * ```
 */
export function setupAuth<
  DM extends GenericDataModel,
  Schema extends SchemaDefinition<GenericSchema, true> = DefaultAuthSchema,
>(
  componentRef: PublicAuthComponentRef,
  queryBuilder: QueryBuilder<DM, 'public'>,
  options?: SetupAuthOptions<DM, Schema>,
) {
  const authComponent = createAuthComponent<DM, Schema>(componentRef, options)
  const { getAuthUser } = makeAuthApi(componentRef, queryBuilder, options)

  const resolvedIntegrations = resolveIntegrations(componentRef, options?.integrations)

  const createAuthOptionsForContext = (ctx: GenericCtx<DM>) => {
    return createBetterAuthOptions(authComponent.adapter(ctx), {
      authConfig: options?.authConfig,
      authOptions: options?.authOptions,
      basePath: options?.basePath,
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
  }
}
