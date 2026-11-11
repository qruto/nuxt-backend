import { computed, ref, toValue, type ComputedRef, type MaybeRefOrGetter, type Ref } from 'vue'
import { CATALOG_INTERVALS } from '../../../convex/catalog.js'
import type { PricedPlan, PricedPlanPrice } from '../../../convex/integrations/billing/types/records.js'
import { useActionState } from '../utils/action-state'
import type { BackendError } from '../utils/backend-error'
import { CONFIRMED_PRORATION, planChangeWhen } from '../utils/plan-change-confirm'
import { pricingCheckout } from '../utils/pricing-checkout'
import { formatBillingAmount, formatBillingDate } from './billing-format'
import { useBilling, type CheckoutOptions, type PlanChangePreview } from './use-billing'
import { useCampaign } from './use-campaign'
import { useLabels, type BackendLabels, type LabelGroupOverrides, type LabelKey } from './use-labels'
import { usePricing, type PricingInterval, type UsePricingReturn } from './use-pricing'

/** A price a subscription's switch moves to, as its confirmation names it. */
export interface PlanChangeTarget {
  /** The product to switch to: one price of a plan. */
  productId: string
  /** The plan as the confirmation names it: `Team`, `Pro, billed yearly`. */
  plan: string
  /** Its price with its period, formatted: `$29/mo`. */
  price: string
  /** Who opened the confirmation, to tell two openers apart: a plan card's key. Default: `productId`. */
  key?: string
}

/** One price the subscription can switch to, in its own currency ({@link UsePlanChangeReturn.targets}). */
export interface PlanSwitchTarget extends Required<PlanChangeTarget> {
  /** Its plan's catalog key (`'team'`). */
  key: string
  /** The plan's own name, as the provider lists it. */
  name: string
  /** The interval the price bills at. */
  interval: PricingInterval
  /** What one interval costs, in the currency's smallest unit. */
  amount: number
  /** Lower-case ISO 4217 code: the subscription's own, where it is known. */
  currency: string
}

/**
 * How a switch goes: `'now'` at once, `'period_end'` when the paid year
 * runs out (`useBilling().changeOf` says which), `'checkout'` for a gifted
 * plan's holder, whose switch is a checkout of the plan that ends the gift.
 */
export type PlanChangeApplies = PlanChangePreview['applies'] | 'checkout'

/** Options for {@link usePlanChange}. */
export interface UsePlanChangeOptions {
  /** Copy for the confirmation, over `appConfig.backend.labels.pricing` and the translations. */
  labels?: MaybeRefOrGetter<LabelGroupOverrides<'pricing'> | undefined>
  /**
   * The pricing your page reads already (`usePricing()`): its prices stand
   * for the switch's wherever they are in the subscription's currency, so
   * no second pricing is read for a page in it. A page in another currency
   * still reads the subscription's. Its `currencies` and `error` count
   * too where it has them: a gifted plan's checkout pays in the currency
   * its card shows where the catalog prices more than one, and a failed
   * read ends the wait.
   */
  pricing?: Pick<UsePricingReturn, 'plans' | 'currency'> & Partial<Pick<UsePricingReturn, 'currencies' | 'error'>>
  /** While this is `false` no pricing is read for the switch, and nothing is a target (default `true`). */
  enabled?: MaybeRefOrGetter<boolean>
}

