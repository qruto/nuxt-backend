import type { createClient } from '@convex-dev/better-auth'
import { convex } from '@convex-dev/better-auth/plugins'
import type { BetterAuthOptions } from 'better-auth/minimal'
import { emailOTP, organization } from 'better-auth/plugins'
import type { GenericDataModel } from 'convex/server'
import authConfig from '../auth.config.js'
import { AUTH_TIME_CLAIM, IMPERSONATED_BY_CLAIM, OTP_EXPIRES_IN_SECONDS, RECENT_SIGN_IN_SECONDS, RESERVED_CLAIMS, SIGN_IN_METHOD_CLAIM, SIGN_IN_METHODS } from '../constants.js'
import type { AdminPluginOptions, AuthBuildOptions, AuthEmail, CanSignInInput } from './auth-types.js'
import { keyedCodeHash, replaceEarlierCodes } from './codes.js'
import { announceEntity } from './entities.js'
import { makeSendVerificationOTP } from './email.js'
import { requestLocale } from './request-origin.js'
import { resolveBrand } from '../email-templates.js'
import type { Email } from '../integrations/email.js'
import { normalizeLocale } from '../locale.js'
import { auditDatabaseHooks, recordSignedUp } from './audit.js'
import { checkNewDevice } from './devices.js'
import { clientAddressPlugin } from './client-address.js'
import { assertCanSignIn, challengePlugin, disabledRoutes, makeRequestHooks, reauthenticatedWorkspace, reauthenticating } from './guards.js'
import { authRefusal } from './refusals.js'
import { pausedData } from '../pauses.js'
import { type DatabaseHooks, mergeDatabaseHooks } from './hooks.js'
import { ACCOUNT_FIELDS, administratorsOf, defaultAdmin, type DefaultAuthPlugin, defaultLastLoginMethod, defaultPasskey, SESSION_FIELDS, sessionSignInMethod } from './plugins.js'
import { isAdministrator } from '../integrations/access.js'
import { CLIENT_IP_HEADER, protectionEnv } from '../proof.js'
import { resolveBackendPaths } from '../paths.js'
import { type AuthRuntime, asMutationCtx, hookAdapter, readEnv } from './runtime.js'
import { ensureActiveWorkspace, organizationOptions } from './workspaces.js'
import { assertAgeOnCreate, recordSignUpConsents } from './age-gate.js'
import { claimGuestJobs } from './guest-claim.js'
import { creationTicket, recordTicketUsed } from './launch-gate.js'
import { passkeyOnlyPlugin } from './passkey-only.js'
import { backendEnvironment } from '../delivery.js'
import { trustsLocalOrigins } from '../environment.js'
import { isLocalOrigin } from '../local-origins.js'
import { logBackend } from '../log.js'
import { secretRotationPlugin } from './secret-rotation.js'
import { authLibrarySecretOptions, authSecrets, oldestSecret } from '../auth-secrets.js'

/**
 * The routes that open a session from a code or a password: a passkey-only
 * account opens none (a password an app's `emailAndPassword` lets someone
 * set is no way around the passkey either).
 */
const CODE_SESSION_PATHS = new Set(['/sign-in/email-otp', '/email-otp/verify-email', '/email-otp/reset-password', '/sign-in/email'])

/**
 * A session token's claims: the user's fields but its id, its image, how it
 * last signed in and the app shell's two marks (`onboardedAt`,
 * `activationDismissedAt`, which the shell reads live), the language the account reads in as the OpenID
 * `locale` claim (`identity.language` in a Convex function), the active
 * workspace, when the person signed in to the
 * session (`authTime`, epoch milliseconds), how they signed in to it
 * (`signInMethod`, the session's own) and, while an admin impersonates
 * the user, that admin — Convex functions read them straight from identity
 * claims. A user field never writes a claim only the package writes
 * (`RESERVED_CLAIMS`): an app's own field named `impersonatedBy`,
 * `authTime` must not make a session read as an impersonation or a
 * recent sign-in.
 */
