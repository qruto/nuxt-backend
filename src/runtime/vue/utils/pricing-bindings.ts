import { tryOnMounted } from '@vueuse/core'
import type { Ref } from 'vue'
import { tryUseNuxtApp, useState } from '#imports'
import { CATALOG_INTERVALS } from '../../../convex/catalog.js'
import type { PricedPlan, PricedPromotion } from '../../../convex/integrations/billing/types/records.js'
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

/**
 * The time a page shows what depends on it by — a promotion's window, the
 * first day a gift may be dated: the server's, carried to the browser in
 * the payload so the hydration renders what the server did, then the
 * browser's own once the page is on screen. A page entered later, by a
 * client-side visit, reads the time it is entered at, never the time the
 * app first rendered.
 *
 * @internal
 */
export function usePageClock(): Ref<number> {
  const now = useState('backend:now', () => Date.now())
  // A client-side visit has no server render to agree with: the time now, from its first render on.
  if (import.meta.client && !tryUseNuxtApp()?.isHydrating) now.value = Date.now()
  tryOnMounted(() => {
    now.value = Date.now()
  })
  return now
}

/** Whether a promotion runs at `now`: started, and not ended. */
export function promotionRuns(promotion: PricedPromotion, now: number): boolean {
  return !(promotion.startsAt && Date.parse(promotion.startsAt) > now) && !(promotion.endsAt && Date.parse(promotion.endsAt) <= now)
}

/** A return address on the site: a path made absolute on its origin, a full URL as it is. */
export function onSite(url: string): string {
  if (!url.startsWith('/') || url.startsWith('//') || typeof window === 'undefined') return url
  return `${window.location.origin}${url}`
}

/** The interval an address asks for (`?interval=year`), when it is one. */
export function askedInterval(value: unknown): Interval | undefined {
  return typeof value === 'string' && (CATALOG_INTERVALS as readonly string[]).includes(value) ? value as Interval : undefined
}
