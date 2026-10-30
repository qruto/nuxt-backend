// The backend event catalog: every kind of event the package records on the
// shared event path (`recordBackendEvent`, nuxt-backend/audit), with what
// its `data` carries, who reads it and what it derives. Runtime-neutral
// (no Vue, no Convex runtime), so the component that stores the rows, the
// auth layer that records them and the docs that list them read one table.
// test/unit/events-catalog.test.ts holds every kind to the rules below, and
// the Events reference page is generated from it.
//
// An event row never holds an address, a name, a code or a token: who acted
// and who it is about are account ids, the workspace a workspace id, and
// `data` only the fields a kind declares here (a role, a sign-in method,
// a workspace's invitation id). An app's own kinds live under `app.`.

/** The type of a field an event's `data` carries; `?` marks one it may leave out. */
export type EventFieldType = 'string' | 'string?' | 'string[]' | 'string[]?' | 'boolean' | 'boolean?' | 'number' | 'number?'

/**
 * Where an event belongs, which decides who reads it:
 * - `account`: about one account (`subjectId`), read by that account and the
 *   app's administrators;
 * - `workspace`: inside one workspace (`entityId`), read by the account it is
 *   about, the workspace's owners and admins, and the app's administrators;
 * - `entity`: about a billing entity, which is a workspace (`entityId`, read
 *   like a workspace's event) or, with `billTo: 'user'`, an account billed on
 *   its own (`subjectId`, read like an account's event).
 */
export type EventScope = 'account' | 'workspace' | 'entity'

/** Who reads an event's row: the account it is about, the workspace's managers, the app's administrators. */
export type EventReader = 'subject' | 'workspace' | 'admin'

/** The channels an event derives a delivery on, beside its row. */
export type EventChannel = 'in-app' | 'email'

/** One kind of event. */
export interface BackendEventDefinition {
  /** Where it belongs: see {@link EventScope}. */
  scope: EventScope
  /** The fields its `data` carries, by name. A field not listed here is refused. */
  data: Readonly<Record<string, EventFieldType>>
  /**
   * What it derives beside its row, before the channel matrix applies:
   * `in-app` a notification in the app (they arrive with the notifications
   * layer), `email` an email to the account it is about. Empty for the
   * record alone. A billing, gift or referral kind never derives an email,
   * whatever it declares.
   */
  channels: readonly EventChannel[]
  /** What happened, for the Events reference. */
  description: string
  /** What records it: the route or the hook, for the Events reference. */
  recordedBy: string
  /**
   * Left out of the person's own activity view (`listActivity`), which
   * would otherwise tell them something about themselves they should not
   * learn there, such as an experiment's cohort. The workspace's and the
   * administrators' views keep it, and so does the data export.
   */
  hiddenFromOwnActivity?: true
}

const STRING = 'string'
const OPTIONAL_STRING = 'string?'
const NUMBER = 'number'
const OPTIONAL_NUMBER = 'number?'

/** What a billing provider's webhook records: the app acted, for the billing entity the customer belongs to. */
const BY_WEBHOOK = 'The billing webhook (`/billing/events`), for the entity the customer belongs to; a free plan\'s own events record nothing'

/**
 * The package's event kinds, by type. Each type is `<area>.<what
 * happened>`, in the past tense: what it carries, who reads it, what it
 * derives and what records it.
 */
