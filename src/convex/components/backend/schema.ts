import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'
import { sendArgs } from '../../email-validators.js'
import { vAnnouncementLink, vBroadcastDraft, vBroadcastState } from '../../announcements.js'
import { vResolvedCaps } from '../../email-preferences.js'
import { vFlowSettings } from '../../lifecycle-flows.js'
import { vEventData } from '../../notifications.js'

// Schema for the default plugins: passkey + emailOTP + admin + organization
// (+ convex plugin which pulls in jwt for Convex tokens + rateLimit).
// Core tables (user/session/account/verification) + passkey + rateLimit + jwks
// (required by jwt plugin used for Convex JWTs) + the admin plugin's role/ban
// fields and the organization plugin's workspace tables.
// No 2FA, no social OAuth, no extra user fields (username/phone/anon/etc)
// beyond lastLoginMethod's, the package's own `locale` and passkey-only's, no
// email/password specific beyond core account.
// Verified against `createSchema` from @convex-dev/better-auth with this plugin set,
// and held to the runtime plugins' fields by test/unit/adapter-plugins.test.ts.
export const tables = {
  user: defineTable({
    name: v.string(),
    email: v.string(),
    emailVerified: v.boolean(),
    image: v.optional(v.union(v.null(), v.string())),
    createdAt: v.number(),
    updatedAt: v.number(),
    // Admin plugin: app-wide role ('user' when unset) and ban state.
    role: v.optional(v.union(v.null(), v.string())),
    banned: v.optional(v.union(v.null(), v.boolean())),
    banReason: v.optional(v.union(v.null(), v.string())),
    banExpires: v.optional(v.union(v.null(), v.number())),
    // lastLoginMethod plugin: how the account last signed in (`passkey`,
    // `email-otp`), written on every sign-in.
    lastLoginMethod: v.optional(v.union(v.null(), v.string())),
    // The language the person reads in (a language tag, `de`, `pt-BR`):
    // set at sign-up and on a language switch; every email they get is
    // written in it (ACCOUNT_FIELDS, client/plugins.ts).
    locale: v.optional(v.union(v.null(), v.string())),
    // Passkey-only accounts (client/passkey-only.ts): whether the account
    // refuses sign-in codes, and the keyed hash of its recovery code.
    passkeyOnly: v.optional(v.union(v.null(), v.boolean())),
    recoveryCodeHash: v.optional(v.union(v.null(), v.string())),
    // The app shell's two marks (onboarding.ts): when the account finished
    // or skipped the first-run steps at /welcome, and when it dismissed the
    // activation checklist. Written only by the component's own functions.
    onboardedAt: v.optional(v.union(v.null(), v.number())),
    activationDismissedAt: v.optional(v.union(v.null(), v.number())),
    // The convex plugin's own field (a legacy link to an app users table).
    // Nothing here writes it, but the plugin declares it, so the schema does:
    // test/unit/adapter-plugins.test.ts holds every table's fields to the
    // runtime plugins'.
    userId: v.optional(v.union(v.null(), v.string())),
  })
    .index('email_name', ['email', 'name'])
    .index('name', ['name']),
  session: defineTable({
    expiresAt: v.number(),
    token: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    ipAddress: v.optional(v.union(v.null(), v.string())),
    userAgent: v.optional(v.union(v.null(), v.string())),
    userId: v.string(),
    // Admin plugin: who is impersonating this session, if anyone.
    impersonatedBy: v.optional(v.union(v.null(), v.string())),
    // Organization plugin: the session's active workspace.
    activeOrganizationId: v.optional(v.union(v.null(), v.string())),
    // Passkey-only: a recovery session, which may only save a passkey.
    passkeyRecovery: v.optional(v.union(v.null(), v.boolean())),
    // How the person signed in to this session (`passkey`, `email-otp`),
    // set once when it opens (SESSION_FIELDS, client/plugins.ts).
    signInMethod: v.optional(v.union(v.null(), v.string())),
  })
    .index('expiresAt', ['expiresAt'])
    .index('expiresAt_userId', ['expiresAt', 'userId'])
    .index('token', ['token'])
    .index('userId', ['userId'])
    // listSessions filters by user then range-checks expiry.
    .index('userId_expiresAt', ['userId', 'expiresAt']),
  account: defineTable({
    accountId: v.string(),
    providerId: v.string(),
    userId: v.string(),
    accessToken: v.optional(v.union(v.null(), v.string())),
    refreshToken: v.optional(v.union(v.null(), v.string())),
    idToken: v.optional(v.union(v.null(), v.string())),
    accessTokenExpiresAt: v.optional(v.union(v.null(), v.number())),
    refreshTokenExpiresAt: v.optional(v.union(v.null(), v.number())),
    scope: v.optional(v.union(v.null(), v.string())),
    password: v.optional(v.union(v.null(), v.string())),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('accountId', ['accountId'])
    .index('accountId_providerId', ['accountId', 'providerId'])
    .index('providerId_userId', ['providerId', 'userId'])
    .index('userId', ['userId']),
  verification: defineTable({
    identifier: v.string(),
    value: v.string(),
    expiresAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('expiresAt', ['expiresAt'])
    .index('identifier', ['identifier']),
  rateLimit: defineTable({
    key: v.string(),
    count: v.number(),
    lastRequest: v.number(),
  })
    .index('key', ['key'])
    // Maintenance: rows idle past their window (maintenance.ts).
    .index('lastRequest', ['lastRequest']),
  // Passkey table (enabled by default in our wrapper via defaultPasskey plugin)
  passkey: defineTable({
    name: v.optional(v.union(v.null(), v.string())),
    publicKey: v.string(),
    userId: v.string(),
    credentialID: v.string(),
    counter: v.number(),
    deviceType: v.string(),
    backedUp: v.boolean(),
    transports: v.optional(v.union(v.null(), v.string())),
    createdAt: v.optional(v.union(v.null(), v.number())),
    aaguid: v.optional(v.union(v.null(), v.string())),
  })
    .index('credentialID', ['credentialID'])
    .index('userId', ['userId']),
  // JWKS table is required by the @convex-dev/better-auth convex plugin (always adds jwt plugin for Convex JWT issuance)
  jwks: defineTable({
    publicKey: v.string(),
    privateKey: v.string(),
    createdAt: v.number(),
    expiresAt: v.optional(v.union(v.null(), v.number())),
  }),
  // Organization plugin: workspaces, memberships, and invitations.
  organization: defineTable({
    name: v.string(),
    slug: v.string(),
    logo: v.optional(v.union(v.null(), v.string())),
    createdAt: v.number(),
    metadata: v.optional(v.union(v.null(), v.string())),
  })
    .index('name', ['name'])
    .index('slug', ['slug']),
  member: defineTable({
    organizationId: v.string(),
    userId: v.string(),
    role: v.string(),
    createdAt: v.number(),
  })
    .index('organizationId', ['organizationId'])
    // Compound index beyond the generated set: serves the frequent
    // "membership of user X in workspace Y" lookup (requireMember).
    .index('organizationId_userId', ['organizationId', 'userId'])
    // A workspace's owners and admins, whatever its size: who its notifications go to.
    .index('organizationId_role', ['organizationId', 'role'])
    .index('userId', ['userId'])
    .index('role', ['role']),
  invitation: defineTable({
    organizationId: v.string(),
    email: v.string(),
    role: v.optional(v.union(v.null(), v.string())),
    status: v.string(),
    expiresAt: v.number(),
    createdAt: v.number(),
    inviterId: v.string(),
  })
    .index('organizationId', ['organizationId'])
    .index('email', ['email'])
    .index('role', ['role'])
    .index('status', ['status'])
    .index('inviterId', ['inviterId'])
    // Maintenance: pending invitations long past their expiry.
    .index('status_expiresAt', ['status', 'expiresAt']),
}

/**
 * Billing entitlement cache — the current user's active plans, granted benefits
 * (feature-gating) and credit-meter balances, synced from Polar by `setupBilling`
 * (see `src/convex/integrations/billing.ts`) and served reactively to
 * `useFeatures()` / `useCredits()`.
 *
 * Kept inside this component so consumers add **nothing** to their own schema —
 * the same "ships out of the box" rationale as the nested Resend email. The
 * validators are shared with the component's billing functions (`billing.ts`) and
 * the app-level cache mutation, so the shape is defined once.
 *
 * Intentionally NOT part of the auth-only `tables` export above, which is the
 * Better Auth adapter's schema — billing data is the component's own.
 */
export const vEntitlementBenefit = v.object({
  id: v.string(),
  benefitId: v.string(),
  type: v.string(),
  // The benefit's live Polar metadata — lets consumers feature-gate by a friendly
  // key (`has('premium')`) instead of a UUID. Optional so pre-metadata rows validate.
  metadata: v.optional(v.record(v.string(), v.union(v.string(), v.number(), v.boolean()))),
  // When the provider granted it (epoch ms), and what the customer state says
  // the grant holds: a license key's masked display key, how many files a
  // download grant carries, a repository grant's `owner/name`. Optional so
  // rows synced before they were read validate.
  grantedAt: v.optional(v.number()),
  licenseKey: v.optional(v.string()),
  files: v.optional(v.number()),
  repository: v.optional(v.string()),
})

export const vEntitlementMeter = v.object({
  meterId: v.string(),
  consumedUnits: v.number(),
  creditedUnits: v.number(),
  balance: v.number(),
  /**
   * The current billing cycle the meter's units belong to, as epoch ms — the
   * granting subscription's period, since a meter has no period of its own in
   * the provider's model (`CustomerStateMeter` carries no dates; the cycle
   * lives on `CustomerStateSubscription.currentPeriodStart/End`, joined by the
   * subscription's meter list). Absent for meters granted only by one-time
   * credit packs, which have no cycle at all.
   */
  cycleStart: v.optional(v.number()),
  cycleEnd: v.optional(v.number()),
  /**
   * Whether unspent credited units carry into the next cycle (the meter-credit
   * benefit's `rollover`). `false` means the remaining balance expires at
   * {@link cycleEnd} — the one fact a "use them or lose them" UI needs.
   */
  rollover: v.optional(v.boolean()),
})

/**
 * An in-flight credit reservation (reserve → run → settle): `debit` records
 * it while atomically decrementing the cached balance, `settle` drops it once
 * the provider event is ingested (releasing the unspent remainder when the
 * final amount came in under the estimate), `release` re-credits on failure.
 * `upsert` subtracts still-active reservations from freshly synced provider
 * state so a webhook refresh can't resurrect balance that is being spent.
 * Entries outlive their usefulness after `PENDING_SPEND_TTL_MS`
 * (crashed flows) and are pruned on every touch — the cache stays a cache,
 * never a ledger.
 */
export const vPendingSpend = v.object({
  meterId: v.string(),
  amount: v.number(),
  externalId: v.string(),
  at: v.number(),
  /**
   * When a long hold lapses, epoch ms: a reservation a queued job keeps
   * while it waits (`reserveCredits({ hold })`). Without it the reservation
   * lapses ten minutes after `at`.
   */
  until: v.optional(v.number()),
  /**
   * The scheduled auto-release that hands this reservation back if its flow
   * never settles (an abandoned stream). Recorded by `attachReleaseJob` so
   * `settle` can hand the id back to the app and cancel the job — the TTL
   * prune above only stops a stale entry from holding provider truth down; it
   * never re-credits, so a reservation nobody settles needs its own release.
   */
  releaseJobId: v.optional(v.string()),
})

/**
 * A gift purchase: one user pays for products (credit packs, plans) that a
 * recipient — identified by email — receives. Created at gift checkout, marked
 * `paid` by the billing webhook, and `claimed` once the entitlement is attached
 * to the recipient's billing entity (automatically when the recipient already
 * has an account, otherwise on their first sign-in).
 */
export const vGift = v.object({
  id: v.string(),
  recipientEmail: v.string(),
  purchaserUserId: v.string(),
  purchaserEmail: v.optional(v.string()),
  purchaserName: v.optional(v.string()),
  productIds: v.array(v.string()),
  message: v.optional(v.string()),
  status: v.string(),
  billingCustomerId: v.optional(v.string()),
  billingOrderId: v.optional(v.string()),
  purchaserEntityId: v.optional(v.string()),
  pack: v.optional(v.string()),
  giftProductId: v.optional(v.string()),
  amount: v.optional(v.number()),
  currency: v.optional(v.string()),
  discountId: v.optional(v.string()),
  claimingEntityId: v.optional(v.string()),
  claimingUserId: v.optional(v.string()),
  claimOrderId: v.optional(v.string()),
  claimedByUserId: v.optional(v.string()),
  claimedEntityId: v.optional(v.string()),
  createdAt: v.number(),
  paidAt: v.optional(v.number()),
  notifiedAt: v.optional(v.number()),
  claimedAt: v.optional(v.number()),
  refundedAt: v.optional(v.number()),
  plan: v.optional(v.string()),
  months: v.optional(v.number()),
  deliverAt: v.optional(v.number()),
  deliveredAt: v.optional(v.number()),
  noticedAt: v.optional(v.number()),
  noticeCount: v.optional(v.number()),
  recipientChanges: v.optional(v.number()),
  remindedAt: v.optional(v.number()),
  passSubscriptionId: v.optional(v.string()),
  passStartedAt: v.optional(v.number()),
  passEndsAt: v.optional(v.number()),
  passReturnScheduledAt: v.optional(v.number()),
  passNoticedAt: v.optional(v.number()),
  passEndedAt: v.optional(v.number()),
  reverseTrial: v.optional(v.boolean()),
})

/** A save offer's terms, as the cancel flow made it (LIFECYCLE). */
export const vSaveOfferTerms = v.object({
  kind: v.union(v.literal('pause'), v.literal('downgrade'), v.literal('discount')),
  months: v.optional(v.number()),
  resumesAt: v.optional(v.number()),
  plan: v.optional(v.string()),
  productId: v.optional(v.string()),
  discount: v.optional(v.string()),
})

export const billingTables = {
  billingEntitlements: defineTable({
    // The billing entity id — the workspace id (billTo: 'workspace', the
    // default) or the auth user id (billTo: 'user'). Opaque string either way.
    userId: v.string(),
    customerId: v.optional(v.string()),
    activeProductIds: v.array(v.string()),
    benefits: v.array(vEntitlementBenefit),
    meters: v.array(vEntitlementMeter),
    // In-flight spend reservations; see vPendingSpend. Optional so existing
    // rows validate.
    pendingSpends: v.optional(v.array(vPendingSpend)),
    updatedAt: v.number(),
  })
    .index('userId', ['userId'])
    .index('customerId', ['customerId']),
  // Live benefit metadata, snapshotted per benefit (not per grant): feature
  // gating joins this at read time, so a `benefit.updated` webhook patches
  // one row here and every `useFeatures()` subscriber updates reactively —
  // no per-sync provider fan-out, no per-row staleness.
  billingBenefitMetadata: defineTable({
    benefitId: v.string(),
    metadata: v.record(v.string(), v.union(v.string(), v.number(), v.boolean())),
    // The benefit's name at the provider (its description), joined onto
    // each granted benefit the same way. Optional so earlier rows validate.
    description: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index('benefitId', ['benefitId']),
  // How many discount codes the provider refused at checkout, per billing
  // entity, in a fixed one-hour window (the codes themselves are not kept):
  // a checkout must not test codes one after another. `refused` also counts
  // a code in flight, reserved before the provider is asked and given back
  // when it accepts. One row per entity, reset when its window ends.
  billingDiscountAttempts: defineTable({
    userId: v.string(),
    refused: v.number(),
    windowStart: v.number(),
  })
    .index('userId', ['userId']),
  // One trial per owner, across every workspace they own and whatever
  // happens to those workspaces later. A row per owner and entity: `used`
  // once a subscription of the entity started a trial, else a hold a
  // checkout took so a second workspace's checkout at the same time starts
  // none.
  billingTrials: defineTable({
    ownerUserId: v.string(),
    entityId: v.string(),
    used: v.boolean(),
    at: v.number(),
  })
    .index('ownerUserId', ['ownerUserId']),
  // What the provider's subscription carries and the synced subscriptions
  // table does not: the plan change scheduled for the next period and when a
  // paused subscription resumes. One row per subscription, written from its
  // `subscription.*` webhooks and from a lifecycle call's response, and kept
  // only when the provider's `modifiedAt` is at least the stored one, so a
  // late delivery never overwrites a newer state.
  billingSubscriptionChanges: defineTable({
    subscriptionId: v.string(),
    // The billing entity the subscription belongs to.
    userId: v.string(),
    // `null` when no plan change is scheduled.
    pendingChange: v.union(v.null(), v.object({ productId: v.string(), appliesAt: v.number() })),
    resumesAt: v.union(v.null(), v.number()),
    // The provider's `modifiedAt` (else `createdAt`) of the state written, epoch ms.
    modifiedAt: v.number(),
  })
    .index('subscriptionId', ['subscriptionId'])
    .index('userId', ['userId']),
  // The plan quotas a billing entity has ever counted, one row per entity
  // and quota key: the counts themselves live in the app's sharded counter,
  // which cannot list them, so forgetting the entity finds every count here,
  // a quota the catalog dropped or a revoked grant named included.
  billingQuotaKeys: defineTable({
    userId: v.string(),
    key: v.string(),
  })
    .index('userId_key', ['userId', 'key']),
  // A billing entity an account's erasure is deleting (`account.forget`):
  // marked before its provider customer is deleted, so a subscription that
  // ends in the meantime starts no free plan for it again. Kept 30 days.
  billingDeletions: defineTable({
    entityId: v.string(),
    at: v.number(),
  })
    .index('entityId', ['entityId'])
    .index('at', ['at']),
  billingGifts: defineTable({
    // Stored lowercased; matched case-insensitively against the claimant's email.
    recipientEmail: v.string(),
    purchaserUserId: v.string(),
    purchaserEmail: v.optional(v.string()),
    purchaserName: v.optional(v.string()),
    // The credit pack the recipient receives: its provider product.
    productIds: v.array(v.string()),
    // Plain text, shown only inside the app once the recipient signs in.
    message: v.optional(v.string()),
    // 'pending' (checkout created) → 'paid' (the purchase order is paid and
    // its claim discount minted) → 'claimed' (the recipient's $0 order is
    // paid), or 'refunded' (the purchase was refunded before the claim).
    status: v.string(),
    // Before 0.2: the provider customer keyed by the recipient's email,
    // which the purchase was billed to. Gifts are billed to the purchaser now.
    billingCustomerId: v.optional(v.string()),
    // The purchase order, paid by the purchaser's own billing entity.
    billingOrderId: v.optional(v.string()),
    purchaserEntityId: v.optional(v.string()),
    // The pack's catalog key, and the private gift product the purchaser bought.
    pack: v.optional(v.string()),
    giftProductId: v.optional(v.string()),
    // What the purchase order charged, in the currency's smallest unit.
    amount: v.optional(v.number()),
    currency: v.optional(v.string()),
    // The single-use 100% discount the recipient claims the pack with.
    discountId: v.optional(v.string()),
    // The claim checkout in flight: who opened it, for which entity. A plan
    // pass's claim holds the gift until `claimingUntil`, while it switches the
    // workspace at the provider.
    claimingEntityId: v.optional(v.string()),
    claimingUserId: v.optional(v.string()),
    claimingUntil: v.optional(v.number()),
    // The purchaser's cancellation in flight, until then: no claim starts meanwhile.
    cancelingUntil: v.optional(v.number()),
    claimOrderId: v.optional(v.string()),
    claimedByUserId: v.optional(v.string()),
    // The entity the credits landed on: workspace id or user id.
    claimedEntityId: v.optional(v.string()),
    createdAt: v.number(),
    paidAt: v.optional(v.number()),
    notifiedAt: v.optional(v.number()),
    claimedAt: v.optional(v.number()),
    refundedAt: v.optional(v.number()),
    // A plan pass (the gift is a plan for `months` months, not a pack): the
    // plan's catalog key and the length the purchaser paid for.
    plan: v.optional(v.string()),
    months: v.optional(v.number()),
    // When the notice goes out: set when the purchase is paid (the moment
    // it is paid, or the date the purchaser chose). The gift is the
    // recipient's to see and claim once `deliveredAt` is stamped; a row
    // with neither is a gift paid before delivery dates, delivered when paid.
    deliverAt: v.optional(v.number()),
    deliveredAt: v.optional(v.number()),
    // The last notice sent (the first, a reminder or a resend), and how many.
    noticedAt: v.optional(v.number()),
    noticeCount: v.optional(v.number()),
    // How many times the purchaser changed the address: each address's notices carry their own idempotency keys.
    recipientChanges: v.optional(v.number()),
    // The one reminder, a week after delivery.
    remindedAt: v.optional(v.number()),
    // A pass once claimed: the free subscription it switched, when it began
    // and ends (the package keeps the end date), the scheduled return to the
    // free plan, the ending notice and the end itself.
    passSubscriptionId: v.optional(v.string()),
    passStartedAt: v.optional(v.number()),
    passEndsAt: v.optional(v.number()),
    // From when the return may be booked: once the pass's last billing cycle began.
    passReturnFrom: v.optional(v.number()),
    passReturnScheduledAt: v.optional(v.number()),
    passNoticedAt: v.optional(v.number()),
    passEndedAt: v.optional(v.number()),
    // A reverse trial (LIFECYCLE): the pass a new workspace started on,
    // with no purchaser (`status` 'trial'). `recipientEmail` holds its
    // owner's address with plus tags and dots taken out, so an address
    // starts one.
    reverseTrial: v.optional(v.boolean()),
    // A referral reward (REF): the pass a referrer on the free plan got for
    // free months, with no purchaser (`status` 'reward'). `rewardId` is the
    // referral it came from; `recipientEmail` is empty.
    rewardId: v.optional(v.string()),
  })
    .index('recipientEmail', ['recipientEmail'])
    .index('recipientEmail_status', ['recipientEmail', 'status'])
    .index('recipientEmail_createdAt', ['recipientEmail', 'createdAt'])
    .index('status', ['status'])
    .index('purchaserUserId_createdAt', ['purchaserUserId', 'createdAt'])
    // The sweep's reads: deliveries due, reminders due, passes to follow.
    .index('status_deliveredAt_deliverAt', ['status', 'deliveredAt', 'deliverAt'])
    .index('status_remindedAt_deliveredAt', ['status', 'remindedAt', 'deliveredAt'])
    .index('passEndedAt_passEndsAt', ['passEndedAt', 'passEndsAt'])
    .index('passEndedAt_passReturnScheduledAt_passReturnFrom', ['passEndedAt', 'passReturnScheduledAt', 'passReturnFrom'])
    .index('passEndedAt_passNoticedAt_reverseTrial_passEndsAt', ['passEndedAt', 'passNoticedAt', 'reverseTrial', 'passEndsAt'])
    .index('claimedEntityId_passEndedAt', ['claimedEntityId', 'passEndedAt'])
    // The pass a workspace holds: a claimed pack has no end date, so it is out of the range.
    .index('claimedEntityId_passEndedAt_passEndsAt', ['claimedEntityId', 'passEndedAt', 'passEndsAt'])
    // A plan pass's claim in flight, by the workspace it goes to.
    .index('claimingEntityId_claimingUntil', ['claimingEntityId', 'claimingUntil'])
    .index('rewardId', ['rewardId']),
  /**
   * Where the gift sweep wakes the app: the handle of the scaffold's
   * `billing:runGiftSweep`, kept with the first gift that is paid. The
   * component sweeps on its own cron, and the app does the work that needs
   * its email and its billing provider.
   */
  billingGiftSweep: defineTable({
    wake: v.string(),
    updatedAt: v.number(),
  }),
  // The cancel flow's save offers (LIFECYCLE): one per cancellation, and
  // one per billing entity in 12 months. The browser names an offer by its
  // id; the server finds what it made here, for that subscription, and
  // takes it once.
  billingSaveOffers: defineTable({
    entityId: v.string(),
    subscriptionId: v.string(),
    reason: v.string(),
    offer: vSaveOfferTerms,
    madeAt: v.number(),
    acceptedAt: v.optional(v.number()),
  })
    .index('entityId_madeAt', ['entityId', 'madeAt'])
    .index('madeAt', ['madeAt']),
  // Proof of a renewing subscription's consent, as California's automatic
  // renewal law asks a seller to keep it: written as the checkout is made
  // (what it showed: the plan, the price and its interval, the terms
  // version, who), confirmed when the subscription it started arrives, and
  // deleted three years after. An unconfirmed row goes after two days.
  billingRenewalConsents: defineTable({
    checkoutId: v.string(),
    entityId: v.string(),
    userId: v.optional(v.string()),
    productId: v.string(),
    amount: v.number(),
    currency: v.string(),
    interval: v.string(),
    intervalCount: v.number(),
    termsVersion: v.optional(v.string()),
    createdAt: v.number(),
    subscriptionId: v.optional(v.string()),
    consentedAt: v.optional(v.number()),
  })
    .index('checkoutId', ['checkoutId'])
    .index('entityId', ['entityId'])
    .index('userId', ['userId'])
    .index('consentedAt_createdAt', ['consentedAt', 'createdAt'])
    .index('subscriptionId_consentedAt', ['subscriptionId', 'consentedAt']),
  // What the billing lifecycle did once and when: the annual renewal
  // reminder of a subscription (`renewal:<id>`), an abandoned checkout's
  // hand-off (`checkout:<id>`). Kept two years.
  billingLifecycleMarks: defineTable({
    key: v.string(),
    at: v.number(),
  })
    .index('key', ['key'])
    .index('at', ['at']),
  // An EU withdrawal through the withdrawal button: the subscription it
  // ended, who pressed it and when (the receipt's date and time). Kept
  // three years, as the consent proof is.
  billingWithdrawals: defineTable({
    entityId: v.string(),
    subscriptionId: v.string(),
    userId: v.string(),
    productId: v.string(),
    at: v.number(),
  })
    .index('subscriptionId', ['subscriptionId'])
    .index('entityId', ['entityId'])
    .index('userId', ['userId'])
    .index('at', ['at']),
}

/**
 * Metered-stream request plumbing for `setupAi().stream` — the HTTP stream
 * endpoint can't carry Convex args, so `start` records the request (args,
 * billing entity, reservation) and the HTTP dispatcher loads it by stream id.
 * Status mirrors the credit reservation: `reserved` → `streaming` (the
 * one dispatch that claimed it runs the model) → `settled` (event
 * ingested) or `released` (failed — nothing charged). Rows are plumbing, not
 * a usage ledger — the provider event is the durable record; they are safe to
 * prune.
 */
export const aiTables = {
  aiRequests: defineTable({
    streamId: v.string(),
    /** Which `ai.stream({ name })` definition drives this request. */
    name: v.string(),
    /** The billing entity (workspace/user) the credits reserve against. */
    entityId: v.string(),
    /** The signed-in caller (for member attribution inside workspaces). */
    userId: v.string(),
    /** JSON-encoded handler args. */
    args: v.string(),
    meterId: v.optional(v.string()),
    cost: v.number(),
    externalId: v.string(),
    status: v.union(v.literal('reserved'), v.literal('streaming'), v.literal('settled'), v.literal('released')),
    createdAt: v.number(),
  })
    .index('streamId', ['streamId'])
    // Maintenance: finished requests past their window.
    .index('status_createdAt', ['status', 'createdAt'])
    // An account's erasure.
    .index('userId', ['userId']),
  /**
   * Who owns each chat thread (`ai.chat`): the thread lives in the app's
   * Agent component, this row says which chat, billing entity (or `app`)
   * and person it belongs to, its title and when it last changed. The two
   * handles reach back into the Agent component: `remove` deletes the
   * thread with its messages (an erasure calls it), `read` lists its
   * messages (an export reads through it).
   */
  aiThreads: defineTable({
    threadId: v.string(),
    chat: v.string(),
    /** The billing entity that pays for its replies, or `app` for a chat the app pays for. */
    owner: v.string(),
    userId: v.string(),
    title: v.string(),
    updatedAt: v.number(),
    remove: v.string(),
    read: v.string(),
  })
    .index('threadId', ['threadId'])
    .index('userId_chat_owner_updatedAt', ['userId', 'chat', 'owner', 'updatedAt'])
    // A workspace's erasure.
    .index('owner', ['owner'])
    // An account's erasure and export.
    .index('userId', ['userId']),
  /**
   * The documents of a knowledge store (`ai.knowledge`): the passages and
   * their embeddings live in the app's RAG component, this row holds the
   * document's owner, who added it, its title and status. `remove`
   * deletes its entry there; `read` lists its passages for an export;
   * `namespaces` and `removeNamespace` find its owner's namespace there
   * and delete it, passages and all, when the owner goes.
   */
  aiDocuments: defineTable({
    /** The knowledge store: its embedding model and dimension. */
    store: v.string(),
    /** The namespace: the billing entity whose members find it, or `app`. */
    owner: v.string(),
    /** The member who added it; empty for the app's own. */
    addedBy: v.string(),
    title: v.string(),
    key: v.optional(v.string()),
    status: v.union(v.literal('pending'), v.literal('ready'), v.literal('failed')),
    entryId: v.optional(v.string()),
    characters: v.number(),
    createdAt: v.number(),
    remove: v.string(),
    read: v.string(),
    namespaces: v.optional(v.string()),
    removeNamespace: v.optional(v.string()),
  })
    .index('store_owner_createdAt', ['store', 'owner', 'createdAt'])
    .index('store_owner_key', ['store', 'owner', 'key'])
    .index('owner', ['owner'])
    .index('addedBy', ['addedBy']),
  /**
   * What made each generated file `ctx.storeImage` stored (`setupAi({
   * provenance })`): the models, when, and the ids of the app's own rows
   * and files it was made from — never their content. The file itself
   * lives in the app's storage, its content credentials written in.
   */
  aiProvenance: defineTable({
    storageId: v.string(),
    /** The job whose step stored it, when a step did. */
    jobId: v.optional(v.string()),
    /** The billing entity it was made for (a job's owner), or `app`. */
    owner: v.string(),
    models: v.array(v.string()),
    inputs: v.array(v.string()),
    sourceType: v.union(v.literal('trainedAlgorithmicMedia'), v.literal('compositeWithTrainedAlgorithmicMedia')),
    /** The label of the signed manifest written into the file; unset when none was. */
    manifest: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index('storageId', ['storageId'])
    .index('jobId', ['jobId'])
    // A workspace's erasure.
    .index('owner', ['owner']),
  /**
   * What AI cost, per person per UTC day: the job queue's steps, metered
   * actions, streams, chat replies and knowledge embeddings, each added as
   * its model calls end (a failed run's calls included, since they were
   * paid for), and the runs that ended that day. The admin console's Costs
   * tab lists the costliest people from it. `who` is the member who made
   * the calls, `guest:0` to `guest:7` for visitors' jobs, else the billing
   * entity that paid.
   */
  aiCosts: defineTable({
    /** The UTC day, as its first millisecond. */
    day: v.number(),
    who: v.string(),
    /** The billing entity the latest of these runs was paid by, or `app`. */
    owner: v.string(),
    /** US dollars, as the gateway reported them; calls through a key of your own report none. */
    usd: v.number(),
    input: v.number(),
    output: v.number(),
    cached: v.number(),
    /** Runs that ended that day: a job (done, failed or canceled), or one metered call, stream, reply or embedding. */
    runs: v.number(),
  })
    .index('by_day_and_who', ['day', 'who'])
    .index('by_who', ['who']),
  /**
   * The same costs summed for the whole app per UTC day, in a few rows a day
   * (`shard`, picked by who spent), so calls made at once rarely write the
   * same one. Written in the same mutation as the person's row: the Costs
   * tab's totals and the AI spend alert read these, never the people's rows.
   */
  aiCostDays: defineTable({
    day: v.number(),
    shard: v.number(),
    usd: v.number(),
    input: v.number(),
    output: v.number(),
    cached: v.number(),
    runs: v.number(),
  })
    .index('by_day_and_shard', ['day', 'shard']),
}

/**
 * The webhook delivery log (see `webhooks.ts`) — powers redelivery dedupe and
 * the DevTools Webhooks page, never a source of truth. A delivery whose
 * signature verified gets a row in the `webhookDeliveries` ring; a request
 * answered before any signature verified is counted in `webhookTallies`, one
 * row per service and outcome; `webhookTrims` holds the ring's next trim.
 */
export const webhookTables = {
  webhookDeliveries: defineTable({
    service: v.string(),
    /** The provider delivery id (webhook-id / svix-id header), truncated. */
    deliveryId: v.string(),
    type: v.optional(v.string()),
    // The tallied outcomes stay in the union for rows written before they
    // were tallied; the trim ages them out with the rest.
    outcome: v.union(
      v.literal('ok'),
      v.literal('invalid_signature'),
      v.literal('unknown_type'),
      v.literal('handler_error'),
      v.literal('duplicate'),
      v.literal('oversized'),
      v.literal('missing_secret'),
    ),
    note: v.optional(v.string()),
    receivedAt: v.number(),
    /** When an administrator last asked the provider to send this delivery again (`replayWebhookDelivery`). */
    replayedAt: v.optional(v.number()),
  })
    .index('receivedAt', ['receivedAt'])
    .index('service_deliveryId', ['service', 'deliveryId'])
    // Dedupe's lookup: the delivery's `ok` row, whatever else it holds.
    .index('service_deliveryId_outcome', ['service', 'deliveryId', 'outcome']),
  webhookTallies: defineTable({
    service: v.string(),
    outcome: v.union(
      v.literal('invalid_signature'),
      v.literal('duplicate'),
      v.literal('oversized'),
      v.literal('missing_secret'),
    ),
    /** The latest such request's delivery id header, truncated. */
    deliveryId: v.string(),
    type: v.optional(v.string()),
    note: v.optional(v.string()),
    /** Requests counted since the tally last went a day without one. */
    count: v.number(),
    /** When the latest one arrived. */
    receivedAt: v.number(),
  })
    .index('service_outcome', ['service', 'outcome'])
    .index('receivedAt', ['receivedAt']),
  webhookTrims: defineTable({
    /** When the scheduled trim runs; the first delivery after it schedules the next. */
    dueAt: v.number(),
  }),
}

/**
 * Email plumbing (see `email.ts`). The dev inbox keeps no table: it reads
 * the mail a test address received from the email provider's own log.
 */
export const emailTables = {
  /**
   * A secret email on its way out (`sendSecret` in `email.ts`): the message
   * waits here only until the provider answers, then the row is deleted, so
   * a code or a deletion link is never kept with the email records.
   */
  secretOutbox: defineTable({
    /** The message, as `send` takes it. */
    message: v.object(sendArgs),
    /** Delivery attempts so far. */
    attempts: v.number(),
    /** When the next attempt is due; the watchdog re-runs one long overdue. */
    nextAttemptAt: v.number(),
    /** The delivery chain that owns the row; a run of an older one stops. */
    generation: v.number(),
    /** When the secret stops working, at most SECRET_OUTBOX_TTL_MS after the send: nothing is sent after it. */
    expiresAt: v.number(),
    /** The caller's idempotency key, deduplicating a send while one waits. */
    idempotencyKey: v.optional(v.string()),
    /** The one address it goes to, lowercased, so an erasure finds it by its index. Unset for several, and on a row from before 0.2. */
    recipient: v.optional(v.string()),
  })
    .index('idempotencyKey', ['idempotencyKey'])
    .index('recipient', ['recipient']),
  /**
   * A send the person's quiet hours hold (`send` with `deliverAt`), until
   * their end: `sendHeld` runs by the row's id and deletes it, and an
   * erasure deletes it first, so the message never waits in a scheduled
   * function's arguments.
   */
  heldEmails: defineTable({
    /** The message, as `send` takes it. */
    message: v.object(sendArgs),
    /** The sender it goes from. */
    from: v.string(),
    /** Its first recipient, lower-cased: what an erasure finds it by. */
    email: v.string(),
    /** When it goes. */
    deliverAt: v.number(),
    /** A send under a topic: the contact and the topic asked again as it goes. */
    hold: v.optional(v.object({ contactId: v.string(), topic: v.object({ key: v.string(), subscribedByDefault: v.boolean() }) })),
  })
    .index('email', ['email']),
  /**
   * How long the email records are kept, as the app's `setupEmail({
   * retention })` last sent it with an email. One row at most; absent, the
   * defaults hold.
   */
  emailSettings: defineTable({
    finalizedMs: v.optional(v.number()),
    abandonedMs: v.optional(v.number()),
  }),
}

/**
 * The email provider's suppression list, mirrored (see `suppressions.ts`):
 * an address the provider stopped delivering to after a hard bounce, a
 * complaint or by hand, recorded from its `suppression.added` and
 * `email.suppressed` events and marked lifted by `suppression.removed`.
 * The provider stays the source of truth; the copy lets a sign-in read one
 * index before a code is sent. A lifted row stays a little while, so an
 * older event arriving late cannot put the address back.
 */
export const suppressionTables = {
  suppressions: defineTable({
    /** The address, trimmed and lower case. */
    email: v.string(),
    /** Why the provider suppressed it: `bounce`, `complaint`, `manual`, or `dropped` when only a dropped send told us. */
    origin: v.union(v.literal('bounce'), v.literal('complaint'), v.literal('manual'), v.literal('dropped')),
    /** When the provider suppressed it, epoch ms. */
    suppressedAt: v.number(),
    /** When the provider lifted it; absent while it stands. */
    liftedAt: v.optional(v.number()),
    /** When the provider made the latest change this row follows: an older event changes nothing. */
    changedAt: v.number(),
  })
    .index('email', ['email'])
    // The admin list, newest first, standing ones only; and the prune of lifted ones.
    .index('liftedAt_suppressedAt', ['liftedAt', 'suppressedAt']),
}

/**
 * The devices each account signed in from (see `devices.ts`): a keyed hash
 * of the device's fingerprint (its browser, system and network range),
 * never the fingerprint, so a sign-in from a device the account has not
 * used before is told apart and alerted. Pruned a year after a device was
 * last seen.
 */
export const deviceTables = {
  knownDevices: defineTable({
    userId: v.string(),
    /** HMAC of the browser, the system and the network range, under the auth secret and bound to the account. */
    fingerprint: v.string(),
    /** HMAC of the browser and the system alone: the one-email-a-day rule's key, which a new network range keeps. */
    device: v.string(),
    /** The browser and system names, for the Alerts section ("Chrome on macOS"); each absent when unknown. */
    browser: v.optional(v.string()),
    os: v.optional(v.string()),
    firstSeenAt: v.number(),
    lastSeenAt: v.number(),
    /** Set when its first sign-in was alerted: a new device, or a recovery. */
    alertedAt: v.optional(v.number()),
    /** Its alert's sign-in was a recovery code's. */
    recovery: v.optional(v.boolean()),
    /** When its alert went out by email; the one-email-a-day rule reads it. */
    emailedAt: v.optional(v.number()),
    /** The session its alert's sign-in opened, so the Alerts section can sign it out. */
    sessionId: v.optional(v.string()),
  })
    .index('userId_fingerprint', ['userId', 'fingerprint'])
    .index('userId_device_emailedAt', ['userId', 'device', 'emailedAt'])
    .index('userId_alertedAt', ['userId', 'alertedAt'])
    .index('lastSeenAt', ['lastSeenAt']),
}

/**
 * The component's own housekeeping (see `maintenance.ts`): one row per
 * maintenance task, with when its latest pass started and finished and how
 * many rows it deleted. Health for DevTools, never a log.
 */
export const maintenanceTables = {
  maintenanceTasks: defineTable({
    task: v.string(),
    /** When the latest pass started. */
    startedAt: v.number(),
    /** When the latest finished pass finished; absent until one has. */
    finishedAt: v.optional(v.number()),
    /** Rows the latest finished pass deleted; absent for a task that cannot count them. */
    pruned: v.optional(v.number()),
    /** Rows deleted since the task first ran. */
    totalPruned: v.number(),
    /** The error that ended the latest pass early; absent when it ran to the end. */
    error: v.optional(v.string()),
    /** Where a task that walks a table in order stopped, for the next pass to go on from (the orphan sweep's `_creationTime`). */
    cursor: v.optional(v.number()),
  })
    .index('task', ['task']),
}

/**
 * A value an event's `data` holds: flat, never an object. Shared by the
 * audit table and the component's audit functions (`audit.ts`).
 */
export { vEventData }

/** An event as the app hands it to the trail: every id resolved, no clock. */
export const vEventRow = v.object({
  type: v.string(),
  actorId: v.optional(v.string()),
  impersonatorId: v.optional(v.string()),
  subjectId: v.optional(v.string()),
  entityId: v.optional(v.string()),
  targetId: v.optional(v.string()),
  data: v.optional(vEventData),
})

/** An event as the app's `onEvent` action receives it: the row, its id and when it was recorded. */
export const vRecordedEvent = vEventRow.extend({ id: v.string(), at: v.number() })

/**
 * The audit trail (see `audit.ts`): one row per event on the shared event
 * path (`recordBackendEvent`), written once and never changed, but by an
 * account's erasure. Rows carry ids, never an address or a name: who acted
 * (`actorId`), the administrator behind an impersonated session
 * (`impersonatorId`), the account it is about (`subjectId`), the workspace
 * it happened in (`entityId`) and the thing acted on (`targetId`). The
 * maintenance pass deletes a row `AUDIT_EVENT_RETENTION_MS` (365 days)
 * after it was written.
 */
export const auditTables = {
  auditEvents: defineTable({
    /** The event's type: a kind of the catalog (`src/convex/events.ts`), or the app's own under `app.`. */
    type: v.string(),
    actorId: v.optional(v.string()),
    impersonatorId: v.optional(v.string()),
    subjectId: v.optional(v.string()),
    entityId: v.optional(v.string()),
    targetId: v.optional(v.string()),
    data: v.optional(vEventData),
    /** When it was recorded, epoch ms. */
    at: v.number(),
  })
    // Every event, newest first (the administrators' view), and the
    // retention sweep.
    .index('at', ['at'])
    // An account's own activity, and its erasure.
    .index('subjectId_at', ['subjectId', 'at'])
    // A workspace's activity.
    .index('entityId_at', ['entityId', 'at'])
    // The first event of a kind for an account or a workspace: what ticks a
    // task of the activation checklist off.
    .index('type_subjectId', ['type', 'subjectId'])
    .index('type_entityId', ['type', 'entityId'])
    // An erased account's rows as actor, and behind someone else's session.
    .index('actorId', ['actorId'])
    .index('impersonatorId', ['impersonatorId']),
}

/** A flag's stored override (see `src/convex/flags.ts`), as the component keeps and returns it. */
export const vFlagOverride = v.object({
  enabled: v.optional(v.boolean()),
  users: v.optional(v.array(v.string())),
  workspaces: v.optional(v.array(v.string())),
  plans: v.optional(v.array(v.string())),
  rollout: v.optional(v.number()),
  message: v.optional(v.string()),
  winner: v.optional(v.string()),
})

/**
 * Feature flags (see `flags.ts`): one row per flag an administrator
 * overrode, the app's own and the package's kill switches alike. A flag
 * without a row holds its default from code. Who changed it, and when, is
 * on the audit trail (`flag.changed`), so a row names no account but the
 * ones it targets, which an account's erasure removes.
 */
export const flagTables = {
  flagOverrides: defineTable({
    key: v.string(),
    override: vFlagOverride,
    updatedAt: v.number(),
    /**
     * What set the override when it was not an administrator: `spend_limit`
     * for the `pause_ai` the AI spend limit turned on, which only its own
     * reset clears. An administrator's write clears it.
     */
    setBy: v.optional(v.literal('spend_limit')),
  })
    .index('key', ['key']),
}

/**
 * Export and erasure (see `account.ts`). `accountErasures` holds an
 * account's erasure while it runs (`account.forget`): the participant it
 * is at, the workspaces it deletes and the address its email-keyed
 * participants erase by, deleted once the last one finished.
 * `accountExports` holds each data export: the file in the component's
 * storage, deleted when its link expires, and the row a day longer, which
 * the export limit counts. `accountExportParts` holds the zip parts that
 * bundle the account's files beside it, each deleted with the export's file.
 * `accountDeletions` holds a deletion that waits out its grace period,
 * until it is cancelled or the erasure removes it.
 */
export const accountTables = {
  accountErasures: defineTable({
    /** The account's id; absent for an erasure by address alone (`account.forget` with only `email`). */
    userId: v.optional(v.string()),
    /** The address, lower-cased, for the participants that erase by it. */
    email: v.optional(v.string()),
    /** The workspaces deleted with the account: its personal one, and any it was the only member of. */
    deleted: v.array(v.string()),
    /** The workspaces the account leaves, others staying. */
    left: v.array(v.string()),
    /** The participant it is at (`ACCOUNT_DATA_SOURCES`'s key, or `done`). */
    step: v.string(),
    /** Failed runs of that participant in a row. */
    attempts: v.number(),
    /** The pseudonym the account's id becomes in the rows that keep one, the same in all of them. */
    alias: v.string(),
    startedAt: v.number(),
    /** Why the latest run failed. */
    error: v.optional(v.string()),
    /** When it gave up on a participant that kept failing; it resumes when `forget` runs for it again. */
    failedAt: v.optional(v.number()),
  })
    .index('userId', ['userId'])
    .index('email', ['email'])
    .index('failedAt', ['failedAt']),
  /**
   * The app's part of an erasure (the billing customer, the email contact,
   * an app's own source) that gave up on a participant: the plan it ran,
   * kept so a retry erases what it was meant to, though the component's
   * part finished and the account's workspaces are gone. Deleted once
   * every participant finished.
   */
  accountErasureFailures: defineTable({
    userId: v.optional(v.string()),
    email: v.optional(v.string()),
    deleted: v.array(v.string()),
    left: v.array(v.string()),
    /** The participants that finished, which a retry skips. */
    done: v.array(v.string()),
    /** The participants that gave up. */
    failed: v.array(v.string()),
    /** The rounds of retries it has run. */
    rounds: v.number(),
    failedAt: v.number(),
  })
    .index('userId', ['userId'])
    .index('email', ['email'])
    .index('failedAt', ['failedAt']),
  accountExports: defineTable({
    userId: v.string(),
    /** The file, once written; gone once the link expired. */
    storageId: v.optional(v.id('_storage')),
    createdAt: v.number(),
    /** When the link stops working and the file is deleted. */
    expiresAt: v.number(),
  })
    .index('userId_createdAt', ['userId', 'createdAt'])
    .index('createdAt', ['createdAt'])
    // The orphan sweep keeps an export's file: it is found by its id.
    .index('storageId', ['storageId']),
  accountExportParts: defineTable({
    exportId: v.id('accountExports'),
    userId: v.string(),
    /** One zip of the account's files; deleted with the export's own file. */
    storageId: v.id('_storage'),
    /** The zip's size in bytes, and how many files it holds. */
    bytes: v.number(),
    files: v.number(),
    createdAt: v.number(),
  })
    .index('exportId', ['exportId'])
    .index('userId', ['userId'])
    .index('createdAt', ['createdAt'])
    // The orphan sweep keeps a part: it is found by its id.
    .index('storageId', ['storageId']),
  accountDeletions: defineTable({
    userId: v.string(),
    requestedAt: v.number(),
    /** When the erasure runs, unless it is cancelled before. */
    deletesAt: v.number(),
    /** SHA-256 (hex) of the token in the "keep my account" link, which works without a sign-in. */
    tokenHash: v.string(),
  })
    .index('userId', ['userId'])
    .index('tokenHash', ['tokenHash']),
}

/** A file's owner, as `storage.store` and `storage.claim` record it: an account, and the workspace whose members read it. */
export const vFileOwner = v.object({ userId: v.string(), workspaceId: v.optional(v.string()) })

/**
 * Files (see `storage.ts`). `files` holds one owner record per file the
 * app keeps: who owns it, whose quota counts it, its size and the type read
 * from its bytes, and, while a claimed upload is still being checked, what
 * the check looks for. `fileUsage` counts each quota holder's files and
 * bytes in one row, so a check and a claim read and write the same document.
 * `shareLinks` holds one link per shared row of the app's: the SHA-256 of
 * its token, never the token.
 */
export const storageTables = {
  files: defineTable({
    /** The id the app holds and passes back. */
    storageId: v.id('_storage'),
    /** The copy served in its place once its metadata was stripped; absent while it is the file itself. */
    servedId: v.optional(v.id('_storage')),
    userId: v.string(),
    workspaceId: v.optional(v.string()),
    /** Whose quota counts it: the billing entity, or the workspace (else the account) the owner names. */
    holder: v.string(),
    /** Its size in bytes, after stripping once the check ran. */
    size: v.number(),
    /** The type read from its bytes; absent while a claimed upload waits for its check. */
    contentType: v.optional(v.string()),
    /** `checking` from a claim until the type check and stripping ran; `ready` once its URL may be served. */
    status: v.union(v.literal('checking'), v.literal('ready')),
    /** What the check of a claimed upload looks for. */
    check: v.optional(v.object({ accept: v.array(v.string()), strip: v.boolean() })),
    /** The SHA-256 of the bytes served, hex, once known: what a removed intimate image's identical copies are found by. */
    sha256: v.optional(v.string()),
    /** Set when an intimate-image removal named it while it was checked: the check blocks its stripped bytes and removes it with their copies. */
    removal: v.optional(v.object({ decision: v.optional(v.id('reportDecisions')) })),
    createdAt: v.number(),
  })
    .index('storageId', ['storageId'])
    .index('servedId', ['servedId'])
    .index('sha256', ['sha256'])
    .index('userId_workspaceId', ['userId', 'workspaceId'])
    .index('workspaceId', ['workspaceId']),
  fileUsage: defineTable({
    holder: v.string(),
    files: v.number(),
    bytes: v.number(),
  })
    .index('holder', ['holder']),
  /**
   * The billing quota keys the file counts are registered under: `setupStorage`
   * names them with each store and claim, so billing's quota reads (which run
   * where storage's module may not be loaded) find the count by key.
   */
  quotaCounters: defineTable({
    key: v.string(),
    source: v.union(v.literal('files'), v.literal('bytes')),
  })
    .index('key', ['key']),
  shareLinks: defineTable({
    /** The app's table the shared row is in. */
    table: v.string(),
    /** The shared row's id. */
    rowId: v.string(),
    /** The SHA-256 of the link's token, hex. */
    tokenHash: v.string(),
    /** Who turned it on. */
    sharedBy: v.string(),
    sharedAt: v.number(),
  })
    .index('table_rowId', ['table', 'rowId'])
    .index('tokenHash', ['tokenHash'])
    .index('sharedBy', ['sharedBy']),
}

/** Why someone reported content: the one-click reasons, and the notice form's legal ones. */
export const vReportReason = v.union(
  v.literal('abuse'),
  v.literal('sexual'),
  v.literal('violence'),
  v.literal('spam'),
  v.literal('intimate'),
  v.literal('child_abuse'),
  v.literal('illegal'),
  v.literal('other'),
)

/**
 * Content duties (`setupAdmin({ reports })`, `reports.ts`).
 * `reportSubjects` holds one row per reported thing of the app's (a table
 * and a row id), with how many reports are open on it, when its first open
 * intimate-image request came (the 48-hour clock) and the Art. 18 flag.
 * `reports` holds each one-click report and each notice of the public form:
 * a notifier's name and address stay here, for the outcome email, and never
 * reach the activity trail or the author. `reportDecisions` keeps every
 * decision with the SHA-256 of its appeal link's token, `reportAppeals`
 * the appeals, and `blockedFiles` the hashes of removed intimate images,
 * which a later upload of the same bytes is refused by. An erasure finds a
 * person by the indexes on the reporter, the notifier's address, the author
 * and the administrator who decided, flagged or answered (`eraseReports`).
 */
export const reportTables = {
  reportSubjects: defineTable({
    /** The app's table the content is in. */
    table: v.string(),
    /** Its row id. */
    subjectId: v.string(),
    /** `open` while a report waits; `hidden` or `dismissed` once decided. */
    status: v.union(v.literal('open'), v.literal('hidden'), v.literal('dismissed')),
    /** Open reports and notices on it. */
    open: v.number(),
    /** When its oldest open intimate-image request came: the 48-hour clock starts here. */
    intimateAt: v.optional(v.number()),
    /** Flagged as a suspected crime that threatens life or safety (DSA Art. 18): who flagged it, when, and a note. */
    crime: v.optional(v.object({ at: v.number(), by: v.string(), note: v.optional(v.string()) })),
    /** Its latest decision. */
    decisionId: v.optional(v.id('reportDecisions')),
    updatedAt: v.number(),
  })
    .index('table_subjectId', ['table', 'subjectId'])
    .index('status_open', ['status', 'open'])
    .index('status_intimateAt', ['status', 'intimateAt'])
    .index('crimeBy', ['crime.by']),
  reports: defineTable({
    /** The content it is about; absent for a notice whose link the app could not place. */
    subject: v.optional(v.id('reportSubjects')),
    /** `report`: a signed-in person's one click; `notice`: the public form. */
    kind: v.union(v.literal('report'), v.literal('notice')),
    reason: vReportReason,
    details: v.optional(v.string()),
    /** The signed-in reporter: one open report per person and subject. */
    reporterId: v.optional(v.string()),
    /** The notice's link to the content, as the notifier gave it. */
    url: v.optional(v.string()),
    /**
     * The thing a notice sent from it names (`?table=&id=`), unchecked: a
     * notice on its own keeps it, and the Reports tab files it there once the
     * app's `describe` knows the thing.
     */
    hint: v.optional(v.object({ table: v.string(), id: v.string() })),
    /** Who sent the notice, for its receipt and outcome emails. */
    notifier: v.optional(v.object({ name: v.optional(v.string()), email: v.optional(v.string()), locale: v.optional(v.string()) })),
    /** The typed name that signs an intimate-image removal request. */
    signature: v.optional(v.string()),
    status: v.union(v.literal('open'), v.literal('closed')),
    outcome: v.optional(v.union(v.literal('hidden'), v.literal('dismissed'))),
    crime: v.optional(v.object({ at: v.number(), by: v.string(), note: v.optional(v.string()) })),
    createdAt: v.number(),
    closedAt: v.optional(v.number()),
  })
    .index('subject_status', ['subject', 'status'])
    .index('reporterId_subject_status', ['reporterId', 'subject', 'status'])
    .index('kind_status_subject', ['kind', 'status', 'subject'])
    .index('kind_status_subject_reason', ['kind', 'status', 'subject', 'reason'])
    .index('hint_status', ['hint.table', 'hint.id', 'status'])
    .index('notifierEmail', ['notifier.email'])
    .index('crimeBy', ['crime.by'])
    .index('status_closedAt', ['status', 'closedAt']),
  reportDecisions: defineTable({
    subject: v.optional(v.id('reportSubjects')),
    /** The notice decided, for one the app could not place. */
    notice: v.optional(v.id('reports')),
    action: v.union(v.literal('hidden'), v.literal('dismissed')),
    /** The facts and the term or law it rests on, as the administrator wrote them. */
    reason: v.string(),
    /** Whether the content broke the law or the app's terms. */
    ground: v.union(v.literal('illegal'), v.literal('terms')),
    /** The administrator who decided. */
    by: v.string(),
    at: v.number(),
    /** Whose content it was, as `describe` said. */
    authorId: v.optional(v.string()),
    /** The SHA-256 of the appeal link's token; absent for a decision that restricted nothing. */
    appealTokenHash: v.optional(v.string()),
  })
    .index('subject', ['subject'])
    .index('appealTokenHash', ['appealTokenHash'])
    .index('by', ['by'])
    .index('authorId', ['authorId'])
    .index('at', ['at']),
  reportAppeals: defineTable({
    decision: v.id('reportDecisions'),
    /** What the author wrote; absent once the author was erased. */
    text: v.optional(v.string()),
    status: v.union(v.literal('open'), v.literal('upheld'), v.literal('reversed')),
    reason: v.optional(v.string()),
    by: v.optional(v.string()),
    createdAt: v.number(),
    closedAt: v.optional(v.number()),
  })
    .index('decision', ['decision'])
    .index('status', ['status'])
    .index('by', ['by']),
  blockedFiles: defineTable({
    /** The SHA-256 of a removed image's bytes, hex. */
    sha256: v.string(),
    decision: v.optional(v.id('reportDecisions')),
    at: v.number(),
  })
    .index('sha256', ['sha256'])
    .index('decision', ['decision']),
}

/** A job's status in the queue. */
export const vJobStatus = v.union(v.literal('queued'), v.literal('running'), v.literal('done'), v.literal('failed'), v.literal('canceled'))

/** A queued job's credit hold: the reservation `reserveCredits({ hold })` made, as plain data. */
export const vJobHold = v.object({
  externalId: v.string(),
  reserved: v.boolean(),
  meter: v.optional(v.string()),
  meterId: v.optional(v.string()),
  value: v.number(),
})

/** What a job's model calls used and cost, summed over its steps. */
export const vJobUsage = v.object({
  usd: v.optional(v.number()),
  input: v.number(),
  output: v.number(),
  cached: v.number(),
  models: v.array(v.string()),
})

/** An administrator's retune of a tier, over `backend/jobs.ts`. */
export const vTierOverride = v.object({
  perOwner: v.optional(v.number()),
  dedicated: v.optional(v.number()),
  budgetUnits: v.optional(v.number()),
})

/**
 * The generation queue (`defineJobQueue`, `nuxt-backend/ai`): each job and
 * where it stands, the queue's state an administrator changes without a
 * deploy, each model's adaptive limit, and each owner's budget windows. The
 * work itself runs on the app's Workflow component; these rows hold the
 * queue's policy around it.
 */
export const jobTables = {
  jobs: defineTable({
    /** The kind: the function name of its `jobs.define` export (`strips:render`). */
    kind: v.string(),
    args: v.any(),
    /** Who pays: the billing entity, fixed when the job joined. */
    owner: v.string(),
    /** The member who started it; for a guest job, the account that claimed it at sign-up. */
    userId: v.optional(v.string()),
    /**
     * A guest job's visitor: the browser that started it signed out. It
     * keeps the guest rank and its visitor's count after its claim moves
     * `owner` and `userId` to the new account. Its owner is
     * `guest:<visitor>` until then.
     */
    visitor: v.optional(v.string()),
    status: vJobStatus,
    /** The effective tier (the better of the one it joined under and its owner's now) and its place in the list; past the list for none. */
    tier: v.optional(v.string()),
    rank: v.number(),
    /** When it joined, less its effective tier's head start: the lowest starts first. */
    score: v.number(),
    joinedAt: v.number(),
    startedAt: v.optional(v.number()),
    endedAt: v.optional(v.number()),
    /** A running job that shows no sign of life past this is failed by the stall sweep. */
    leaseUntil: v.optional(v.number()),
    meter: v.optional(v.string()),
    cost: v.number(),
    hold: v.optional(vJobHold),
    /** The budget window it counted in, and what it counted there. */
    budgetWindow: v.optional(v.number()),
    budgetCounted: v.number(),
    charged: v.boolean(),
    refunded: v.boolean(),
    /** When its charge began: from then on the hold is the charge's to settle or let go. */
    charging: v.optional(v.number()),
    /**
     * A charged job that ended owing its credits back: `pending` while its
     * refund is tried (the latest try due at `refundAt`), `given_up` after
     * the last one failed. Cleared once refunded.
     */
    refundOwed: v.optional(v.union(v.literal('pending'), v.literal('given_up'))),
    refundAt: v.optional(v.number()),
    workflowId: v.optional(v.string()),
    /** Attempts of its steps, the throttled ones included. */
    attempts: v.number(),
    progress: v.optional(v.object({ done: v.number(), total: v.number(), label: v.optional(v.string()) })),
    result: v.optional(v.any()),
    /** Why it failed, as a catalog error payload: what the person sees. */
    error: v.optional(v.any()),
    /** The provider's own text for its last failed attempt, cut to 500 characters: for administrators. */
    lastError: v.optional(v.string()),
    usage: v.optional(vJobUsage),
    /** A failed job, for an administrator to retry or discard. */
    deadLetter: v.optional(v.boolean()),
    /** How often an administrator put it back in line. */
    retries: v.number(),
    /** A running job's cancel: who asked, and whether its credits go back. */
    cancel: v.optional(v.object({ by: v.string(), refund: v.boolean() })),
  })
    .index('by_status_and_score', ['status', 'score'])
    // Each owner's waiting jobs in score order: the line read owner by owner past one owner's backlog.
    .index('by_status_and_owner_and_score', ['status', 'owner', 'score'])
    .index('by_owner_and_status', ['owner', 'status'])
    .index('by_userId', ['userId'])
    .index('by_visitor_and_status', ['visitor', 'status'])
    .index('by_workflowId', ['workflowId'])
    .index('by_deadLetter_and_endedAt', ['deadLetter', 'endedAt'])
    .index('by_status_and_endedAt', ['status', 'endedAt']),
  /**
   * A browser's used guest tries: its guest jobs that ended done, counted
   * as they end, so a try stays used for the visitor cookie's year after
   * the job's own record is pruned (30 days after it ends). Kept a year
   * after the last try. The account that claimed the visitor's jobs at
   * sign-up is named, so its erasure removes the count.
   */
  guestTries: defineTable({
    visitor: v.string(),
    done: v.number(),
    lastAt: v.number(),
    userId: v.optional(v.string()),
  })
    .index('by_visitor', ['visitor'])
    .index('by_userId', ['userId'])
    .index('by_lastAt', ['lastAt']),
  jobQueue: defineTable({
    paused: v.boolean(),
    /** The administrator's concurrency, over `backend/jobs.ts`. */
    concurrency: v.optional(v.number()),
    tiers: v.record(v.string(), vTierOverride),
    /** The average length of recent finished jobs, in ms. */
    averageMs: v.optional(v.number()),
    /** The tiers as `backend/jobs.ts` names them, kept so a plan change re-tiers waiting jobs here. */
    plan: v.optional(v.array(v.object({ name: v.string(), feature: v.optional(v.string()), headStart: v.number() }))),
    /** The app's `jobs:runQueue`, as a function handle: the sweep wakes it to fail stalled jobs and fill free slots. */
    wake: v.optional(v.string()),
  }),
  jobModels: defineTable({
    model: v.string(),
    perMinute: v.number(),
    min: v.number(),
    max: v.number(),
    last429At: v.optional(v.number()),
    grewAt: v.optional(v.number()),
    cleanStreak: v.number(),
    count429: v.number(),
  })
    .index('by_model', ['model']),
  jobBudgets: defineTable({
    owner: v.string(),
    windowStart: v.number(),
    used: v.number(),
  })
    .index('by_owner_and_windowStart', ['owner', 'windowStart']),
}

/**
 * The alerts the backend raised (`alerts.ts`): one row per alert and period,
 * so each fires once a day, or once a month for a monthly quota.
 */
export const monitoringTables = {
  monitoringAlerts: defineTable({
    /** The alert and its threshold: `email_quota:80`, `ai_spend`. */
    alert: v.string(),
    /** The period it fired for: `2026-10-27`, `2026-10`. */
    period: v.string(),
    at: v.number(),
  })
    .index('by_alert_and_period', ['alert', 'period'])
    .index('by_at', ['at']),
}

/**
 * The consent ledger (see `consents.ts`): one row per decision, a grant or a
 * withdrawal, of one kind at one version, never overwritten, so the history
 * stays readable. A row belongs to an account (`userId`) or, before sign-up,
 * to a hash of the address (`emailHash`), and moves to the account when it
 * signs up.
 */
export const consentTables = {
  consents: defineTable({
    userId: v.optional(v.string()),
    /** SHA-256 of the lower-cased address, for a decision given before the account existed. */
    emailHash: v.optional(v.string()),
    kind: v.string(),
    version: v.string(),
    /** `true` a grant, `false` a withdrawal. */
    granted: v.boolean(),
    at: v.number(),
    /** Where it came from: `sign-up`, `prompt`, `settings`, `waitlist` or `topic`. */
    source: v.string(),
    /** The words the person agreed to, when the form showed its own (the launch-news box). */
    text: v.optional(v.string()),
    /** What the decision came with: `checkout:<id>` for a topic's soft opt-in at checkout. */
    reference: v.optional(v.string()),
  })
    .index('userId_kind_at', ['userId', 'kind', 'at'])
    .index('userId_at', ['userId', 'at'])
    .index('emailHash_at', ['emailHash', 'at']),
}

/**
 * Launch access (see `access.ts`): the phase an administrator set, the
 * invite codes and access links (a keyed hash of each, never the code), the
 * invitations by address an administrator made, and the redemption ledger
 * that says which ticket admitted each account. `accessSettings` holds one
 * row, the phase, absent until an administrator first changes it.
 */
export const accessTables = {
  accessSettings: defineTable({
    phase: v.string(),
    updatedAt: v.number(),
  }),
  /** When the next invitation email may go: "Email them" books its emails one after another, about a hundred an hour. One row at most. */
  accessEmailPace: defineTable({
    nextAt: v.number(),
  }),
  accessInvites: defineTable({
    kind: v.union(v.literal('code'), v.literal('link')),
    /** The keyed hash of the normalized code or token (`inviteHash`). */
    tokenHash: v.string(),
    /**
     * The version of the `AUTH_SECRET` entry the hash is keyed with (`0` for a plain secret):
     * set when the row is written or re-keyed, so a retirement can count the rows still under an
     * older one. Absent on a row from before it was kept, which reads as older.
     */
    keyVersion: v.optional(v.number()),
    label: v.string(),
    maxUses: v.number(),
    uses: v.number(),
    expiresAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
    /** The administrator who made it; absent for one made by server code. */
    createdBy: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index('tokenHash', ['tokenHash'])
    .index('createdAt', ['createdAt'])
    .index('createdBy', ['createdBy'])
    .index('revokedAt_keyVersion', ['revokedAt', 'keyVersion']),
  accessAdmissions: defineTable({
    /** The address, trimmed and lower-cased. */
    email: v.string(),
    source: v.union(v.literal('invitation'), v.literal('waitlist')),
    label: v.optional(v.string()),
    expiresAt: v.number(),
    createdBy: v.optional(v.string()),
    createdAt: v.number(),
    /** Set once the address signed up with it. */
    usedAt: v.optional(v.number()),
  })
    .index('email', ['email'])
    .index('createdAt', ['createdAt'])
    .index('createdBy', ['createdBy']),
  accessRedemptions: defineTable({
    /** The address that signed up, until the account it made is attached. */
    email: v.optional(v.string()),
    userId: v.optional(v.string()),
    ticket: v.string(),
    label: v.optional(v.string()),
    inviteId: v.optional(v.id('accessInvites')),
    /** For a workspace invitation: the account that sent it, whose share of sign-ups it counts against. */
    inviterId: v.optional(v.string()),
    at: v.number(),
  })
    .index('email', ['email'])
    .index('userId', ['userId'])
    .index('inviteId', ['inviteId'])
    .index('inviterId', ['inviterId'])
    .index('label_at', ['label', 'at']),
}

/**
 * The waitlist (see `waitlist.ts`): one entry per verified address, the
 * join a person has begun but not yet proven with a code (`waitlistJoins`,
 * gone within a day), a count per status for the Waitlist tab, and the
 * email provider's segment and topic the launch-news mirror writes to. The
 * order people wait in lives in the nested `waitlistRank` aggregate.
 */
export const waitlistTables = {
  waitlistEntries: defineTable({
    /** The address, trimmed and lower-cased. */
    email: v.string(),
    /** Its domain, for the tab's filter. */
    domain: v.string(),
    status: v.union(v.literal('waiting'), v.literal('admitted'), v.literal('declined'), v.literal('joined')),
    /** Where it came from: `sign-in`, or the form's `source`. */
    source: v.string(),
    /** The answers to the app's questions, by question. */
    answers: v.optional(v.record(v.string(), v.string())),
    locale: v.optional(v.string()),
    note: v.optional(v.string()),
    /** When the code proved the address. */
    verifiedAt: v.number(),
    /**
     * The state of its contact at the email provider; absent without launch
     * news. Whether the person ticked the launch-news box, when, and the
     * words they agreed to live on the consent ledger alone.
     */
    mirror: v.optional(v.union(v.literal('pending'), v.literal('synced'), v.literal('drift'), v.literal('skipped'))),
    mirrorError: v.optional(v.string()),
    mirrorAt: v.optional(v.number()),
    /** The entry whose link this one joined through. */
    referredBy: v.optional(v.id('waitlistEntries')),
    /** Friends that count for it, up to the cap. */
    boost: v.number(),
    /** How far it moved the entry it came through up the line, in the queue key's milliseconds; taken back with it. */
    creditedMs: v.optional(v.number()),
    /** The key it holds in the rank aggregate while it waits. */
    rankKey: v.optional(v.number()),
    admittedAt: v.optional(v.number()),
    declinedAt: v.optional(v.number()),
    declinedFor: v.optional(v.literal('abuse')),
    joinedAt: v.optional(v.number()),
  })
    .index('email', ['email'])
    .index('status_verifiedAt', ['status', 'verifiedAt'])
    .index('mirror_mirrorAt', ['mirror', 'mirrorAt']),
  waitlistJoins: defineTable({
    email: v.string(),
    /** The key `joinWaitlist` handed the browser that began the join: only a code check that carries it applies the join. */
    key: v.optional(v.string()),
    answers: v.optional(v.record(v.string(), v.string())),
    launchNews: v.optional(v.object({ text: v.string() })),
    source: v.string(),
    /** The share code of the friend whose link it came through. */
    ref: v.optional(v.string()),
    locale: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index('email', ['email'])
    .index('createdAt', ['createdAt']),
  waitlistStats: defineTable({
    status: v.string(),
    count: v.number(),
  }).index('status', ['status']),
  waitlistSettings: defineTable({
    /** The provider's segment and topic for launch news, found or made on the first mirror. */
    segmentId: v.optional(v.string()),
    topicId: v.optional(v.string()),
    updatedAt: v.number(),
  }),
}

/**
 * Notifications (see `notifications.ts`): one row per person an event
 * notified in the app. A row restates an event the audit trail holds: its
 * type, who acted, the workspace and the thing acted on, and the few flat
 * values the kind carries, never a name, an address or the words. The words
 * are labels, read in the person's language when the row is shown, and
 * names are read then too, so a renamed workspace shows its new name.
 * `channels` records the channels the notification went out on.
 * The maintenance pass deletes a read row 90 days after it was read and an
 * unread one 365 days after it was recorded.
 */
export const notificationTables = {
  notifications: defineTable({
    /** The recipient. */
    userId: v.string(),
    /** The event's type: a kind of the catalog, or the app's own under `app.`. */
    type: v.string(),
    /** The audit event it restates. */
    eventId: v.string(),
    actorId: v.optional(v.string()),
    /** An administrator acted, in a session they opened as `actorId`: the inbox names an administrator, never the account. */
    impersonated: v.optional(v.boolean()),
    entityId: v.optional(v.string()),
    targetId: v.optional(v.string()),
    /** Where it links, a path of the app; absent for a package kind, which links to a ready-made page by its type. */
    link: v.optional(v.string()),
    data: v.optional(vEventData),
    /** The channels it went out on: `app`, and later `email` and `push`. */
    channels: v.array(v.string()),
    /** When it was recorded, epoch ms. */
    at: v.number(),
    /** When the person read it; absent while unread. */
    readAt: v.optional(v.number()),
  })
    // The inbox, newest first.
    .index('userId_at', ['userId', 'at'])
    // The unread count and mark-all-read: an unread row has no `readAt`.
    .index('userId_readAt', ['userId', 'readAt'])
    // Retention: read rows by when they were read, unread ones by when they were recorded.
    .index('readAt_at', ['readAt', 'at'])
    // An erased account's name in rows that stay.
    .index('actorId', ['actorId'])
    // An event that records twice notifies once.
    .index('eventId_userId', ['eventId', 'userId'])
    // What the app forgets with the thing they point at: one kind about one target.
    .index('targetId_type', ['targetId', 'type']),
  /**
   * A person's choice of one channel for one kind of notification, where it
   * differs from the default: every channel the kind allows is on until the
   * person turns it off. Written by the profile's Email section
   * (`setNotificationChannel`); read in the transaction that notifies.
   */
  notificationChoices: defineTable({
    userId: v.string(),
    /** The kind: an event type of the catalog, or the app's own under `app.`. */
    type: v.string(),
    channel: v.union(v.literal('app'), v.literal('email'), v.literal('push')),
    enabled: v.boolean(),
    /** When the person chose it. */
    at: v.number(),
  })
    .index('userId_type_channel', ['userId', 'type', 'channel']),
  /**
   * A device a person allowed web push on: the push service's address for
   * it and the keys a message to it is encrypted with. A device belongs to
   * the account that subscribed it last. Dropped when the push service says
   * the device is gone (`404`, `410`), and erased with the account.
   */
  pushSubscriptions: defineTable({
    userId: v.string(),
    /** The push service's URL for the device: personal data. */
    endpoint: v.string(),
    /** The device's public key, base64url. */
    p256dh: v.string(),
    /** The device's authentication secret, base64url. */
    auth: v.string(),
    /** When it was subscribed, or subscribed again. */
    at: v.number(),
  })
    .index('endpoint', ['endpoint'])
    .index('userId', ['userId']),
}

/**
 * Email preferences (`setupEmail({ topics, caps })`): a copy of each
 * person's topic choices, kept beside the deployment so every send reads it
 * in its own transaction, and the few values the sending rules need. The
 * provider keeps the choices too; the two stay in step through its
 * `contact.topics.updated` and `contact.updated` webhooks and a job after
 * each change here.
 */
export const preferenceTables = {
  /** One per address that was sent mail under a topic, chose a topic, or has an account that did. */
  emailContacts: defineTable({
    /** The address, normalized. */
    email: v.string(),
    /** The account the address belongs to, once known. */
    userId: v.optional(v.string()),
    /** The last click in an email or activity in the app, epoch ms: the sunset rule reads it. */
    engagedAt: v.optional(v.number()),
    /** The person's time zone, from their browser at sign-in (`Europe/Dublin`): quiet hours read it. */
    timeZone: v.optional(v.string()),
    /** When non-transactional mail went to the address in the last 7 days: the weekly cap counts them. */
    recentSends: v.optional(v.array(v.number())),
    /** One-click unsubscribes in the current minute, for the per-token limit. */
    unsubscribeHits: v.optional(v.object({ windowStart: v.number(), count: v.number() })),
    /** Whether the provider's contact still has to be written. */
    pendingSync: v.optional(v.boolean()),
    /** Whether the provider's contact is unsubscribed from everything, as its `contact.updated` webhook last said. */
    providerUnsubscribed: v.optional(v.boolean()),
  })
    .index('email', ['email'])
    .index('userId', ['userId']),
  /** One per contact and topic it decided about: no row reads as the topic's default. */
  emailTopicChoices: defineTable({
    contactId: v.id('emailContacts'),
    /** The topic's key, as `setupEmail({ topics })` names it. */
    topic: v.string(),
    state: v.union(v.literal('subscribed'), v.literal('unsubscribed'), v.literal('pending')),
    /** How the choice was made: `profile`, `double-opt-in`, `soft-opt-in`, `unsubscribe-page`, `one-click` or `provider`. */
    source: v.string(),
    at: v.number(),
    /** A pending choice lapses at this time without its confirmation click. */
    pendingUntil: v.optional(v.number()),
    /** When the last double opt-in confirmation went out: the next waits a few minutes, however often the person asks. */
    askedAt: v.optional(v.number()),
  })
    .index('contactId_topic', ['contactId', 'topic']),
  /**
   * The id a contact had before an address change merged it onto another
   * row: the unsubscribe and confirmation links already sent carry it, and
   * resolve through it to the row the person is on now.
   */
  emailContactAliases: defineTable({
    formerId: v.string(),
    contactId: v.id('emailContacts'),
  })
    .index('formerId', ['formerId'])
    .index('contactId', ['contactId']),
  /** The provider's id of each object `email sync` made or found (a topic, the accounts' segment), so no provider id sits in the app's code. */
  emailProviderIds: defineTable({
    kind: v.union(v.literal('topic'), v.literal('segment')),
    /** The topic's key, or `accounts` for the segment. */
    key: v.string(),
    providerId: v.string(),
    /** For a topic: the version of its words the provider was given, a digest of its description. */
    version: v.optional(v.string()),
    syncedAt: v.number(),
  })
    .index('kind_key', ['kind', 'key'])
    .index('providerId', ['providerId']),
}

/**
 * Announcements (`setupEmail` → the admin console's Announcements tab): the
 * notice every signed-in person sees until it expires or they dismiss it,
 * and the broadcast that may go with it, created once at the provider and
 * sent by its id.
 */
export const announcementTables = {
  announcements: defineTable({
    /** The notice's words, as the administrator wrote them. */
    message: v.string(),
    link: v.optional(vAnnouncementLink),
    /** When the notice goes away by itself, epoch ms. */
    expiresAt: v.number(),
    /** The administrator who published it. */
    publishedBy: v.string(),
    /** When an administrator took it down before it expired. */
    endedAt: v.optional(v.number()),
    /** The email that goes with it, to the people in a topic. */
    broadcast: v.optional(v.object({
      ...vBroadcastDraft.fields,
      state: vBroadcastState,
      /** When a `creating` claim was taken, so a crashed one is retried after a while. */
      claimedAt: v.optional(v.number()),
      /** The provider's id of the broadcast, kept once it is created: a retry sends this one. */
      providerId: v.optional(v.string()),
      /** When it goes out, epoch ms: a scheduled send, or the time it was sent. */
      sendAt: v.optional(v.number()),
      /** The administrator who sent it. */
      sentBy: v.optional(v.string()),
    })),
  })
    // The live ones, the soonest to expire first.
    .index('expiresAt', ['expiresAt']),
  /** One per person and announcement they dismissed. */
  announcementDismissals: defineTable({
    announcementId: v.id('announcements'),
    userId: v.string(),
  })
    .index('userId_announcementId', ['userId', 'announcementId'])
    .index('announcementId', ['announcementId']),
}

/**
 * Lifecycle email (`setupEmail({ lifecycle })`): the flows' settings as
 * `email sync` kept them, and each person's run of a flow, one row per
 * email step, checked against the sending rules when it is due.
 */
export const lifecycleTables = {
  lifecycleSettings: defineTable({
    flows: v.array(vFlowSettings),
    caps: vResolvedCaps,
    syncedAt: v.number(),
  }),
  lifecycleRuns: defineTable({
    userId: v.string(),
    /** The address when the run started; a step reads the account's address now. */
    email: v.string(),
    /** The flow's key (`winBack`). */
    flow: v.string(),
    /** Which of the flow's emails, from 0. */
    step: v.number(),
    /** When the step is due, epoch ms; a step the quiet hours hold, when they end. */
    dueAt: v.number(),
    /** `waiting` for its time; `held` by the quiet hours, counted already; then `sent`, `skipped` or `stopped`. */
    state: v.union(v.literal('waiting'), v.literal('held'), v.literal('sent'), v.literal('skipped'), v.literal('stopped')),
    /** Why it was skipped or stopped: a sending rule, the event that made it moot, `flow_off` or `no_account`. */
    reason: v.optional(v.string()),
    /** What the flow's event carries to its automation: a win-back's cancellation `reason`. */
    data: v.optional(v.record(v.string(), v.string())),
    /** A flow sent at most once per person: its row stays, to say it was. */
    once: v.boolean(),
  })
    .index('state_dueAt', ['state', 'dueAt'])
    .index('userId_flow', ['userId', 'flow'])
    .index('once_state_dueAt', ['once', 'state', 'dueAt']),
}

/**
 * The contact form and inbound mail (see `inbound.ts`). A contact message is
 * stored before anything is sent, and kept 90 days; an inbound message is
 * what a receiving domain or the support inbox handed the deployment, kept
 * 90 days too; a reply address is the token a reply-by-email address carries,
 * with the person and the thread it names.
 */
export const inboundTables = {
  contactMessages: defineTable({
    /** A short random reference, written into the email the team receives so the support inbox's thread can be matched back. */
    ref: v.string(),
    /** The account that sent it, when it was signed in. */
    userId: v.optional(v.string()),
    name: v.optional(v.string()),
    /** The address to answer, lower-cased: the typed one, or the account's. */
    email: v.optional(v.string()),
    message: v.string(),
    locale: v.optional(v.string()),
    sentAt: v.number(),
    /** Where it went: `support` (a thread in the support inbox), `copy` (the contact mailbox), `kept` (the console alone), `held` (test mode or no key: not sent) or `failed` (the provider refused it). */
    delivery: v.union(v.literal('support'), v.literal('copy'), v.literal('kept'), v.literal('held'), v.literal('failed')),
    /** The email the provider queued for it. */
    emailId: v.optional(v.string()),
    /** The support inbox's thread and the email in it, once the inbox handed them back: what an administrator's reply answers. */
    threadId: v.optional(v.string()),
    inboxEmailId: v.optional(v.string()),
    /** When an administrator answered it from the Inbox tab, and who. */
    repliedAt: v.optional(v.number()),
    repliedBy: v.optional(v.string()),
    /** The provider's own words for a refusal, cut to 300 characters: for administrators. */
    error: v.optional(v.string()),
  })
    .index('ref', ['ref'])
    .index('sentAt', ['sentAt'])
    .index('userId_sentAt', ['userId', 'sentAt'])
    .index('email_sentAt', ['email', 'sentAt']),
  inboundMessages: defineTable({
    /** The provider's id for the received email. */
    emailId: v.string(),
    route: v.union(v.literal('reply'), v.literal('workspace'), v.literal('support')),
    /** The address it came to, lower-cased. */
    to: v.string(),
    /** The sender's address, lower-cased. */
    from: v.string(),
    fromName: v.optional(v.string()),
    subject: v.string(),
    text: v.optional(v.string()),
    attachments: v.array(v.object({ name: v.string(), size: v.optional(v.number()) })),
    receivedAt: v.number(),
    /** The account the sender is (a reply: the reply address's owner; support: the account holding the address), when one is. */
    userId: v.optional(v.string()),
    /** A reply: the thread the reply address named. */
    thread: v.optional(v.string()),
    workspaceId: v.optional(v.string()),
    /** The support inbox's thread. */
    threadId: v.optional(v.string()),
    /** The inbox's email id: what a reply answers (support only). */
    inboxEmailId: v.optional(v.string()),
    /** When the app's hook finished with it. */
    handledAt: v.optional(v.number()),
    /** When an administrator answered it from the Inbox tab, and who. */
    repliedAt: v.optional(v.number()),
    repliedBy: v.optional(v.string()),
  })
    .index('emailId_to', ['emailId', 'to'])
    .index('receivedAt', ['receivedAt'])
    .index('userId_receivedAt', ['userId', 'receivedAt'])
    .index('from_receivedAt', ['from', 'receivedAt']),
  replyAddresses: defineTable({
    token: v.string(),
    userId: v.string(),
    thread: v.string(),
    /** When it was made, or last handed out for an email (to the day): maintenance prunes it a year after. */
    createdAt: v.number(),
  })
    .index('token', ['token'])
    .index('userId_thread', ['userId', 'thread'])
    .index('createdAt', ['createdAt']),
}

/** What the person referred gets, as a program names it. */
const vReferredReward = v.union(v.object({ discount: v.string() }), v.object({ trialDays: v.number() }))
/** What the referrer gets, as a program names it. */
const vReferrerReward = v.union(v.object({ pack: v.string() }), v.object({ months: v.number(), plan: v.optional(v.string()) }))
/** A program's terms, kept on each referral as they were when it was claimed: the promise made to the person referred. */
export const vReferralTerms = v.object({
  referred: v.optional(vReferredReward),
  referrer: v.optional(vReferrerReward),
  holdMs: v.number(),
  caps: v.object({ perReferrer: v.union(v.null(), v.number()), perMonth: v.union(v.null(), v.number()) }),
})

/**
 * The referral program (see `referrals.ts`): the share codes, program-wide
 * (an account's and a waitlist entry's are one kind), each referral from
 * its claim to its reward, and the counters the caps read. The program's own
 * options live in the app (`setupReferrals`); each referral keeps the terms
 * it was claimed under.
 */
export const referralTables = {
  referralCodes: defineTable({
    /** The code, 8 characters of the unambiguous alphabet. */
    code: v.string(),
    /** Whose it is: an account's, or a waitlist entry's until that address signs up and the code moves to the account. */
    ownerKind: v.union(v.literal('user'), v.literal('entry')),
    ownerId: v.string(),
    /** Whether share pages carry the code; absent means yes. The owner's choice. */
    sharePages: v.optional(v.boolean()),
    createdAt: v.number(),
  })
    .index('code', ['code'])
    .index('owner', ['ownerKind', 'ownerId']),
  referrals: defineTable({
    code: v.string(),
    referrerId: v.string(),
    referredId: v.string(),
    state: v.union(v.literal('claimed'), v.literal('held'), v.literal('rewarded'), v.literal('voided')),
    terms: vReferralTerms,
    claimedAt: v.number(),
    /** The referred person's first paid order, the billing entity it was paid on, and when. */
    orderId: v.optional(v.string()),
    entityId: v.optional(v.string()),
    paidAt: v.optional(v.number()),
    /** When the hold ends; set with the first payment. */
    holdUntil: v.optional(v.number()),
    /** Why an administrator should look before the reward goes out; the reward waits. */
    flags: v.optional(v.array(v.string())),
    /** An administrator released the flagged reward. */
    released: v.optional(v.boolean()),
    /** A flag waits for an administrator: the admin console's flagged queue. */
    review: v.optional(v.boolean()),
    /** When the sweep takes the reward up: the end of the hold, unless a flag waits for an administrator; later after a grant that failed or has to wait. */
    dueAt: v.optional(v.number()),
    /** The caps were reached at the end of the hold: recorded and counted, no reward. */
    capped: v.optional(v.boolean()),
    /** The hold ended under a program with no referrer reward: recorded and counted, no reward and no slot. */
    unrewarded: v.optional(v.boolean()),
    /** SHA-256 of the referred person's mailbox (plus tags and dots taken out): a mailbox is referred once, an erased account's too. */
    mailbox: v.optional(v.string()),
    /** A slot under the caps is held for it, in this month's count. */
    reservedMonth: v.optional(v.string()),
    /** How far the referrer's reward got, so a grant that stopped half way resumes instead of repeating. */
    grant: v.optional(v.object({ discountId: v.optional(v.string()), endsAt: v.optional(v.number()), done: v.optional(v.boolean()) })),
    rewardedAt: v.optional(v.number()),
    voidedAt: v.optional(v.number()),
    voidedFor: v.optional(v.string()),
  })
    .index('referredId', ['referredId'])
    .index('referrerId_claimedAt', ['referrerId', 'claimedAt'])
    .index('code_claimedAt', ['code', 'claimedAt'])
    .index('state_dueAt', ['state', 'dueAt'])
    .index('review_claimedAt', ['review', 'claimedAt'])
    .index('mailbox', ['mailbox'])
    .index('orderId', ['orderId'])
    .index('claimedAt', ['claimedAt']),
  /**
   * How many rewards a referrer (`referrer:<id>`) and the program in a month
   * (`month:2026-10`) hold, and the program's totals by state
   * (`total:claimed`, `total:flagged`, …), kept on every state change.
   */
  referralCounters: defineTable({
    key: v.string(),
    count: v.number(),
  }).index('key', ['key']),
  /** Each referrer's referrals (voided ones left out) and rewards, kept on every state change: the admin console's top referrers. */
  referralTallies: defineTable({
    referrerId: v.string(),
    referrals: v.number(),
    rewarded: v.number(),
  })
    .index('referrerId', ['referrerId'])
    .index('rewarded_referrals', ['rewarded', 'referrals']),
  /** Where the referral sweep wakes the app: the handle of its `referrals:runReferralSweep`. */
  referralSweep: defineTable({
    wake: v.string(),
    updatedAt: v.number(),
  }),
}

/**
 * The growth funnel and the experiments (see `funnel.ts`). The counts
 * themselves live in the nested `funnelCounts` aggregate, keyed by step,
 * dimension, value and sign-up week, under ids that name no account, so an
 * erasure that deletes the rows here keeps every count.
 * - `funnelPeople`: one row per account the funnel counts: its sign-up
 *   week, how it was attributed (invite, first campaign, referral code,
 *   first promotion, its answer to "How did you hear about us?" and the
 *   free text of an "Other" answer), the steps it reached and the last week
 *   it was active. Deleted with the account.
 * - `funnelValues`: each value a dimension was attributed, with how many
 *   people it was attributed to; the report lists the `FUNNEL_VALUES_MAX`
 *   with the most people and folds the rest into "Everything else".
 * - `experiments`: each experiment the deployment saw run: its variants,
 *   goal and guardrails as the code declared them at its last exposure, and
 *   when it first exposed someone. `experimentKinds` indexes it by the
 *   kinds it counts.
 * - `experimentExposures`: who saw which variant first: the account (or
 *   the workspace, `by: 'workspace'`) and the account that saw it. An
 *   account's erasure deletes its own and drops it from a workspace's.
 */
/** A campaign link's UTM values, as the first-touch claim takes them. */
export const vCampaignTouch = v.object({
  source: v.optional(v.string()),
  medium: v.optional(v.string()),
  campaign: v.optional(v.string()),
  term: v.optional(v.string()),
  content: v.optional(v.string()),
})

/** Where an account stands with "How did you hear about us?", and how it was attributed. */
export const vSourceView = v.object({
  asked: v.boolean(),
  answer: v.union(v.string(), v.null()),
  campaign: v.union(v.string(), v.null()),
})

export const funnelTables = {
  funnelPeople: defineTable({
    userId: v.string(),
    signedUpAt: v.number(),
    /** The sign-up week (Monday 00:00 UTC): every step of the account counts in it. */
    week: v.number(),
    invite: v.optional(v.string()),
    campaign: v.optional(v.string()),
    referral: v.optional(v.string()),
    promotion: v.optional(v.string()),
    answer: v.optional(v.string()),
    /** The free text of an "Other" answer. */
    detail: v.optional(v.string()),
    /** When the account answered or skipped the question: it is never asked again. */
    answeredAt: v.optional(v.number()),
    activatedAt: v.optional(v.number()),
    trialAt: v.optional(v.number()),
    paidAt: v.optional(v.number()),
    /** The last week the account was counted active in. */
    activeWeek: v.optional(v.number()),
  })
    .index('userId', ['userId'])
    // The latest "Other" answers, for the Growth view.
    .index('answer_answeredAt', ['answer', 'answeredAt']),
  funnelValues: defineTable({
    dimension: v.string(),
    value: v.string(),
    /** How many people were attributed to it: the report's rank. Absent on a row from before it was kept. */
    people: v.optional(v.number()),
  })
    .index('dimension_value', ['dimension', 'value'])
    .index('dimension_people', ['dimension', 'people']),
  experiments: defineTable({
    key: v.string(),
    variants: v.array(v.string()),
    by: v.union(v.literal('user'), v.literal('workspace')),
    goal: v.optional(v.string()),
    guardrails: v.array(v.string()),
    startedAt: v.number(),
  }).index('key', ['key']),
  experimentKinds: defineTable({
    kind: v.string(),
    experiment: v.string(),
  })
    .index('kind', ['kind'])
    .index('experiment', ['experiment']),
  experimentExposures: defineTable({
    experiment: v.string(),
    /** The account the variant belongs to, or the workspace for an experiment `by: 'workspace'`. */
    subject: v.string(),
    /** The account that saw it; dropped when that account is erased. */
    userId: v.optional(v.string()),
    variant: v.string(),
    at: v.number(),
  })
    .index('experiment_subject', ['experiment', 'subject'])
    .index('subject', ['subject'])
    .index('userId', ['userId']),
}

/** Auth-only schema — passed to Better Auth's `createApi` in `adapter.ts`. */
export const authSchema = defineSchema(tables)

/** Full component schema: auth + billing cache + AI plumbing + webhook log + email plumbing + maintenance + the audit trail + flags + export and erasure + the contact form and inbound mail + launch access + the waitlist + the referral program + files + the job queue + notifications + email preferences + announcements + lifecycle email + the growth funnel and experiments. */
export default defineSchema({ ...tables, ...billingTables, ...aiTables, ...webhookTables, ...emailTables, ...maintenanceTables, ...auditTables, ...flagTables, ...accountTables, ...consentTables, ...inboundTables, ...accessTables, ...waitlistTables, ...referralTables, ...storageTables, ...jobTables, ...notificationTables, ...preferenceTables, ...announcementTables, ...lifecycleTables, ...monitoringTables, ...reportTables, ...suppressionTables, ...deviceTables, ...funnelTables })
