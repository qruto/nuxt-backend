import type { FunctionReference } from 'convex/server'
import { computed, inject, type ComputedRef } from 'vue'
import { useAction, useQuery, ConvexAuthStateKey, useConvexNamespace } from 'nuxt-convex-module/client'

/** A Polar product (loose — the full shape is Polar's; cast as needed). */
export type PolarProduct = { id: string, name: string } & Record<string, unknown>
/** A Polar subscription (loose — the full shape is Polar's; cast as needed). */
export type PolarSubscription = { id: string, status: string, productId: string } & Record<string, unknown>

type EmptyArgs = Record<string, never>
type Query<Result> = FunctionReference<'query', 'public', EmptyArgs, Result>

/** A granted benefit — the unit of feature-gating (`useFeatures().has()`). */
export interface EntitlementBenefit {
  id: string
  benefitId: string
  type: string
  /**
   * The benefit's Polar metadata (live, not the grant-time snapshot). Set a
   * stable key here (e.g. `{ key: 'premium' }`) to feature-gate by a friendly
   * name — `useFeatures().has('premium')` matches any metadata value.
   */
  metadata?: Record<string, string | number | boolean>
}

/** A prepaid credit-meter balance (`useCredits()`). */
export interface EntitlementMeter {
  meterId: string
  consumedUnits: number
  creditedUnits: number
  balance: number
}

/** Feature-gating state for the current user, as returned by `getFeatures`. */
export interface Features {
  /** Active product ids the user is subscribed to. */
  plans: string[]
  /** Granted benefits. */
  benefits: EntitlementBenefit[]
}

/** Prepaid credit balances for the current user, as returned by `getCredits`. */
export interface Credits {
  meters: EntitlementMeter[]
}

/** Args of the Polar-generated `generateCheckoutLink` action. */
export type CheckoutArgs = {
  productIds: string[]
  origin: string
  successUrl: string
  subscriptionId?: string
  metadata?: Record<string, string>
  trialInterval?: 'day' | 'week' | 'month' | 'year' | null
  trialIntervalCount?: number | null
  locale?: string
}

/**
 * The billing function references — the result of `setupBilling().api` re-exported
 * from your `backend/billing.ts` (plus the optional `getCurrentSubscription`
 * query). Supplied automatically from the injected `api.billing` namespace;
 * pass `options.api` to override.
 */
export interface BillingApi {
  getConfiguredProducts?: Query<Record<string, PolarProduct | undefined>>
  listAllProducts?: Query<PolarProduct[]>
  listAllSubscriptions?: Query<PolarSubscription[] | null>
  getCurrentSubscription?: Query<PolarSubscription | null>
  generateCheckoutLink?: FunctionReference<'action', 'public', CheckoutArgs, { url: string }>
  generateCustomerPortalUrl?: FunctionReference<'action', 'public', { returnUrl?: string }, { url: string }>
  changeCurrentSubscription?: FunctionReference<'action', 'public', { productId: string }, null>
  cancelCurrentSubscription?: FunctionReference<'action', 'public', { revokeImmediately?: boolean }, null>
  getFeatures?: Query<Features | null>
  getCredits?: Query<Credits | null>
  syncEntitlements?: FunctionReference<'action', 'public', EmptyArgs, null>
  giftCheckout?: FunctionReference<'action', 'public', GiftCheckoutArgs, { url: string }>
  getReceivedGifts?: Query<ReceivedGift[] | null>
  claimGift?: FunctionReference<'action', 'public', { giftId?: string }, { claimed: number }>
}

/** Args of the `giftCheckout` action (a checkout whose recipient is someone else). */
export type GiftCheckoutArgs = {
  productIds: string[]
  recipientEmail: string
  message?: string
  origin: string
  successUrl: string
  metadata?: Record<string, string>
}

/** A gift addressed to the current user (`getReceivedGifts` shape). */
export interface ReceivedGift {
  id: string
  recipientEmail: string
  purchaserUserId: string
  purchaserEmail?: string
  purchaserName?: string
  productIds: string[]
  message?: string
  /** `'pending'` (awaiting payment) → `'paid'` (claimable) → `'claimed'`. */
  status: string
  createdAt: number
  paidAt?: number
  claimedAt?: number
}