export const BACKEND_EVENTS = {
  // ── Sign-in and the account ───────────────────────────────────────────
  'auth.signed_in': {
    scope: 'account',
    data: { method: OPTIONAL_STRING },
    channels: [],
    description: 'A session was opened for the account: `method` is how it signed in (`email-otp`, `passkey`), read as the account\'s last sign-in method records it.',
    recordedBy: 'Every new session, by its database hook, except an administrator\'s impersonation and a re-authentication',
  },
  'auth.signed_out': {
    scope: 'account',
    data: {},
    channels: [],
    description: 'The account signed out of this browser.',
    recordedBy: '`/sign-out`',
  },
  'auth.reauthenticated': {
    scope: 'account',
    data: { method: OPTIONAL_STRING },
    channels: [],
    description: 'The person confirmed it was them, with a passkey or a code, before a sensitive action; the new session replaced the old one.',
    recordedBy: 'A sign-in marked as a re-authentication (`useReauthentication`)',
  },
  'auth.passkey_added': {
    scope: 'account',
    data: {},
    channels: ['in-app', 'email'],
    description: 'A passkey was saved to the account. `targetId` is the passkey.',
    recordedBy: '`/passkey/verify-registration`',
  },
  'auth.passkey_removed': {
    scope: 'account',
    data: {},
    channels: ['in-app', 'email'],
    description: 'A passkey was removed from the account. `targetId` is the passkey.',
    recordedBy: '`/passkey/delete-passkey`',
  },
  'auth.passkey_only_changed': {
    scope: 'account',
    data: { enabled: 'boolean' },
    channels: ['in-app', 'email'],
    description: 'Sign-in codes were turned off for the account (`enabled: true`: it signs in with a passkey only) or back on, by the person, or by an administrator for someone who lost every passkey.',
    recordedBy: '`/passkey-only/set` and `/admin/disable-passkey-only`',
  },
  'auth.email_changed': {
    scope: 'account',
    data: {},
    channels: ['in-app', 'email'],
    description: 'The account moved to a new address. Neither address is kept: the old one hears of it from the `emailChanged` notice.',
    recordedBy: '`/email-otp/change-email`',
  },
  'auth.new_device': {
    scope: 'account',
    data: { browser: OPTIONAL_STRING, os: OPTIONAL_STRING, recovery: 'boolean?' },
    channels: ['in-app', 'email'],
    description: 'The account signed in from a device it has not used before (`browser` and `os` name it when known), or with its recovery code (`recovery`), which always counts as new. The account\'s first device records nothing. The email goes out from the sign-in itself, with the device, place and time; a recovery\'s is the `passkeyRecovered` email. `targetId` is the session.',
    recordedBy: 'Every new session, by its database hook, except an administrator\'s impersonation',
  },
  'auth.session_revoked': {
    scope: 'account',
    data: {},
    channels: [],
    description: 'A session of the account was signed out from elsewhere: by its owner, or by an administrator. `targetId` is the session.',
    recordedBy: '`/revoke-session`, `/revoke-sessions`, `/revoke-other-sessions`, `/admin/revoke-user-session(s)` and `auth:revokeSession`',
  },

  // ── Workspaces ────────────────────────────────────────────────────────
  'workspace.created': {
    scope: 'workspace',
    data: {},
    channels: [],
    description: 'A workspace was created; its creator is its owner.',
    recordedBy: '`/organization/create`',
  },
  'workspace.member_invited': {
    scope: 'workspace',
    data: { role: STRING },
    channels: [],
    description: 'Someone was invited to the workspace with `role`. `targetId` is the invitation; the address it went to is not kept.',
    recordedBy: '`/organization/invite-member`',
  },
  'workspace.invitation_accepted': {
    scope: 'workspace',
    data: { role: STRING },
    channels: ['in-app'],
    description: 'The account accepted an invitation and joined the workspace with `role`. `targetId` is the invitation.',
    recordedBy: '`/organization/accept-invitation`',
  },
  'workspace.member_removed': {
    scope: 'workspace',
    data: {},
    channels: ['in-app'],
    description: 'The account was taken out of the workspace. `targetId` is the membership.',
    recordedBy: '`/organization/remove-member`',
  },
  'workspace.member_role_changed': {
    scope: 'workspace',
    data: { role: STRING },
    channels: ['in-app'],
    description: 'The account\'s role in the workspace became `role`. A change to the role it already held records nothing.',
    recordedBy: '`/organization/update-member-role`',
  },

  // ── Administration ────────────────────────────────────────────────────
  'admin.impersonation_started': {
    scope: 'account',
    data: {},
    channels: [],
    description: 'An administrator (the actor) began acting as the account. `targetId` is the session they opened.',
    recordedBy: 'The impersonation\'s session, by its database hook (`/admin/impersonate-user`)',
  },
  'admin.impersonation_stopped': {
    scope: 'account',
    data: {},
    channels: [],
    description: 'The administrator stopped acting as the account. `targetId` is the session that ended.',
    recordedBy: '`/admin/stop-impersonating`, and signing the impersonated session out',
  },
  'admin.role_changed': {
    scope: 'account',
    data: { role: STRING },
    channels: ['in-app'],
    description: 'An administrator set the account\'s app-wide role to `role`. Setting the role it already held records nothing.',
    recordedBy: '`/admin/set-role`, and the `setUserRole` bootstrap (as the app)',
  },
  'admin.user_banned': {
    scope: 'account',
    data: { expiresIn: 'number?' },
    channels: [],
    description: 'An administrator banned the account: it cannot sign in, and every session it had was signed out. `expiresIn` is how many seconds the ban lasts; without it, until lifted. The reason given is not kept.',
    recordedBy: '`/admin/ban-user`',
  },
  'admin.user_unbanned': {
    scope: 'account',
    data: {},
    channels: [],
    description: 'An administrator lifted the account\'s ban: it can sign in again.',
    recordedBy: '`/admin/unban-user`',
  },

  // ── Flags ─────────────────────────────────────────────────────────────
  'flag.changed': {
    scope: 'account',
    data: { flag: STRING, enabled: 'boolean?', rollout: 'number?', targets: 'number?', reset: 'boolean?', winner: OPTIONAL_STRING },
    channels: [],
    description: 'An administrator (the actor) changed a feature flag or a kill switch: `flag` is its key, `enabled` its value for everyone when the change sets one, `rollout` the percentage it rolls out to, `targets` how many accounts, workspaces and plans it names (never which), `winner` the variant an experiment\'s flag now shows everyone, and `reset` that its override was removed, so it holds its default from code.',
    recordedBy: '`flags:setFlag` (`setupFlags`), from the admin console\'s Flags tab and the Experiments view',
  },
  'experiment.exposed': {
    scope: 'entity',
    data: { experiment: STRING, variant: STRING },
    channels: [],
    description: 'An account saw a variant of an experiment for the first time: `experiment` is the flag\'s key, `variant` the version it was given. For an experiment `by: \'workspace\'`, `entityId` is the workspace the variant belongs to. Once per account (or workspace) and experiment; only exposed people count in its results. The person\'s own activity view leaves it out, so nobody is told which version they were given; the workspace\'s and the administrators\' views show it.',
    recordedBy: 'The first `useExperiment` (`flags:exposeExperiment`) or `flags.variant` read of a running experiment',
    hiddenFromOwnActivity: true,
  },

  // ── Announcements ─────────────────────────────────────────────────────
  'announcement.published': {
    scope: 'account',
    data: { announcement: STRING, broadcast: 'boolean' },
    channels: [],
    description: 'An administrator (the actor) published an announcement: `announcement` is its id, and `broadcast` whether an email waits to go with it. Never its words.',
    recordedBy: '`email:publishAnnouncement` (`setupEmail`), from the admin console\'s Announcements tab',
  },
  'announcement.ended': {
    scope: 'account',
    data: { announcement: STRING },
    channels: [],
    description: 'An administrator (the actor) took an announcement\'s notice down before it expired.',
    recordedBy: '`email:endAnnouncement` (`setupEmail`), from the admin console\'s Announcements tab',
  },
  'announcement.sent': {
    scope: 'account',
    data: { announcement: STRING, audience: STRING, topic: 'string?', scheduled: 'boolean' },
    channels: [],
    description: 'An administrator (the actor) sent an announcement\'s broadcast: `audience` is `accounts` (under `topic`) or `waitlist`, and `scheduled` that it goes out later.',
    recordedBy: '`email:sendAnnouncement` (`setupEmail`), from the admin console\'s Announcements tab',
  },
  'announcement.cancelled': {
    scope: 'account',
    data: { announcement: STRING },
    channels: [],
    description: 'An administrator (the actor) cancelled an announcement\'s broadcast before it went out.',
    recordedBy: '`email:cancelAnnouncement` (`setupEmail`), from the admin console\'s Announcements tab',
  },

  // ── Launch access ─────────────────────────────────────────────────────
  'access.phase_changed': {
    scope: 'account',
    data: { phase: STRING, from: STRING },
    channels: [],
    description: 'An administrator (the actor) moved the app to another launch phase: `phase` is the new one, `from` the one before (`early-access`, `invite-only`, `public`).',
    recordedBy: '`access:setAccessPhase` (`setupAccess`), from the admin console\'s Access tab',
  },
  'access.ticket_used': {
    scope: 'account',
    data: { ticket: STRING, label: OPTIONAL_STRING },
    channels: [],
    description: 'A new account signed up with a ticket while the app was closed: `ticket` is its kind (`invite-code`, `access-link`, `invitation`, `waitlist`, `workspace-invitation`, `gift`, `domain`, `administrator`) and `label` the cohort of a code, a link or an invitation by address. Never the code itself.',
    recordedBy: 'The account\'s creation (`user.create`), once the account exists',
  },
  'access.invite_created': {
    scope: 'account',
    data: { kind: STRING, label: STRING, maxUses: NUMBER },
    channels: [],
    description: 'An administrator (the actor) or server code made an invite code (`kind` `code`) or an access link (`link`) for the cohort `label`, good for `maxUses` sign-ups. Never the code itself.',
    recordedBy: '`access:createInvite` and `access.invites.create`',
  },
  'access.invite_revoked': {
    scope: 'account',
    data: { kind: STRING },
    channels: [],
    description: 'An administrator (the actor) closed a code or a link (`kind` `invite`), or deleted an unused invitation by address (`admission`).',
    recordedBy: '`access:revokeInvite`',
  },
  'access.admitted': {
    scope: 'account',
    data: { count: NUMBER, label: OPTIONAL_STRING },
    channels: [],
    description: 'An administrator (the actor) or server code invited `count` addresses by address, for the cohort `label`. Never the addresses.',
    recordedBy: '`access:admitEmails` and `access.admit`',
  },

  // ── Waitlist ──────────────────────────────────────────────────────────
  'waitlist.joined': {
    scope: 'account',
    data: { source: STRING, referred: 'boolean', news: 'boolean' },
    channels: [],
    description: 'An address\'s sign-in code checked while the app was in early access, so it is on the waitlist: `source` is where it joined (`sign-in`, or the form\'s source), `referred` that it came through a friend\'s link, `news` that it asked for launch news. Never the address. The person has no account, so there is no actor.',
    recordedBy: 'The code check of a new address in early access (`setupAccess`\'s sign-in hooks)',
  },
  'waitlist.admitted': {
    scope: 'account',
    data: { count: NUMBER },
    channels: [],
    description: 'An administrator (the actor) admitted `count` waitlist entries, each given a ticket and a "You\'re in" email. Never the addresses.',
    recordedBy: '`waitlist:admitWaitlist` (`setupWaitlist`), from the admin console\'s Waitlist tab',
  },
  'waitlist.declined': {
    scope: 'account',
    data: { count: NUMBER, abuse: 'boolean' },
    channels: [],
    description: 'An administrator (the actor) declined `count` waitlist entries; `abuse` that they were removed as abuse, which takes back what each gave the friend who shared with it.',
    recordedBy: '`waitlist:declineWaitlist` (`setupWaitlist`), from the admin console\'s Waitlist tab',
  },
  'report.decided': {
    scope: 'account',
    data: { action: STRING, ground: STRING, reports: NUMBER, reason: STRING, table: OPTIONAL_STRING },
    channels: [],
    description: 'An administrator (the actor) decided reported content (`targetId`, a row of `table`): `action` is `hidden` or `dismissed`, `ground` `illegal` or `terms`, `reports` how many open reports and notices it closed, `reason` the start of the reason given. About its author, when `reports.describe` names one. Never who reported it.',
    recordedBy: '`admin:decideReport` (`setupAdmin({ reports })`), from the admin console\'s Reports tab',
  },
  'report.crime_flagged': {
    scope: 'account',
    data: { table: OPTIONAL_STRING },
    channels: [],
    description: 'An administrator (the actor) flagged reported content (`targetId`) as a suspected crime that threatens someone\'s life or safety, to be told to the authorities (DSA Art. 18). The package tells no one.',
    recordedBy: '`admin:flagCrime` (`setupAdmin({ reports })`), from the admin console\'s Reports tab',
  },
  'report.appealed': {
    scope: 'account',
    data: {},
    channels: [],
    description: 'The author of hidden content appealed the decision through the link in its statement of reasons. The appeal waits in the Reports tab.',
    recordedBy: '`admin:appealDecision` (`setupAdmin({ reports })`), from the `report` page',
  },
  'report.appeal_decided': {
    scope: 'account',
    data: { outcome: STRING, reason: STRING },
    channels: [],
    description: 'An administrator (the actor) decided an appeal about content (`targetId`): `outcome` is `upheld` or `reversed`, `reason` the start of the reason given. About the content\'s author.',
    recordedBy: '`admin:decideAppeal` (`setupAdmin({ reports })`), from the admin console\'s Reports tab',
  },
  'waitlist.left': {
    scope: 'account',
    data: {},
    channels: [],
    description: 'A person left the waitlist from their status page: their entry and contact were removed.',
    recordedBy: '`waitlist:leaveWaitlist` (`setupWaitlist`)',
  },

  // ── Jobs ──────────────────────────────────────────────────────────────
  'job.queue_changed': {
    scope: 'account',
    data: { change: STRING, tier: OPTIONAL_STRING, model: OPTIONAL_STRING },
    channels: [],
    description: 'An administrator (the actor) changed the job queue: `change` is `paused`, `resumed`, `concurrency`, `tier` or `model`, with the `tier` or `model` it retuned.',
    recordedBy: '`jobs:setQueue` (`defineJobQueue`), from the admin console\'s Queue tab',
  },
  'job.canceled': {
    scope: 'entity',
    data: { kind: STRING, refunded: 'boolean', running: 'boolean' },
    channels: [],
    description: 'Someone (the actor) canceled a job of the billing entity: `kind` is its `jobs.define` export, `running` whether it had started, and `refunded` whether its credits went back.',
    recordedBy: '`jobs:cancelJob` (`defineJobQueue`), from `useJob().cancel()` or the admin console\'s Queue tab',
  },
  'job.retried': {
    scope: 'entity',
    data: { kind: STRING },
    channels: [],
    description: 'An administrator (the actor) put a failed job of the billing entity back in line, with a new hold on its credits.',
    recordedBy: '`jobs:retryJob` (`defineJobQueue`), from the Queue tab\'s dead letters',
  },

  // ── AI ────────────────────────────────────────────────────────────────
  'ai.spend_limit_reached': {
    scope: 'account',
    data: { usd: NUMBER, limit: NUMBER },
    channels: [],
    description: 'What AI cost the whole app today (UTC), `usd`, reached the daily spend limit, `limit` (US dollars), so the app turned the `pause_ai` kill switch on until the next UTC day begins, when it lifts by itself. By the app: no one signed in acted, and the administrators\' view shows it.',
    recordedBy: 'The cost record that reached `setupAi({ spendLimit })` (`costs.checkSpendLimit` in the `backend` component)',
  },

  // ── Billing ───────────────────────────────────────────────────────────
  // In the app only, whatever a kind declares: the billing provider sends
  // its own receipts, trial and dunning mail.
  'billing.checkout_started': {
    scope: 'entity',
    data: { productId: STRING },
    channels: [],
    description: 'A billing manager opened a checkout for a plan or a pack: `productId` is the provider product. Paying for it records `billing.order_paid`.',
    recordedBy: '`billing:generateCheckoutLink` and `billing.checkout`',
  },
  'billing.plan_changed': {
    scope: 'entity',
    data: { change: STRING, productId: OPTIONAL_STRING },
    channels: ['in-app'],
    description: 'A billing manager changed the subscription: `change` is `plan` (to `productId`), `cancel`, `uncancel`, `cancel_pending`, `pause` or `resume`. `targetId` is the subscription.',
    recordedBy: '`billing:updateSubscription`, `cancelSubscription`, `uncancelSubscription`, `cancelPendingChange`, `pauseSubscription` and `resumeSubscription`',
  },
  'billing.subscription_created': {
    scope: 'entity',
    data: { productId: STRING, interval: OPTIONAL_STRING, trialEndsAt: 'number?', trialDays: 'number?' },
    channels: ['in-app'],
    description: 'A paid subscription started at the provider. `targetId` is the subscription; `interval` is its billing period (`month`, `year`), and a trial\'s end (`trialEndsAt`, epoch ms) and length in days (`trialDays`) when it starts with one.',
    recordedBy: BY_WEBHOOK,
  },
  'billing.subscription_updated': {
    scope: 'entity',
    data: { productId: STRING, status: STRING },
    channels: [],
    description: 'A paid subscription changed at the provider: its plan, its status or its period. `targetId` is the subscription.',
    recordedBy: BY_WEBHOOK,
  },
  'billing.subscription_canceled': {
    scope: 'entity',
    data: { productId: STRING, reason: OPTIONAL_STRING },
    channels: ['in-app'],
    description: 'A paid subscription was canceled: it ends with its period. `reason` is the customer\'s cancellation reason, when they gave one. `targetId` is the subscription.',
    recordedBy: BY_WEBHOOK,
  },
  'billing.subscription_revoked': {
    scope: 'entity',
    data: { productId: STRING },
    channels: ['in-app'],
    description: 'A paid subscription ended, and its benefits with it. `targetId` is the subscription.',
    recordedBy: BY_WEBHOOK,
  },
  'billing.subscription_past_due': {
    scope: 'entity',
    data: { productId: STRING },
    channels: ['in-app'],
    description: 'A renewal payment failed and the provider retries it: the `past-due` notice shows to the billing managers until it is paid. `targetId` is the subscription.',
    recordedBy: BY_WEBHOOK,
  },
  'billing.order_paid': {
    scope: 'entity',
    data: { amount: NUMBER, currency: STRING, interval: OPTIONAL_STRING, promotion: OPTIONAL_STRING },
    channels: ['in-app'],
    description: 'An order was paid: `amount` in the currency\'s smallest unit, `interval` the billing period of the subscription it pays for (`month`, `year`), and `promotion` the catalog key of the discount it was bought with, when it was one of the catalog\'s. `targetId` is the order.',
    recordedBy: BY_WEBHOOK,
  },
  'billing.order_refunded': {
    scope: 'entity',
    data: { amount: NUMBER, currency: STRING },
    channels: ['in-app'],
    description: 'An order was refunded at the provider: `amount` is what it refunded so far, in the currency\'s smallest unit. `targetId` is the order.',
    recordedBy: BY_WEBHOOK,
  },
  'billing.refund_issued': {
    scope: 'entity',
    data: { amount: OPTIONAL_NUMBER, reason: STRING },
    channels: [],
    description: 'An administrator (the actor) refunded an order: `amount` when it was a part of it, `reason` the provider\'s reason. `targetId` is the order.',
    recordedBy: '`billing:refundOrder`',
  },
  'billing.benefit_granted': {
    scope: 'entity',
    data: { benefitType: STRING },
    channels: [],
    description: 'The provider granted a benefit of a plan or a pack: features, credits, a license key. `targetId` is the benefit.',
    recordedBy: BY_WEBHOOK,
  },
  'billing.benefit_revoked': {
    scope: 'entity',
    data: { benefitType: STRING },
    channels: [],
    description: 'The provider revoked a benefit. `targetId` is the benefit.',
    recordedBy: BY_WEBHOOK,
  },
  'billing.credits_low': {
    scope: 'entity',
    data: { balance: NUMBER, threshold: NUMBER, meter: OPTIONAL_STRING },
    channels: ['in-app'],
    description: 'A spend took the credit balance to `threshold` or below (`setupAi({ credits: { lowBalanceThreshold } })`): once per crossing. The actor is the member whose spend crossed it.',
    recordedBy: 'A metered AI call\'s settle (`setupAi`)',
  },
  'billing.save_offer_made': {
    scope: 'entity',
    data: { reason: STRING, offer: STRING },
    channels: [],
    description: 'The cancel flow made a billing manager (the actor) a save offer instead of cancelling at once: `reason` is the cancellation reason, `offer` is `pause`, `downgrade` or `discount`. `targetId` is the subscription.',
    recordedBy: '`billing:cancelSubscription`, with `setupBilling({ lifecycle: { saveOffers } })`',
  },
  'billing.save_offer_accepted': {
    scope: 'entity',
    data: { reason: STRING, offer: STRING },
    channels: ['in-app'],
    description: 'A billing manager (the actor) accepted the cancel flow\'s save offer and kept the plan: `offer` is `pause`, `downgrade` or `discount`. `targetId` is the subscription.',
    recordedBy: '`billing:acceptSaveOffer`',
  },
  'billing.checkout_abandoned': {
    scope: 'entity',
    data: { productId: STRING },
    channels: [],
    description: 'A checkout expired unpaid, once per checkout: the actor is the person who opened it. The `checkoutAbandoned` lifecycle email starts from it. `targetId` is the checkout.',
    recordedBy: 'The billing webhook\'s `checkout.expired`, with `setupBilling({ lifecycle: { abandonedCheckout: true } })`',
  },
  'billing.contract_withdrawn': {
    scope: 'entity',
    data: { productId: STRING },
    channels: ['in-app'],
    description: 'A billing manager (the actor) withdrew from a purchase inside its 14 days with the withdrawal button: the subscription ended at once and a receipt went out. Refund what is due with `billing.refundOrder`. `targetId` is the subscription.',
    recordedBy: '`billing:withdraw`, with `setupBilling({ lifecycle: { withdrawal: true } })`',
  },
  'billing.trial_pass_started': {
    scope: 'entity',
    data: { plan: STRING, endsAt: NUMBER },
    channels: ['in-app'],
    description: 'A new workspace started on a reverse trial: it holds `plan` as a pass, with no card, until `endsAt` (epoch milliseconds), then returns to the free plan. The actor is its owner. `targetId` is the subscription.',
    recordedBy: 'The free plan\'s start, for a catalog plan with `trial: { pass: true }`',
  },
  'billing.credits_exhausted': {
    scope: 'entity',
    data: { balance: NUMBER, meter: OPTIONAL_STRING },
    channels: ['in-app'],
    description: 'A spend took the credit balance from above zero to zero or below: once per crossing. The actor is the member whose spend crossed it.',
    recordedBy: 'A metered AI call\'s settle (`setupAi`)',
  },

  // ── Gifts ─────────────────────────────────────────────────────────────
  'gift.purchased': {
    scope: 'entity',
    data: { amount: OPTIONAL_NUMBER, currency: OPTIONAL_STRING },
    channels: ['in-app'],
    description: 'A gift was paid for; its recipient is told by email, from the gift\'s own template. `targetId` is the gift. Its recipient\'s address is not kept here.',
    recordedBy: 'The billing webhook\'s `order.paid` for a gift',
  },
  'gift.claimed': {
    scope: 'entity',
    data: {},
    channels: ['in-app'],
    description: 'The recipient claimed a gift: for the recipient\'s billing entity, its credits or its plan landed there; for the purchaser\'s, their gift was received. `targetId` is the gift.',
    recordedBy: 'The billing webhook\'s `order.paid` for a gift\'s claim, or `claimGift` for a plan pass',
  },
  'gift.pass_started': {
    scope: 'entity',
    data: { plan: STRING, months: NUMBER, endsAt: NUMBER },
    channels: ['in-app'],
    description: 'A workspace claimed a plan pass: it holds `plan` until `endsAt` (epoch milliseconds), with no card and no renewal. `targetId` is the gift.',
    recordedBy: '`claimGift`, for a plan pass',
  },
  'gift.pass_ending': {
    scope: 'entity',
    data: { plan: STRING, endsAt: NUMBER },
    channels: ['in-app'],
    description: 'A workspace\'s plan pass ends in a week: its billing managers are offered to keep the plan, in the app and by email. `targetId` is the gift.',
    recordedBy: 'The gift sweep, seven days before the pass ends',
  },
  'gift.pass_ended': {
    scope: 'entity',
    data: { plan: STRING, outcome: STRING },
    channels: ['in-app'],
    description: 'A workspace\'s plan pass is over: `outcome` is `returned` when it went back to the free plan and `kept` when the plan was paid for. `targetId` is the gift.',
    recordedBy: 'The gift sweep, or the billing webhook when the plan is kept',
  },
  'gift.refunded': {
    scope: 'entity',
    data: {},
    channels: ['in-app'],
    description: 'A gift\'s purchase was refunded before it was claimed. `targetId` is the gift.',
    recordedBy: 'The billing webhook\'s `order.refunded` for a gift',
  },

  // ── Referrals ─────────────────────────────────────────────────────────
  'referral.claimed': {
    scope: 'entity',
    data: {},
    channels: ['in-app'],
    description: 'Someone signed up through a referral link, on the referrer\'s billing entity, by the app: never who signed up. `targetId` is the referral.',
    recordedBy: '`referrals:claimReferral` (`setupReferrals`)',
  },
  'referral.rewarded': {
    scope: 'entity',
    data: {},
    channels: ['in-app'],
    description: 'A referral\'s reward was granted, once its hold passed. `targetId` is the referral.',
    recordedBy: 'The referral sweep (`referrals:runReferralSweep`, `setupReferrals`), when a hold ends',
  },

  // ── Email ─────────────────────────────────────────────────────────────
  'email.bounced': {
    scope: 'account',
    data: {},
    channels: ['in-app'],
    description: 'An email to the account\'s address bounced: the address may be wrong or closed. Neither the address nor the email is kept here.',
    recordedBy: 'The email webhook (`/email/events`), for an account whose address an `email.bounced` event names',
  },

  'email.suppression_lifted': {
    scope: 'account',
    data: { origin: STRING },
    channels: [],
    description: 'An administrator (the actor) lifted the email provider\'s suppression of an address, so mail reaches it again: `origin` is why it was suppressed (`bounce`, `complaint`, `manual`, `dropped`). The account that holds the address is the subject, when one does; the address is never kept here.',
    recordedBy: '`email:liftSuppression` (`setupEmail`), from the admin console\'s Suppressions tab',
  },

  // ── Webhooks ──────────────────────────────────────────────────────────
  'webhook.replayed': {
    scope: 'account',
    data: { service: STRING, delivery: STRING, type: OPTIONAL_STRING },
    channels: [],
    description: 'An administrator (the actor) asked a provider to send a webhook delivery again: `service` is `billing` or `email`, `delivery` the provider\'s delivery id and `type` its event type. The replay arrives at the route like any delivery.',
    recordedBy: '`webhooks:replayWebhookDelivery` (`setupWebhooks`), from the admin console\'s Webhooks tab or DevTools',
  },

  // ── Consents ──────────────────────────────────────────────────────────
  'consent.granted': {
    scope: 'account',
    data: { kind: STRING, version: STRING, source: STRING },
    channels: [],
    description: 'The account agreed to a document or an opt-in, chose optional storage, or passed the age check: the `kind`, the `version` it agreed to (for `storage`, the purposes it allowed; for `age`, the minimum it passed) and where it came from (`sign-up`, `prompt` or `settings`). Never the age typed.',
    recordedBy: 'Account creation (`setupAccount`\'s required consents), `account:grantConsent` and `account:chooseStorage`',
  },
  'consent.withdrawn': {
    scope: 'account',
    data: { kind: STRING, version: STRING, source: STRING },
    channels: [],
    description: 'The account withdrew a consent, or chose to allow no optional storage: the `kind` and the `version` it had agreed to. A required consent can\'t be withdrawn.',
    recordedBy: '`account:withdrawConsent` and `account:chooseStorage`',
  },

  // ── The account ───────────────────────────────────────────────────────
  'account.created': {
    scope: 'account',
    data: { invite: OPTIONAL_STRING },
    channels: [],
    description: 'An account was created: the growth funnel\'s sign-up. `invite` is the label of the invite code or access link that admitted it, or the kind of ticket that let it in (`invite-code`, `access-link`, `waitlist` and the rest `access.ticket_used` names) when it had no label; absent for an account no ticket admitted. Never the address.',
    recordedBy: 'The account\'s creation, by its database hook',
  },
  'account.activated': {
    scope: 'account',
    data: { kind: STRING },
    channels: [],
    description: 'The account reached activation, once: `kind` is the event that counted, the one `setupAudit({ activation })` names, or the account\'s first event of the app\'s own (`app.*`) when none is named. An event recorded while an administrator acted as the account never counts. The `reviewAsk` lifecycle email starts from it.',
    recordedBy: 'The event path itself, as it records the activation event',
  },
  'account.data_exported': {
    scope: 'account',
    data: {},
    channels: [],
    description: 'The account exported its data: a file behind a link that expires within the hour.',
    recordedBy: '`account:exportAccountData`',
  },
  'account.deletion_scheduled': {
    scope: 'account',
    data: {},
    channels: [],
    description: 'The account asked to be deleted: the deletion waits out its grace period, and the account can cancel it until then.',
    recordedBy: '`/delete-user`, once `setupAccount` is the app\'s account instance',
  },
  'account.deletion_canceled': {
    scope: 'account',
    data: {},
    channels: [],
    description: 'The account kept itself: it cancelled a scheduled deletion from the app, or with the link in the email.',
    recordedBy: '`account:cancelAccountDeletion`',
  },
  'account.erasure_failed': {
    scope: 'account',
    data: { source: STRING, attempts: NUMBER },
    channels: [],
    description: 'A participant of a deleted account\'s erasure gave up after `attempts` tries: `source` names it. The account is gone, so the row names none; administrators read it.',
    recordedBy: 'An erasure (`account.forget`), once a participant used up its retries',
  },
} as const satisfies Record<string, BackendEventDefinition>

