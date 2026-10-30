import { computed, getCurrentInstance, onMounted, ref, toValue, watch, type Ref } from 'vue'
import { useAction } from 'nuxt-convex-module/client'
import { VISITOR_IP_ROUTE } from '../../../convex/constants.js'
import { openProviderUrl } from '../utils/open-url'
import { type BackendError, failureOf } from '../utils/backend-error'
import type { BillingApi, BillingPage, CheckoutOptions, GiftOptions, PageFetcher, ProviderPager, ProviderPagerOptions } from './use-billing'

// The round trips to the billing provider that more than one composable
// makes through the `api.billing` actions — a checkout, paged history, a
// gift checkout — and the error a billing action throws when its function
// is not deployed.

/** The error a billing action throws when its function is not deployed: it names the action. */
export function notConfigured(action: string): never {
  throw new Error(
    `[nuxt-backend] Billing ${action} is unavailable — ensure \`billing.ts\` re-exports the `
    + `setupBilling api and the required BILLING_ACCESS_TOKEN env var is set, or pass \`{ api }\` to useBilling().`,
  )
}

/**
 * The checkout options only the server may choose, passed on when a caller
 * still sends them (from plain JavaScript, or code written for an earlier
 * release): the server then refuses the checkout naming the field, where
 * dropping it here would silently check out without the trial or discount.
 */
function serverOnly(opts: CheckoutOptions): Record<string, unknown> {
  const sent = opts as Record<string, unknown>
  return Object.fromEntries(['trialInterval', 'trialIntervalCount', 'discountId']
    .filter(field => sent[field] !== undefined)
    .map(field => [field, sent[field]]))
}

/**
 * The visitor's IP address as the app's server sees it
 * (`/api/backend/visitor-ip`), which a checkout forwards for the billing
 * provider's local pricing: the checkout is created on the deployment, whose
 * address the provider would price by. Nothing when the route does not
 * answer within two seconds, or answers none: the checkout goes on without.
 */
async function visitorIp(): Promise<string | undefined> {
  if (typeof window === 'undefined' || typeof fetch !== 'function') return undefined
  try {
    // fallow-ignore-next-line security-sink -- VISITOR_IP_ROUTE is the module's own same-origin path, a constant; verified 2026-10-28
    const response = await fetch(VISITOR_IP_ROUTE, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(2000) })
    if (!response.ok) return undefined
    const { ip } = await response.json() as { ip?: unknown }
    return typeof ip === 'string' && ip !== '' ? ip : undefined
  }
  catch {
    return undefined
  }
}

/**
 * Build a `checkout(productIds, options)` action over a billing namespace —
 * shared by {@link useBilling} (subscriptions) and
 * {@link "runtime/vue/composables/use-credits"!useCredits} (top-ups),
 * since a credit-pack top-up is just a checkout for a one-time product. Must be
 * called during component setup (it sets up the underlying action).
 */
export function createCheckout(billing: BillingApi) {
  const runCheckout = billing.generateCheckoutLink ? useAction(billing.generateCheckoutLink) : null
  return async (productIds: string | string[], opts: CheckoutOptions = {}): Promise<string> => {
    if (!runCheckout) notConfigured('checkout')
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    const successUrl = opts.successUrl ?? (typeof window !== 'undefined' ? window.location.href : '')
    const customerIpAddress = await visitorIp()
    const { url } = await runCheckout({
      productIds: Array.isArray(productIds) ? productIds : [productIds],
      origin,
      successUrl,
      subscriptionId: opts.subscriptionId,
      metadata: opts.metadata,
      locale: opts.locale,
      currency: opts.currency,
      prefill: opts.prefill,
      customFields: opts.customFields,
      requireBillingAddress: opts.requireBillingAddress,
      allowDiscountCodes: opts.allowDiscountCodes,
      discountCode: opts.discountCode,
      discount: opts.discount,
      utm: opts.utm,
      ...(opts.emailOptOut === undefined ? {} : { emailOptOut: opts.emailOptOut }),
      ...(customerIpAddress ? { customerIpAddress } : {}),
      ...serverOnly(opts),
    })
    openProviderUrl(url, opts.redirect)
    return url
  }
}

/**
 * One page of provider history, however the deployed function spells it: a
 * bare array (a backend that dropped the envelope) reads as a single page with
 * unknown totals.
 */
function normalizePage<Item>(result: BillingPage<Item> | Item[] | null | undefined): BillingPage<Item> {
  if (!result) return { items: [] }
  if (Array.isArray(result)) return { items: result }
  return { items: result.items ?? [], pagination: result.pagination }
}

/**
 * The reactive paging both provider-history composables need — `useOrders`
 * and `useUsage` differ only in what they fetch. Provider history lives behind
 * page numbers rather than a cursor, so this tracks a page and its totals.
 *
 * Loads run in the browser only (they need a Convex client and the signed-in
 * identity), never reject — a failure lands in `error` as `failureOf` reads
 * it, so a permanently mounted history panel cannot break a page — and stay
 * put when `fetchPage` is `null`, which is how an undeployed backend
 * function degrades. Must be called during component setup.
 */
