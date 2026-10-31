// The authorization policy of every public function the scaffold ships
// (test/fixtures/registration/backend, a verbatim copy of templates/starter),
// keyed `module:export` as the client calls it. `authorization-probes.test.ts`
// fails when a public function has no policy here, when a policy names a
// function the scaffold no longer exports, when a probe gets through where
// the policy says it must not — unless the gap is in the ratchet
// (`authorization-gaps.ts`), which only ever shrinks — and when a probe the
// policy lets through is refused, so a tightened function updates its policy.
//
// A policy names who the function is for (its principal) and who must be
// refused. The probes call it as:
// - `anonymous`: no token at all;
// - `otherUser`: another account, a plain member of the principal's
//   workspace without the app-wide admin role, passing the principal's ids;
// - `otherWorkspace`: an account that no longer belongs here, removed from the
//   principal's workspace (and demoted, for admin functions), with a token
//   from before that still names the workspace and role;
// - `otherManager`: the owner of a workspace of their own, a manager there,
//   passing the principal's ids: what `owned` refuses on the manager rows;
// - `impersonated`: the principal's own session, opened by an admin
//   impersonating them;
// - `stale`: the principal's own session, signed in more than ten minutes
//   ago, which a function that takes a recent sign-in refuses;
// - `input:<rule>`: the principal, choosing what `inputs` says only the server
//   may choose.
//
// The runtime rows live beside the functions (`BILLING_ACCESS`,
// `ADMIN_WRITE`, each auth function's own); this registry mirrors them, and
// the probes hold the two together.

/**
 * Who a function is for, from the widest to the narrowest:
 * - `public`: anyone, signed in or not;
 * - `authed`: any signed-in account, acting on its own;
 * - `member`: a member of the active workspace, read fresh, not from the token;
 * - `manage`: a member who manages the workspace's billing (owner or admin);
 * - `admin`: the app-wide admin role, read fresh.
 */
export type Access = 'public' | 'authed' | 'member' | 'manage' | 'admin'

/**
 * Inputs only the server may choose, refused even from the principal:
 * - `catalog`: products, packs and plans from the app's billing catalog, nothing else;
 * - `redirect`: redirect and return URLs on the site (`SITE_URL`) or a trusted origin;
 * - `metadata`: no metadata key the package itself writes and reads back;
 * - `trial`: trials are the server's to grant;
 * - `discount`: a catalog discount without a code is the server's to apply:
 *   a client names only a public promotion.
 */
export type InputRule = 'catalog' | 'redirect' | 'metadata' | 'trial' | 'discount'

export interface Policy {
  access: Access
  /**
   * It acts on an id the caller passes, and the id must be the caller's:
   * anyone else's is refused, whatever `access` lets them do otherwise.
   * `'provider'` when ownership is told only by the billing provider's own
   * record, which the probes never reach (every provider request is
   * refused): the unit tests hold that one.
   */
  owned?: true | 'provider'
  /** A session an admin opened by impersonating the principal. Default `'allowed'`. */
  impersonation?: 'allowed' | 'refused'
  inputs?: readonly InputRule[]
  /**
   * It takes a recent sign-in (its row of the sensitive-action table names a
   * window): a session signed in before it is refused as
   * `reauthentication_required`.
   */
  recentSignIn?: true
  /** What looks like a hole and is the design, with the reason. */
  byDesign?: string
}

