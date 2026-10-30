import { inject, provide, type ComputedRef, type InjectionKey } from 'vue'
import type { UseBillingReturn } from '../../composables/use-billing'
import type { UseCreditsReturn } from '../../composables/use-credits'
import type { UseLabelsReturn } from '../../composables/use-labels'
import type { PricedCredits, PricedOffer, PricedPack, PricedPlan, PricedPlanPrice, PricedPromotion, PricedTrial, PricingInterval, UsePricingReturn } from '../../composables/use-pricing'
import type { CancelConfirm } from '../../utils/cancel-confirm'
import type { CreditPack, PricingContact, PricingPlan } from '../../../config'

/** A free trial the live product offers, as the provider configured it. */
export type PlanTrial = PricedTrial

/** A plan card: the app's copy for it joined with its live pricing, at the interval shown. */
export interface ResolvedPlan extends PricingPlan {
  /** The plan as `getPricing` reads it, every interval included. */
  offer: PricedPlan
  /** Its name at the provider. */
  name: string
  /** The interval the card shows: the one chosen, or the plan's own when it has no price at that one. */
  interval: PricingInterval
  /** The price at {@link ResolvedPlan.interval}. */
  priceAt: PricedPlanPrice
  /** That price, formatted in the reader's locale. */
  price: string
  /** What the plan grants every cycle at that interval, from its live credit benefit. */
  credits?: PricedCredits
  /** How many percent the yearly price saves against twelve monthly ones; on a yearly card only. */
  savings?: number
  /** The product's free trial, when it has one (live, not catalog copy). */
  trial?: PlanTrial
  /** The plan is the subscription's, at any interval. */
  isCurrent: boolean
  /** The subscription is this very price: this plan, at this interval. */
  isCurrentPrice: boolean
  /** When a plan change scheduled for the period's end moves the subscription to this price; absent without one. */
  scheduledFor?: Date
  /** Retired: sold to nobody new, shown only to its subscribers. */
  isRetired: boolean
  /** The free plan: every workspace is on it until it buys a plan, and back on it when that ends. Never checked out. */
  isFree: boolean
  /** The plan the address names (`/pricing?plan=<key>`), as `<UpgradePrompt>` links to it. */
  isRequested: boolean
  /** The running promotion's offer on this price: what a payment costs with it. */
  promotion?: PricedOffer
  /** Costs more per month than the current subscription (only meaningful when subscribed). */
  isUpgrade: boolean
  /** Costs less per month than the current subscription (only meaningful when subscribed). */
  isDowngrade: boolean
}

/** A credit pack card: the app's copy for it joined with its live pricing. */
export interface ResolvedPack extends CreditPack {
  /** The pack as `getPricing` reads it. */
  offer: PricedPack
  name: string
  /** Its price, formatted. */
  price: string
  /** The credits it grants, from its live benefit. */
  credits?: number
  /** One credit's price, formatted, when the pack is compared. */
  perCredit?: string
  /** How many percent less per credit than the costliest pack on its meter. */
  lessPerCredit?: number
  /** The one pack whose credits cost least. */
  isBestValue: boolean
  /** The running promotion's offer on this pack. */
  promotion?: PricedOffer
}

export interface PricingSlotContext {
  billing: UseBillingReturn
  credits: UseCreditsReturn
  /** The live pricing the cards are built from. */
  pricing: UsePricingReturn
  plans: ResolvedPlan[]
  packs: ResolvedPack[]
  currentPlan: ResolvedPlan | null
  /** The contact card's content, or `null` for none. */
  contact: PricingContact | null
  /** The interval the plans show. */
  interval: PricingInterval
  /** The intervals a plan is priced at: two make the monthly / yearly switch. */
  intervals: PricingInterval[]
  /** Show the plans at another interval (`v-model:interval` follows). */
  setInterval: (interval: PricingInterval) => void
  /** The currency the prices are in, and the one a checkout pays in. */
  currency: string | undefined
  /** Every currency the catalog prices in: two or more make the currency switch. */
  currencies: string[]
  /** The promotion running now (`discount`, or a campaign link's code), with its real end; `undefined` without one. */
  promotion: PricedPromotion | undefined
  /** Show the prices, and check out, in another currency. */
  setCurrency: (currency: string) => void
  /** Key of the plan/pack whose action is in flight, `null` when idle. */
  pending: string | null
  error: string | null
  isAuthenticated: boolean
  /** The sign-in page, returning here — query and all, so a campaign link survives. */
  loginPath: string
  subscribe: (key: string) => Promise<void>
  switchTo: (key: string) => Promise<void>
  /** Cancel the plan at the period's end at once. The card's own button asks first, in one step. */
  cancelPlan: (key: string) => Promise<void>
  /** Undo a pending cancellation and stay on the plan. */
  uncancelPlan: (key: string) => Promise<void>
  buyPack: (key: string) => Promise<void>
  openPortal: () => Promise<void>
}