/** The kinds the person's own activity view leaves out: see `hiddenFromOwnActivity`. */
export const HIDDEN_FROM_OWN_ACTIVITY: readonly string[] = Object.entries(BACKEND_EVENTS as Record<string, BackendEventDefinition>)
  .filter(([, kind]) => kind.hiddenFromOwnActivity)
  .map(([type]) => type)

/** A kind the package records. */
export type BackendEventType = keyof typeof BACKEND_EVENTS

/** A kind of an app's own: under `app.`, such as `app.project_archived`. */
export type AppEventType = `app.${string}`

/** A value an app's own event may carry in its `data`. */
export type EventDataValue = string | number | boolean | string[]

/** The value a field of one {@link EventFieldType} holds. */
export type EventFieldValue<T> = T extends 'string' | 'string?' ? string
  : T extends 'string[]' | 'string[]?' ? string[]
    : T extends 'boolean' | 'boolean?' ? boolean
      : T extends 'number' | 'number?' ? number
        : never

/** The `data` a set of declared fields types: a field marked `?` may be left out. */
export type EventFieldsOf<F> = { [K in keyof F as F[K] extends `${string}?` ? never : K]: EventFieldValue<F[K]> }
  & { [K in keyof F as F[K] extends `${string}?` ? K : never]?: EventFieldValue<F[K]> }

