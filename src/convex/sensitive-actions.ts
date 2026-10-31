import type { AuthRateLimitName } from './client/auth-types.js'
import { RECENT_SIGN_IN_SECONDS } from './constants.js'

// The sensitive-action table: every write an account can make through the
// package — each Better Auth route the auth instance mounts, and each public
// mutation and action the scaffold exports — with the three things it takes:
// how recent a sign-in, whether an administrator impersonating the account
// may make it, and the limits it spends.
//
// The routes' rows are enforced where every auth request passes, the
// package's one before-hook (client/guards.ts): a route off the table
// refuses an impersonated session, and takes nothing else. The functions'
// rows are kept by the functions themselves, through the caller rule each
// one checks (`CallerRule`, with its `recentSignIn`); the probe suite calls
// every one of them as each kind of caller and holds it to its row. A
// feature that adds a write adds its row here: test/unit/sensitive-actions.test.ts
// fails on a route or a public write without one.

/** Where a limit's bucket is keyed, one per kind of key. */
export interface SensitiveLimit {
  /** Per signed-in caller, by user id: opening more sessions does not multiply it. */
  caller?: AuthRateLimitName
  /** Per address the request names, by a digest of it. */
  address?: AuthRateLimitName
  /** Per client network address, by an HMAC of it under the auth secret. */
  client?: AuthRateLimitName
  /** Per billing entity (the workspace, or the account with `billTo: 'user'`). */
  entity?: string
  /** One ceiling for the whole deployment, spent after every keyed bucket allowed the request. */
  global?: AuthRateLimitName
}

/** One row: what a write takes. */
export interface SensitiveAction {
  /**
   * How recent a sign-in it takes, in seconds since the person signed in to
   * the session (`RECENT_SIGN_IN_SECONDS`, ten minutes, on every row of the
   * package's); `null` for none. An older sign-in is refused as
   * `reauthentication_required`. An impersonated session never passes, since
   * no sign-in of the person's own stands behind it: `forbidden`, reason
   * `impersonating`.
   */
  recentSignIn: number | null
  /** A session an administrator opened by impersonating the account: `'refused'` as `forbidden`, reason `impersonating`. */
  impersonation: 'allowed' | 'refused'
  /** The limits it spends, each keyed as its field says; `null` for none. */
  limit: SensitiveLimit | null
}

/** A write that needs a recent sign-in and no administrator acting as the account. */
const STEP_UP = { recentSignIn: RECENT_SIGN_IN_SECONDS, impersonation: 'refused', limit: null } as const satisfies SensitiveAction
/** An administrator's write: a recent sign-in, in person, under the per-caller `admin` limit. */
const ADMIN_STEP_UP = { ...STEP_UP, limit: { caller: 'admin' } } as const satisfies SensitiveAction
/** A write of the account's own, refused to an administrator acting as it, with no limit. */
const OWN = { recentSignIn: null, impersonation: 'refused', limit: null } as const satisfies SensitiveAction
/** Anything a visit may do: a read, or the support work an impersonation is for. */
const VISIT = { recentSignIn: null, impersonation: 'allowed', limit: null } as const satisfies SensitiveAction

/** The limits of a route that sends a code to an address. */
const SENDS_CODE = { address: 'emailOtp', global: 'emailOtpGlobal' } as const satisfies SensitiveLimit
/** The limit of a route that checks a code sent to an address. */
const CHECKS_CODE = { address: 'emailOtpAttempt' } as const satisfies SensitiveLimit

