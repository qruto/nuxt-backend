// The account-data registry: every place the package keeps something of a
// person, what it holds, how long it stays, what an export includes and
// what an erasure does with it. Runtime-neutral (no Vue, no Convex
// runtime), so the component that erases, the app that exports, the
// erasure sweep test that proves nothing remains and the Privacy and data
// inventory page that lists it all read one table.
// test/convex-component/account.test.ts holds every table of the component
// to it: a table is a participant here, or named in NO_PERSONAL_DATA with
// why.

/** How an erasure treats a participant's rows. */
export type ErasureAction
  /** Removed. */
  = | 'deleted'
  /** Kept as someone else's record, the account's id replaced by one random pseudonym, its address and name dropped. */
    | 'pseudonymized'
  /** Deleted at the provider, which keeps an anonymized record for its own books. */
    | 'anonymized'
  /** Not erased one by one: every row goes within a short retention window anyway. */
    | 'expires'
  /** Not erased yet: what holds it offers no way to, which its note says, with what stays. */
    | 'kept'

/** What a participant's rows are found by. */
export type ErasureKey = 'account' | 'email' | 'entity'

/** One participant of export and erasure: a store of personal data the package keeps. */
export interface AccountDataRecord {
  /** The app capability it belongs to (one of `nuxt-backend status`): the data map lists it while the app uses that capability. */
  capability: 'auth' | 'data' | 'jobs' | 'billing' | 'email' | 'notifications' | 'ai' | 'protection' | 'monitoring' | 'flags' | 'analytics' | 'hosting'
  /** Where it lives: the backend component's own tables, a component the app mounts, or a provider's records. */
  where: 'component' | 'app' | 'provider'
  /** The component tables it covers, or the provider record it names. */
  tables: readonly string[]
  /** What it holds of a person, in a sentence. */
  holds: string
  /** What its rows are found by: the account's id, the address, the billing entity. */
  keyedBy: readonly ErasureKey[]
  /** What an erasure does with them. */
  erasure: ErasureAction
  /** How an erasure treats them, and why, in a sentence. */
  erasureNote: string
  /** How long they are kept otherwise. */
  retention: string
  /** Whether an export includes them. */
  exported: boolean
}

/**
 * The package's participants, by key, in the order an erasure runs them.
 * An app's own tables join through `setupAccount({ sources })`.
 */