export function sessionClaims({ user, session }: { user: Record<string, unknown> & { id: string }, session: Record<string, unknown> }): Record<string, unknown> {
  // A recovery session gets no token: no function runs as the account until
  // it saves a passkey. The Convex plugin mints one after every sign-in and
  // session read, past the request guard, so the refusal lives here; the
  // plugin swallows it and sets no cookie.
  if (session.passkeyRecovery) throw authRefusal('forbidden', { reason: 'passkey_required' })
  // How the account last signed in is the sign-in form's, not a caller's:
  // it changes with every sign-in and says nothing a function needs.
  const { id: _id, image: _image, lastLoginMethod: _lastLoginMethod, onboardedAt: _onboardedAt, activationDismissedAt: _dismissedAt, ...fields } = user
  const claims = Object.fromEntries(Object.entries(fields).filter(([key]) => !RESERVED_CLAIMS.includes(key)))
  // The package's own `locale` field is the standard claim of that name,
  // as a language tag only: no other value reaches it.
  const locale = normalizeLocale(user.locale)
  const { activeOrganizationId, impersonatedBy, createdAt, signInMethod } = session as { activeOrganizationId?: string | null, impersonatedBy?: string | null, createdAt?: Date | string | number | null, signInMethod?: unknown }
  const authTime = createdAt == null ? Number.NaN : new Date(createdAt).getTime()
  return {
    ...claims,
    ...(locale ? { locale } : {}),
    ...(activeOrganizationId ? { activeOrganizationId } : {}),
    ...(impersonatedBy ? { [IMPERSONATED_BY_CLAIM]: impersonatedBy } : {}),
    ...(Number.isFinite(authTime) ? { [AUTH_TIME_CLAIM]: authTime } : {}),
    // How this session was signed in to, never the account's last sign-in: a visit has none.
    ...(!impersonatedBy && (SIGN_IN_METHODS as readonly unknown[]).includes(signInMethod) ? { [SIGN_IN_METHOD_CLAIM]: signInMethod } : {}),
  }
}

/**
 * What a new session opens with beside Better Auth's own fields: its active
 * workspace, and how the person signed in to it, by the route that opens it
 * (the session's own method, for its token; an administrator's visit has
 * none). `undefined` when it adds neither.
 */
function openedSession(session: Record<string, unknown>, activeOrganizationId: string | undefined, hookCtx: unknown): { data: Record<string, unknown> } | undefined {
  const signInMethod = session.impersonatedBy ? null : sessionSignInMethod((hookCtx as { path?: string } | null)?.path)
  if (!activeOrganizationId && !signInMethod) return undefined
  return { data: { ...session, ...(activeOrganizationId ? { activeOrganizationId } : {}), ...(signInMethod ? { signInMethod } : {}) } }
}

/**
 * The one place the auth options are assembled: `setupAuth` builds every
 * auth instance through it, per request ctx. Tests call it with a memory
 * adapter to run real flows.
 *
 * @internal
 */
