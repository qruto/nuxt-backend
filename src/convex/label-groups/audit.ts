import type { LabelTree } from '../label-format.js'

/**
 * `<AuditLog>`: the activity trail. Each event reads as one sentence from
 * `events.<area>.<kind>`, its actor first: `{actor}` is a name or one of
 * `actors`, `{subject}` a name or one of `subjects`, `{workspace}` a
 * workspace's name, `{role}` one of `roles`. What
 * a sentence leaves out (the account it is about, the workspace, the sign-in
 * method, an administrator acting for the account) follows it as
 * a detail. A kind without a sentence (one of the app's own) reads as `other`.
 */
const AUDIT_LABELS = {
  title: 'Recent activity',
  workspaceTitle: 'Workspace activity',
  allTitle: 'All activity',
  empty: 'Nothing recorded yet.',
  loading: 'Loading…',
  newer: 'Newer',
  older: 'Older',
  pageLoading: 'Loading the page…',
  // Who acted, at the start of a sentence.
  actors: {
    you: 'You',
    administrator: 'An administrator',
    app: 'The app',
    erased: 'A deleted account',
    unknown: 'Someone',
  },
  // Who it is about, inside a sentence.
  subjects: {
    you: 'you',
    administrator: 'an administrator',
    app: 'the app',
    erased: 'a deleted account',
    unknown: 'someone',
  },
  unnamedWorkspace: 'a workspace',
  roles: {
    owner: 'owner',
    admin: 'admin',
    member: 'member',
    user: 'user',
  },
  methods: {
    passkey: 'a passkey',
    emailOtp: 'an email code',
  },
  // The details after a sentence.
  forSubject: 'for {subject}',
  inWorkspace: 'in {workspace}',
  withMethod: 'with {method}',
  impersonated: 'by an administrator acting for the account',
  events: {
    auth: {
      signed_in: '{actor} signed in',
      signed_out: '{actor} signed out',
      reauthenticated: '{actor} confirmed it was them',
      passkey_added: '{actor} added a passkey',
      passkey_removed: '{actor} removed a passkey',
      passkey_only_changed: '{actor} changed whether sign-in codes work',
      email_changed: '{actor} changed the email address',
      session_revoked: '{actor} signed a session out',
      new_device: '{actor} signed in from a new device',
    },
    workspace: {
      created: '{actor} created {workspace}',
      member_invited: '{actor} invited someone to {workspace} as {role}',
      invitation_accepted: '{actor} joined {workspace} as {role}',
      member_removed: '{actor} removed {subject} from {workspace}',
      member_role_changed: '{actor} made {subject} {role} of {workspace}',
    },
    admin: {
      impersonation_started: '{actor} began acting as {subject}',
      impersonation_stopped: '{actor} stopped acting as {subject}',
      role_changed: '{actor} made {subject} an app {role}',
      user_banned: '{actor} banned {subject}',
      user_unbanned: '{actor} lifted the ban on {subject}',
    },
    flag: {
      changed: '{actor} changed the {flag} flag',
    },
    experiment: {
      exposed: '{actor} saw the {variant} version of {experiment}',
    },
    announcement: {
      published: '{actor} published an announcement',
      ended: '{actor} ended an announcement',
      sent: '{actor} sent an announcement\'s email',
      cancelled: '{actor} cancelled an announcement\'s email',
    },
    access: {
      phase_changed: '{actor} changed the launch phase',
      ticket_used: '{actor} signed up with a ticket',
      invite_created: '{actor} made an invite code or link',
      invite_revoked: '{actor} revoked an invite',
      admitted: '{actor} invited people by address',
    },
    consent: {
      granted: '{actor} agreed to a consent',
      withdrawn: '{actor} withdrew a consent',
    },
    waitlist: {
      joined: '{actor} joined the waitlist',
      admitted: '{actor} admitted people from the waitlist',
      declined: '{actor} declined waitlist entries',
      left: '{actor} left the waitlist',
    },
    report: {
      decided: '{actor} decided reported content',
      crime_flagged: '{actor} flagged reported content for the authorities',
      appealed: '{actor} appealed a decision on their content',
      appeal_decided: '{actor} decided an appeal',
    },
    job: {
      queue_changed: '{actor} changed the job queue',
      canceled: '{actor} canceled a job',
      retried: '{actor} put a failed job back in line',
    },
    ai: {
      spend_limit_reached: '{actor} paused AI: today\'s spend limit was reached',
    },
    billing: {
      checkout_started: '{actor} opened a checkout',
      plan_changed: '{actor} changed the subscription',
      subscription_created: '{actor} started a subscription',
      subscription_updated: '{actor} updated a subscription',
      subscription_canceled: '{actor} canceled a subscription',
      subscription_revoked: '{actor} ended a subscription',
      order_paid: '{actor} recorded a payment',
      order_refunded: '{actor} recorded a refund',
      refund_issued: '{actor} issued a refund',
      benefit_granted: '{actor} granted a benefit',
      benefit_revoked: '{actor} revoked a benefit',
      credits_low: '{actor} brought the credits to their low mark',
      credits_exhausted: '{actor} used up the credits',
      subscription_past_due: '{actor} recorded a failed renewal payment',
      save_offer_made: '{actor} was offered to stay',
      save_offer_accepted: '{actor} accepted an offer to stay',
      checkout_abandoned: '{actor} left a checkout unpaid',
      contract_withdrawn: '{actor} withdrew from a purchase',
      trial_pass_started: '{actor} started a trial',
    },
    gift: {
      purchased: '{actor} bought a gift',
      claimed: '{actor} claimed a gift',
      refunded: '{actor} recorded a gift refund',
      pass_started: '{actor} started a plan pass',
      pass_ending: '{actor} was told a plan pass ends soon',
      pass_ended: '{actor} recorded the end of a plan pass',
    },
    referral: {
      claimed: '{actor} recorded a sign-up through a referral',
      rewarded: '{actor} granted a referral reward',
    },
    email: {
      bounced: '{actor} could not deliver an email to {subject}',
      suppression_lifted: '{actor} lifted an email suppression',
    },
    webhook: {
      replayed: '{actor} replayed a webhook delivery',
    },
    account: {
      created: '{actor} signed up',
      activated: '{actor} reached their first result',
      data_exported: '{actor} exported the account data',
      deletion_scheduled: '{actor} asked to delete the account',
      deletion_canceled: '{actor} kept the account, cancelling its deletion',
      erasure_failed: '{actor} could not finish erasing a deleted account',
    },
  },
  other: '{actor}: {type}',
} satisfies LabelTree

export default AUDIT_LABELS
