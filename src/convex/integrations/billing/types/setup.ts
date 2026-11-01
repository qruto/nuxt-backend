import type { WebhookEventHandlers } from '@convex-dev/polar'
import type { Auth, FunctionReference, GenericActionCtx, GenericDataModel } from 'convex/server'
import type { CatalogInterval } from '../../../catalog.js'
import type { CallerRule } from '../../access.js'
import type { ShardedCounter } from '@convex-dev/sharded-counter'
import type { Workpool } from '@convex-dev/workpool'
import type { Email } from '../../email.js'
import type { BillingAudit } from '../activity.js'
import type { WebhookLogRefs } from '../../webhook-guard.js'
import type { ProviderRecordRefs } from '../provider-events.js'
import type { BillingRateLimiter, ProviderComponent, RunQueryCtx, RunWriteCtx } from './base.js'
import type { BillingLifecycle } from './lifecycle.js'
import type { BackendPaths } from '../../../paths.js'
import type {
  BillingCatalogIds,
  CachedEntitlements,
  CreditMeterConfig,
  EntitlementBenefit,
  EntitlementMeter,
  GiftRecord,
  GiftTask,
} from './records.js'

/** A save offer's terms as the component keeps them (LIFECYCLE). */
export interface SaveOfferTerms {
  kind: 'pause' | 'downgrade' | 'discount'
  months?: number
  resumesAt?: number
  plan?: string
  productId?: string
  discount?: string
}

// What `setupBilling` takes: the component handles and the configuration.

/**
 * Per-event billing webhook handlers, keyed by the provider's event names
 * (`'order.paid'`, `'subscription.active'`, …). Service-neutral alias for the
 * shape `registerBackendRoutes` mounts at `/billing/events`.
 */
export type BillingWebhookEventHandlers = WebhookEventHandlers

/**
 * The component handles `setupBilling` reads from your generated `components`
 * object. Pass the whole object — each key is picked structurally:
 *
 * - `polar` — the upstream billing-provider component (checkout / portal /
 *   webhooks / customer mapping).
 * - `backend` — the package's all-in-one component: `billing` is the reactive
 *   entitlement cache, `gifts` the gift-purchase records, `email` (optional)
 *   delivers gift notifications, and `adapter` reads the workspace members
 *   and the roles every call is checked against, fresh.
 * - `shardedCounter` — the counter component the scaffold mounts: it counts
 *   what each billing entity holds of a quota (`billing.requireQuota`).
 * - `workpool` — the queue the scaffold mounts: the free plan starts for
 *   each new billing entity through it, a few provider requests at a time.
 */