export const ACCOUNT_DATA_SOURCES = {
  workspaces: {
    capability: 'auth',
    where: 'component',
    tables: ['organization', 'member', 'invitation'],
    holds: 'The workspaces an account belongs to, with its role in each, and the invitations it sent or was sent.',
    keyedBy: ['account', 'email'],
    erasure: 'deleted',
    erasureNote: 'Its memberships are removed, and so are its personal workspace and every workspace it was the only member of, with their members, invitations, activity and billing cache. Deleting the only owner of a workspace others belong to is refused until ownership moves.',
    retention: 'As long as the account; an unanswered invitation 30 days past its expiry.',
    exported: true,
  },
  auth: {
    capability: 'auth',
    where: 'component',
    tables: ['user', 'session', 'account', 'passkey', 'verification'],
    holds: 'The account: name, address, language, app role and ban, and whether it finished the first run and dismissed the activation checklist; its sessions with their browser and network address; its passkeys; the sign-in and email-change codes waiting for its address, stored as keyed hashes.',
    keyedBy: ['account', 'email'],
    erasure: 'deleted',
    erasureNote: 'The account and everything of its sign-in are removed, codes waiting for its address included.',
    retention: 'As long as the account; a session a day past its expiry, a code an hour past its expiry.',
    exported: true,
  },
  knownDevices: {
    capability: 'auth',
    where: 'component',
    tables: ['knownDevices'],
    holds: 'The devices the account signed in from, for new-device alerts: a keyed hash of each device\'s browser, system and network range (never the fingerprint itself), the browser and system names, when it was first and last seen, and whether its first sign-in was alerted.',
    keyedBy: ['account'],
    erasure: 'deleted',
    erasureNote: 'Every device of the account is removed.',
    retention: 'A year after the device was last seen.',
    exported: false,
  },
  access: {
    capability: 'auth',
    where: 'component',
    tables: ['accessAdmissions', 'accessRedemptions', 'accessInvites', 'waitlistEntries', 'waitlistJoins'],
    holds: 'The invitations by address an administrator made for the address, which ticket admitted the account while the app was closed (the redemption ledger), the codes and links it made as an administrator, and its waitlist entry: the address, its answers, its place and the state of its launch-news contact (the launch-news consent itself is on the consent ledger).',
    keyedBy: ['account', 'email'],
    erasure: 'deleted',
    erasureNote: 'The invitations by address waiting for it, the record of the ticket that admitted the account, and its waitlist entry (with a join it began and what it gave a friend) are removed; a code or link it made as an administrator stays, without its maker. Its launch-news contact goes with the email part of the erasure.',
    retention: 'An invitation by address until it is used or revoked; the ticket record as long as the account; a waitlist entry until the person leaves or is erased, and a join whose code never checked a day.',
    exported: true,
  },
  consents: {
    capability: 'auth',
    where: 'component',
    tables: ['consents'],
    holds: 'The consent ledger: one row for each time the account (or, before it signed up, a hash of its address) agreed to a document or an opt-in, withdrew it, or chose optional storage, with the kind, its version, the time and where it came from.',
    keyedBy: ['account', 'email'],
    erasure: 'deleted',
    erasureNote: 'Every row of the account is removed, and so is every row kept by a hash of its address. An erasure by address removes the rows of that address alone.',
    retention: 'As long as the account; the rows of an address that never signed up until it is erased.',
    exported: true,
  },
  referrals: {
    capability: 'billing',
    where: 'component',
    tables: ['referralCodes', 'referrals', 'referralCounters', 'referralTallies'],
    holds: 'The account\'s share code, the referral that brought it (when it claimed one), and the referrals it brought, as states and times: claimed, held, rewarded or voided. Never who the other person is, an order or an amount. The counters hold totals per referrer and month, and the program\'s by state; the tallies how many referrals and rewards each referrer has.',
    keyedBy: ['account'],
    erasure: 'deleted',
    erasureNote: 'The account\'s codes, the referrals it brought, its own counter and its tally are removed, and the program\'s totals lose them. The referral that brought it stays its referrer\'s, without the account, its order or its billing entity: only a digest of its mailbox is left, so the address can\'t be referred again, and it is voided when it was not rewarded yet. A slot under the caps is given back only for a reward not granted. A waitlist entry\'s code goes with the entry. The rewards themselves are catalog products at the billing provider, kept under the billing participant.',
    retention: 'As long as the account.',
    exported: true,
  },
  billing: {
    capability: 'billing',
    where: 'component',
    tables: ['billingEntitlements', 'billingSubscriptionChanges', 'billingDiscountAttempts', 'billingQuotaKeys', 'billingTrials', 'billingDeletions', 'billingSaveOffers'],
    holds: 'The cached plans, features and credit balances of the account\'s billing entities, their scheduled plan changes and quota keys, the save offers the cancel flow made them, and the trial the account used.',
    keyedBy: ['account', 'entity'],
    erasure: 'deleted',
    erasureNote: 'The cache of every billing entity deleted with the account is removed, and so is the record of its trial. Each entity is marked as deleting first, so no free plan starts for it again.',
    retention: 'As long as the entity; a deletion mark 30 days.',
    exported: true,
  },
  billingProofs: {
    capability: 'billing',
    where: 'component',
    tables: ['billingRenewalConsents', 'billingWithdrawals'],
    holds: 'Proof of the consent to a renewing subscription (the plan, the price and interval shown, the terms version, when and by whom) and of each EU withdrawal: when and by whom.',
    keyedBy: ['account', 'entity'],
    erasure: 'pseudonymized',
    erasureNote: 'California\'s automatic renewal law asks a seller to keep the consent proof three years, and a withdrawal is a record of the contract: both stay, the account\'s id and the billing entities deleted with it replaced by the pseudonym.',
    retention: 'Three years; a checkout\'s proof that started no subscription two days.',
    exported: false,
  },
  gifts: {
    capability: 'billing',
    where: 'component',
    tables: ['billingGifts'],
    holds: 'The gifts the account bought, with the address it sent each to and its message, and the gifts sent to its address.',
    keyedBy: ['account', 'email'],
    erasure: 'pseudonymized',
    erasureNote: 'A gift is a record of a payment, so it stays: the purchaser\'s or the recipient\'s id and address become a pseudonym, and the purchaser\'s name and the message go.',
    retention: 'As long as the purchase is on the books.',
    exported: true,
  },
  billingCustomer: {
    capability: 'billing',
    where: 'provider',
    tables: ['billing provider customer'],
    holds: 'The provider customer of each billing entity: its name, the owner\'s address, its members, payment method, orders and invoices.',
    keyedBy: ['entity', 'account'],
    erasure: 'anonymized',
    erasureNote: 'The customer of each entity deleted with the account is deleted and anonymized at the provider, which keeps its orders for its books; in a workspace the account leaves, only its member is removed.',
    retention: 'The provider\'s own, for its tax and accounting duties.',
    exported: true,
  },
  billingSync: {
    capability: 'billing',
    where: 'app',
    tables: ['customers', 'subscriptions'],
    holds: 'The provider\'s customers and subscriptions as the billing component the app mounts syncs them: each billing entity\'s id beside its provider customer\'s, and each subscription\'s plan, price, dates and status, with the reason and comment of a cancellation.',
    keyedBy: ['entity'],
    erasure: 'kept',
    erasureNote: 'Not erased yet: that component has no way to delete a customer or its subscriptions, which the package asked for upstream. What stays names the billing entity\'s id and its deleted provider customer\'s, never an address or a name; a cancellation keeps the reason and comment the customer gave.',
    retention: 'Until that component can delete them.',
    exported: true,
  },
  rateLimits: {
    capability: 'auth',
    where: 'component',
    tables: ['rateLimit'],
    holds: 'Better Auth\'s own limiter, off unless an app turns it on: a counter per route and network address.',
    keyedBy: [],
    erasure: 'expires',
    erasureNote: 'Not erased one by one: it names an address on the network, never an account, and a day without requests deletes it.',
    retention: 'A day after its last request.',
    exported: false,
  },
  aiRequests: {
    capability: 'ai',
    where: 'component',
    tables: ['aiRequests'],
    holds: 'The arguments of a metered AI stream the account started, while it runs.',
    keyedBy: ['account'],
    erasure: 'deleted',
    erasureNote: 'Every request of the account is removed.',
    retention: 'A day after it settles; a week if it never does.',
    exported: false,
  },
  jobs: {
    capability: 'ai',
    where: 'component',
    tables: ['jobs', 'jobBudgets', 'guestTries'],
    holds: 'The generation jobs an account or its workspace queued (the job\'s arguments, who started it, its progress, result and cost), the budget each owner used per window, and how many guest tries the browser the account signed up in used, by its visitor cookie\'s id.',
    keyedBy: ['account', 'entity'],
    erasure: 'deleted',
    erasureNote: 'Every job and budget window of a workspace deleted with the account is removed; a job it started for a workspace that stays keeps its place, its starter the pseudonym. The guest tries of the browser it signed up in are removed.',
    retention: 'Thirty days after a job ends, dead letters included; a budget window until its owner is erased; a browser\'s guest tries a year after its last, as long as the visitor cookie lasts.',
    exported: false,
  },
  aiCosts: {
    capability: 'ai',
    where: 'component',
    tables: ['aiCosts'],
    holds: 'What each person\'s AI calls cost a day: the job queue\'s, metered actions, streams, chat replies and knowledge embeddings, in US dollars and tokens, with the billing entity that paid.',
    keyedBy: ['account', 'entity'],
    erasure: 'pseudonymized',
    erasureNote: 'The day\'s costs of the account, and of the workspaces deleted with it, stay in the totals under the pseudonym, and so does the entity that paid when it goes too.',
    retention: '90 days after the day.',
    exported: false,
  },
  aiThreads: {
    capability: 'ai',
    where: 'component',
    tables: ['aiThreads'],
    holds: 'The chat threads an account started (`ai.chat`): which chat and workspace each belongs to, its title and when it last changed. The messages live in the app\'s Agent component.',
    keyedBy: ['account', 'entity'],
    erasure: 'deleted',
    erasureNote: 'Every thread of the account, and every thread kept in a workspace deleted with it, goes with its messages.',
    retention: 'Until the person deletes the thread, or the account or the workspace goes.',
    exported: true,
  },
  aiDocuments: {
    capability: 'ai',
    where: 'component',
    tables: ['aiDocuments'],
    holds: 'The knowledge documents an account added (`ai.knowledge`): their title, workspace and status. The passages and embeddings live in the app\'s RAG component.',
    keyedBy: ['account', 'entity'],
    erasure: 'pseudonymized',
    erasureNote: 'Every document of a workspace deleted with the account goes with its passages, and the workspace\'s namespace in the RAG component goes once they are gone; a document it added to a workspace that stays keeps its place, its adder the pseudonym.',
    retention: 'Until a member removes it, or its workspace goes.',
    exported: true,
  },
  aiProvenance: {
    capability: 'ai',
    where: 'component',
    tables: ['aiProvenance'],
    holds: 'What made each generated image a workspace\'s jobs stored (`ctx.storeImage`): the models, when, and the ids of the rows and files it was made from, never their content.',
    keyedBy: ['entity'],
    erasure: 'deleted',
    erasureNote: 'Every record of a workspace deleted with the account is removed; the images themselves are the workspace\'s files (`files`), deleted with it.',
    retention: 'Until its workspace goes: the record is what shows an image was generated, for as long as the image is shown.',
    exported: false,
  },
  audit: {
    capability: 'auth',
    where: 'component',
    tables: ['auditEvents'],
    holds: 'The account\'s activity: sign-ins, passkeys, email and session changes, workspace and billing events, as ids, never an address or a name.',
    keyedBy: ['account'],
    erasure: 'pseudonymized',
    erasureNote: 'The account\'s own record is removed, its personal workspace\'s with it; in the rows that stay (a workspace\'s trail, what it did to someone else, what an administrator did) its id becomes one random pseudonym.',
    retention: '365 days.',
    exported: true,
  },
  notifications: {
    capability: 'notifications',
    where: 'component',
    tables: ['notifications', 'notificationChoices'],
    holds: 'What the app told the account in its inbox: the kind of event, when, whether it was read and the workspace and thing it names, as ids, never the words, an address or a name; and the channels the account turned on or off for each kind.',
    keyedBy: ['account'],
    erasure: 'deleted',
    erasureNote: 'Every notification for the account and every channel it chose are removed; in the notifications it caused for others, its id becomes one random pseudonym.',
    retention: 'A read notification 90 days after it was read, an unread one 365 days after it was recorded; a channel choice until the account changes it.',
    exported: true,
  },
  pushSubscriptions: {
    capability: 'notifications',
    where: 'component',
    tables: ['pushSubscriptions'],
    holds: 'Each device the account allowed web push on: the push service\'s address for it and the keys messages to it are encrypted with.',
    keyedBy: ['account'],
    erasure: 'deleted',
    erasureNote: 'Every device of the account is removed, so nothing more reaches it.',
    retention: 'Until the push service says the device is gone, the account subscribes a newer one past twenty, or the device is subscribed by another account.',
    exported: true,
  },
  announcements: {
    capability: 'email',
    where: 'component',
    tables: ['announcementDismissals', 'announcements'],
    holds: 'Which announcements the account dismissed, and, for an administrator, the announcements they published or sent, by account id.',
    keyedBy: ['account'],
    erasure: 'pseudonymized',
    erasureNote: 'The account\'s dismissals are removed; on an announcement it published or sent, its id becomes one random pseudonym.',
    retention: 'An announcement and its dismissals 90 days after it expired.',
    exported: false,
  },
  lifecycle: {
    capability: 'email',
    where: 'component',
    tables: ['lifecycleRuns'],
    holds: 'Each lifecycle email flow the account is in: which email, when it is due, its address, and whether it was sent, skipped by a sending rule or stopped.',
    keyedBy: ['account'],
    erasure: 'deleted',
    erasureNote: 'Every run is removed, the emails still waiting with them.',
    retention: 'A finished run of a flow that may run again 90 days after it was due; the record of a flow sent once until the account is erased.',
    exported: false,
  },
  inbound: {
    capability: 'email',
    where: 'component',
    tables: ['contactMessages', 'inboundMessages', 'replyAddresses'],
    holds: 'The messages the account sent through the contact form, and the mail it (or its address) sent to the app: the sender\'s name and address, the subject, the text, the names and sizes of the attachments; and the reply addresses made for it, each a random token with the thread it answers.',
    keyedBy: ['account', 'email'],
    erasure: 'deleted',
    erasureNote: 'Every message of the account and every message from its address is removed, and so are its reply addresses. The copy a message left in the team\'s own mailbox or support inbox is the team\'s: delete it there.',
    retention: 'A message 90 days; a reply address a year after the last email it went out in.',
    exported: true,
  },
  reports: {
    capability: 'auth',
    where: 'component',
    tables: ['reports', 'reportSubjects', 'reportDecisions', 'reportAppeals', 'blockedFiles'],
    holds: 'The content the account reported in a click, and the notices sent from its address on the public form, with the notifier\'s name, address, language and typed signature. The decisions on content it wrote, with the text of its appeal. For an administrator, the decisions it made, the appeals it answered and the suspected crimes it flagged, by account id. The hashes of removed intimate images, which name no one.',
    keyedBy: ['account', 'email'],
    erasure: 'pseudonymized',
    erasureNote: 'A host answers for every notice and decision, so the records stay and lose the person. A notice from the address loses its sender\'s name, address, language and signature; its reason, link and text stay, for the decision that rests on them. A report the account made loses its text, and the account\'s id becomes the pseudonym. A decision on its content keeps its statement of reasons and its appeal\'s outcome; its author becomes the pseudonym, and the appeal loses its text. As an administrator, its id becomes the pseudonym on what it decided, answered and flagged. A removed image\'s hash stays: it names no one, and it keeps the same image from coming back.',
    retention: 'A closed report or notice 548 days (18 months) after it was closed; a decision 548 days after it was made, with its appeal, once no appeal is open; a removed image\'s hash as long as the app keeps it.',
    exported: true,
  },
  flags: {
    capability: 'flags',
    where: 'component',
    tables: ['flagOverrides'],
    holds: 'The flags an administrator turned on for the account by its id.',
    keyedBy: ['account'],
    erasure: 'deleted',
    erasureNote: 'The account leaves every flag\'s targets.',
    retention: 'Until an administrator changes the flag.',
    exported: false,
  },
  funnel: {
    capability: 'analytics',
    where: 'component',
    tables: ['funnelPeople', 'experimentExposures'],
    holds: 'How the growth funnel counts the account: its sign-up week, the invite, first campaign, referral code and promotion it came with, its answer to "How did you hear about us?" (with an "Other" answer\'s own words), the steps it reached and its last active week; and the experiments\' variants it saw first.',
    keyedBy: ['account'],
    erasure: 'deleted',
    erasureNote: 'Its row and its own exposures are removed, and it leaves its workspace\'s. Every count stays: the counts are keyed by step, value and week, never by the account, so the funnel and the experiments\' results do not change.',
    retention: 'Until the account is erased.',
    exported: true,
  },
  email: {
    capability: 'email',
    where: 'component',
    tables: ['secretOutbox', 'heldEmails'],
    holds: 'A code email waiting for the provider, and an email the person\'s quiet hours hold until they end.',
    keyedBy: ['email'],
    erasure: 'deleted',
    erasureNote: 'Every message held for the address is removed.',
    retention: 'A code email until the provider answers, at most ten minutes; a held email until the quiet hours end.',
    exported: false,
  },
  emailRecords: {
    capability: 'email',
    where: 'component',
    tables: ['emails'],
    holds: 'The emails sent to the address: recipients, subject, body and delivery status.',
    keyedBy: ['email'],
    erasure: 'expires',
    erasureNote: 'Not erased one by one: the email component nested in the backend keeps its records with no index by recipient, and every one goes with its retention.',
    retention: '7 days after a final status, 30 days without one (`setupEmail({ retention })`).',
    exported: false,
  },
  emailPreferences: {
    capability: 'email',
    where: 'component',
    tables: ['emailContacts', 'emailTopicChoices', 'emailContactAliases'],
    holds: 'The address\'s choice for each email topic and how it was made, its time zone, when it last clicked an email or used the app, and when marketing mail went to it in the last 7 days.',
    keyedBy: ['account', 'email'],
    erasure: 'deleted',
    erasureNote: 'The contact and every choice of it are removed; the consents it gave stay on the consent ledger until the ledger\'s own erasure.',
    retention: 'Until the account is erased.',
    exported: true,
  },
  emailContact: {
    capability: 'email',
    where: 'provider',
    tables: ['email provider contact'],
    holds: 'The address as a contact of the email provider, with the segments and topics it is in.',
    keyedBy: ['email'],
    erasure: 'deleted',
    erasureNote: 'The contact is removed at the provider.',
    retention: 'Until it is removed.',
    exported: false,
  },
  suppressions: {
    capability: 'email',
    where: 'component',
    tables: ['suppressions'],
    holds: 'The address, when the email provider stopped delivering to it after a hard bounce, a complaint or by hand: a copy of the provider\'s suppression list that sign-in reads before it sends a code.',
    keyedBy: ['email'],
    erasure: 'deleted',
    erasureNote: 'The address\'s row is removed. The provider keeps its own suppression, which is what keeps mail from going to it.',
    retention: 'While the provider suppresses the address; a week after it lifts the suppression.',
    exported: false,
  },
  files: {
    capability: 'data',
    where: 'component',
    tables: ['files', 'fileUsage', 'shareLinks'],
    holds: 'The files an account uploaded through setupStorage and the images its jobs generated (`ctx.storeImage`), with their owner records (account, workspace, size, type) and quota counts, and the share links it turned on (the shared row, never the token).',
    keyedBy: ['account', 'entity'],
    erasure: 'deleted',
    erasureNote: 'Its own files and every file of a workspace deleted with it are removed with their counts, and so are the links it shared; a file it uploaded to a workspace others keep stays with that workspace, its uploader the pseudonym.',
    retention: 'Until released by the app or erased; an upload nobody claimed a day.',
    exported: true,
  },
  exports: {
    capability: 'auth',
    where: 'component',
    tables: ['accountExports', 'accountExportParts'],
    holds: 'The account\'s data exports, each a file behind a link, and the zip parts that bundle its files beside it.',
    keyedBy: ['account'],
    erasure: 'deleted',
    erasureNote: 'Every export file, its zip parts and its record are removed.',
    retention: 'The file an hour; its record a day, which the export limit counts.',
    exported: false,
  },
  deletions: {
    capability: 'auth',
    where: 'component',
    tables: ['accountDeletions'],
    holds: 'A deletion waiting out its grace period: the account\'s id, when it was asked for and when it runs, and a keyed hash of the token in the "keep my account" link.',
    keyedBy: ['account'],
    erasure: 'deleted',
    erasureNote: 'The record goes with the account, whether the grace period ended or an administrator removed it first.',
    retention: 'Until the deletion is cancelled or runs.',
    exported: true,
  },
  erasures: {
    capability: 'auth',
    where: 'component',
    tables: ['accountErasures', 'accountErasureFailures'],
    holds: 'An erasure in progress: the account\'s id and address, and the workspaces it deletes; and the plan of the app\'s part (the billing customer, the email contact) while a participant of it is retried.',
    keyedBy: ['account', 'email'],
    erasure: 'deleted',
    erasureNote: 'Removed once every participant finished; one that kept failing stays for an operator to run again, at most 30 days.',
    retention: 'Until the erasure finishes; a failed one 30 days.',
    exported: false,
  },
  monitoringUser: {
    capability: 'monitoring',
    where: 'provider',
    tables: ['monitoring service user'],
    holds: 'Error reports and cron check-ins with ids, never an address or a name. The package sets no user on a report.',
    keyedBy: ['account'],
    erasure: 'kept',
    erasureNote: 'Errors stop naming the account: nothing the package sends names it once it is deleted. Reports already sent keep their scrubbed contents until the service\'s retention removes them, because the service has no confirmed way to delete one user\'s events.',
    retention: 'The service\'s own retention.',
    exported: false,
  },
} as const satisfies Record<string, AccountDataRecord>