/** What an event's `data` carries: the kind's declared fields, or any flat values for an app's own kind. */
export type BackendEventData<T extends string> = T extends BackendEventType ? EventFieldsOf<(typeof BACKEND_EVENTS)[T]['data']> : Record<string, EventDataValue>

/** An app's own type: `app.` and one or more lower-case, snake-case words, dot-separated. */
const APP_TYPE = /^app(?:\.[a-z][a-z0-9_]*)+$/

/** The longest type, id or string a row takes. */
export const EVENT_VALUE_MAX = 128

/** The most fields an app's own event carries in its `data`. */
export const EVENT_DATA_FIELDS_MAX = 16

/** The most strings a list in an event's `data` holds. */
export const EVENT_LIST_MAX = 32

/** Whether `type` is a kind of the package's own. */
export function isBackendEventType(type: string): type is BackendEventType {
  return Object.hasOwn(BACKEND_EVENTS, type)
}

/**
 * A role as an event records it, from a role as Better Auth holds it (a
 * string, a comma-separated list, or an array): each role once, in order,
 * so the same roles set in another order read as the role already held.
 * `null` for none.
 */
export function eventRole(value: unknown): string | null {
  const listed = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : []
  const roles = listed.filter((role): role is string => typeof role === 'string').map(role => role.trim()).filter(Boolean)
  return roles.length > 0 ? [...new Set(roles)].sort().join(',') : null
}

