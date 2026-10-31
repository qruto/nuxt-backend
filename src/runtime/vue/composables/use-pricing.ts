import type { FunctionReference } from 'convex/server'
import { computed, ref, toValue, type ComputedRef, type MaybeRefOrGetter, type Ref } from 'vue'
import { navigateTo, useRequestHeaders, useRoute, useState } from '#imports'
import { useAsyncQuery } from 'nuxt-convex-module/app'
import { CATALOG_INTERVALS, type CatalogInterval } from '../../../convex/catalog.js'
import type { PricedPack, PricedPlan, PricedPromotion, Pricing } from '../../../convex/integrations/billing/types/records.js'
import { failureOf, type BackendError } from '../utils/backend-error'
import { useActiveLocale } from '../utils/active-locale'
import { currencyCode, visitorCurrency } from '../utils/currency'
import { diagnostics } from '../utils/live-query'
import { useBackendNamespace } from '../utils/namespace'
import { pricingBindings, shownInterval, type PricingBindings } from '../utils/pricing-bindings'
import { useAuthSession } from '../utils/auth-session'
import { useBilling } from './use-billing'
import { useCampaign } from './use-campaign'
import { useBackendPagePath } from './use-backend-page-path'

export type { PricingBindings } from '../utils/pricing-bindings'

export type { PricedCredits, PricedOffer, PricedPack, PricedPlan, PricedPlanPrice, PricedPromotion, PricedTrial, Pricing } from '../../../convex/integrations/billing/types/records.js'

/** A billing interval a plan is priced at. */
export type PricingInterval = CatalogInterval

/** Options for {@link usePricing}. */
export interface UsePricingOptions {
  /** Override the injected `api.billing.getPricing` reference. */
  api?: { getPricing?: FunctionReference<'query', 'public', { currency?: string, discount?: string }, Pricing> }
  /**
   * The currency to show prices in, lower-case ISO 4217, over the
   * visitor's: what a page that knows it passes (`'eur'`). One the
   * catalog does not price shows the catalog's own.
   */
  currency?: MaybeRefOrGetter<string | undefined>
  /**
   * A public promotion to show (`'launch'`): its key, or its code as a
   * campaign link carries it. Its terms come back as `promotion`, and each
   * price and pack it applies to carries its `promotion` offer. A name that
   * is no public promotion of the catalog shows none.
   */
  discount?: MaybeRefOrGetter<string | undefined>
  /**
   * Read the pricing on the server too, so the page's HTML carries it
   * (default `true`). `false` reads it in the browser only, without
   * holding up the page: for something that only sometimes needs it, like
   * a banner that sits in a layout — and for a pricing page served from a
   * cache or prerendered, whose HTML would carry the currency guessed for
   * the request that rendered it to every visitor.
   */
  server?: boolean
  /**
   * While this is `false` the pricing is not read, nor kept live (default
   * `true`): for something that needs it only some of the time, like a
   * banner that shows only while the balance is low.
   */
  enabled?: MaybeRefOrGetter<boolean>
  /**
   * Build the actions `bind.planAction` runs (default `true`): a view
   * that runs its own, as `<PricingTable>` does, turns them off.
   *
   * @internal
   */
  actions?: boolean
}

/** What {@link usePricing} returns. */
export interface UsePricingReturn {
  /**
   * The plans, in catalog order, retired ones included and marked (their
   * subscribers still see their card): `undefined` until the pricing loads.
   */
  plans: ComputedRef<PricedPlan[] | undefined>
  /** The credit packs on sale, in catalog order: `undefined` until the pricing loads. */
  packs: ComputedRef<PricedPack[] | undefined>
  /**
   * The intervals a plan on sale is priced at by a price that still sells,
   * monthly first: what a monthly / yearly switch offers.
   */
  intervals: ComputedRef<PricingInterval[]>
  /**
   * The currency the prices are in: the one chosen (`setCurrency`, a
   * `?currency=` in the address, the `currency` option), else the
   * visitor's — from the country their request comes from, else their
   * language's region — when the catalog prices it, else the catalog's own.
   * `undefined` until the pricing loads.
   */
  currency: ComputedRef<string | undefined>
  /** Every currency the catalog prices in, its own first: what a currency switch offers. */
  currencies: ComputedRef<string[]>
  /**
   * The promotion asked for (`discount`) with its real terms and dates;
   * `undefined` without one. Whether it runs now is the page's to say,
   * from `startsAt` and `endsAt` against its own clock.
   */
  promotion: ComputedRef<PricedPromotion | undefined>
  /** Show the prices in another currency, for this visit; a checkout from the pricing table pays in it. */
  setCurrency: (currency: string) => void
  /** `true` until the pricing has loaded (`false` once the read failed, and while it is not enabled). */
  isLoading: ComputedRef<boolean>
  /** Why the pricing could not be read, else `null`. The read never throws. */
  error: ComputedRef<BackendError | null>
  /**
   * The pack to offer someone short of `units` credits: the smallest that
   * covers them, else the largest there is — on `meter` when one is named.
   * `undefined` while the pricing loads, or with no pack on that meter.
   * What an `insufficient_credits` refusal's call to action preselects
   * (`need - balance`), and the low-credits notice too.
   */
  packFor: (units: number, meter?: string) => PricedPack | undefined
  /** Read the pricing again. It is live already; this is for a retry after a failure. */
  refresh: () => Promise<void>
  /** The interval the plans show: monthly when a plan is priced by the month, until `setInterval` picks another. */
  interval: Ref<PricingInterval>
  /** Show the plans at another interval. */
  setInterval: (interval: PricingInterval) => void
  /** The key of the plan whose action runs (checkout or a plan change), else `null`. */
  pending: Ref<string | null>
  /**
   * Attribute and handler bags for markup of your own: `periodSwitch`,
   * `planCard(plan)`, `planAction(plan)` and `packCard(pack)`. Spread
   * each with `v-bind`; they carry the accessibility attributes and the
   * actions the packaged table has.
   */
  bind: PricingBindings
}

