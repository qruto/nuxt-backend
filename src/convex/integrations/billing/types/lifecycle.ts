import type { CancellationReason } from './base.js'

/**
 * The one offer the cancel flow makes for a cancellation reason: a pause of
 * 1 to 3 months at the period's end, a switch to a cheaper plan of the
 * catalog at the period's end (its key), or a discount of the catalog
 * without a `code` (its key), put on the subscription by the server.
 */
export type SaveOfferRule
  = | { pause: { months: 1 | 2 | 3 } }
    | { downgrade: string }
    | { discount: string }

/**
 * `setupBilling({ lifecycle })`: what the package does around a
 * subscription's life beyond the provider's own (LIFECYCLE).
 */
export interface BillingLifecycle {
  /**
   * Save offers by cancellation reason: cancelling stays one step, and a
   * reason with an entry gets one optional step first, its offer. None in
   * the withdrawal period, on a past-due plan or a trial, and one per
   * billing entity in 12 months.
   */
  saveOffers?: Partial<Record<CancellationReason, SaveOfferRule>>
  /** Record `billing.checkout_abandoned` once per checkout that expired unpaid, which the `checkoutAbandoned` lifecycle email starts from. */
  abandonedCheckout?: boolean
  /**
   * Email the billing managers a yearly reminder of a renewing
   * subscription's terms, as California's automatic renewal law asks, on
   * cycles the provider's own reminder does not cover (under six months).
   */
  renewalReminders?: boolean
  /**
   * The EU withdrawal button (Art. 11a of the Consumer Rights Directive):
   * `getWithdrawal` and `withdraw`, which `<WithdrawalButton>` calls, and
   * the `withdrawalReceipt` email. For where the provider does not offer it.
   */
  withdrawal?: boolean
}

/**
 * The save offer `cancel` answered with, its real terms included: what the
 * cancel flow shows before "Cancel my plan".
 */
export type SaveOffer
  = | {
    /** The offer's id: `acceptOffer` names it, and the server finds what it made by it. */
    id: string
    reason: CancellationReason
    kind: 'pause'
    /** How long the plan pauses. */
    months: number
    /** When it resumes by itself, epoch ms: the period's end plus `months`. */
    resumesAt: number
    /** The current plan's catalog key, `null` for a product the catalog does not name. */
    plan: string | null
  }
  | {
    id: string
    reason: CancellationReason
    kind: 'downgrade'
    /** The cheaper plan's catalog key. */
    plan: string
    /** When the switch applies, epoch ms: the current period's end. */
    appliesAt: number | null
  }
  | {
    id: string
    reason: CancellationReason
    kind: 'discount'
    /** The catalog discount's key. */
    discount: string
    /** Its name, as the checkout shows it. */
    name: string
    percentOff?: number
    /** A fixed amount off per currency, in the currency's smallest unit. */
    amountOff?: Record<string, number>
    duration: 'once' | 'forever' | 'repeating'
    /** The months a `repeating` discount lasts. */
    months?: number
  }

/** What `cancelSubscription` answers: the save offer for the reason, or the cancellation and when the plan ends (epoch ms). */
export type CancelOutcome = { offer: SaveOffer } | { canceled: true, endsAt: number | null }

/** A purchase and its withdrawal period, as `getWithdrawal` reads it: what `<WithdrawalButton>` shows until `endsAt`. */
export interface WithdrawalPeriod {
  subscriptionId: string
  /** The plan's catalog key, `null` for a product the catalog does not name. */
  plan: string | null
  /** When the plan was bought, epoch ms: its checkout's confirmed renewal consent, else the subscription's start. */
  startedAt: number
  /** When the withdrawal period ends, epoch ms: 14 days after the purchase. The period is open until then. */
  endsAt: number
}

/**
 * The billing lifecycle's records as the admin console's Billing tab
 * reads them (`getBillingConsole`), newest first, the latest 50 of each.
 * Each names the billing entity: a workspace's id, or an account's with
 * `billTo: 'user'`.
 */
export interface BillingConsole {
  /** The save offers the cancel flow made: for which reason, what, and whether it was taken. */
  saveOffers: Array<{
    id: string
    entityId: string
    subscriptionId: string
    /** The cancellation reason the person gave. */
    reason: string
    kind: 'pause' | 'downgrade' | 'discount'
    /** The months of a pause. */
    months: number | null
    /** The plan a downgrade moves to, by its catalog key. */
    plan: string | null
    /** The catalog discount a win-back applies, by its key. */
    discount: string | null
    madeAt: number
    /** When the person took it; `null` when they cancelled past it or left. */
    acceptedAt: number | null
  }>
  /** The EU withdrawals: who withdrew from which plan, and when. */
  withdrawals: Array<{ entityId: string, subscriptionId: string, userId: string, plan: string, at: number }>
  /** The confirmed renewal consent proofs: what the checkout showed (the plan, the price and its interval, the terms version), who agreed and when. */
  consents: Array<{
    entityId: string
    subscriptionId: string | null
    userId: string | null
    plan: string
    /** In the currency's smallest unit. */
    amount: number
    currency: string
    interval: string
    intervalCount: number
    termsVersion: string | null
    consentedAt: number
  }>
}
