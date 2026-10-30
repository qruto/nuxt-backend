export const DEFAULT_AUTH_ROUTE = '/api/auth'
/**
 * The session-token claim naming the admin who is impersonating the session's
 * user, present only while one is. Convex functions read it to refuse what an
 * impersonating admin must not do (`Authorization.requireUser` surfaces it).
 */
export const IMPERSONATED_BY_CLAIM = 'impersonatedBy'
/**
 * The session-token claim saying when the person signed in to the session
 * the token belongs to, as epoch milliseconds: the session's `createdAt`.
 * Signing in again (re-authentication) opens a new session, so the claim
 * moves to that sign-in.
 */
export const AUTH_TIME_CLAIM = 'authTime'
/**
 * The session-token claim saying how the person signed in to the session
 * the token belongs to: `passkey` or `email-otp`, the session's own
 * `signInMethod`, never the account's last one. Absent for a session no
 * person signed in to with either (an administrator's visit, a recovery).
 */
export const SIGN_IN_METHOD_CLAIM = 'signInMethod'
/** How a session was signed in to: what `ctx.user.signInMethod` reads. */
export const SIGN_IN_METHODS = ['passkey', 'email-otp'] as const
export type SignInMethod = (typeof SIGN_IN_METHODS)[number]
/**
 * How recent a sign-in a sensitive action takes, in seconds: ten minutes.
 * One constant for the whole package: Better Auth's `session.freshAge` (the
 * passkey routes' own check), every row of the sensitive-action table that
 * asks for a recent sign-in, and `requireRecentSignIn`'s default `within`.
 */
export const RECENT_SIGN_IN_SECONDS = 600

/**
 * How long a one-time code works, in seconds: the emailOTP plugin's
 * `expiresIn`, set from here so the email's own expiry matches it.
 */
export const OTP_EXPIRES_IN_SECONDS = 300

/**
 * The request header that marks a sign-in as a re-authentication of the
 * session the request already carries: the same account must sign in, the
 * new session keeps the old one's active workspace, and the old one is
 * signed out. `useReauthentication` sends it.
 */
export const REAUTHENTICATE_HEADER = 'x-backend-reauthenticate'
/**
 * Claims a session token never takes from a field of the user: the ones only
 * the package writes, from the session, and the ones Convex reads the
 * identity from. An app's own user field named `impersonatedBy`, `authTime`
 * or `subject` can never make a session read as an impersonation, a recent
 * sign-in or somebody else.
 */
export const RESERVED_CLAIMS: readonly string[] = [
  // The package's own.
  IMPERSONATED_BY_CLAIM, AUTH_TIME_CLAIM, SIGN_IN_METHOD_CLAIM, 'activeOrganizationId', 'sessionId',
  // The token's frame, and the identity fields Convex derives from it.
  'sub', 'iss', 'aud', 'exp', 'nbf', 'iat', 'jti', 'subject', 'issuer', 'tokenIdentifier',
  // The OpenID Connect standard claims, which Convex maps onto identity fields.
  'email_verified', 'phone_number', 'phone_number_verified', 'preferred_username', 'given_name', 'family_name',
  'middle_name', 'nickname', 'profile', 'picture', 'website', 'gender', 'birthdate', 'zoneinfo', 'locale',
  'address', 'updated_at',
]
/**
 * The workspace roles that manage its billing: buy, change or cancel the
 * plan, open the portal, read orders and invoices. Any other member reads
 * the plan and spends the credits. The server checks it on every billing
 * call, and `getBillingAccess` reports it for `useBilling().canManage`.
 */
export const BILLING_MANAGER_ROLES: readonly string[] = ['owner', 'admin']
export const COMPONENT_AUTH_ROUTE = '/'
/**
 * App page that handles workspace-invitation accept links
 * (`{SITE_URL}{path}?id=<invitationId>`). The Nuxt module registers this page
 * automatically (module option `pages.acceptInvitation`); the Convex side builds the
 * emailed URL from `paths.acceptInvitation`, which the module generates from it.
 */
export const DEFAULT_INVITATION_PATH = '/accept-invitation'
/**
 * App page the "keep my account" link of a scheduled deletion opens
 * (`{SITE_URL}{path}?token=…`). The Nuxt module registers it (module option
 * `pages.keepAccount`); the Convex side builds the emailed URL from
 * `paths.keepAccount`, which the module generates from it.
 */
export const DEFAULT_KEEP_ACCOUNT_PATH = '/account/keep'
/**
 * Default paths of the module-mounted pages (module option `pages`). Shared
 * Nuxt↔Convex constants — the login path is also the page guard's
 * redirect target, and settings/security paths are natural email
 * `callbackURL` defaults.
 */
export const DEFAULT_LOGIN_PATH = '/login'
export const DEFAULT_PRICING_PATH = '/pricing'

/** Where an access link lands (`/invite#<token>`): the `invite` page key. */
export const DEFAULT_INVITE_PATH = '/invite'

/** Where a waitlist status link lands (`/waitlist#<token>`): the `waitlist` page key. */
export const DEFAULT_WAITLIST_PATH = '/waitlist'

