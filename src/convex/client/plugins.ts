import { passkey } from '@better-auth/passkey'
import type { BetterAuthOptions } from 'better-auth/minimal'
import { admin, lastLoginMethod } from 'better-auth/plugins'
import { storageAllows, storageFromCookieHeader } from '../consent-rules.js'
import { DEFAULT_ADMIN_ROLES, IMPERSONATION_SESSION_SECONDS, LAST_SIGN_IN_COOKIE, type SignInMethod } from '../constants.js'
import type { Administrators } from '../integrations/access.js'
import { LOCALE_SCHEMA } from '../locale.js'
import type { AdminPluginOptions } from './auth-types.js'

// How the packaged default plugins are built. The order they join the plugin
// list in, which matters, is `buildAuthOptions`' concern
// (better-auth-options.ts).

/**
 * The plugin element type of `BetterAuthOptions.plugins`. A default plugin
 * is widened to it when its concrete return type references option types
 * better-auth doesn't export — declaration emit of `buildAuthOptions` would
 * fail on the unnameable type.
 */
export type DefaultAuthPlugin = NonNullable<BetterAuthOptions['plugins']>[number]

/**
 * The account fields the package adds to Better Auth's user: `locale`, the
 * language the person reads in, which every email the package sends them
 * is written in. Set when the account is created (from the request's
 * `Accept-Language`, which `useLoginFlow` sets to the app's language), and
 * by the person on `/update-user` (`useAccount().updateProfile({ locale })`, sent
 * on every language switch). Stored as a language tag (`de`, `pt-BR`), or
 * refused. Returned with the user, and the OpenID `locale` claim of the
 * session's token (`sessionClaims`).
 *
 * `onboardedAt` and `activationDismissedAt` are the app shell's marks
 * (epoch ms): when the account finished or skipped the first run at
 * `/welcome`, and when it dismissed the activation checklist. Only the
 * component's own functions write them (`input: false`), and they are
 * returned to nobody: the shell reads them through its live queries.
 *
 * @internal
 */
export const ACCOUNT_FIELDS = {
  locale: { type: 'string', required: false, input: true, validator: { input: LOCALE_SCHEMA } },
  onboardedAt: { type: 'number', required: false, input: false, returned: false },
  activationDismissedAt: { type: 'number', required: false, input: false, returned: false },
} satisfies NonNullable<NonNullable<BetterAuthOptions['user']>['additionalFields']>

/**
 * The session fields the package adds to Better Auth's session:
 * `signInMethod`, how the person signed in to this session (`passkey`,
 * `email-otp`), set once when it is created and never by a request
 * (`input: false`). The session's token carries it as the
 * `signInMethod` claim, which `ctx.user.signInMethod` reads: unlike the
 * account's `lastLoginMethod`, another browser's later sign-in never
 * changes it.
 *
 * @internal
 */
export const SESSION_FIELDS = {
  signInMethod: { type: 'string', required: false, input: false },
} satisfies NonNullable<NonNullable<BetterAuthOptions['session']>['additionalFields']>

/** The routes that open a session a person signed in to, by how they signed in. */
const SESSION_SIGN_IN_ROUTES: Readonly<Record<string, SignInMethod>> = {
  '/sign-in/email-otp': 'email-otp',
  '/email-otp/verify-email': 'email-otp',
  '/passkey/verify-authentication': 'passkey',
}

/**
 * How a new session was signed in to, by the route that opens it: a code
 * (`email-otp`) or a passkey (`passkey`); `null` for every other session
 * (an administrator's visit, a recovery code's, an email change's).
 *
 * @internal
 */
export function sessionSignInMethod(path: string | undefined): SignInMethod | null {
  return (path && Object.hasOwn(SESSION_SIGN_IN_ROUTES, path) ? SESSION_SIGN_IN_ROUTES[path] : undefined) ?? null
}

/**
 * The passkey-only plugin's id and fields (passkey-only.ts builds the plugin
 * around them): on the account, whether it refuses sign-in codes and the
 * hash of its recovery code, which is never returned; on a session, the mark
 * of a recovery session, which may only save a passkey. Apart from the
 * routes, so the component's adapter derives its schema from them without
 * the routes' imports.
 *
 * @internal
 */
export const PASSKEY_ONLY_PLUGIN = {
  id: 'passkey-only',
  schema: {
    user: {
      fields: {
        passkeyOnly: { type: 'boolean', required: false, input: false },
        recoveryCodeHash: { type: 'string', required: false, input: false, returned: false },
      },
    },
    session: {
      fields: {
        passkeyRecovery: { type: 'boolean', required: false, input: false },
      },
    },
  },
} as const

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
 * session (the `passkey-offer` step of `useLoginFlow`).
 *
 * Override by passing your own `passkey(...)` plugin in `authOptions.plugins`.
 */