/** What {@link usePlanChange} returns. */
export interface UsePlanChangeReturn {
  /**
   * Every price the subscription can switch to: each plan on sale at each
   * interval in the subscription's own currency, which the provider keeps
   * on a switch, the plan's own other period included. Never the price it
   * is on, the free plan, a retired plan, an archived price, the price a
   * scheduled change moves to (`scheduledFor`), nor one with no price in
   * that currency, which the provider would refuse. For a gifted plan's
   * holder, whose switch is a checkout, every paid plan's price as the
   * pricing shows it. `[]` without a plan to switch from (none, the free
   * plan, still loading); `undefined` while the prices are read.
   */
  targets: ComputedRef<PlanSwitchTarget[] | undefined>
  /**
   * The target for one plan's card: the price of the plan `key` at
   * `interval`, as `targets` lists it. `null` while its price in the
   * subscription's currency is read; `undefined` when there is no switch
   * to it, which a card shows no switch button for.
   */
  targetFor: (key: string, interval: PricingInterval) => PlanSwitchTarget | null | undefined
  /** When a change scheduled for the period's end moves the subscription to `productId`, else `null`: say when, rather than offer it again. */
  scheduledFor: (productId: string) => Date | null
  /** The switch waiting on the person's confirmation, `null` while none is open. */
  target: Ref<Required<PlanChangeTarget> | null>
  /** What that switch would do (`useBilling().changeOf`); `null` while none is open, for a gifted plan's, and for one there is nothing to preview. */
  preview: ComputedRef<PlanChangePreview | null>
  /** How that switch goes; `null` while none is open, or for one there is nothing to say about. */
  applies: ComputedRef<PlanChangeApplies | null>
  /** The confirmation's question, "Switch to Team?"; `''` while none is open. */
  title: ComputedRef<string>
  /**
   * When the switch happens and how the period's difference is settled, in
   * the reader's words: at once with the difference settled now, when the
   * paid year runs out, and in a trial, whether it carries over, ends with
   * a first payment, or waits for its end; for a gifted plan's holder, that
   * the checkout ends the gift. What the switch `confirm` makes does. `''`
   * while none is open.
   */
  when: ComputedRef<string>
  /** Ask about a switch: `target`, `preview` and the words follow it. */
  open: (target: PlanChangeTarget) => void
  /** Close the confirmation without switching. */
  close: () => void
  /**
   * Make the switch the confirmation is open for, then close it: a
   * subscriber's `changePlan(productId, { proration: 'invoice' })`, so the
   * difference settles now as `when` says, whatever the organization's
   * default; a gifted plan's holder's checkout of the plan, which ends the
   * gift, with the address's campaign (its code and attribution, a refused
   * code dropped) and in the currency its price shows where the catalog
   * prices more than one, as `<PricingTable>` checks it out (`options` go
   * with it, over those, `{ redirect: true }` by default). Rejects
   * with what the call threw, `error` holds it too, and the confirmation
   * stays open.
   */
  confirm: (options?: CheckoutOptions) => Promise<void>
  /** Switch to `productId` at once, past any confirmation, settling the period's difference now (`proration: 'invoice'`): the switch `changeOf` describes. */
  switchTo: (productId: string) => Promise<void>
  /** `true` until the switch's prices are known (`false` without a plan to switch from, and once the read failed). */
  isLoading: ComputedRef<boolean>
  /** `true` while a switch or a gifted plan's checkout is on its way. */
  isPending: ComputedRef<boolean>
  /** Why the last switch failed, else why the prices could not be read, else `null`. */
  error: ComputedRef<BackendError | null>
}

/**
 * A subscriber's switch to another plan or billing period, without its
 * markup: the prices it can move to, in the subscription's own currency,
 * and one confirmation that says what the switch does before it does it —
 * the price, when it happens (a yearly price left for a monthly one waits
 * for the paid year's end) and how the period's difference is settled, or,
 * in a trial, what becomes of it — then the switch itself, settling that
 * difference at once (`proration: 'invoice'`), so the words stay true
 * whatever the organization's default. A gifted plan's holder is asked
 * too: their switch is a checkout of the new plan, which ends the gift.
 * What `<PricingTable>` and the billing section of `/settings` confirm.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const change = usePlanChange()
 * </script>
 * <template>
 *   <button v-for="target in change.targets.value" :key="target.productId" @click="change.open(target)">
 *     {{ target.plan }} · {{ target.price }}
 *   </button>
 *   <div v-if="change.target.value" role="group" :aria-label="change.title.value">
 *     <p>{{ change.title.value }} {{ change.when.value }}</p>
 *     <button :aria-disabled="change.isPending.value || undefined" @click="change.confirm()">Confirm switch</button>
 *     <button @click="change.close()">Not now</button>
 *   </div>
 * </template>
 * ```
 */