export interface BillingComponents {
  polar: ProviderComponent
  /**
   * The workpool component the scaffold mounts. The free plan is started
   * through it, so a wave of sign-ups queues its provider requests and
   * retries a refused one; without it, through the scheduler.
   */
  workpool?: ConstructorParameters<typeof Workpool>[0]
  /**
   * The sharded counter component the scaffold mounts: it keeps how many of
   * each plan quota a billing entity holds (`billing.requireQuota` and
   * `releaseQuota`). Without it, `getQuota` and `getFeatures` read every
   * quota as nothing used, and counting one throws, naming the mount.
   *
   * @experimental
   */
  shardedCounter?: ConstructorParameters<typeof ShardedCounter>[0]
  backend: {
    /**
     * The auth tables' adapter: a member's role and an account's role are
     * read through `findOne`; the free plan's backfill pages the workspaces
     * (or the users) through `findMany`.
     */
    adapter: { findOne: unknown, findMany?: unknown }
    // Component functions always surface to the parent app as `internal`
    // references in the generated `ComponentApi`, regardless of how they are
    // registered inside the component.
    billing: {
      getByUser: FunctionReference<'query', 'internal', { userId: string }, CachedEntitlements | null>
      upsert: FunctionReference<'mutation', 'internal', {
        userId: string
        customerId?: string
        activeProductIds: string[]
        benefits: EntitlementBenefit[]
        meters: EntitlementMeter[]
      }, null>
      userByCustomer: FunctionReference<'query', 'internal', { customerId: string }, string | null>
      /** Who stands behind a workspace entity: its name, whether it is personal, its owner and the workspaces that owner owns; `null` for anything else. */
      entityProfile: FunctionReference<'query', 'internal', { entityId: string }, EntityProfile | null>
      /** Hold the owner's one trial for this entity's checkout, or say no when it is spent or held for another entity. */
      claimTrial: FunctionReference<'mutation', 'internal', { ownerUserId: string, entityId: string, holdMs: number }, boolean>
      /** Record that a subscription of this entity started its owner's trial. */
      markTrialUsed: FunctionReference<'mutation', 'internal', { ownerUserId: string, entityId: string }, null>
      /**
       * Count one discount-code attempt for an entity before the provider is
       * asked, in a fixed window of at most `max`: the window's start, or the
       * wait once `max` are counted.
       */
      reserveDiscountCode: FunctionReference<'mutation', 'internal', { userId: string, max: number, windowMs: number }, { reserved: true, windowStart: number } | { reserved: false, retryAfter: number }>
      /** Give back an attempt `reserveDiscountCode` counted, in the window it was counted in. */
      releaseDiscountCode: FunctionReference<'mutation', 'internal', { userId: string, windowStart: number }, null>
      debit: FunctionReference<'mutation', 'internal', {
        userId: string
        meterId: string
        amount: number
        externalId: string
        allowOverage?: boolean
      }, { ok: boolean, balance: number, reason?: 'no-row' | 'no-meter' | 'insufficient' }>
      settle: FunctionReference<'mutation', 'internal', { userId: string, externalId: string, finalAmount?: number }, null>
      /** {@link settle}, reporting whether a reservation was still there to close. */
      finalize: FunctionReference<'mutation', 'internal', { userId: string, externalId: string, finalAmount?: number }, { settled: boolean, released: number, balance: number, balanceBefore: number, releaseJobId?: string }>
      release: FunctionReference<'mutation', 'internal', { userId: string, externalId: string }, null>
      credit: FunctionReference<'mutation', 'internal', { userId: string, meterId: string, amount: number }, null>
      /**
       * Drop every in-flight spend reservation for one entity, without
       * re-crediting: used after a refund, where the provider's balance is
       * already the truth and re-subtracting local reservations would push the
       * cache below it.
       */
      clearPendingSpends: FunctionReference<'mutation', 'internal', { userId: string }, null>
      /** Delete one entity's entitlement cache row (account erasure). */
      deleteByUser: FunctionReference<'mutation', 'internal', { userId: string }, null>
      /** Note that an entity counts a plan quota, once per entity and key. */
      recordQuotaKey: FunctionReference<'mutation', 'internal', { userId: string, key: string }, null>
      /** Every plan quota an entity has counted, by key. */
      quotaKeys: FunctionReference<'query', 'internal', { userId: string }, string[]>
      getBenefitMetadata: FunctionReference<'query', 'internal', { benefitIds: string[] }, Array<{
        benefitId: string
        metadata: Record<string, string | number | boolean>
        /** The benefit's name at the provider, once it was read. */
        description?: string
        updatedAt: number
      }>>
      upsertBenefitMetadata: FunctionReference<'mutation', 'internal', {
        entries: Array<{ benefitId: string, metadata: Record<string, string | number | boolean>, description?: string }>
      }, null>
      /** Record a subscription's scheduled plan change and resume date (epoch ms), unless a newer state is stored. */
      recordSubscriptionChange: FunctionReference<'mutation', 'internal', {
        subscriptionId: string
        userId: string
        pendingChange: { productId: string, appliesAt: number } | null
        resumesAt: number | null
        modifiedAt: number
      }, null>
      /** The recorded plan changes and resume dates (epoch ms) of these subscriptions, with the provider time each was recorded at. */
      subscriptionChanges: FunctionReference<'query', 'internal', { subscriptionIds: string[] }, Array<{
        subscriptionId: string
        pendingChange: { productId: string, appliesAt: number } | null
        resumesAt: number | null
        modifiedAt: number
      }>>
    }
    /** The referral program (REF): what the first paid checkout and the order webhooks ask of it. Absent from a component built before it. */
    referrals?: {
      offerFor: FunctionReference<'query', 'internal', { userId: string }, { id: string, discount?: string, trialDays?: number } | null>
      orderPaid: FunctionReference<'mutation', 'internal', { ownerId: string, entityId: string, orderId: string }, { id: string, holdUntil: number } | null>
      orderRefunded: FunctionReference<'mutation', 'internal', { orderId: string }, string | null>
    }
    gifts: {
      create: FunctionReference<'mutation', 'internal', {
        recipientEmail: string
        purchaserUserId: string
        purchaserEntityId?: string
        purchaserName?: string
        pack?: string
        plan?: string
        months?: number
        deliverAt?: number
        productIds: string[]
        giftProductId?: string
        message?: string
      }, string>
      markPaid: FunctionReference<'mutation', 'internal', { giftId: string, billingOrderId?: string, amount?: number, currency?: string }, null>
      setDiscount: FunctionReference<'mutation', 'internal', { giftId: string, discountId: string }, boolean>
      markNotified: FunctionReference<'mutation', 'internal', { giftId: string }, boolean>
      startClaim: FunctionReference<'mutation', 'internal', { giftId: string, userId: string, entityId: string }, boolean>
      reservePass: FunctionReference<'mutation', 'internal', { giftId: string, userId: string, entityId: string, until: number }, 'reserved' | 'busy' | 'taken' | 'closed'>
      releasePass: FunctionReference<'mutation', 'internal', { giftId: string, userId: string, entityId: string, until: number }, null>
      beginCancel: FunctionReference<'mutation', 'internal', { giftId: string, until: number }, boolean>
      endCancel: FunctionReference<'mutation', 'internal', { giftId: string }, null>
      markClaimed: FunctionReference<'mutation', 'internal', { giftId: string, userId: string, entityId: string, claimOrderId?: string }, null>
      markRefunded: FunctionReference<'mutation', 'internal', { giftId: string }, boolean>
      listByEmail: FunctionReference<'query', 'internal', { email: string, status?: 'paid' | 'claimed' }, GiftRecord[]>
      countBought: FunctionReference<'query', 'internal', { purchaserUserId: string, since: number, pendingSince: number, excludeGiftId?: string }, { count: number, oldest: number | null }>
      get: FunctionReference<'query', 'internal', { giftId: string }, GiftRecord | null>
      personalEntity: FunctionReference<'query', 'internal', { userId: string }, string | null>
      listByPurchaser: FunctionReference<'query', 'internal', { purchaserUserId: string }, GiftRecord[]>
      countToAddress: FunctionReference<'query', 'internal', { email: string, since: number, pendingSince: number, excludeGiftId?: string }, number>
      markDelivered: FunctionReference<'mutation', 'internal', { giftId: string }, boolean>
      noteNotice: FunctionReference<'mutation', 'internal', { giftId: string, reminder?: boolean }, null>
      setRecipient: FunctionReference<'mutation', 'internal', { giftId: string, recipientEmail: string }, boolean>
      setDeliverAt: FunctionReference<'mutation', 'internal', { giftId: string, deliverAt: number }, boolean>
      startPass: FunctionReference<'mutation', 'internal', { giftId: string, userId: string, entityId: string, until: number, subscriptionId: string, endsAt: number, returnFrom: number }, boolean>
      notePass: FunctionReference<'mutation', 'internal', { giftId: string, step: 'return_scheduled' | 'noticed' | 'ended' }, boolean>
      activePass: FunctionReference<'query', 'internal', { entityId: string }, { id: string, plan: string, months?: number, startedAt: number, endsAt: number, subscriptionId?: string, trial?: true, rewardId?: string } | null>
      startTrialPass: FunctionReference<'mutation', 'internal', { address: string, userId: string, entityId: string, plan: string, productId: string, subscriptionId: string, endsAt: number, returnFrom: number }, boolean>
      startRewardPass: FunctionReference<'mutation', 'internal', { rewardId: string, userId: string, entityId: string, plan: string, months: number, productId: string, subscriptionId: string, endsAt: number, returnFrom: number }, boolean>
      trialPassTaken: FunctionReference<'query', 'internal', { address: string }, boolean>
      due: FunctionReference<'query', 'internal', { now: number, limit?: number }, { tasks: GiftTask[], more: boolean }>
      registerSweep: FunctionReference<'mutation', 'internal', { wake: string }, null>
    }
    webhooks: WebhookLogRefs
    /** The billing lifecycle's records (LIFECYCLE): save offers, consent proofs, once-marks and withdrawals. */
    subscriptions: {
      recordOffer: FunctionReference<'mutation', 'internal', { entityId: string, subscriptionId: string, reason: string, offer: SaveOfferTerms, since: number }, string | null>
      lastOffer: FunctionReference<'query', 'internal', { entityId: string, since: number }, number | null>
      takeOffer: FunctionReference<'mutation', 'internal', { offerId: string, entityId: string }, { id: string, entityId: string, subscriptionId: string, reason: string, offer: SaveOfferTerms, madeAt: number, acceptedAt?: number } | null>
      releaseOffer: FunctionReference<'mutation', 'internal', { offerId: string }, null>
      /** The save offers made in a window, and how many were accepted: the Revenue view's count (analytics). */
      offerCounts: FunctionReference<'query', 'internal', { since: number, until: number }, { made: number, accepted: number, truncated: boolean }>
      recordConsent: FunctionReference<'mutation', 'internal', { checkoutId: string, entityId: string, userId?: string, productId: string, amount: number, currency: string, interval: string, intervalCount: number, termsVersion?: string }, null>
      confirmConsent: FunctionReference<'mutation', 'internal', { checkoutId: string, subscriptionId: string, at: number }, boolean>
      purchasedAt: FunctionReference<'query', 'internal', { subscriptionId: string }, number | null>
      markOnce: FunctionReference<'mutation', 'internal', { key: string, every?: number }, boolean>
      recordWithdrawal: FunctionReference<'mutation', 'internal', { entityId: string, subscriptionId: string, userId: string, productId: string, at: number }, boolean>
      withdrawalOf: FunctionReference<'query', 'internal', { subscriptionId: string }, { at: number, userId: string } | null>
      lifecycleConsole: FunctionReference<'query', 'internal', { entityId?: string }, {
        saveOffers: Array<{ id: string, entityId: string, subscriptionId: string, reason: string, offer: SaveOfferTerms, madeAt: number, acceptedAt?: number }>
        withdrawals: Array<{ entityId: string, subscriptionId: string, userId: string, productId: string, at: number }>
        consents: Array<{ entityId: string, subscriptionId?: string, productId: string, amount: number, currency: string, interval: string, intervalCount: number, termsVersion?: string, userId?: string, consentedAt: number }>
      }>
    }
    /** The consent ledger: the terms version a renewal's consent proof names. */
    consents: {
      latest: FunctionReference<'query', 'internal', { userId: string, kind: string }, { kind: string, version: string, granted: boolean, at: number } | null>
    }
    /**
     * What the storage module counts by billing quota key (a holder's files
     * and bytes): a quota read adds it to the count the app claims itself,
     * so a quota shows one number. Absent on a component built before it.
     */
    storage?: {
      quotaUsage: FunctionReference<'query', 'internal', { holder: string }, Record<string, number>>
    }
    /**
     * Export and erasure: a billing entity an account's erasure is
     * deleting starts no free plan again. Absent on a component built
     * before it.
     */
    account?: {
      isDeleting: FunctionReference<'query', 'internal', { entityId: string }, boolean>
    }
  }
}

