import type { createClient } from '@convex-dev/better-auth'
import { convex } from '@convex-dev/better-auth/plugins'
import { APIError } from 'better-auth/api'
import type { BetterAuthOptions } from 'better-auth/minimal'
import { admin, emailOTP, organization } from 'better-auth/plugins'
import type { GenericDataModel } from 'convex/server'
import authConfig from '../auth.config.js'
import { DEFAULT_AUTH_ROUTE, DEFAULT_INVITATION_PATH, IMPERSONATED_BY_CLAIM } from '../constants.js'
import { agentConsent } from './agent-consent.js'
import type { AuthBuildOptions, CanSignInInput } from './auth-types.js'
import { makeSendVerificationOTP, resolveTemplates } from './email.js'
import { assertCanSignIn, DEFAULT_REFUSAL, makeRequestHooks } from './guards.js'
import { type DatabaseHooks, mergeDatabaseHooks } from './hooks.js'
import { type DefaultAuthPlugin, defaultMcp, defaultPasskey } from './plugins.js'
import { type AuthRuntime, asMutationCtx, readEnv } from './runtime.js'
import { ensureActiveOrganization, hookAdapter } from './workspaces.js'

/**
 * The one place the auth options are assembled: `setupAuth` builds every
 * auth instance through it, per request ctx. Tests call it with a memory
 * adapter to run real flows.
 *
 * @internal
 */