/**
 * The namespaces whose kinds stay in the app: the billing provider sends its
 * own receipts, trial and dunning mail. A plan pass is a gift, so its kinds
 * live under `gift.`. A bounce is news about the address mail does not
 * reach, so its kind never emails it.
 */
export const IN_APP_ONLY_AREAS: readonly string[] = ['billing', 'gift', 'referral', 'email']

/** What an event derives beside its row. */
export interface EventDeliveries {
  /** A notification in the app (the notifications layer delivers it). */
  inApp: boolean
  /** An email to the account it is about (the email layer renders it). */
  email: boolean
}

/**
 * What an event derives, by the channel matrix: the channels its kind
 * declares, except that a kind in an {@link IN_APP_ONLY_AREAS} namespace
 * never derives an email, whatever it declares. An app's own kind derives
 * nothing until it declares channels. A kind derives nothing for an event
 * no account is about.
 */
export function deriveDeliveries(type: string, subjectId: string | undefined, kinds: Readonly<Record<string, Pick<BackendEventDefinition, 'channels'>>> = BACKEND_EVENTS): EventDeliveries {
  const channels = Object.hasOwn(kinds, type) ? kinds[type]!.channels : []
  if (!subjectId) return { inApp: false, email: false }
  const area = type.slice(0, type.indexOf('.'))
  return {
    inApp: channels.includes('in-app'),
    email: channels.includes('email') && !IN_APP_ONLY_AREAS.includes(area),
  }
}

