import {
  DEFAULT_AUTH_ROUTE,
  DEFAULT_INVITATION_PATH,
  DEFAULT_KEEP_ACCOUNT_PATH,
  DEFAULT_LOGIN_PATH,
  DEFAULT_PRIVACY_PATH,
  DEFAULT_REPORT_PATH,
  DEFAULT_SECURITY_PATH,
  DEFAULT_SETTINGS_PATH,
  DEFAULT_UNSUBSCRIBE_PATH,
  DEFAULT_WAITLIST_PATH,
} from './constants.js'

/**
 * The app paths the backend links to or serves on, as nuxt.config declares
 * them (`backend.authRoute` and `backend.pages`). The Nuxt module writes them
 * to `paths.generated.ts` in the functions directory on every `nuxt prepare`,
 * `dev` and `build`, and the scaffold passes that file's `paths` to
 * `defineBackendAuthConfig`, `setupAuth`, `setupAccount` and `setupWaitlist`:
 * nuxt.config stays the one place an app writes a path.
 */
export interface BackendPaths {
  /** The auth routes' base path: the same-origin proxy (`backend.authRoute`), Better Auth's `basePath` and the Convex auth config's JWKS route. */
  authRoute: string
  /** The page a workspace invitation email links to (`pages.acceptInvitation`): `{SITE_URL}{path}?id=<invitationId>`. */
  acceptInvitation: string
  /** The page the "keep my account" link of a scheduled deletion opens (`pages.keepAccount`): `{SITE_URL}{path}?token=…`. */
  keepAccount: string
  /** The page the `passkeyRecovered` email links to (`pages.security`). */
  security: string
  /** The page a waitlist confirmation's status link opens (`pages.waitlist`): `{SITE_URL}{path}#<token>`. */
  waitlist: string
  /** The sign-in page (`pages.login`): where the waitlist's "You're in" email sends an admitted person. */
  login: string
  /** The page a topic email's unsubscribe link and a double opt-in's confirmation link open (`pages.unsubscribe`). */
  unsubscribe: string
  /** The public notice form (`pages.report`): where a statement of reasons' appeal link lands, `{SITE_URL}{path}#appeal=<token>`. */
  report: string
  /** The workspace, plan and credit settings (`pages.settings`): where the billing emails' manage links open. */
  settings: string
  /** The privacy policy (`pages.privacy`, the packaged legal page): where an access invitation email ("Email them") links. */
  privacy: string
}

/** The paths every key takes when nuxt.config sets none: each page's default path. */
export const DEFAULT_BACKEND_PATHS: Readonly<BackendPaths> = Object.freeze({
  authRoute: DEFAULT_AUTH_ROUTE,
  acceptInvitation: DEFAULT_INVITATION_PATH,
  keepAccount: DEFAULT_KEEP_ACCOUNT_PATH,
  security: DEFAULT_SECURITY_PATH,
  waitlist: DEFAULT_WAITLIST_PATH,
  login: DEFAULT_LOGIN_PATH,
  unsubscribe: DEFAULT_UNSUBSCRIBE_PATH,
  report: DEFAULT_REPORT_PATH,
  settings: DEFAULT_SETTINGS_PATH,
  privacy: DEFAULT_PRIVACY_PATH,
})

/** The keys of {@link BackendPaths}, in the order the generated file writes them. */
export const BACKEND_PATH_KEYS = Object.keys(DEFAULT_BACKEND_PATHS) as ReadonlyArray<keyof BackendPaths>

/**
 * The paths a helper uses: the generated file's, each key it lacks at its
 * default. A value that is no absolute path stops the setup, since every link
 * built from it would be broken.
 *
 * @internal
 */
export function resolveBackendPaths(paths: Partial<BackendPaths> | undefined, helper: string): BackendPaths {
  const resolved = { ...DEFAULT_BACKEND_PATHS, ...paths }
  for (const key of BACKEND_PATH_KEYS) {
    const value: unknown = resolved[key]
    if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) {
      throw new TypeError(`[nuxt-backend] ${helper}: paths.${key} is ${JSON.stringify(value)}, not a path such as ${JSON.stringify(DEFAULT_BACKEND_PATHS[key])}. Pass the \`paths\` of paths.generated.ts, which the Nuxt module writes from nuxt.config.`)
    }
  }
  return resolved
}