/**
 * A workspace entity as its provider customer needs it: the team customer is
 * named after the workspace and owned by its owner, a personal workspace may
 * adopt its owner's earlier customer, and one trial counts across every
 * workspace the owner owns.
 */
export interface EntityProfile {
  name: string
  personal: boolean
  owner: { userId: string, email: string, name: string, emailVerified: boolean } | null
  ownedEntityIds: string[]
}

/** The provider component's own customer-mapping and record functions (structural). */
export interface ProviderLibRefs {
  lib: ProviderRecordRefs & {
    insertCustomer: FunctionReference<'mutation', 'internal', { id: string, userId: string, metadata?: Record<string, unknown> }, unknown>
  }
}

/** What billing sends its email through: the app's `setupEmail` instance. */
export type BillingEmail = Pick<Email, 'sendTemplate'> & {
  /** The soft opt-in a paid checkout joins its customer to (`setupEmail({ topics: { <key>: { softOptIn: true } } })`). */
  preferences?: Pick<Email['preferences'], 'softOptIn' | 'topics'>
}

/**
 * Who a billing operation runs for: the entity that owns the subscription and
 * the credits — a workspace, or a user with `billTo: 'user'` — and the email
 * the provider customer is created with. `userId` is the entity's id either
 * way.
 */
export interface BillingEntity {
  userId: string
  email: string
}