/**
 * Who reads a kind's rows. An app's own kind is read like a workspace's
 * when it names one, and so is a billing entity's kind about a workspace.
 */
export function eventReaders(type: string, entityId?: string): EventReader[] {
  const scope = Object.hasOwn(BACKEND_EVENTS, type) ? BACKEND_EVENTS[type as BackendEventType].scope : 'entity'
  const workspace = scope === 'workspace' || (scope === 'entity' && Boolean(entityId))
  return workspace ? ['subject', 'workspace', 'admin'] : ['subject', 'admin']
}

/** An event as `recordBackendEvent` writes it, with every id already resolved. */
export interface EventRow {
  type: string
  actorId?: string
  impersonatorId?: string
  subjectId?: string
  entityId?: string
  targetId?: string
  data?: Record<string, EventDataValue>
}

/** Whether a value has the field type's shape. */
function fits(value: unknown, type: EventFieldType): boolean {
  const base = type.replace('?', '')
  if (base === 'string[]') return Array.isArray(value) && value.length <= EVENT_LIST_MAX && value.every(entry => typeof entry === 'string' && entry.length <= EVENT_VALUE_MAX)
  if (base === 'string') return typeof value === 'string' && value.length <= EVENT_VALUE_MAX
  return typeof value === base
}

/**
 * What is wrong with an event before it is written, as the field it names
 * and why; `null` when it may be written. A type the package does not know
 * must be an app's own (`app.…`); a package kind carries exactly its
 * declared fields, and a workspace kind names its workspace; an app's own
 * carries at most {@link EVENT_DATA_FIELDS_MAX} flat values.
 */