/** The smallest pack whose credits cover `units`, else the largest; packs without credits never. */
function smallestCovering(packs: PricedPack[], units: number, meter?: string): PricedPack | undefined {
  const candidates = packs
    .filter(pack => pack.credits && (meter === undefined || pack.credits.meter === meter))
    .sort((a, b) => a.credits!.units - b.credits!.units || a.amount - b.amount)
  return candidates.find(pack => pack.credits!.units >= units) ?? candidates.at(-1)
}

/**
 * The currency a visitor's request suggests — the country it comes from,
 * else the region of the app's language, else of their browser's — read
 * once on the server and carried to the browser in the page's payload. A
 * page served from a cache or prerendered carries the guess of the request
 * that rendered it: read such a page with `server: false`, or pass
 * `currency`.
 */
function useDetectedCurrency() {
  const activeLocale = useActiveLocale()
  return useState<string | null>('backend:pricing:detected-currency', () => {
    if (import.meta.server) {
      return visitorCurrency(useRequestHeaders(['x-vercel-ip-country', 'cf-ipcountry', 'accept-language']), activeLocale()) ?? null
    }
    return visitorCurrency({ 'accept-language': typeof navigator === 'undefined' ? undefined : navigator.languages?.join(',') }, activeLocale()) ?? null
  })
}

/**
 * The app's plans and credit packs as a pricing page shows them — every
 * plan with its monthly and yearly price, what a year saves, its trial and
 * the credits it grants per cycle; every pack with its price per credit and
 * which is the best value — read through the scaffolded `getPricing`, in
 * the visitor's currency where the catalog prices it. The figures are the
 * live products' (`billing sync` loads them), never a copy in the page.
 *
 * Rendered on the server: the first read rides in the page's payload, so
 * `/pricing` arrives with its prices for a visitor and a crawler alike, and
 * the read then stays live. It is public — the same for everyone, signed in
 * or not.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const { plans, intervals } = usePricing()
 * const interval = ref<'month' | 'year'>('month')
 * </script>
 * <template>
 *   <article v-for="plan in plans?.filter(plan => !plan.retired)" :key="plan.key">
 *     <h3>{{ plan.name }}</h3>
 *     <p v-if="plan.prices[interval]">{{ plan.prices[interval].amount / 100 }} {{ plan.prices[interval].currency }}</p>
 *   </article>
 * </template>
 * ```
 */