/** Every public function of the scaffold, and its policy. */
export const POLICIES: Record<string, Policy> = {
  // ai.ts: a metered action spends the workspace's credits. What AI cost per
  // person is for an administrator whose role is read fresh; anyone else,
  // an administrator acting as someone included, reads `null`.
  'ai:transform': { access: 'member', impersonation: 'refused' },
  'ai:getCosts': { access: 'admin', impersonation: 'refused' },

  // audit.ts: the activity trail, each read for its own reader: the
  // account's own, the active workspace's for its owners and admins, every
  // event for an administrator. A read answers anyone else `null`.
  'audit:listActivity': { access: 'authed' },
  'audit:listWorkspaceActivity': { access: 'manage' },
  'audit:listAllActivity': { access: 'admin' },
  // The activation checklist: the caller's own progress, which an
  // administrator's visit reads too (read-only); dismissing it is in person.
  'audit:getActivation': { access: 'authed' },
  'audit:dismissActivation': { access: 'authed', impersonation: 'refused' },
  // How the person found the app: their own question and answer; a visit reads it and answers nothing.
  'audit:getSource': { access: 'authed' },
  'audit:recordSource': { access: 'authed', impersonation: 'refused' },

  // notifications.ts: the account's inbox, its own and in person: an
  // administrator acting as the account reads and marks nothing of it.
  'notifications:listNotifications': { access: 'authed', impersonation: 'refused' },
  'notifications:getUnreadCount': { access: 'authed', impersonation: 'refused' },
  'notifications:markNotificationsRead': { access: 'authed', impersonation: 'refused' },
  // The channels, kind by kind, and the devices web push reaches: the
  // account's own, in person. The public key is the app's, nothing of a person.
  'notifications:getNotificationChannels': { access: 'authed', impersonation: 'refused' },
  'notifications:setNotificationChannel': { access: 'authed', impersonation: 'refused' },
  'notifications:subscribePush': { access: 'authed', impersonation: 'refused' },
  'notifications:unsubscribePush': { access: 'authed', impersonation: 'refused' },
  'notifications:getPushConfig': {
    access: 'public',
    byDesign: 'The web push public key: every browser that subscribes receives it, so it is public by design, and it says nothing about a person.',
  },

  // account.ts: the account's export, its own and in person: an
  // administrator acting as it is refused. The read of the newest export
  // answers anyone else `null`.
  'account:exportAccountData': { access: 'authed', impersonation: 'refused' },
  'account:getAccountExport': { access: 'authed', impersonation: 'refused' },
  // The deletion waiting out its grace period, the same way; and the keep:
  // with the token of the emailed link anyone keeps the account (256 random
  // bits, stored as a hash), without one only the signed-in account itself.
  'account:getAccountDeletion': { access: 'authed', impersonation: 'refused' },
  'account:cancelAccountDeletion': {
    access: 'public',
    byDesign: 'The "keep my account" link works without a sign-in: its token is 256 random bits stored as a hash, and the call without one is the signed-in account\'s own, refused to an administrator acting as it.',
  },

  // The consent ledger: a person's own agreements and choices, in person (an
  // administrator acting as the account can't agree for it). The read answers
  // anyone else `null`; the terms are the app's declaration, nothing of a person.
  'account:getConsents': { access: 'authed', impersonation: 'refused' },
  'account:grantConsent': { access: 'authed', impersonation: 'refused' },
  'account:withdrawConsent': { access: 'authed', impersonation: 'refused' },
  'account:chooseStorage': { access: 'authed', impersonation: 'refused' },
  // The first run at /welcome: the state is the account's own and a visit reads it; finishing it is in person.
  'account:getOnboarding': { access: 'authed' },
  'account:completeOnboarding': { access: 'authed', impersonation: 'refused' },
  'account:getConsentTerms': {
    access: 'public',
    byDesign: 'The required consents the app declares and its minimum age: what a signed-out sign-in form names in its agreement line, nothing about a person.',
  },

  // admin.ts: the admin console's reads, for an administrator whose role is
  // read fresh. A read answers anyone else `null`, an administrator acting
  // as someone included (an administrator's account is never visited, so
  // that session can only be one opened before a promotion).
  'admin:listUsers': { access: 'admin', impersonation: 'refused' },
  'admin:getUser': { access: 'admin', impersonation: 'refused' },
  'admin:listWorkspaces': { access: 'admin', impersonation: 'refused' },
  'admin:getWorkspace': { access: 'admin', impersonation: 'refused' },
  // The growth funnel: counts of the whole app, for an administrator in person.
  'admin:getFunnel': { access: 'admin', impersonation: 'refused' },

  // flags.ts: every flag's value for the caller, which a signed-out page
  // renders too; the admin console's list, `null` to anyone who is not an
  // administrator now; and a change, an administrator's in person with a
  // recent sign-in.
  'flags:getFlags': {
    access: 'public',
    byDesign: 'Each flag\'s value for the caller and the maintenance notice: what the page renders for them, never whom a flag targets.',
  },
  'flags:listFlags': { access: 'admin', impersonation: 'refused' },
  'flags:setFlag': { access: 'admin', impersonation: 'refused', recentSignIn: true },
  // An experiment's variant for whoever reads it: the control for a visitor,
  // signed out, with nothing recorded; a visit reads the variant and records no exposure.
  'flags:exposeExperiment': { access: 'public', byDesign: 'It answers the caller\'s own variant and records only the caller\'s own exposure: a visitor and a visit record nothing.' },
  'flags:getExperiments': { access: 'admin', impersonation: 'refused' },

  // auth.ts
  'auth:getAuthUser': { access: 'authed' },
  'auth:authConfig': {
    access: 'public',
    byDesign: 'Page paths for `nuxt-backend doctor`, the same ones the site serves.',
  },
  'auth:updateProfile': { access: 'authed' },
  'auth:listSessions': { access: 'authed' },
  'auth:revokeSession': { access: 'authed', owned: true, impersonation: 'refused' },
  'auth:listSignInAlerts': { access: 'authed' },

  // billing.ts: the workspace's billing. Reading it is for members; buying,
  // changing the plan and the provider's records are for whoever manages it;
  // the portal and the plan's lifecycle are a person's own.
  'billing:generateCheckoutLink': { access: 'manage', impersonation: 'refused', inputs: ['catalog', 'redirect', 'metadata', 'trial', 'discount'] },
  'billing:generateCustomerPortalUrl': { access: 'manage', impersonation: 'refused', inputs: ['redirect'] },
  'billing:getConfiguredProducts': { access: 'public', byDesign: 'The price list a pricing page shows signed-out visitors.' },
  'billing:getPricing': { access: 'public', byDesign: 'The plans and packs on sale, rendered on the server for signed-out visitors and crawlers alike: the same for everyone.' },
  'billing:listAllSubscriptions': { access: 'member' },
  // The purchaser pays at the provider's checkout, for someone else.
  'billing:giftCheckout': { access: 'authed', impersonation: 'refused', inputs: ['catalog', 'redirect', 'metadata'] },
  'billing:getCurrentSubscription': { access: 'member' },
  'billing:getFeatures': { access: 'member' },
  'billing:getCredits': { access: 'member' },
  'billing:getBillingAccess': { access: 'member' },
  'billing:getWithdrawal': { access: 'manage', impersonation: 'refused' },
  'billing:syncEntitlements': { access: 'member' },
  'billing:getReceivedGifts': { access: 'authed' },
  'billing:claimGift': { access: 'authed', owned: true, impersonation: 'refused' },
  // The purchaser's side of a gift they sent: the sent list, and changes to a gift that is theirs. A cancel moves money.
  'billing:getSentGifts': { access: 'authed' },
  'billing:resendGift': { access: 'authed', owned: true, impersonation: 'refused' },
  'billing:changeGiftRecipient': { access: 'authed', owned: true, impersonation: 'refused' },
  'billing:rescheduleGift': { access: 'authed', owned: true, impersonation: 'refused' },
  'billing:cancelGift': { access: 'authed', owned: true, impersonation: 'refused', recentSignIn: true },
  'billing:getBillingConsole': { access: 'admin' },
  'billing:updateSubscription': { access: 'manage', owned: true, impersonation: 'refused', inputs: ['catalog'] },
  'billing:cancelSubscription': { access: 'manage', owned: true, impersonation: 'refused' },
  'billing:acceptSaveOffer': { access: 'manage', owned: 'provider', impersonation: 'refused' },
  'billing:withdraw': { access: 'manage', owned: true, impersonation: 'refused' },
  'billing:uncancelSubscription': { access: 'manage', owned: true, impersonation: 'refused' },
  'billing:cancelPendingChange': { access: 'manage', owned: true, impersonation: 'refused' },
  'billing:pauseSubscription': { access: 'manage', owned: true, impersonation: 'refused' },
  'billing:resumeSubscription': { access: 'manage', owned: true, impersonation: 'refused' },
  'billing:getOrders': { access: 'manage' },
  'billing:getInvoiceUrl': { access: 'manage', owned: 'provider' },
  'billing:getUsageHistory': { access: 'member' },
  'billing:refundOrder': { access: 'admin', impersonation: 'refused', recentSignIn: true },
  'billing:getRevenue': { access: 'admin', impersonation: 'refused' },

  // email.ts. `getSandboxInbox`, public by design (a sandbox address's mail,
  // for demos and e2e runs), is not in the scaffold: only the website
  // re-exports it.
  'email:getEmailStatus': {
    access: 'authed',
    byDesign: 'The email id is the capability: `send` returns it to server code, and the status carries no recipient or body.',
  },
  // The preference center: the account's own topics, never an administrator's
  // to change for it, and the links in an email, whose signed token is the
  // authorization.
  'email:getEmailPreferences': { access: 'authed', impersonation: 'refused' },
  'email:setEmailTopic': { access: 'authed', impersonation: 'refused' },
  'email:unsubscribeAllTopics': { access: 'authed', impersonation: 'refused' },
  'email:recordTimeZone': { access: 'authed', impersonation: 'refused' },
  'email:getEmailLink': {
    access: 'public',
    byDesign: 'What an unsubscribe or confirmation link names: the signed token is the authorization, and the answer is the topic\'s words and whether it is still subscribed, never an address.',
  },
  'email:unsubscribeByLink': {
    access: 'public',
    byDesign: 'The one-click unsubscribe works without a sign-in, as RFC 8058 needs: the signed token names the contact and the topic, and it can only take mail away.',
  },
  'email:confirmEmailTopic': {
    access: 'public',
    byDesign: 'A double opt-in\'s confirmation link works without a sign-in: the signed, expiring token names the contact and the topic it asked for.',
  },
  // Announcements: every signed-in page shows the live ones; the console and
  // its writes are an administrator's, in person.
  'email:getAnnouncements': {
    access: 'public',
    byDesign: 'The live notices every signed-in account sees, less the ones the caller dismissed; a signed-out caller reads an empty list.',
  },
  'email:dismissAnnouncement': { access: 'authed', impersonation: 'refused' },
  'email:getAnnouncementsConsole': { access: 'admin', impersonation: 'refused' },
  'email:publishAnnouncement': { access: 'admin', impersonation: 'refused', recentSignIn: true },
  'email:endAnnouncement': { access: 'admin', impersonation: 'refused', recentSignIn: true },
  'email:previewAnnouncement': { access: 'admin', impersonation: 'refused', recentSignIn: true },
  'email:sendAnnouncement': { access: 'admin', impersonation: 'refused', recentSignIn: true },
  'email:cancelAnnouncement': { access: 'admin', impersonation: 'refused', recentSignIn: true },
  // Suppressions: the provider's list, mirrored, and its lift, an administrator's in person.
  'email:getSuppressions': { access: 'admin', impersonation: 'refused' },
  'email:liftSuppression': { access: 'admin', impersonation: 'refused', recentSignIn: true },

  // webhooks.ts: the delivery log is deployment-wide, and a replay changes
  // state as the first delivery did: an administrator's, in person.
  'webhooks:getWebhookDeliveries': { access: 'admin', impersonation: 'refused' },
  'webhooks:replayWebhookDelivery': { access: 'admin', impersonation: 'refused', recentSignIn: true },
}