export function eventProblem(event: EventRow): EventProblem | null {
  if (event.type.length > EVENT_VALUE_MAX) return { field: 'type', reason: `at most ${EVENT_VALUE_MAX} characters` }
  return idProblem(event) ?? (isBackendEventType(event.type) ? kindProblem(event, event.type) : appEventProblem(event))
}

/** What an event's `eventProblem` names: the field, and what it must be. */
interface EventProblem {
  field: string
  reason: string
}

/** The ids a row holds, each a non-empty string of bounded length. */
const ID_FIELDS = ['actorId', 'impersonatorId', 'subjectId', 'entityId', 'targetId'] as const

/** An id that is empty or too long. */
function idProblem(event: EventRow): EventProblem | null {
  const field = ID_FIELDS.find(name => event[name] !== undefined && (event[name].length === 0 || event[name].length > EVENT_VALUE_MAX))
  return field ? { field, reason: `1 to ${EVENT_VALUE_MAX} characters` } : null
}

/** An app's own event: a type under `app.`, and at most so many bounded, flat values. */
function appEventProblem(event: EventRow): EventProblem | null {
  if (!APP_TYPE.test(event.type)) return { field: 'type', reason: 'a package kind, or one of the app\'s own under `app.`' }
  const fields = Object.entries(event.data ?? {})
  if (fields.length > EVENT_DATA_FIELDS_MAX) return { field: 'data', reason: `at most ${EVENT_DATA_FIELDS_MAX} fields` }
  const long = fields.find(([, value]) => !fits(value, Array.isArray(value) ? 'string[]' : typeof value as EventFieldType))
  return long ? { field: `data.${long[0]}`, reason: `strings of at most ${EVENT_VALUE_MAX} characters, in lists of at most ${EVENT_LIST_MAX}` } : null
}

/** A package kind's event: its workspace where it belongs to one, and exactly its declared fields. */
function kindProblem(event: EventRow, type: BackendEventType): EventProblem | null {
  const kind = BACKEND_EVENTS[type]
  if (kind.scope !== 'entity' && (kind.scope === 'workspace') !== Boolean(event.entityId)) {
    return { field: 'entityId', reason: kind.scope === 'workspace' ? `${type} happens in a workspace` : `${type} belongs to an account, not a workspace` }
  }
  const data = event.data ?? {}
  const declared = kind.data as Readonly<Record<string, EventFieldType>>
  const unknown = Object.keys(data).find(field => !Object.hasOwn(declared, field))
  if (unknown) return { field: `data.${unknown}`, reason: `${type} carries no ${unknown}` }
  const wrong = Object.entries(declared).find(([field, fieldType]) => !(data[field] === undefined && fieldType.endsWith('?')) && !fits(data[field], fieldType))
  return wrong ? { field: `data.${wrong[0]}`, reason: `a ${wrong[1].replace('?', '')}` } : null
}