/**
 * `<PricingTable>`'s slots, one per region. Each receives
 * {@link PricingSlotContext}; a card's slots also get the plan or pack it
 * renders.
 */
export interface PricingTableSlots {
  /** Above the plans: replaces the heading. */
  'header': (context: PricingSlotContext) => unknown
  /** The monthly / yearly switch. */
  'interval': (context: PricingSlotContext) => unknown
  /** The currency switch. */
  'currency': (context: PricingSlotContext) => unknown
  /** While the plans load. */
  'loading': (context: PricingSlotContext) => unknown
  /** When no plan is on sale. */
  'empty': (context: PricingSlotContext) => unknown
  /** A whole plan card. */
  'plan': (context: PricingSlotContext & { plan: ResolvedPlan }) => unknown
  /** A plan card's button. */
  'plan-action': (context: PricingSlotContext & { plan: ResolvedPlan }) => unknown
  /** The contact card after the plans. */
  'contact': (context: PricingSlotContext & { contact: PricingContact }) => unknown
  /** Every credit pack. */
  'packs': (context: PricingSlotContext) => unknown
  /** A credit pack card. */
  'pack': (context: PricingSlotContext & { pack: ResolvedPack }) => unknown
  /** The button that opens the billing portal. */
  'portal': (context: PricingSlotContext) => unknown
  /** Why the last action failed, or why the plans could not be read. */
  'error': (context: PricingSlotContext) => unknown
  /** Below everything. */
  'footer': (context: PricingSlotContext) => unknown
}

/** What a plan card's action area shows, as the table decides it. */
export type PlanAction
  = | { kind: 'slot' }
    | { kind: 'sign-in', href: string, text: string }
    | { kind: 'none' }
    | { kind: 'note', hook: 'plan-returns' | 'plan-scheduled', text: string }
    | { kind: 'cancel' }
    | { kind: 'button', intent: string, idle: string, busy: string, run: () => unknown, trial?: boolean, unavailable?: boolean }

/** What `<PricingTable>` hands its packaged parts beside their props. */
export interface PricingView {
  labels: UseLabelsReturn<'pricing'>
  context: ComputedRef<PricingSlotContext>
  /** The table's slots a packaged part renders through when the app fills them. */
  slots: Pick<Partial<PricingTableSlots>, 'plan-action'>
  /** A unique prefix for ids. */
  uid: string
  /** The id of a card's name, which names the card and describes its button. */
  nameId: (kind: 'plan' | 'pack' | 'contact', key: string) => string
  /** What a plan card's action area shows. */
  planAction: (plan: ResolvedPlan) => PlanAction
  /** `'7-day free trial'`: the length from the live product, the words from the labels. */
  trialText: (trial: PlanTrial) => string
  /** A plan price's promotion, in words: its terms and the regular price after it. */
  planPromotion: (plan: ResolvedPlan) => string | null
  /** A pack's promotion, in words. */
  packPromotion: (pack: ResolvedPack) => string | null
  /** The promotion's end, as a date; `null` without one. */
  promotionEnds: () => string | null
  /** Whether the caller may use billing actions: a visitor, or a member who manages billing. */
  manages: () => boolean
  /** The current plan's one-step cancellation. */
  confirm: CancelConfirm
  /** Whether a plan card offers its trial: only to someone who could still start one. */
  offersTrial: (plan: ResolvedPlan) => boolean
}

const PRICING_VIEW: InjectionKey<PricingView> = Symbol('nuxt-backend:pricing')

/** @internal */
export function providePricingView(view: PricingView): void {
  provide(PRICING_VIEW, view)
}

/** @internal */
export function usePricingView(part: string): PricingView {
  const view = inject(PRICING_VIEW, null)
  if (!view) throw new Error(`[nuxt-backend] <${part}> renders inside <PricingTable>. To build pricing of your own, use usePricing() and its bindings.`)
  return view
}