/**
 * Who a billing call is for, as each of the package's own functions names
 * it, and as `billing.requireEntity` takes it from your own:
 *
 * - `access: 'member'` — any member of the workspace that pays: reading
 *   the plan, the features, the credits and the usage, and spending credits;
 * - `access: 'manage'` — its owner or an admin, the billing managers:
 *   checkout, the portal, the plan's lifecycle, orders and invoices.
 *
 * Membership and the workspace role are read fresh from the member table
 * once per call, and so is the account (a banned one is refused).
 * `impersonation: 'refused'` (see {@link CallerRule}) also refuses a
 * session an administrator opened as the caller.
 */
export interface BillingAccessRule extends CallerRule {
  access: 'member' | 'manage'
  /**
   * Read the member table and the account again even when this call
   * already did: after the same call changed the caller's membership or role.
   */
  reread?: boolean
}

/**
 * The context {@link SetupBillingConfig.resolveEntity} receives: the caller's
 * auth, and `runQuery` to read the app's own tables. Queries, mutations and
 * actions all provide both, so one resolver serves the reactive reads and the
 * provider calls alike. `auth` is always there; an internal call with no
 * caller has a `null` identity.
 */
export interface BillingEntityCtx {
  auth: Auth
  runQuery: RunQueryCtx['runQuery']
}