/**
 * Every public function an app gets from a setup's `api` beyond what the
 * scaffold exports: content reports (`setupAdmin({ reports })`), launch
 * phases and invitations (`setupAccess`), the waitlist, files and share
 * links (`setupStorage`), referrals, and the contact form and support
 * inbox every `setupEmail` carries. The probes call them the same way, on
 * an app that re-exports each setup's whole `api`
 * (`authorization-probes.test.ts`), so a function a setup adds is probed
 * once an app could export it, scaffold or not.
 */
export const OPT_IN_POLICIES: Record<string, Policy> = {
  // admin.ts with `reports`: the one-click report is a signed-in person's
  // own; the notice form and an appeal are anyone's; the Reports tab and its
  // decisions are an administrator's, in person.
  'admin:reportContent': { access: 'authed', impersonation: 'refused' },
  'admin:sendNotice': {
    access: 'public',
    byDesign: 'The notice form (DSA Art. 16) takes notices from anyone, signed in or not: it passes the bot check and the per-mailbox and deployment-wide limits, and files a notice an administrator decides.',
  },
  'admin:getAppeal': {
    access: 'public',
    byDesign: 'The appeal link is the authorization: a 256-bit token, stored as a hash, emailed to the author of what was hidden. The answer is the decision\'s title, reason and dates.',
  },
  'admin:appealDecision': {
    access: 'public',
    byDesign: 'The same link\'s token appeals its decision once, within six months, without a sign-in: the author may have lost the account.',
  },
  'admin:getReports': { access: 'admin', impersonation: 'refused' },
  'admin:decideReport': { access: 'admin', impersonation: 'refused', recentSignIn: true },
  'admin:flagCrime': { access: 'admin', impersonation: 'refused', recentSignIn: true },
  'admin:decideAppeal': { access: 'admin', impersonation: 'refused', recentSignIn: true },

  // access.ts: the phase every sign-in page reads, an invitation code's
  // check, and the Access tab, an administrator's in person.
  'access:getAccessPhase': {
    access: 'public',
    byDesign: 'Which phase the app is in, which every sign-in page shows before anyone signs in.',
  },
  'access:checkInvite': {
    access: 'public',
    byDesign: 'Whether a code is a live invitation, asked before sign-up: the per-caller and deployment-wide limits keep guessing slow, and the answer names no address.',
  },
  'access:getAccessConsole': { access: 'admin', impersonation: 'refused' },
  'access:setAccessPhase': { access: 'admin', impersonation: 'refused', recentSignIn: true },
  'access:createInvite': { access: 'admin', impersonation: 'refused', recentSignIn: true },
  'access:revokeInvite': { access: 'admin', impersonation: 'refused', recentSignIn: true },
  'access:admitEmails': { access: 'admin', impersonation: 'refused', recentSignIn: true },

  // waitlist.ts: the form and the status link are anyone's; the Queue tab is
  // an administrator's, and its writes in person.
  'waitlist:getWaitlistQuestions': {
    access: 'public',
    byDesign: 'The questions the waitlist form asks, the same for everyone.',
  },
  'waitlist:joinWaitlist': {
    access: 'public',
    byDesign: 'Joining is for people without an account: the bot check and the per-address and deployment-wide limits gate it, and an entry counts only once its emailed code is checked.',
  },
  'waitlist:waitlistStatus': {
    access: 'public',
    byDesign: 'The status link is the authorization: a token signed under the auth secret, naming one entry. The answer is its place in line, never an address.',
  },
  'waitlist:leaveWaitlist': {
    access: 'public',
    byDesign: 'The same signed status link takes its entry out of line, without a sign-in.',
  },
  'waitlist:getWaitlistConsole': { access: 'admin', impersonation: 'refused' },
  'waitlist:getWaitlistCaps': { access: 'admin', impersonation: 'refused' },
  'waitlist:admitWaitlist': { access: 'admin', impersonation: 'refused', recentSignIn: true },
  'waitlist:declineWaitlist': { access: 'admin', impersonation: 'refused', recentSignIn: true },
  'waitlist:noteWaitlist': { access: 'admin', impersonation: 'refused', recentSignIn: true },

  // files.ts (setupStorage): uploads are a signed-in account's; a file's URL
  // and a row's share link answer only whoever `canShare` lets share the row.
  // An administrator's visit may upload and share as the person: support work.
  'files:generateUploadUrl': { access: 'authed' },
  'files:getFileUrl': { access: 'authed', owned: true },
  'files:getShareLink': { access: 'authed', owned: true },
  'files:enableShareLink': { access: 'authed', owned: true },
  'files:revokeShareLink': { access: 'authed', owned: true },

  // referrals.ts: a person's own code, claims and sharing, in person; the
  // preview of a code is anyone's; the Referrals tab is an administrator's.
  'referrals:getReferralCode': { access: 'authed', impersonation: 'refused' },
  'referrals:getReferrals': { access: 'authed' },
  'referrals:claimReferral': { access: 'authed', impersonation: 'refused' },
  'referrals:previewReferral': {
    access: 'public',
    byDesign: 'A referral link\'s landing page names who invited the visitor, by first name only, and the program\'s terms before sign-up; a code is 40 random bits.',
  },
  'referrals:setReferralSharing': { access: 'authed', impersonation: 'refused' },
  // The Referrals tab reads with the Billing tab's rule (`getBillingConsole`): an administrator's visit may read it.
  'referrals:getReferralConsole': { access: 'admin' },
  'referrals:resolveReferral': { access: 'admin', impersonation: 'refused', recentSignIn: true },

  // billing.ts: the delivery log's old place, before it moved to webhooks.ts.

  // email.ts: every setupEmail carries the contact form, the dev inbox and
  // the support inbox, which the starter does not re-export.
  'email:submitContactMessage': {
    access: 'public',
    impersonation: 'refused',
    byDesign: 'The contact form takes messages from anyone, behind the bot check and the per-address limit; an administrator acting as an account is refused, so no message is stored as words the account never wrote.',
  },
  'email:getSandboxInbox': {
    access: 'public',
    byDesign: 'The dev inbox for test addresses, published only with EMAIL_DEV_INBOX set and never in production; anywhere else it answers an empty list.',
  },
  'email:getInboxConsole': { access: 'admin', impersonation: 'refused' },
  'email:replyToInbox': { access: 'admin', impersonation: 'refused', recentSignIn: true },
}