/** Per-call checkout overrides for {@link UseBillingReturn.checkout}. */
export interface CheckoutOptions {
  subscriptionId?: string
  metadata?: Record<string, string>
  trialInterval?: 'day' | 'week' | 'month' | 'year' | null
  trialIntervalCount?: number | null
  locale?: string
  /** Where Polar returns the customer after checkout. Defaults to the current URL. */
  successUrl?: string
  /** Open in the same tab instead of a new one (redirect checkout). */
  redirect?: boolean
}

export interface UseBillingOptions {
  /** Override the injected `api.billing` namespace (or individual references). */
  api?: BillingApi
}

export interface UseBillingReturn {
  /** Configured products keyed by your product map, or `undefined` while loading. */
  products: ComputedRef<Record<string, PolarProduct | undefined> | undefined>
  /** The current active subscription, `null` when on the free plan, `undefined` while loading. */
  subscription: ComputedRef<PolarSubscription | null | undefined>
  /** Every subscription for the user (incl. ended/expired trials), or `undefined` while loading. */
  subscriptions: ComputedRef<PolarSubscription[] | undefined>
  /** `true` once an active subscription is known. */
  isSubscribed: ComputedRef<boolean>
  /** `true` once it's known the user has no active subscription. */
  isFree: ComputedRef<boolean>
  /** `true` until the subscription state has loaded. */
  isLoading: ComputedRef<boolean>
  /** Generate a checkout for the given product(s) and open it (returns the URL). */
  checkout: (productIds: string | string[], options?: CheckoutOptions) => Promise<string>
  /** Buy the given product(s) as a gift for someone else (by email). Opens checkout. */
  gift: (productIds: string | string[], options: GiftOptions & { recipientEmail: string }) => Promise<string>
  /** Open the billing customer portal (returns the URL). */
  portal: (options?: { returnUrl?: string, redirect?: boolean }) => Promise<string>
  /** Switch the active subscription to another product (upgrade/downgrade). */
  changePlan: (productId: string) => Promise<void>
  /** Cancel the active subscription (at period end, or immediately with `revokeImmediately`). */
  cancel: (options?: { revokeImmediately?: boolean }) => Promise<void>
}

function notConfigured(action: string): never {
  throw new Error(
    `[nuxt-backend] Billing ${action} is unavailable — ensure \`billing.ts\` re-exports the `
    + `setupBilling api and the required BILLING_ACCESS_TOKEN env var is set, or pass \`{ api }\` to useBilling().`,
  )
}

function openUrl(url: string, redirect?: boolean): void {
  if (typeof window === 'undefined') return
  if (redirect) window.location.href = url
  else window.open(url, '_blank')
}

/**
 * Build a `checkout(productIds, options)` action over a billing namespace —
 * shared by {@link useBilling} (subscriptions) and {@link useCredits} (top-ups),
 * since a credit-pack top-up is just a checkout for a one-time product. Must be
 * called during component setup (it sets up the underlying action).
 */
export function createCheckout(billing: BillingApi) {
  const runCheckout = billing.generateCheckoutLink ? useAction(billing.generateCheckoutLink) : null
  return async (productIds: string | string[], opts: CheckoutOptions = {}): Promise<string> => {
    if (!runCheckout) notConfigured('checkout')
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    const successUrl = opts.successUrl ?? (typeof window !== 'undefined' ? window.location.href : '')
    const { url } = await runCheckout({
      productIds: Array.isArray(productIds) ? productIds : [productIds],
      origin,
      successUrl,
      subscriptionId: opts.subscriptionId,
      metadata: opts.metadata,
      trialInterval: opts.trialInterval,
      trialIntervalCount: opts.trialIntervalCount,
      locale: opts.locale,
    })
    openUrl(url, opts.redirect)
    return url
  }
}

/** Per-call options for {@link UseBillingReturn.gift}. */
export interface GiftOptions {
  /** A note shown to the recipient in the gift email. */
  message?: string
  metadata?: Record<string, string>
  /** Where the purchaser returns after paying. Defaults to the current URL. */
  successUrl?: string
  /** Open in the same tab instead of a new one (redirect checkout). */
  redirect?: boolean
}

/**
 * Build a `gift(productIds, { recipientEmail, ... })` action over a billing
 * namespace — shared by {@link useBilling} and {@link useCredits} (gifting a
 * credit pack is just a gift checkout of a one-time product). The purchaser
 * pays; the recipient (by email) receives the entitlement — attached
 * automatically if they have an account, claimable on first sign-in otherwise.
 * Must be called during component setup.
 */