/**
 * Billing configuration: every option `setupBilling` reads, and nothing else.
 * The access token and webhook secret default to the
 * `BILLING_ACCESS_TOKEN` / `BILLING_WEBHOOK_SECRET` env vars, and the
 * provider environment follows `BACKEND_ENVIRONMENT` (the provider's
 * production on `production`, its sandbox everywhere else), so `setupBilling(components, { email })` needs no env plumbing.
 *
 * The billing entity resolves from identity claims out of the box — the
 * active workspace (`billTo: 'workspace'`, the default) or the signed-in
 * user (`billTo: 'user'`) — so {@link SetupBillingConfig.resolveEntity} is an
 * override, not required wiring.
 */
export interface SetupBillingConfig {
  /**
   * The app's `setupEmail` instance. A gift's recipient hears of it through
   * its `gift` template once the purchase is paid; restyle it there, with
   * `setupEmail(components, { templates: { gift } })`. Checked when
   * `setupBilling` runs: an import cycle through `email.ts` can hand it over
   * as `undefined` despite the type, and that fails the deploy instead of the
   * first paid gift.
   */
  email: BillingEmail
  /**
   * The app's `setupAudit` instance (`backend/audit.ts`): billing records
   * its events through it — a checkout opened, the plan changed, a webhook's
   * subscription, order, refund and benefit, a gift, a credit balance at its
   * mark — so they reach its `onEvent` too. Without it they are recorded on
   * the component's own trail. A free plan's own events record nothing.
   */
  audit?: BillingAudit
  /**
   * The app's paths, from the `paths.generated.ts` the Nuxt module writes
   * from nuxt.config: the plan-pass and renewal emails link billing managers
   * to `{SITE_URL}{paths.settings}` (`pages.settings`, `/settings` by default).
   */
  paths?: Partial<BackendPaths>
  /** Provider access token. Defaults to the required `BILLING_ACCESS_TOKEN` env var. */
  accessToken?: string
  /** Webhook signature secret. Defaults to the required `BILLING_WEBHOOK_SECRET` env var. */
  webhookSecret?: string
  /**
   * Friendly product keys → provider product ids (`{ pro: '…' }`), so a
   * current subscription reads with its `productKey`. Usually supplied via
   * `catalog`; an explicit map wins.
   */
  products?: Record<string, string>
  /**
   * Origins, besides `SITE_URL`'s, a checkout, a gift checkout or the
   * customer portal may send the buyer back to (`['https://app.example.com']`)
   * — a second domain the app is served from, say. Every other return or
   * embed URL is refused as `invalid_input`. On a
   * `development` `BACKEND_ENVIRONMENT` local origins are
   * trusted too: loopback on any port, and `.localhost` names over https.
   */
  trustedOrigins?: string[]
  /**
   * Who owns subscriptions and credits: the active workspace (`'workspace'`,
   * the default — members share the workspace's plan and credits) or the
   * individual user (`'user'`, for B2C apps without shared billing). With
   * `'workspace'` the entity is a workspace, and every call checks the
   * caller's membership and role in it, read fresh from the member table:
   * members read and spend, its owner and admins also buy and manage (see
   * {@link BillingAccessRule}). With `'user'` the caller manages their own
   * billing, or whatever entity your `resolveEntity` returns for them.
   */
  billTo?: 'workspace' | 'user'
  /**
   * Resolve the billing entity yourself, in place of the identity claims
   * `billTo` reads. One resolver for every context: the reactive reads
   * (`getCurrentSubscription`, `getFeatures`, `getCredits`), checkout and
   * the portal, spends and the subscription lifecycle. It is called with
   * every context, signed in or not, so it must return `null` when
   * `ctx.auth.getUserIdentity()` does: reads then answer `null`, and
   * provider operations refuse. With `billTo: 'workspace'` what it
   * returns must be a workspace the caller belongs to: every billing call,
   * the gifts included, reads their membership and role in it fresh; an
   * entity of your own (a team in your own tables) goes with
   * `billTo: 'user'`, where your resolver is the check. When a call checks its caller it hands the resolver its
   * {@link BillingAccessRule} too: refuse a caller who may not have that
   * access by throwing a refusal (`backendError('forbidden', { reason:
   * 'not_billing_manager' })`), which the reads answer as `null`, or by
   * returning `null`. Treat a missing rule as the strictest case: refuse
   * anything but `access: 'member'` to a caller who may only read.
   * `billing.resolveEntity`, which checks nobody, passes none.
   *
   * @guarantee
   * - Runs: in every billing function's ctx: a query, a mutation or an action
   * - Delivery: on every billing call, the reads included
   * - Order: before the call reads or writes anything
   * - When it throws: a refusal it throws answers the reads with `null` and refuses the rest
   * - Idempotency: a read only; return `null` when there is no identity
   */
  resolveEntity?: (ctx: BillingEntityCtx, rule?: BillingAccessRule) => Promise<BillingEntity | null>
  /**
   * Throttle every client-callable function that reaches the live provider —
   * `syncEntitlements`, `syncProducts`, checkout, the subscription-lifecycle
   * actions, order history and invoices. Pass your `setupRateLimiter(...)`
   * limiter and each authenticated call is checked against the `billingSync`
   * limit (10/min, keyed by the workspace/user), so a caller can't loop one to
   * amplify the provider fan-out. `giftCheckout` burns the same limit keyed by
   * the purchaser. Omit to leave them unthrottled.
   */
  rateLimiter?: BillingRateLimiter
  /**
   * Let one billing entity hold several live subscriptions at once (a plan
   * plus add-ons, say). The upstream single-subscription read throws the
   * moment a second one exists, so this switches `getCurrentSubscription` to
   * the subscriptions-array-first shape ({@link CurrentSubscriptions}) and
   * makes `subscriptionId` the way lifecycle actions pick their target.
   */
  multipleSubscriptions?: boolean
  /**
   * Gate the admin-tier billing functions (`refundOrder` — moving real
   * money — and the webhook delivery log). Throw from here to refuse. The
   * default requires the `admin` role on the account, read fresh from the
   * user table (the admin plugin's role), so a demoted admin is refused on
   * their next call; supply your own to check permissions, a workspace
   * role, or an allowlist. `refundOrder` refuses an impersonated session
   * before either gate runs.
   *
   * @guarantee
   * - Runs: in the admin-tier function's ctx (`refundOrder`, the webhook log)
   * - Delivery: on every admin-tier call
   * - Order: after the impersonation refusal, before the call
   * - When it throws: the call is refused
   * - Idempotency: a read only
   */
  requireAdmin?: (ctx: { auth?: Auth }) => Promise<void>
  /**
   * React to billing webhook events, keyed by the provider's own event names
   * (`'order.paid'`, `'subscription.active'`, …). Your handler runs **after**
   * the built-in entitlement-cache refresh (and gift fulfilment), so
   * features/credits read fresh inside it. Events outside the built-in refresh
   * set are mounted too.
   *
   * @guarantee
   * - Runs: in the webhook's HTTP action, after the built-in entitlement refresh and gift fulfilment
   * - Delivery: at least once: a delivery already processed answers 200 without running it again, but one that threw is redelivered
   * - Order: as the provider delivers: no order across events
   * - When it throws: logged as `handler_error`, answered 500, and the provider retries
   * - Idempotency: key what it writes on the event's id
   */
  events?: Partial<BillingWebhookEventHandlers>
  /**
   * Decide who may receive a gift, before `giftCheckout` opens the
   * purchaser's checkout — only addresses on your own domain, say, or only
   * sandbox addresses on a public demo. It adds to the package's own rules,
   * which always hold: no gift to the purchaser's own address, an earlier
   * paid order of the purchaser's first, and {@link SetupBillingConfig.giftLimit}.
   * Return `true` to allow, or a refusal whose `message` `giftCheckout`
   * throws as a `ConvexError`, so it reaches the purchaser even where
   * production redacts other errors (default: "This address can't receive
   * gifts."). Called with the action ctx, so it can read your own tables;
   * `recipientEmail` is lower-cased, and `purchaserEntityId` is the billing
   * entity that pays.
   *
   * @guarantee
   * - Runs: in `giftCheckout`'s action ctx, after the package's own gift rules
   * - Delivery: once per gift checkout
   * - Order: before the purchaser's checkout opens
   * - When it throws: the error fails the gift checkout; return a refusal instead, whose message reaches the purchaser as `forbidden`, reason `gift_refused`
   * - Idempotency: a read only
   */
  canGift?: (
    ctx: GenericActionCtx<GenericDataModel>,
    input: { recipientEmail: string, purchaserUserId: string, purchaserEntityId: string },
  ) => Promise<true | { allowed: false, message?: string }> | true | { allowed: false, message?: string }
  /**
   * How many gifts one purchaser may buy in a window: `max` paid gifts in
   * `days` days (default 10 in 30). A stolen card that can buy gifts for
   * strangers is a way to cash it out, and a claimed gift can't be taken
   * back, so the cap holds whatever rate limiter the app passes. A further
   * purchase is `rate_limited` (`limit: 'gifts'`).
   */
  giftLimit?: { max?: number, days?: number }
  /**
   * Pick a server-side discount for a plan's checkout: the key of a
   * catalog discount, or `null` for none. It runs on every checkout of a
   * catalog plan that names no discount of its own (no `discount`,
   * `discountCode` or `discountId`), from `<PricingTable>`,
   * `useBilling().checkout` and `billing.checkout` alike: the place to give
   * a cohort its price, such as founder pricing for accounts made before a
   * launch. It decides who qualifies; the provider still checks the
   * discount's dates, caps and per-customer limit, and one it no longer
   * redeems (ended, used up) is dropped: the checkout opens again without
   * it, at the regular price. A discount that applies to none of the
   * checkout's products is never sent. A key the catalog does not have
   * throws, naming it. `userId` is the person checking out, `entityId` the
   * billing entity that pays (the workspace, with `billTo: 'workspace'`).
   *
   * @guarantee
   * - Runs: in the checkout's action ctx, after the caller and every input are checked
   * - Delivery: once per checkout of a catalog plan that names no discount of its own
   * - Order: before the provider checkout is created
   * - When it throws: the checkout fails with the error
   * - Idempotency: a read only
   */
  checkoutDiscount?: (
    ctx: GenericActionCtx<GenericDataModel>,
    input: { userId: string, entityId: string, plan: string, interval: CatalogInterval, productId: string },
  ) => Promise<string | null | undefined> | string | null | undefined
  /**
   * Named credit meters: spend by friendly name (`spendCredits({ meter:
   * 'credits' })`, `useCredits({ meter: 'credits' })`) instead of provider
   * meter ids.
   * Usually supplied via `catalog`; explicit entries here win.
   */
  credits?: Record<string, CreditMeterConfig>
  /**
   * The environment-keyed id map generated by `nuxt-backend billing sync`
   * (`backend/billing.generated.ts`): fills `products` and `credits` for the
   * deployment's billing environment, so provider UUIDs live in exactly one
   * generated file. Explicit `products`/`credits` config wins.
   */
  catalog?: Partial<Record<'sandbox' | 'production', BillingCatalogIds | undefined>>
  /**
   * The billing lifecycle beyond the provider's own (LIFECYCLE): save offers
   * by cancellation reason for the cancel flow, the abandoned-checkout
   * hand-off, the annual renewal reminder for short cycles, and the EU
   * withdrawal button. Each is off until named.
   *
   * @example
   * ```ts
   * setupBilling(components, {
   *   catalog,
   *   email,
   *   lifecycle: {
   *     saveOffers: { too_expensive: { discount: 'stay30' }, unused: { pause: { months: 2 } } },
   *     abandonedCheckout: true,
   *     renewalReminders: true,
   *     withdrawal: true,
   *   },
   * })
   * ```
   */
  lifecycle?: BillingLifecycle
  /**
   * Called for an **authentic** (signature-verified) webhook event whose type
   * this package's provider SDK cannot parse — e.g. an event newer than the
   * installed package. The delivery is acknowledged with 202 when it returns,
   * so an unknown type never puts the endpoint into a retry loop; a throw
   * answers 500, and the provider redelivers.
   *
   * @guarantee
   * - Runs: in the webhook's HTTP action, for a verified event of a type this package does not know
   * - Delivery: at least once: answered 202 when it returns, and redelivered when it throws
   * - Order: as the provider delivers: no order across events
   * - When it throws: logged as `handler_error`, answered 500, and the provider retries
   * - Idempotency: key what it writes on the event's id
   */
  onUnknownEvent?: (ctx: RunWriteCtx, event: { type?: string, payload: unknown }) => Promise<void>
}