export function defaultPasskey() {
  return passkey()
}

/**
 * The `customResolveMethod` of Better Auth's `lastLoginMethod` plugin that
 * names a sign-in its own resolver does not know: a code sign-in
 * (`/sign-in/email-otp`, which also signs a new account up) is `email-otp`.
 * Everything else is left to Better Auth's resolver, which names a passkey
 * sign-in (`/passkey/verify-authentication`) `passkey` and returns nothing
 * for the sessions no person signed in for (an impersonation, an email
 * change). The package's own plugin uses it; pass it to one of your own:
 *
 * ```ts
 * lastLoginMethod({ storeInDatabase: true, customResolveMethod: resolveSignInMethod, beforeStoreCookie })
 * ```
 */
export function resolveSignInMethod(ctx: { path?: string }): string | null {
  return ctx.path === '/sign-in/email-otp' ? 'email-otp' : null
}

/**
 * Whether the browser that signs in allowed the `preferences` purpose of
 * optional storage: its choice rides in a first-party cookie of the consent
 * manager (`backend.storage`), which the request carries. Without that
 * cookie, nothing was allowed. The `beforeStoreCookie` of the package's
 * `lastLoginMethod`; pass it to one of your own to tie the cookie to the
 * same choice.
 */
export function storesLastSignInCookie(ctx: { headers?: Headers | null, request?: { headers: Headers } | null }): boolean {
  const header = ctx.headers?.get('cookie') ?? ctx.request?.headers.get('cookie')
  return storageAllows(storageFromCookieHeader(header), 'preferences')
}

/**
 * Better Auth's `lastLoginMethod`: every sign-in records how it was made, on
 * the account (`user.lastLoginMethod`) and, once the browser allowed it
 * (the consent manager's `preferences` purpose), in a cookie of this
 * browser (`LAST_SIGN_IN_COOKIE`, 30 days, readable by the page). The
 * sign-in form marks that method "Last used" and opens on it. The cookie
 * holds the method's name and nothing else; it is not strictly necessary, so
 * it is never set before the person agrees.
 *
 * Override by passing your own `lastLoginMethod(...)` in
 * `authOptions.plugins` — keep `storeInDatabase: true`, the default
 * `cookieName`, `customResolveMethod: resolveSignInMethod` and
 * `beforeStoreCookie: storesLastSignInCookie`, or a code sign-in records
 * nothing, or the cookie is set unasked. `beforeStoreCookie: () => false`
 * keeps the cookie off and the record on.
 */
export function defaultLastLoginMethod() {
  return lastLoginMethod({ storeInDatabase: true, cookieName: LAST_SIGN_IN_COOKIE, customResolveMethod: resolveSignInMethod, beforeStoreCookie: ctx => storesLastSignInCookie(ctx as never) })
}

/**
 * How long an impersonation lasts, in seconds: the app's own
 * `impersonationSessionDuration` when it is shorter, else
 * `IMPERSONATION_SESSION_SECONDS` (thirty minutes). An administrator's
 * visit is short by design: it ends on its own, and the administrator signs
 * in again as themselves.
 */
export function impersonationSeconds(options: AdminPluginOptions | undefined): number {
  const asked = options?.impersonationSessionDuration
  return typeof asked === 'number' && Number.isFinite(asked) && asked > 0 ? Math.min(asked, IMPERSONATION_SESSION_SECONDS) : IMPERSONATION_SESSION_SECONDS
}

/**
 * Better Auth's admin plugin with the app's options, its impersonations
 * held to {@link impersonationSeconds}. Who counts as an administrator stays
 * the plugin's (`adminRoles`, `adminUserIds`); the session hook refuses a
 * visit of any of them, whoever asks and whatever the app's roles grant
 * (`impersonate-admins`, `allowImpersonatingAdmins`).
 *
 * Override by passing your own `admin(...)` in `authOptions.plugins`: the
 * hook still refuses an administrator's account (by your plugin's
 * `adminRoles` and `adminUserIds`), and the duration is then yours to keep
 * short.
 */
export function defaultAdmin(options: AdminPluginOptions | undefined) {
  return admin({ ...options, impersonationSessionDuration: impersonationSeconds(options) })
}

/** The administrators an app's admin options name: `adminRoles` (default `DEFAULT_ADMIN_ROLES`) and `adminUserIds`. */
export function administratorsOf(options: AdminPluginOptions | undefined): Administrators {
  const roles = options?.adminRoles
  const listed = Array.isArray(roles) ? roles : typeof roles === 'string' ? roles.split(',') : DEFAULT_ADMIN_ROLES
  return {
    roles: listed.map(role => role.trim()).filter(Boolean),
    userIds: options?.adminUserIds ?? [],
  }
}