export function buildAuthOptions<DM extends GenericDataModel = GenericDataModel>(
  database: ReturnType<ReturnType<typeof createClient>['adapter']>,
  options: AuthBuildOptions<DM> = {},
  runtime?: AuthRuntime<DM>,
) {
  const resolvedAuthConfig = options.authConfig ?? authConfig
  const resolvedAuthOptions = options.authOptions ?? {}
  const paths = resolveBackendPaths(options.paths, 'setupAuth')
  const resolvedBasePath = paths.authRoute
  // Better Auth needs an explicit baseURL or it warns and derives the origin
  // from each incoming request. The app proxies /api/auth to the Convex site,
  // so default to CONVEX_SITE_URL (always present on a Convex deployment) when
  // the consumer hasn't set an app URL. Override precedence: explicit
  // authOptions.baseURL > SITE_URL > CONVEX_SITE_URL.
  const siteUrl = resolvedAuthOptions.baseURL
    ?? readEnv('SITE_URL')
    ?? readEnv('CONVEX_SITE_URL')
  // A versioned AUTH_SECRET (`nuxt-backend env rotate`) becomes the auth
  // library's `secrets`, current first, with the plain secret it replaced as
  // the fallback for what was encrypted before; an app's own `secret` wins.
  const deployed = authSecrets(readEnv('AUTH_SECRET'))
  const secretOptions = resolvedAuthOptions.secret ? { secret: resolvedAuthOptions.secret } : authLibrarySecretOptions(deployed)
  // Sign-in codes are hashed under the oldest live secret: a rotation leaves a code in flight working.
  const codeSecret = resolvedAuthOptions.secret ?? (deployed ? oldestSecret(deployed) : undefined)
  // The app's name where Better Auth shows one (a passkey prompt names its
  // relying party after it): the name the emails sign with.
  const appName = resolvedAuthOptions.appName ?? (brandName(runtime?.email) || undefined)

  const invitationPath = paths.acceptInvitation

  // Deliver the sign-in, verification and email-change codes, and the
  // welcome and workspace-invitation emails through the app's email
  // instance, which holds the templates (`setupEmail({ templates })`).
  // User-supplied options win.
  // Note: this package is passwordless (passkey + OTP): the password-reset
  // code routes are off unless the app turns passwords on (disabledRoutes).
  const email = runtime?.email
  const emailCtx = asMutationCtx(runtime?.ctx)
  const canSendEmail = Boolean(email && emailCtx)

  // Workspace invitations: email the invitee an accept link pointing at the
  // app's invitation page.
  const sendInvitationEmail = canSendEmail
    ? async (data: {
      id: string
      role: string
      email: string
      organization: { name: string }
      inviter: { user: { id: string, name: string, email: string } }
    }) => {
      // Accept links must open the app (SITE_URL), never the Convex site URL —
      // so read the explicit baseURL, not `siteUrl`, which falls back to
      // CONVEX_SITE_URL. That baseURL may be Better Auth's dynamic form
      // ({ allowedHosts, fallback }), which has no single origin to put in an
      // email: use its fallback, never the object ("[object Object]/…").
      const explicitUrl = resolvedAuthOptions.baseURL
      const appUrl = readEnv('SITE_URL') ?? (typeof explicitUrl === 'string' ? explicitUrl : explicitUrl?.fallback) ?? ''
      const url = `${appUrl}${invitationPath}?id=${data.id}`
      // No idempotency key: every send is a new issuance (a resend moves the
      // expiry), so a key would never match a second send. In the invitee's
      // language when they have an account, else the inviter's.
      await email!.sendTemplate(emailCtx!, 'invite', {
        email: data.email,
        url,
        inviterName: data.inviter.user.name,
        inviterEmail: data.inviter.user.email,
        workspaceName: data.organization.name,
        role: data.role,
      }, { senderId: data.inviter.user.id })
    }
    : undefined

  const userPlugins = resolvedAuthOptions.plugins ?? []
  const userPluginIds = new Set(userPlugins.map(p => p.id))
  // Whose accounts are never impersonated, and who may turn an account's
  // passkey-only off: the administrators the admin plugin in use names, an
  // app's own `admin(...)` included.
  const adminPlugin = userPlugins.find(plugin => plugin.id === 'admin') as { options?: AdminPluginOptions } | undefined
  const administrators = administratorsOf(adminPlugin ? adminPlugin.options : options.admin)
  // Bot protection, as the deployment's env sets it: a challenge verified by
  // Better Auth's captcha plugin (an app's own `captcha` plugin replaces it,
  // and with it the package's challenge), and the proof the app's server
  // signs, which the request guard checks whenever the package's challenge
  // does not run: an app's own plugin may cover other routes, and never
  // takes a proof.
  const protection = protectionEnv()
  const challenge = protection.challengeSecretKey && !userPluginIds.has('captcha') ? challengePlugin(protection.challengeSecretKey, protection.proofSecret) : undefined
  const defaultPlugins = [
    emailOTP({
      sendVerificationOTP: makeSendVerificationOTP(runtime),
      // Only a hash keyed by the auth secret is stored: a database read
      // yields no usable code, and no way to compute one.
      storeOTP: keyedCodeHash(codeSecret),
      // The code's lifetime, which its email's delivery also stops at.
      expiresIn: OTP_EXPIRES_IN_SECONDS,
      // Three wrong guesses end a code (Better Auth's default, said here).
      allowedAttempts: 3,
      // Codes, never links: a link signs in whoever opens it, a code proves
      // the person holds the mailbox. An email change needs a code from the
      // current address, then one from the new address.
      changeEmail: { enabled: true, verifyCurrentEmail: true },
      overrideDefaultEmailVerification: true,
    }),
    defaultPasskey(),
    // How each sign-in was made: on the account, and in a cookie the sign-in
    // form reads to mark the method "Last used".
    defaultLastLoginMethod(),
    // Impersonations last at most thirty minutes (IMPERSONATION_SESSION_SECONDS).
    defaultAdmin(options.admin),
    // Passkey-only accounts: the switch, the recovery code and its session.
    passkeyOnlyPlugin({ administrators, runtime }) as DefaultAuthPlugin,
    organization(organizationOptions(options.workspaces, runtime, sendInvitationEmail)),
    ...(challenge ? [challenge as DefaultAuthPlugin] : []),
    // Sessions signed before an AUTH_SECRET rotation keep working until the previous secret retires.
    secretRotationPlugin(),
  ].filter(plugin => !userPluginIds.has(plugin.id))

  const onUserCreated = runtime?.onUserCreated
  // After a user is created: send the welcome email (if a transport is wired)
  // and run the consumer's onUserCreated hook (workflows, analytics). The
  // account exists by now, so a welcome that cannot go out (test mode refusing
  // a real address, an override that renders no body) is logged, not thrown:
  // a throw would fail the sign-up the person just completed and skip
  // onUserCreated.
  const createAfterHook = emailCtx
    ? async (user: { id: string, email: string, name: string, locale?: string | null }, hookCtx: unknown) => {
      // The ticket that admitted it, on its ledger row and the activity trail;
      // then the sign-up itself, the growth funnel's step, with that invite.
      await recordSignedUp(runtime, user, await recordTicketUsed(runtime, user))
      // What it agreed to at sign-up, and the consents its address gave before.
      await recordSignUpConsents(runtime, user, hookCtx)
      // The guest jobs its browser started signed out (defineJobQueue({ guest })).
      await claimGuestJobs(runtime, user, hookCtx)
      if (canSendEmail) {
        // The lifecycle flows that start at sign-up start; the welcome flow, when on, sends the welcome in place of the packaged one.
        // A failure there starts none of them, and the packaged welcome goes.
        let flows = { welcome: false }
        try {
          if (email!.lifecycle) flows = await email!.lifecycle.signedUp(emailCtx, user)
        }
        catch (error) {
          logBackend('warn', 'email.lifecycle_unstarted', 'A new account\'s sign-up did not reach the lifecycle flows; none of them started for it, and the packaged welcome email goes instead.', error)
        }
        try {
          // Better Auth runs an after-hook again when it throws (a failing
          // onUserCreated, say); the key keeps the welcome to one.
          if (!flows.welcome) await email!.sendTemplate(emailCtx, 'welcome', { email: user.email, name: user.name }, { locale: user.locale, idempotencyKey: `nuxt-backend:welcome:${user.id}` })
        }
        catch (error) {
          logBackend('warn', 'auth.welcome_unsent', 'A new account\'s welcome email was not sent; the account was created and onUserCreated still runs.', error)
        }
      }
      // An account is a billing entity with `billTo: 'user'`: billing's free plan hears of it.
      await announceEntity(runtime, { kind: 'user', id: user.id })
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
  // Before an account is created: the sign-ups kill switch (the code
  // request asked it already; this is the backstop on every route that
  // creates an account), the sign-in gate, then the language it reads in,
  // from the request that creates it unless the request named one.
  const paused = runtime?.paused
  const createBeforeHook = async (user: { email: string, locale?: string | null } & Record<string, unknown>, hookCtx: unknown) => {
    if (paused && emailCtx && await paused(emailCtx, 'signups')) throw authRefusal('unavailable', pausedData('signups'))
    // The launch phase: the ticket that admits the address, read; the
    // app's own veto; then the ticket taken, in one transaction.
    const admitted = runtime?.access && emailCtx ? await creationTicket(runtime.access, emailCtx, user.email, hookCtx) : undefined
    if (gate) await gate({ email: user.email, isNewUser: true, purpose: 'user-create', ticket: admitted?.ticket ?? null })
    // The age every route that creates an account needs, before the ticket is taken.
    assertAgeOnCreate(runtime, hookCtx)
    await admitted?.take()
    if (user.locale) return undefined
    const locale = requestLocale(hookCtx)
    return locale ? { data: { ...user, locale } } : undefined
  }
  const sessionBeforeHook = async (session: { userId: string } & Record<string, unknown>, hookCtx: unknown) => {
    // Every refusal comes before any write, so a refused sign-in leaves no
    // workspace behind: Better Auth runs the plugins' database hooks (the
    // admin plugin's ban check) ahead of the app's, and the gate runs first
    // here. A re-authentication refuses another account's sign-in before
    // anything: the browser keeps the session it re-authenticates.
    const restored = await reauthenticatedWorkspace(session, hookCtx)
    const user = await hookAdapter(hookCtx)?.findOne({
      model: 'user',
      where: [{ field: 'id', value: session.userId }],
    }) as { email?: string, name?: string, role?: unknown, passkeyOnly?: boolean | null } | null | undefined
    // A passkey-only account opens no session from a code, whichever route
    // checked it: the code request sends none, and this is the backstop.
    if (user?.passkeyOnly && CODE_SESSION_PATHS.has((hookCtx as { path?: string } | null)?.path ?? '')) {
      throw authRefusal('invalid_input', { field: 'otp' })
    }
    // An administrator's account is never visited, whoever asks and whatever
    // the app's roles grant (`impersonate-admins`, `allowImpersonatingAdmins`).
    // Better Auth opens a visit only after its own permission check, so a
    // caller who may not impersonate is refused there and learns nothing here.
    // An account that cannot be read is refused too.
    if (session.impersonatedBy && (!user || isAdministrator({ id: session.userId, role: user.role }, administrators))) {
      throw authRefusal('forbidden', { reason: 'admin_target' })
    }
    if (gate) {
      // Fail closed: a gate that cannot see the account refuses the session.
      if (!user?.email) throw authRefusal('forbidden', { reason: 'sign_in_refused' })
      await gate({ email: user.email, isNewUser: false, purpose: 'session', ticket: null })
    }
    // Every new session gets an active workspace: the one the session it
    // re-authenticates had, else the user's first membership, or their
    // personal workspace.
    let created: string | undefined
    const activeOrganizationId = restored ?? await ensureActiveWorkspace(session.userId, hookCtx, user?.name, (id) => {
      created = id
    })
    // A personal workspace made for this sign-in is a billing entity: billing's free plan hears of it.
    if (created) await announceEntity(runtime, { kind: 'workspace', id: created })
    return openedSession(session, activeOrganizationId, hookCtx)
  }
  // Once an account is deleted — by its owner or an administrator —
  // everything else of it is erased: the component's tables, and through
  // the app's account instance the providers' records and the app's own
  // sources. Never the deletion's failure: the account is gone already.
  const account = runtime?.account
  const deleteAfterHook = account && emailCtx
    ? async (user: { id: string, email?: string | null }) => {
      try {
        await account.forget(emailCtx as never, { userId: user.id, ...(user.email ? { email: user.email } : {}) })
      }
      catch (error) {
        logBackend('error', 'account.erasure_failed', 'A deleted account\'s erasure could not start; run account.forget for its id.', error)
      }
    }
    : undefined
  const packageHooks: DatabaseHooks = {
    user: {
      create: {
        before: createBeforeHook,
        ...(createAfterHook ? { after: createAfterHook } : {}),
      },
      ...(deleteAfterHook ? { delete: { after: deleteAfterHook } } : {}),
    },
    session: { create: { before: sessionBeforeHook } },
    // A new code replaces every earlier one for its address and purpose.
    verification: { create: { before: replaceEarlierCodes } },
  }

  // Account deletion: on, and immediate — the request guard asks for a
  // recent sign-in and for the account's address typed to confirm, and
  // refuses the only owner of a workspace others belong to — merged with
  // the consumer's own `deleteUser` options (theirs win field by field),
  // and `onUserDeleted` chained after their `afterDelete`.
  const consumerDeleteUser = resolvedAuthOptions.user?.deleteUser
  const onUserDeleted = runtime?.onUserDeleted
  const afterDelete = onUserDeleted && emailCtx
    ? async (user: { id: string, email: string, name: string }, request?: Request) => {
      await consumerDeleteUser?.afterDelete?.(user as never, request)
      await onUserDeleted(emailCtx, { id: user.id, email: user.email, name: user.name })
    }
    : consumerDeleteUser?.afterDelete
  const deleteUser = {
    enabled: true,
    ...consumerDeleteUser,
    ...(afterDelete ? { afterDelete } : {}),
  }

  // Local development: trust the origins the Nuxt dev server actually runs
  // on (loopback on any port, or a `.localhost` name behind a local HTTPS
  // proxy, over https), in addition to SITE_URL. On a `development`
  // BACKEND_ENVIRONMENT alone — no other kind of deployment trusts them.
  const trustLocalOrigins = trustsLocalOrigins(backendEnvironment())
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
    return isLocalOrigin(origin) ? [...list, origin] : list
  }) as TrustedOriginsFn
  const trustedOrigins: BetterAuthOptions['trustedOrigins'] = trustLocalOrigins ? loopbackOrigins : configuredTrusted

  // A new session's device, once the trail recorded the sign-in: a device
  // the account has not used before is alerted (new-device alerts).
  const deviceHooks: DatabaseHooks | undefined = runtime?.devices
    ? { session: { create: { after: async (session, hookCtx) => checkNewDevice(runtime, session as never, hookCtx) } } }
    : undefined
  // The audit trail's hooks follow the package's own, then the new-device
  // check, ahead of the app's.
  const databaseHooks = mergeDatabaseHooks(mergeDatabaseHooks(mergeDatabaseHooks(packageHooks, auditDatabaseHooks(runtime, reauthenticating)), deviceHooks), resolvedAuthOptions.databaseHooks)
  // The routes the package turns off, refused by the request guard as well.
  const disabled = disabledRoutes(resolvedAuthOptions)
  const hooks = makeRequestHooks(runtime, resolvedAuthOptions.hooks, {
    codes: !userPluginIds.has('email-otp'),
    // An app's own organization plugin sends its own invitations.
    invitations: Boolean(sendInvitationEmail) && !userPluginIds.has('organization'),
    passwords: resolvedAuthOptions.emailAndPassword?.enabled === true,
    disabled,
    ...(protection.proofSecret && !challenge ? { proof: protection.proofSecret } : {}),
  })

  return {
    ...resolvedAuthOptions,
    ...(appName ? { appName } : {}),
    ...(siteUrl ? { baseURL: siteUrl } : {}),
    ...secretOptions,
    ...(trustedOrigins ? { trustedOrigins } : {}),
    basePath: resolvedBasePath,
    database,
    disabledPaths: [...new Set([...resolvedAuthOptions.disabledPaths ?? [], ...disabled])],
    // Passwordless by default; consumers may still enable email+password here.
    emailAndPassword: {
      enabled: false,
      ...resolvedAuthOptions.emailAndPassword,
    },
    // Account deletion is on, so the account system is complete out of the
    // box. Email changes go through the email OTP plugin's code flow above,
    // never the core link flow.
    user: {
      ...resolvedAuthOptions.user,
      // The package's account fields (`locale`), beside the app's own.
      additionalFields: { ...ACCOUNT_FIELDS, ...resolvedAuthOptions.user?.additionalFields },
      deleteUser,
    },
    // A recent sign-in, for Better Auth's own checks (registering a passkey,
    // its session list): the package's one window (`RECENT_SIGN_IN_SECONDS`),
    // which every row of the sensitive-action table that asks for a recent
    // sign-in uses too. An app's other session options still apply.
    session: {
      ...resolvedAuthOptions.session,
      // The package's session fields (`signInMethod`), beside the app's own.
      additionalFields: { ...SESSION_FIELDS, ...resolvedAuthOptions.session?.additionalFields },
      freshAge: RECENT_SIGN_IN_SECONDS,
    },
    // Better Auth's own limiter keeps its counters in memory, which on Convex
    // lives no longer than one function call: it would limit nothing. The
    // package's limits run in the request guard on the rate-limiter component
    // instead. `authOptions.rateLimit: { enabled: true, storage: 'database' }`
    // still turns it on, with durable storage.
    rateLimit: { enabled: false, ...resolvedAuthOptions.rateLimit },
    // The client's address: the one the app's server signed and the
    // client-address plugin checked, else the one the platform wrote into
    // `x-forwarded-for` (see clientAddressPlugin). An app's own
    // `ipAddressHeaders` replace both.
    advanced: {
      ...resolvedAuthOptions.advanced,
      ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER, 'x-forwarded-for'], ...resolvedAuthOptions.advanced?.ipAddress },
    },
    // The package's hooks compose with consumer-supplied databaseHooks —
    // per model and operation, ours run first, theirs second (see
    // mergeDatabaseHooks) — so a consumer hook extends the packaged
    // behaviour rather than replacing it.
    ...(databaseHooks ? { databaseHooks } : {}),
    // The request guards (and any consumer before-hook after them).
    hooks,
    plugins: [
      clientAddressPlugin(protection.proofSecret),
      convex({
        authConfig: resolvedAuthConfig,
        options: {
          basePath: resolvedBasePath,
        },
        jwt: {
          definePayload: sessionClaims,
        },
      }),
      ...defaultPlugins,
      ...userPlugins,
    ],
  } satisfies BetterAuthOptions
}

/**
 * The name the emails sign with: the email instance's brand (`setupEmail`'s
 * `brand.name`, else the display name of `EMAIL_FROM`, else the `SITE_URL`
 * host), or, for a stand-in that only sends, the same names without the
 * configured one. Empty without any of them.
 */
function brandName(email: AuthEmail | undefined): string {
  if (email && 'brand' in email && typeof email.brand === 'function') return (email.brand as Email['brand'])().name
  return resolveBrand(undefined, { siteUrl: readEnv('SITE_URL'), from: readEnv('EMAIL_FROM') }).name
}