export function createGiftCheckout(billing: BillingApi) {
  const runGiftCheckout = billing.giftCheckout ? useAction(billing.giftCheckout) : null
  return async (
    productIds: string | string[],
    opts: GiftOptions & { recipientEmail: string },
  ): Promise<string> => {
    if (!runGiftCheckout) notConfigured('gift')
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    const successUrl = opts.successUrl ?? (typeof window !== 'undefined' ? window.location.href : '')
    const { url } = await runGiftCheckout({
      productIds: Array.isArray(productIds) ? productIds : [productIds],
      recipientEmail: opts.recipientEmail,
      message: opts.message,
      origin,
      successUrl,
      metadata: opts.metadata,
    })
    openUrl(url, opts.redirect)
    return url
  }
}

/**
 * Reactive billing state plus checkout/gift/portal/plan actions, linked to
 * your auth user. Works with no arguments via the auto-provided `api.billing`
 * namespace; pass `{ api }` to override.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const billing = useBilling()
 * </script>
 * <template>
 *   <p v-if="billing.isSubscribed.value">Pro</p>
 *   <button @click="billing.checkout(productId, { trialInterval: 'day', trialIntervalCount: 7 })">
 *     Upgrade
 *   </button>
 * </template>
 * ```
 */
export function useBilling(options: UseBillingOptions = {}): UseBillingReturn {
  const billing = (options.api ?? useConvexNamespace<BillingApi>('billing') ?? {}) as BillingApi

  const products = billing.getConfiguredProducts
    ? useQuery(billing.getConfiguredProducts)
    : computed(() => undefined)

  // The user-scoped subscription queries resolve the current user server-side
  // and return `null` for claimless callers (signed out, or the auth-handshake /
  // reconnect window). Additionally gate them on auth state, read via `inject`
  // (not `useConvexAuth`, which throws) so `useBilling` still works without the
  // auth integration. When signed out, the user is simply on the free plan.
  const auth = inject(ConvexAuthStateKey, null)
  const signedOut = computed(() => auth != null && !auth.isAuthenticated.value)
  const userScopedArgs = () => (signedOut.value ? 'skip' : {})

  const rawSubscriptions = billing.listAllSubscriptions
    ? useQuery(billing.listAllSubscriptions, userScopedArgs)
    : computed<PolarSubscription[] | null | undefined>(() => undefined)
  const subscriptions = computed<PolarSubscription[] | undefined>(() => {
    if (signedOut.value) return []
    // Server-side null = no billing entity yet — same as having no subscriptions.
    return rawSubscriptions.value === null ? [] : rawSubscriptions.value
  })

  // Prefer an explicit `getCurrentSubscription` query; otherwise derive the
  // active subscription from the full list.
  const rawCurrentSubscription = billing.getCurrentSubscription
    ? useQuery(billing.getCurrentSubscription, userScopedArgs)
    : computed<PolarSubscription | null | undefined>(() => {
        const all = subscriptions.value
        if (all === undefined) return undefined
        return all.find(s => s.status === 'active' || s.status === 'trialing') ?? null
      })
  const currentSubscription = computed<PolarSubscription | null | undefined>(() =>
    signedOut.value ? null : rawCurrentSubscription.value,
  )

  const checkout = createCheckout(billing)
  const gift = createGiftCheckout(billing)
  const runPortal = billing.generateCustomerPortalUrl ? useAction(billing.generateCustomerPortalUrl) : null
  const runChange = billing.changeCurrentSubscription ? useAction(billing.changeCurrentSubscription) : null
  const runCancel = billing.cancelCurrentSubscription ? useAction(billing.cancelCurrentSubscription) : null

  return {
    products,
    subscription: computed(() => currentSubscription.value),
    subscriptions,
    isSubscribed: computed(() => currentSubscription.value != null),
    isFree: computed(() => currentSubscription.value === null),
    isLoading: computed(() => currentSubscription.value === undefined),
    checkout,
    gift,
    portal: async (opts = {}) => {
      if (!runPortal) notConfigured('portal')
      const { url } = await runPortal({ returnUrl: opts.returnUrl })
      openUrl(url, opts.redirect)
      return url
    },
    changePlan: async (productId) => {
      if (!runChange) notConfigured('changePlan')
      await runChange({ productId })
    },
    cancel: async (opts = {}) => {
      if (!runCancel) notConfigured('cancel')
      await runCancel({ revokeImmediately: opts.revokeImmediately })
    },
  }
}