/** A participant of the package's own, by key. */
export type AccountDataSourceKey = keyof typeof ACCOUNT_DATA_SOURCES

/**
 * The component tables that hold nothing of a person, each with why: the
 * rest are participants above. A table added to the component lands in
 * one or the other, or test/unit/account-data.test.ts fails.
 */
export const NO_PERSONAL_DATA: Readonly<Record<string, string>> = {
  jwks: 'The keys the session tokens are signed with.',
  billingBenefitMetadata: 'A benefit\'s metadata and name, the same for every customer.',
  webhookDeliveries: 'Delivery ids, event types and outcomes: the payload is never kept.',
  webhookTallies: 'Counts of refused deliveries, by service and outcome.',
  webhookTrims: 'When the delivery log is next trimmed.',
  emailSettings: 'The app\'s email retention windows.',
  emailProviderIds: 'The email provider\'s ids of the topics and the accounts\' segment.',
  lifecycleSettings: 'The lifecycle flows\' settings and the sending rules, as `email sync` kept them.',
  maintenanceTasks: 'Each maintenance task\'s latest pass.',
  accessSettings: 'The launch phase an administrator set.',
  accessEmailPace: 'When the next invitation email may go: one time, for every invitation alike.',
  waitlistStats: 'A count of waitlist entries per status.',
  waitlistSettings: 'The ids of the email provider\'s segment and topic for launch news.',
  jobQueue: 'The job queue\'s settings: paused, the concurrency and the tiers an administrator retuned.',
  jobModels: 'Each model\'s learned rate limit, the same for every account.',
  aiCostDays: 'What AI cost the whole app each day, summed over everyone.',
  monitoringAlerts: 'Which alert fired for which day or month.',
  billingGiftSweep: 'The handle the gift sweep wakes the app by.',
  referralSweep: 'The handle the referral sweep wakes the app by.',
  billingLifecycleMarks: 'What the billing lifecycle did once and when, by subscription or checkout id: an annual reminder, an abandoned checkout\'s hand-off.',
  quotaCounters: 'The quota keys storage counts files and bytes under, the same for every account.',
  funnelValues: 'The values the growth funnel breaks its steps down by: campaign and answer names, invite labels, promotion keys and referral codes. A referral code points at its owner only while the referral program keeps it, which an erasure deletes there.',
  experiments: 'Each experiment\'s variants, goal and guardrails as the code declared them, and when it started.',
  experimentKinds: 'The event kinds each experiment counts.',
}

/** The participants whose rows an erasure finds by the address alone: what it does for someone without an account. */
export function emailKeyedSources(): AccountDataSourceKey[] {
  return (Object.keys(ACCOUNT_DATA_SOURCES) as AccountDataSourceKey[]).filter(key => (ACCOUNT_DATA_SOURCES[key].keyedBy as readonly ErasureKey[]).includes('email'))
}