/** The rows, by key; `SENSITIVE_ACTIONS` publishes them. */
const ROWS = {
  // ── Signing in, codes and passkeys (no session needed) ─────────────────
  '/email-otp/send-verification-otp': { ...OWN, limit: SENDS_CODE },
  '/sign-in/email-otp': { ...OWN, limit: CHECKS_CODE },
  '/email-otp/verify-email': { ...OWN, limit: CHECKS_CODE },
  '/passkey/generate-authenticate-options': { ...OWN, limit: { client: 'passkeySignIn', global: 'passkeySignInGlobal' } },
  '/passkey/verify-authentication': OWN,
  // A passkey-only account's way back in: a 100-bit code, bounded like the
  // passkey challenge (per client, then the deployment), never per address,
  // so nobody can lock a person out of their own recovery.
  '/sign-in/recovery-code': { ...OWN, limit: { client: 'passkeySignIn', global: 'passkeySignInGlobal' } },
  // Passwords: off unless the app turns them on (the request guard refuses
  // the code routes while they are).
  '/email-otp/request-password-reset': { ...OWN, limit: SENDS_CODE },
  '/forget-password/email-otp': { ...OWN, limit: SENDS_CODE },
  '/email-otp/reset-password': { ...OWN, limit: CHECKS_CODE },
  '/sign-in/email': OWN,
  '/sign-up/email': OWN,
  '/request-password-reset': OWN,
  '/reset-password': OWN,
  '/change-password': STEP_UP,
  '/verify-password': OWN,
  // Off: every proof of a mailbox here is a code.
  '/email-otp/check-verification-otp': OWN,
  '/send-verification-email': OWN,
  '/change-email': OWN,
  // Social sign-in: the package offers none.
  '/sign-in/social': OWN,
  '/callback/:id': OWN,
  '/link-social': STEP_UP,
  '/unlink-account': STEP_UP,
  '/get-access-token': OWN,
  '/refresh-token': OWN,

  // ── The session ────────────────────────────────────────────────────────
  '/get-session': VISIT,
  // Better Auth's own list holds every session to its `freshAge`, the
  // package's window: `auth:listSessions` lists them at any age.
  '/list-sessions': STEP_UP,
  '/list-accounts': VISIT,
  '/update-session': OWN,
  '/sign-out': VISIT,
  // Signing devices out is the account's defence, so it never waits on a
  // sign-in: a person who fears for the account signs the others out first.
  '/revoke-session': OWN,
  '/revoke-sessions': OWN,
  '/revoke-other-sessions': OWN,
  '/convex/token': VISIT,
  '/convex/jwks': VISIT,
  '/convex/.well-known/openid-configuration': VISIT,
  '/ok': VISIT,
  '/error': VISIT,

  // ── The account ────────────────────────────────────────────────────────
  // The profile's name and image (the request guard holds a visit to those two).
  '/update-user': VISIT,
  // The new address's code is the proof of it, and the current address's
  // code (asked before the change starts) the proof of the person.
  '/email-otp/request-email-change': { ...OWN, limit: { caller: 'emailChange', address: 'emailOtpAttempt', global: 'emailOtpGlobal' } },
  '/email-otp/change-email': { ...OWN, limit: CHECKS_CODE },
  // Deleting the account: immediate after a recent sign-in, with the
  // account's address typed to confirm (the request guard checks both).
  '/delete-user': { ...STEP_UP, limit: { caller: 'accountDelete' } },
  // A confirmation link an earlier release emailed, until it expires.
  '/delete-user/callback': OWN,
  '/passkey/list-user-passkeys': VISIT,
  // A passkey signs in on its own: saving or removing one asks for a recent sign-in.
  '/passkey/generate-register-options': STEP_UP,
  '/passkey/verify-registration': STEP_UP,
  '/passkey/delete-passkey': STEP_UP,
  '/passkey/update-passkey': OWN,
  // Turning sign-in codes off (or on, or a new recovery code) changes how the account is defended.
  '/passkey-only/set': STEP_UP,

  // ── Workspaces ─────────────────────────────────────────────────────────
  '/organization/list': VISIT,
  '/organization/get-full-organization': VISIT,
  '/organization/get-active-member': VISIT,
  '/organization/get-active-member-role': VISIT,
  '/organization/get-invitation': VISIT,
  '/organization/list-invitations': VISIT,
  '/organization/list-members': VISIT,
  '/organization/list-user-invitations': VISIT,
  '/organization/has-permission': VISIT,
  '/organization/check-slug': VISIT,
  '/organization/set-active': VISIT,
  // A new workspace is a billing entity (the free plan's credits, a provider customer): one member makes a few an hour.
  '/organization/create': { ...VISIT, limit: { caller: 'workspaceCreate' } },
  '/organization/update': VISIT,
  '/organization/cancel-invitation': VISIT,
  '/organization/reject-invitation': VISIT,
  '/organization/accept-invitation': OWN,
  '/organization/leave': OWN,
  // Who may do what in the workspace, ownership included: an invitation
  // names the role the invitee takes, so it asks as a role change does, and
  // so does taking a member out.
  '/organization/invite-member': { ...STEP_UP, limit: { caller: 'invitation', global: 'invitationGlobal' } },
  '/organization/remove-member': STEP_UP,
  '/organization/update-member-role': STEP_UP,
  '/organization/delete': STEP_UP,

  // ── Administration ─────────────────────────────────────────────────────
  // Every administrator route spends the per-caller `admin` limit, but the
  // way out of an impersonation and the read-only permission check the
  // console calls on render.
  '/admin/has-permission': VISIT,
  '/admin/stop-impersonating': VISIT,
  '/admin/list-users': { ...OWN, limit: { caller: 'admin' } },
  '/admin/get-user': { ...OWN, limit: { caller: 'admin' } },
  '/admin/list-user-sessions': { ...OWN, limit: { caller: 'admin' } },
  // Signing someone's devices out defends their account: no sign-in to wait on.
  '/admin/revoke-user-session': { ...OWN, limit: { caller: 'admin' } },
  '/admin/revoke-user-sessions': { ...OWN, limit: { caller: 'admin' } },
  '/admin/create-user': ADMIN_STEP_UP,
  '/admin/update-user': ADMIN_STEP_UP,
  '/admin/set-role': ADMIN_STEP_UP,
  '/admin/ban-user': ADMIN_STEP_UP,
  '/admin/unban-user': ADMIN_STEP_UP,
  '/admin/impersonate-user': ADMIN_STEP_UP,
  '/admin/set-user-password': ADMIN_STEP_UP,
  '/admin/remove-user': ADMIN_STEP_UP,
  // Codes back on for a person who lost every passkey and the recovery code.
  '/admin/disable-passkey-only': ADMIN_STEP_UP,

  // ── The scaffold's public writes ───────────────────────────────────────
  'auth:updateProfile': VISIT,
  // An export is the account's own, never an administrator's visit: at most
  // three a day, counted by the component (ACCOUNT_EXPORTS_PER_DAY).
  'account:exportAccountData': OWN,
  // A person's agreements and choices are theirs: an administrator acting as
  // the account can't agree for it.
  'account:grantConsent': OWN,
  'account:withdrawConsent': OWN,
  'account:chooseStorage': OWN,
  // Finishing the first run, and dismissing the checklist, are the account's own.
  'account:completeOnboarding': OWN,
  'audit:dismissActivation': OWN,
  // How a person found the app is theirs to say: an administrator acting as the account can't answer for it.
  'audit:recordSource': OWN,
  // The link's token needs no sign-in, and a visit may use it; the call without a token is the account's own, which the function refuses to a visit.
  'account:cancelAccountDeletion': VISIT,
  'auth:revokeSession': OWN,
  // Reading what the app told a person is theirs: an administrator acting as the account marks nothing read.
  'notifications:markNotificationsRead': OWN,
  // A person's channels and the devices they allowed web push on are their own: an administrator acting as the account changes none.
  'notifications:setNotificationChannel': OWN,
  'notifications:subscribePush': OWN,
  'notifications:unsubscribePush': OWN,
  'ai:transform': { ...OWN, limit: { entity: 'ai' } },
  'billing:syncEntitlements': { ...VISIT, limit: { entity: 'billingSync' } },
  'billing:getOrders': VISIT,
  'billing:getInvoiceUrl': VISIT,
  'billing:getUsageHistory': VISIT,
  // The whole business's numbers, for an administrator in person: a visit to someone's account reads none.
  'billing:getRevenue': OWN,
  'billing:generateCheckoutLink': OWN,
  'billing:giftCheckout': OWN,
  'billing:generateCustomerPortalUrl': OWN,
  'billing:claimGift': OWN,
  // The purchaser's side of a gift: its notice, its address and its date are their own to change, and a cancel moves money back.
  'billing:resendGift': OWN,
  'billing:changeGiftRecipient': OWN,
  'billing:rescheduleGift': OWN,
  'billing:cancelGift': STEP_UP,
  'billing:updateSubscription': OWN,
  'billing:cancelSubscription': OWN,
  // The cancel flow's offer, taken by the entity it was made to, and the EU withdrawal: never behind a recent sign-in, which would stand in a legal right's way.
  'billing:acceptSaveOffer': OWN,
  'billing:withdraw': OWN,
  'billing:uncancelSubscription': OWN,
  'billing:cancelPendingChange': OWN,
  'billing:pauseSubscription': OWN,
  'billing:resumeSubscription': OWN,
  // An administrator's writes: money back to a customer, and a flag or a kill
  // switch, which changes the app for everyone.
  'billing:refundOrder': STEP_UP,
  'flags:setFlag': STEP_UP,
  // An experiment's exposure: recorded for the person on their first read, never for a visit, which reads the variant only.
  'flags:exposeExperiment': VISIT,
  // The preference center's choices are the account's own; the links in an
  // email carry a signed token instead of a sign-in, and a visit may follow them.
  'email:setEmailTopic': OWN,
  'email:unsubscribeAllTopics': OWN,
  'email:recordTimeZone': OWN,
  'email:unsubscribeByLink': VISIT,
  'email:confirmEmailTopic': VISIT,
  // A person hides a notice for themself; an administrator publishes, sends
  // and takes one down in person, since it reaches everyone.
  'email:dismissAnnouncement': OWN,
  'email:publishAnnouncement': STEP_UP,
  'email:endAnnouncement': STEP_UP,
  'email:previewAnnouncement': STEP_UP,
  'email:sendAnnouncement': STEP_UP,
  'email:cancelAnnouncement': STEP_UP,
  // An administrator lifts the email provider's suppression of an address, in person: mail reaches it again.
  'email:liftSuppression': STEP_UP,
  // An administrator asks a provider to send a webhook delivery again, in person: it changes state as the first did.
  'webhooks:replayWebhookDelivery': STEP_UP,
} as const satisfies Record<string, SensitiveAction>

/**
 * The table, by Better Auth route (its path under the auth base path) or by
 * scaffold function (`module:export`, as the client calls it). Reads appear
 * where their impersonation rule or limit says something: an impersonated
 * session may use only the routes whose row allows it.
 */
export const SENSITIVE_ACTIONS: Readonly<Record<string, SensitiveAction>> = ROWS

/** The row of an auth route, by its path; `undefined` for a route off the table. */
export function sensitiveRoute(path: string): SensitiveAction | undefined {
  return path.startsWith('/') && Object.hasOwn(SENSITIVE_ACTIONS, path) ? SENSITIVE_ACTIONS[path] : undefined
}