/** How each probe is named: a caller kind, or the principal sending an input only the server may choose. */
export type Probe = 'anonymous' | 'otherUser' | 'otherWorkspace' | 'otherManager' | 'impersonated' | 'stale' | `input:${InputRule}`

/** The caller kinds, in the order the probes run. */
export const CALLERS = ['anonymous', 'otherUser', 'otherWorkspace', 'otherManager', 'impersonated', 'stale'] as const

const RANK: Record<Access, number> = { public: 0, authed: 1, member: 2, manage: 3, admin: 4 }

/**
 * The rule of `policy` that refuses `probe`, or `null` when the probe may
 * get through. What a gap in the ratchet names as its policy.
 */
export function refusingRule(policy: Policy, probe: Probe): string | null {
  if (probe.startsWith('input:')) return policy.inputs?.includes(probe.slice(6) as InputRule) ? probe.slice(6) : null
  switch (probe) {
    case 'anonymous':
      return policy.access === 'public' ? null : policy.access
    case 'otherUser':
      // A plain member: in for `member`, out for `manage` and `admin`.
      if (RANK[policy.access] >= RANK.manage) return policy.access
      return policy.owned ? 'owned' : null
    case 'otherWorkspace':
      // Not a member any more: out for `member` and up.
      if (RANK[policy.access] >= RANK.member) return policy.access
      return policy.owned ? 'owned' : null
    case 'otherManager':
      // A manager, of their own workspace: only an admin function or the
      // principal's ids are out of reach.
      if (policy.access === 'admin') return 'admin'
      return policy.owned === true ? 'owned' : null
    case 'impersonated':
      return policy.impersonation === 'refused' ? 'impersonation' : null
    case 'stale':
      return policy.recentSignIn ? 'recent' : null
  }
  return null
}