export function buildAuthOptions<DM extends GenericDataModel = GenericDataModel>(
  database: ReturnType<ReturnType<typeof createClient>['adapter']>,
  options: AuthBuildOptions = {},
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

  const {
    invitationPath = DEFAULT_INVITATION_PATH,
    ...organizationPluginOptions
  } = options.organization ?? {}

  // When an email transport is wired, deliver the sign-in, verification and
  // email-change codes, and the delete-account, welcome and
  // workspace-invitation emails through it (default templates, overridable
  // through `emailTemplates`). User-supplied options win.
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
      // Accept links must open the app (SITE_URL), never the Convex site URL —
      // so read the explicit baseURL, not `siteUrl`, which falls back to
      // CONVEX_SITE_URL. That baseURL may be Better Auth's dynamic form
      // ({ allowedHosts, fallback }), which has no single origin to put in an
      // email: use its fallback, never the object ("[object Object]/…").
      const explicitUrl = resolvedAuthOptions.baseURL
      const appUrl = readEnv('SITE_URL') ?? (typeof explicitUrl === 'string' ? explicitUrl : explicitUrl?.fallback) ?? ''
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
  // Note: the mcp/jwt defaults must sit AFTER the convex plugin in the final
  // plugins array — the convex plugin embeds its own oidc provider whose
  // login-resume after-hook fires on the same `oidc_login_prompt` cookie, and
  // better-auth's after-hooks are last-write-wins, so the mcp plugin's resume
  // (which knows the agent scopes) must run later to own the response.
  const defaultPlugins = [
    emailOTP({
      sendVerificationOTP: makeSendVerificationOTP(runtime),
      // Only a hash is stored: a database read never yields a usable code.
      storeOTP: 'hashed',
      // Codes, never links: a link signs in whoever opens it, a code proves
      // the person holds the mailbox. An email change needs a code from the
      // current address, then one from the new address.
      changeEmail: { enabled: true, verifyCurrentEmail: true },
      overrideDefaultEmailVerification: true,
    }),
    defaultPasskey(),
    admin(options.admin),
    organization({
      ...organizationPluginOptions,
      ...(sendInvitationEmail ? { sendInvitationEmail } : {}),
    }),
    // No top-level jwt() here: better-auth dedupes plugins by id, and a
    // second jwt displaces the convex plugin's internal custom-path jwt —
    // 404ing /convex/token (the client token bridge). The exchange's signJWT
    // lives on a separate sign-only instance instead (setupAuth).
    defaultMcp(options.mcp),
    agentConsent() as DefaultAuthPlugin,
  ].filter(plugin => !userPluginIds.has(plugin.id))

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

  // The sign-in gate, bound to the request ctx. The OTP request already asked
  // it before sending anything; these are the authoritative backstops on the
  // write path itself — every account-creation route, and every session for
  // an existing account (passkey sign-in included; passkey *registration*
  // requires a session, so a passkey can never create an account).
  const canSignIn = runtime?.canSignIn
  const gate = canSignIn && emailCtx
    ? (input: CanSignInInput) => assertCanSignIn(canSignIn, emailCtx, input)
    : undefined
  const createBeforeHook = gate
    ? async (user: { email: string }) => {
      await gate({ email: user.email, isNewUser: true, purpose: 'user-create' })
    }
    : undefined
  const sessionBeforeHook = async (session: { userId: string } & Record<string, unknown>, hookCtx: unknown) => {
    // Every new session gets an active workspace: the user's first
    // membership, or a personal workspace created on first sign-in.
    const activeOrganizationId = await ensureActiveOrganization(session.userId, hookCtx)
    if (gate) {
      const user = await hookAdapter(hookCtx)?.findOne({
        model: 'user',
        where: [{ field: 'id', value: session.userId }],
      }) as { email?: string } | null | undefined
      // Fail closed: a gate that cannot see the account refuses the session.
      if (!user?.email) throw new APIError('FORBIDDEN', { message: DEFAULT_REFUSAL })
      await gate({ email: user.email, isNewUser: false, purpose: 'session' })
    }
    return activeOrganizationId ? { data: { ...session, activeOrganizationId } } : undefined
  }
  const packageHooks: DatabaseHooks = {
    ...(createBeforeHook || createAfterHook
      ? {
          user: {
            create: {
              ...(createBeforeHook ? { before: createBeforeHook } : {}),
              ...(createAfterHook ? { after: createAfterHook } : {}),
            },
          },
        }
      : {}),
    session: { create: { before: sessionBeforeHook } },
  }

  // Account deletion: on by default (confirmed via email when a transport is
  // wired), merged with the consumer's own `deleteUser` options — theirs win
  // field by field — and `onUserDeleted` chained after their `afterDelete`.
  const consumerDeleteUser = resolvedAuthOptions.user?.deleteUser
  const onUserDeleted = runtime?.onUserDeleted
  const afterDelete = onUserDeleted && emailCtx
    ? async (user: { id: string, email: string, name: string }, request?: Request) => {
      await consumerDeleteUser?.afterDelete?.(user as never, request)
      await onUserDeleted(emailCtx, { id: user.id, email: user.email, name: user.name })
    }
    : consumerDeleteUser?.afterDelete
  const deleteUser = sendDeleteAccountVerification || consumerDeleteUser || afterDelete
    ? {
        enabled: true,
        ...(sendDeleteAccountVerification ? { sendDeleteAccountVerification } : {}),
        ...consumerDeleteUser,
        ...(afterDelete ? { afterDelete } : {}),
      }
    : undefined

  // Opt-in for local development: trust the loopback origins the Nuxt dev
  // server actually runs on (any port), in addition to SITE_URL. Off unless
  // AUTH_TRUST_LOCAL_ORIGINS is set on the deployment — never enable in prod.
  const trustLocalOrigins = readEnv('AUTH_TRUST_LOCAL_ORIGINS') === '1'
  const configuredTrusted = resolvedAuthOptions.trustedOrigins
  type TrustedOriginsFn = Extract<NonNullable<BetterAuthOptions['trustedOrigins']>, (...args: never[]) => unknown>
  // Better Auth also evaluates trustedOrigins without a request (e.g. while
  // building the session/CSRF context), so the request is optional here.
  const loopbackOrigins: TrustedOriginsFn = (async (request?: Request) => {
    const base = typeof configuredTrusted === 'function'
      ? await (configuredTrusted as (request?: Request) => unknown)(request)
      : configuredTrusted
    const list = (Array.isArray(base) ? base : []).filter((entry): entry is string => typeof entry === 'string')
    const origin = request?.headers?.get('origin') ?? ''
    const isLoopback = /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(origin)
    return isLoopback ? [...list, origin] : list
  }) as TrustedOriginsFn
  const trustedOrigins: BetterAuthOptions['trustedOrigins'] = trustLocalOrigins ? loopbackOrigins : configuredTrusted

  const databaseHooks = mergeDatabaseHooks(packageHooks, resolvedAuthOptions.databaseHooks)
  const hooks = makeRequestHooks(runtime, resolvedAuthOptions.hooks)

  return {
    ...resolvedAuthOptions,
    ...(siteUrl ? { baseURL: siteUrl } : {}),
    ...(secret ? { secret } : {}),
    ...(trustedOrigins ? { trustedOrigins } : {}),
    basePath: resolvedBasePath,
    database,
    // Passwordless by default; consumers may still enable email+password here.
    emailAndPassword: {
      enabled: false,
      ...resolvedAuthOptions.emailAndPassword,
    },
    // Account deletion (confirmed via email) is on by default so the account
    // system is complete out of the box. Email changes go through the email
    // OTP plugin's code flow above, never the core link flow.
    user: {
      ...resolvedAuthOptions.user,
      ...(deleteUser ? { deleteUser } : {}),
    },
    // Better Auth's own limiter keeps its counters in memory, which on Convex
    // lives no longer than one function call: it would limit nothing. The
    // package's limits run in the request guard on the rate-limiter component
    // instead. `authOptions.rateLimit` still turns it on, with storage of your
    // choosing.
    rateLimit: { enabled: false, ...resolvedAuthOptions.rateLimit },
    // The package's hooks compose with consumer-supplied databaseHooks —
    // per model and operation, ours run first, theirs second (see
    // mergeDatabaseHooks) — so a consumer hook extends the packaged
    // behaviour rather than replacing it.
    ...(databaseHooks ? { databaseHooks } : {}),
    // The OTP request guard (and any consumer before-hook after it).
    hooks,
    plugins: [
      convex({
        authConfig: resolvedAuthConfig,
        options: {
          basePath: resolvedBasePath,
        },
        jwt: {
          // Default payload (the user sans id/image), the active workspace and,
          // while an admin impersonates the user, that admin: Convex functions
          // read both straight from identity claims.
          definePayload: ({ user, session }) => {
            const { id: _id, image: _image, ...claims } = user
            const { activeOrganizationId, impersonatedBy } = session as { activeOrganizationId?: string | null, impersonatedBy?: string | null }
            return {
              ...claims,
              ...(activeOrganizationId ? { activeOrganizationId } : {}),
              ...(impersonatedBy ? { [IMPERSONATED_BY_CLAIM]: impersonatedBy } : {}),
            }
          },
        },
      }),
      ...defaultPlugins,
      ...userPlugins,
    ],
  } satisfies BetterAuthOptions
}