export function createProviderPager<Item>(
  fetchPage: PageFetcher<Item> | null,
  options: ProviderPagerOptions = {},
): ProviderPager<Item> {
  const items = ref<Item[] | undefined>() as Ref<Item[] | undefined>
  const page = ref(1)
  const total = ref<number | undefined>()
  const pageCount = ref<number | undefined>()
  const error = ref<BackendError | null>(null)

  const instance = getCurrentInstance()
  const immediate = (options.immediate ?? true) && instance != null
  // A mount-time load starts the state as loading, so the first paint is the
  // loading state rather than a flash of "nothing here" that immediately fills
  // in — and so a server render matches the client's first frame.
  const loading = ref(Boolean(fetchPage) && immediate)

  const enabled = () => (options.enabled ? options.enabled() : true)

  // Loads overlap: a filter or a sign-out reloads page 1 while a `next()`
  // is still on its way, and either may answer last. Only the latest load
  // writes, so an older answer can never put the previous filter's page, or
  // the previous account's history, back on screen, and only it ends the
  // loading state.
  let latest = 0

  async function load(target: number): Promise<void> {
    const run = ++latest
    if (!fetchPage || !enabled()) {
      items.value = []
      total.value = undefined
      pageCount.value = undefined
      loading.value = false
      return
    }
    loading.value = true
    error.value = null
    try {
      const result = normalizePage(await fetchPage({ page: target, limit: toValue(options.limit) }))
      if (run !== latest) return
      items.value = result.items
      total.value = result.pagination?.totalCount
      pageCount.value = result.pagination?.maxPage
      page.value = target
    }
    catch (failure) {
      if (run !== latest) return
      error.value = failureOf(failure)
      items.value ??= []
    }
    finally {
      if (run === latest) loading.value = false
    }
  }

  if (instance) {
    if (immediate) onMounted(() => load(page.value))
    // A page size or filter change invalidates the position, not just the data.
    watch(
      () => [toValue(options.limit), options.watchSources?.(), enabled()],
      () => load(1),
      { flush: 'post' },
    )
    // Another reader's history is not theirs to see, nor to act on, while theirs loads.
    if (options.reader) {
      watch(options.reader, () => {
        items.value = undefined
        total.value = undefined
        pageCount.value = undefined
        void load(1)
      }, { flush: 'post' })
    }
  }

  return {
    items,
    page,
    total: computed(() => total.value),
    pageCount: computed(() => pageCount.value),
    // Without provider totals, a full page is the only "there may be more"
    // signal there is; a short page is certainly the last one.
    hasMore: computed(() => {
      if (pageCount.value != null) return page.value < pageCount.value
      const limit = toValue(options.limit)
      return limit != null && (items.value?.length ?? 0) >= limit
    }),
    hasPrevious: computed(() => page.value > 1),
    isLoading: computed(() => loading.value),
    error: computed(() => error.value),
    refresh: () => load(page.value),
    next: async () => {
      if (pageCount.value != null && page.value >= pageCount.value) return
      await load(page.value + 1)
    },
    previous: async () => {
      if (page.value <= 1) return
      await load(page.value - 1)
    },
    goTo: target => load(Math.max(1, Math.trunc(target))),
  }
}

/**
 * Build the `send(item, { recipientEmail, ... })` action of
 * {@link "runtime/vue/composables/use-gifts"!useGifts} over a billing
 * namespace. A gift is a credit pack, named by its catalog key
 * (`credits500`), or a plan as a pass: its key with a length in `months`
 * the plan offers. The server refuses anything outside the catalog. The
 * purchaser pays on their own billing account and gets the receipt; the
 * recipient (by email) signs in and claims it (`useGifts().claim`). Must be
 * called during component setup.
 */
export function createGiftCheckout(billing: BillingApi) {
  const runGiftCheckout = billing.giftCheckout ? useAction(billing.giftCheckout) : null
  return async (item: string, opts: GiftOptions & { recipientEmail: string, months?: number, deliverAt?: Date | number }): Promise<string> => {
    if (!runGiftCheckout) notConfigured('gift')
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    const successUrl = opts.successUrl ?? (typeof window !== 'undefined' ? window.location.href : '')
    const { url } = await runGiftCheckout({
      ...(opts.months === undefined ? { pack: item } : { plan: item, months: opts.months }),
      ...(opts.deliverAt === undefined ? {} : { deliverAt: new Date(opts.deliverAt).getTime() }),
      recipientEmail: opts.recipientEmail,
      message: opts.message,
      origin,
      successUrl,
      metadata: opts.metadata,
      currency: opts.currency,
    })
    openProviderUrl(url, opts.redirect)
    return url
  }
}
