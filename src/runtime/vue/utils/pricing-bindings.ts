import type { Ref } from 'vue'
import type { PricedPlan } from '../../../convex/integrations/billing/types/records.js'
import { busyAttributes } from '../a11y'

/** An interval a plan is priced at. */
type Interval = 'month' | 'year'

/** A plan or pack as the bindings read it: its key and name. */
interface Item { key: string, name: string }

/** The attribute and handler bags `usePricing().bind` holds. */
export interface PricingBindings {
  /** A monthly / yearly toggle: `role="switch"`, `aria-checked` on yearly, and the click that flips it. */
  readonly periodSwitch: Record<string, unknown>
  /** One plan's container: `role="group"`, named by the plan, so a row of the same buttons reads apart. */
  planCard: (plan: Item) => Record<string, unknown>
  /**
   * The plan's button: checkout, or a plan change for a subscriber, or the
   * sign-in page for a visitor; `aria-disabled` while it opens, and hidden
   * from a member who manages no billing.
   */
  planAction: (plan: Item) => Record<string, unknown>
  /** One credit pack's container: `role="group"`, named by the pack. */
  packCard: (pack: Item) => Record<string, unknown>
}

/** What the bindings read and call. */
export interface PricingBindingsContext {
  interval: Ref<Interval>
  setInterval: (interval: Interval) => void
  /** The key of the plan or pack whose action runs, else `null`. */
  pending: Ref<string | null>
  /** Whether the caller may use billing actions: a visitor (who signs in first) or a member who manages billing. */
  manages: () => boolean
  /** Run the plan's action: checkout, a plan change, or the sign-in page. */
  act: (plan: Item) => unknown
  /** The plan's container, as the caller describes it: the plan's name and its price. */
  planLabel?: (plan: Item) => string
  /** The pack's container, as the caller describes it. */
  packLabel?: (pack: Item) => string
}

/**
 * The interval a plan is shown and sold at: the chosen one, else the plan's
 * own — among its prices that sell, or the one `subscribed` to (an archived
 * price, a retired plan's), which only its subscriber sees. `undefined`
 * when no price of the plan is left to show: an archived price is sold to
 * nobody new. `<PricingTable>`'s cards and `usePricing`'s plan actions
 * both go by it.
 */
export function shownInterval(plan: Pick<PricedPlan, 'prices'>, chosen: Interval, subscribed: string | undefined): Interval | undefined {
  const shows = (at: Interval) => {
    const price = plan.prices[at]
    return price !== undefined && (!price.archived || price.productId === subscribed)
  }
  if (shows(chosen)) return chosen
  return shows('month') ? 'month' : shows('year') ? 'year' : undefined
}

/** The bindings of a pricing view: what `usePricing().bind` and the packaged pricing parts spread. */
export function pricingBindings(context: PricingBindingsContext): PricingBindings {
  return {
    get periodSwitch() {
      const yearly = context.interval.value === 'year'
      return {
        'type': 'button',
        'role': 'switch',
        'aria-checked': yearly ? 'true' : 'false',
        'data-state': yearly ? 'checked' : 'unchecked',
        'onClick': () => context.setInterval(yearly ? 'month' : 'year'),
      }
    },
    planCard: plan => ({
      'role': 'group',
      'aria-label': context.planLabel?.(plan) ?? plan.name,
    }),
    planAction: (plan) => {
      if (!context.manages()) return { hidden: true }
      return {
        type: 'button',
        ...busyAttributes(context.pending.value === plan.key),
        onClick: () => (context.pending.value === null ? context.act(plan) : undefined),
      }
    },
    packCard: pack => ({
      'role': 'group',
      'aria-label': context.packLabel?.(pack) ?? pack.name,
    }),
  }
}