export function usePlanChange(options: UsePlanChangeOptions = {}): UsePlanChangeReturn {
  const billing = useBilling()
  const { t, locale } = useLabels('pricing', () => toValue(options.labels))
  const enabled = () => toValue(options.enabled) !== false
  const shown = options.pricing
  const gifted = computed(() => billing.pass.value !== null)
  // The provider keeps a subscription's currency on a switch; a gifted plan's holder checks out in the page's.
  const currency = computed(() => {
    const code = billing.subscription.value?.currency
    return !gifted.value && typeof code === 'string' && code !== '' ? code.toLowerCase() : undefined
  })
  // The page's pricing stands for the switch's while it is in that currency: read apart, in the browser, only otherwise.
  const own = usePricing({
    server: false,
    actions: false,
    currency: () => currency.value,
    enabled: () => enabled() && billing.isSubscribed.value
      && (shown === undefined || (currency.value !== undefined && shown.currency.value !== undefined && shown.currency.value !== currency.value)),
  })
  const plans = computed(() => (shown ?? own).plans.value)

  /** The price of plan `key` at `interval` a switch moves to: `null` while it is read, `undefined` when there is none in the subscription's currency. */
  function priceAt(key: string, interval: PricingInterval): PricedPlanPrice | null | undefined {
    const page = shown?.plans.value
    if (shown && page === undefined) return null
    const offered = page?.find(plan => plan.key === key)?.prices[interval]
    if (shown) {
      if (!offered) return undefined
      if (currency.value === undefined || offered.currency === currency.value) return offered
      // The page is in the subscription's currency, and this price came back in the catalog's.
      if (shown.currency.value === currency.value) return undefined
    }
    const read = own.plans.value
    if (read === undefined) return null
    const at = read.find(plan => plan.key === key)?.prices[interval]
    // A product with no price in that currency comes back in the catalog's.
    return at && (currency.value === undefined || at.currency === currency.value) && (!offered || at.productId === offered.productId) ? at : undefined
  }

  const pending = computed(() => billing.pendingChange.value)
  const ownPlan = (plan: PricedPlan) => Object.values(plan.prices).some(price => price?.productId === billing.subscription.value?.productId)
  /** The target for `plan`'s price at `interval`, `undefined` for one no switch moves to. */
  function targetOf(plan: PricedPlan, interval: PricingInterval, price: PricedPlanPrice): PlanSwitchTarget | undefined {
    if (plan.free || plan.retired || price.archived) return undefined
    if (price.productId === billing.subscription.value?.productId || price.productId === pending.value?.productId) return undefined
    return {
      key: plan.key,
      productId: price.productId,
      name: plan.name,
      // Its own plan at the other period is named with it: "Pro, billed yearly".
      plan: ownPlan(plan) ? t(`billedAt.${interval}` as LabelKey<BackendLabels['pricing']>, { plan: plan.name }) : plan.name,
      price: `${formatBillingAmount(price.amount, price.currency, locale.value)}${t(`period.${interval}` as LabelKey<BackendLabels['pricing']>)}`,
      interval,
      amount: price.amount,
      currency: price.currency,
    }
  }
  const switches = () => enabled() && billing.isSubscribed.value

  const targets = computed<PlanSwitchTarget[] | undefined>(() => {
    if (!switches()) return []
    const list = plans.value
    if (list === undefined) return undefined
    const found: PlanSwitchTarget[] = []
    for (const plan of list) {
      if (plan.free || plan.retired) continue
      for (const interval of CATALOG_INTERVALS) {
        if (!plan.prices[interval]) continue
        const price = priceAt(plan.key, interval)
        if (price === null) return undefined
        const target = price && targetOf(plan, interval, price)
        if (target) found.push(target)
      }
    }
    return found
  })

  const target = ref<Required<PlanChangeTarget> | null>(null)
  const preview = computed(() => (target.value ? billing.changeOf(target.value.productId) : null))
  const applies = computed<PlanChangeApplies | null>(() => (target.value === null ? null : gifted.value ? 'checkout' : preview.value?.applies ?? null))
  const { isPending, failure, run } = useActionState()
  // A gifted plan's checkout carries the campaign as the table's does: a held plan is offered no promotion.
  const { payIn, withCampaign } = pricingCheckout({
    campaign: useCampaign(),
    asked: () => undefined,
    active: () => undefined,
    currencies: () => shown?.currencies?.value ?? own.currencies.value,
  })
  /** The currency a price of the pricing shows in, by its product. */
  const currencyOf = (productId: string) => plans.value?.flatMap(entry => Object.values(entry.prices)).find(price => price?.productId === productId)?.currency

  const switchTo = (productId: string) => run(() => billing.changePlan(productId, { proration: CONFIRMED_PRORATION }), { silent: true })

  return {
    targets,
    targetFor: (key, interval) => {
      if (!switches()) return undefined
      const plan = plans.value?.find(entry => entry.key === key)
      if (!plan?.prices[interval]) return plans.value === undefined ? null : undefined
      if (plan.free || plan.retired) return undefined
      const price = priceAt(key, interval)
      return price === null ? null : price && targetOf(plan, interval, price)
    },
    scheduledFor: productId => (pending.value?.productId === productId ? pending.value.appliesAt : null),
    target,
    preview,
    applies,
    title: computed(() => (target.value ? t('changeTitle', { plan: target.value.plan }) : '')),
    when: computed(() => target.value
      ? planChangeWhen({
          applies: applies.value,
          preview: preview.value,
          price: target.value.price,
          gifted: t('changeGifted', { price: target.value.price }),
          t,
          date: value => formatBillingDate(value, { dateStyle: 'medium' }, locale.value) || null,
        })
      : ''),
    open: (next) => {
      target.value = { ...next, key: next.key ?? next.productId }
    },
    close: () => {
      target.value = null
    },
    confirm: async (checkout = {}) => {
      const chosen = target.value
      if (!chosen) return
      // The provider switches no pass: a gifted plan's holder checks the plan out, which replaces the pass in place.
      if (gifted.value) await run(() => withCampaign(false, campaign => billing.checkout(chosen.productId, { redirect: true, ...payIn(currencyOf(chosen.productId)), ...campaign, ...checkout })), { silent: true })
      else await switchTo(chosen.productId)
      if (target.value === chosen) target.value = null
    },
    switchTo,
    isLoading: computed(() => switches() && targets.value === undefined && own.error.value === null && (shown?.error?.value ?? null) === null),
    isPending,
    error: computed(() => failure.value ?? own.error.value ?? shown?.error?.value ?? null),
  }
}