/** Where a new account's first run is: the steps at `/welcome`. */
export const DEFAULT_WELCOME_PATH = '/welcome'
/** Where the public notice form lives, and where a statement of reasons links the author to appeal. */
export const DEFAULT_REPORT_PATH = '/report'
/** Where the packaged privacy policy lives. */
export const DEFAULT_PRIVACY_PATH = '/legal/privacy'
/** Where the packaged terms of service live. */
export const DEFAULT_TERMS_PATH = '/legal/terms'
/** Where the generated subprocessor list lives. */
export const DEFAULT_SUBPROCESSORS_PATH = '/legal/subprocessors'
/** Where the packaged accessibility statement lives. */
export const DEFAULT_ACCESSIBILITY_PATH = '/legal/accessibility'

/** Where a topic email's unsubscribe link and a double opt-in's confirmation link land: the `unsubscribe` page key. */
export const DEFAULT_UNSUBSCRIBE_PATH = '/unsubscribe'

/** How long a decision on reported content may be appealed: six months (DSA Art. 20(1)), as 183 days. */
export const APPEAL_WINDOW_MS = 183 * 24 * 60 * 60 * 1000
export const DEFAULT_SETTINGS_PATH = '/settings'
/** Where the gifts page mounts by default: the `gifts` page key. */
export const DEFAULT_GIFTS_PATH = '/gifts'
/** Where a referral link lands (`/r/<code>`): the `referral` page key. */
export const DEFAULT_REFERRAL_PATH = '/r/:code'
export const DEFAULT_PROFILE_PATH = '/profile'
export const DEFAULT_SECURITY_PATH = '/security'
/** The admin console, for the app-wide `admin` role only (module option `pages.admin`). */
export const DEFAULT_ADMIN_PATH = '/admin'
/**
 * The app-wide roles the package treats as administrators unless an app
 * names its own: the admin plugin's default `adminRoles`. An account holding
 * one is never impersonated, and the admin console and `setupAdmin`'s reads
 * are theirs.
 */
export const DEFAULT_ADMIN_ROLES: readonly string[] = ['admin']
/**
 * How long a session an administrator opens by impersonating an account
 * lasts, in seconds: thirty minutes, the longest the package allows. Better
 * Auth's admin plugin keeps one an hour by default; an app's own
 * `admin.impersonationSessionDuration` may only shorten it. When it ends,
 * the administrator signs in again as themselves.
 */
export const IMPERSONATION_SESSION_SECONDS = 1800
/**
 * The cookie that says how this browser last signed in (`passkey` or
 * `email-otp`), for 30 days. Better Auth's `lastLoginMethod` plugin writes it
 * on every sign-in, readable by the page (not `httpOnly`), and
 * `useLoginFlow().lastMethod` reads it, in the server render too. Better
 * Auth's own default name, passed to the plugin explicitly so the two sides
 * cannot drift.
 */
export const LAST_SIGN_IN_COOKIE = 'better-auth.last_used_login_method'
/**
 * The query parameter a checkout's return URL carries the checkout's id in.
 * The server appends it to the `successUrl` of every plan and pack checkout
 * and of a gift's claim, with the provider's placeholder, which the
 * provider fills in on the way back; the client's checkout-return plugin
 * takes it off the address and refreshes the entitlements once. The
 * package's own name, never `checkout_id`: an app that reads that one on
 * its own success page keeps it.
 */
export const CHECKOUT_RETURN_PARAM = 'checkout_return'
/** Where the backend serves its own health, which `registerBackendRoutes` mounts: a fixed path, which the app's health route asks. */
export const DEFAULT_HEALTH_PATH = '/backend/health'
/** Where the Nuxt app serves its health, under the package's own route prefix. */
export const HEALTH_ROUTE = '/api/backend/health'
/** Where the Nuxt app answers the visitor's own IP address, which a checkout forwards for the billing provider's local pricing. */
export const VISITOR_IP_ROUTE = '/api/backend/visitor-ip'
/** The Nuxt dev server's local error log: a dev-only route, never in a build. */
export const LOCAL_LOG_ROUTE = '/api/backend/_monitoring'
/**
 * The scaffold's billing function that starts the catalog's free plan for
 * one billing entity (`billing.ts` re-exports it as `startFreePlan`): the
 * queue runs it by this name, as every billing function goes by its module.
 */
export const START_FREE_PLAN_FUNCTION = 'billing:startFreePlan'
/**
 * The scaffold's gift sweep (`billing.api.runGiftSweep`), by the module name
 * every billing function goes by: the component's cron wakes it, and a gift
 * dated for later is scheduled on it.
 */
export const RUN_GIFT_SWEEP_FUNCTION = 'billing:runGiftSweep'
/**
 * The referral sweep, by the name the app's `backend/referrals.ts` exports it
 * under: the component's cron wakes it when a hold has ended.
 */
export const RUN_REFERRAL_SWEEP_FUNCTION = 'referrals:runReferralSweep'
/**
 * The scaffold's account function that runs the providers' and the app's
 * own part of an erasure (`account.ts` re-exports it as
 * `eraseAccountData`): an erasure starts it by this name, as every account
 * function goes by its module.
 */
export const ERASE_ACCOUNT_FUNCTION = 'account:eraseAccountData'