export function usePricing(options: UsePricingOptions = {}): UsePricingReturn {
  const billing = useBackendNamespace<NonNullable<UsePricingOptions['api']>>('billing', 'usePricing', options.api)
  if (!billing?.getPricing) {
    if (diagnostics.enabled) {
      console.warn('[nuxt-backend] usePricing(): the backend exports no `getPricing`, so there is no pricing to show. Export it from backend/billing.ts with the rest of `billing.api` (npx nuxt-backend doctor checks the billing exports).')
    }
    return {
      plans: computed(() => []),
      packs: computed(() => []),
      intervals: computed(() => []),
      currency: computed(() => undefined),
      currencies: computed(() => []),
      promotion: computed(() => undefined),
      setCurrency: () => {},
      isLoading: computed(() => false),
      error: computed(() => null),
      packFor: () => undefined,
      refresh: async () => {},
      ...intervalState(computed(() => [])),
      bind: pricingBindings({ interval: ref('month'), setInterval: () => {}, pending: ref(null), manages: () => false, act: () => {} }),
    }
  }
  const enabled = () => toValue(options.enabled) !== false
  const route = useRoute()
  const detected = useDetectedCurrency()
  // The visitor's pick, for this visit, shared by every pricing read.
  const picked = useState<string | null>('backend:pricing:currency', () => null)
  // The explicit choice first: the option, the visitor's pick, the address; then the guess.
  const wanted = () => currencyCode(toValue(options.currency)) ?? picked.value ?? currencyCode(route.query.currency) ?? detected.value ?? undefined
  const args = () => {
    if (!enabled()) return 'skip' as const
    const currency = wanted()
    const discount = toValue(options.discount)?.trim() || undefined
    return { ...(currency ? { currency } : {}), ...(discount ? { discount } : {}) }
  }
  // A browser-only read keeps a key of its own: one payload entry per way of reading.
  const read = useAsyncQuery(billing.getPricing, args, options.server === false ? { server: false, lazy: true, key: 'backend:pricing:client' } : {})
  const plans = computed(() => read.data.value?.plans)
  const intervals = computed(() => CATALOG_INTERVALS.filter(interval => (plans.value ?? []).some(plan => !plan.retired && plan.prices[interval] && !plan.prices[interval].archived)))
  const state = intervalState(intervals)
  return {
    plans,
    packs: computed(() => read.data.value?.packs),
    currency: computed(() => read.data.value?.currency),
    currencies: computed(() => read.data.value?.currencies ?? []),
    promotion: computed(() => read.data.value?.promotion),
    setCurrency: (currency) => {
      const code = currencyCode(currency)
      if (code) picked.value = code
    },
    intervals,
    isLoading: computed(() => enabled() && read.data.value === undefined && read.error.value === null),
    error: computed(() => (read.error.value ? failureOf(read.error.value) : null)),
    packFor: (units, meter) => smallestCovering(read.data.value?.packs ?? [], units, meter),
    refresh: () => read.refresh(),
    ...state,
    bind: options.actions === false
      ? pricingBindings({ ...state, manages: () => false, act: () => {} })
      : planActions(state, plans, toValue(options.discount)),
  }
}

/** The interval a pricing view shows, and how to change it. */
function intervalState(intervals: ComputedRef<PricingInterval[]>): Pick<UsePricingReturn, 'interval' | 'setInterval' | 'pending'> {
  const picked = ref<PricingInterval | null>(null)
  const interval = computed<PricingInterval>({
    get: () => picked.value ?? (intervals.value.includes('month') ? 'month' : intervals.value[0] ?? 'month'),
    set: (next) => {
      picked.value = next
    },
  })
  const setInterval = (next: PricingInterval) => {
    picked.value = next
  }
  return { interval, setInterval, pending: ref(null) }
}

/**
 * The bindings with the actions behind `planAction`: a visitor goes to the
 * sign-in page and back, a subscriber changes plan, anyone else checks out,
 * with the address's campaign. One action at a time.
 */
function planActions(state: Pick<UsePricingReturn, 'interval' | 'setInterval' | 'pending'>, plans: ComputedRef<PricedPlan[] | undefined>, discount: string | undefined): PricingBindings {
  const billing = useBilling()
  const campaign = useCampaign()
  const auth = useAuthSession()
  const login = useBackendPagePath('login')
  const route = useRoute()
  // The price the plan's card shows, as `<PricingTable>` picks it: an archived one is sold to nobody new.
  const priceOf = (key: string) => {
    const plan = plans.value?.find(entry => entry.key === key)
    if (!plan) return undefined
    const at = shownInterval(plan, state.interval.value, billing.subscription.value?.productId)
    return at && plan.prices[at]
  }
  const act = async ({ key }: { key: string }) => {
    if (!auth.isAuthenticated.value) {
      if (login.value) await navigateTo(`${login.value}?redirect=${encodeURIComponent(route.fullPath)}`)
      return
    }
    const price = priceOf(key)
    if (!price || state.pending.value !== null) return
    state.pending.value = key
    try {
      if (billing.isSubscribed.value) await billing.changePlan(price.productId)
      else await billing.checkout(price.productId, { redirect: true, ...campaign.checkoutOptions.value, ...(discount ? { discount } : {}) })
    }
    catch {
      // The failure is in `useBilling().error`; the button is free again.
    }
    finally {
      state.pending.value = null
    }
  }
  return pricingBindings({
    ...state,
    manages: () => !auth.isAuthenticated.value || billing.canManage.value,
    act,
  })
}
