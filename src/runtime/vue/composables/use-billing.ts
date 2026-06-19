import type { FunctionReference } from 'convex/server'
import { computed, inject, type ComputedRef } from 'vue'
import { useAction } from './use-action'
import { useQuery } from './use-query'
import { ConvexAuthStateKey } from '../auth'
import { useBackendNamespace } from '../provide'

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
  listAllSubscriptions?: Query<PolarSubscription[]>
  getCurrentSubscription?: Query<PolarSubscription | null>
  generateCheckoutLink?: FunctionReference<'action', 'public', CheckoutArgs, { url: string }>
  generateCustomerPortalUrl?: FunctionReference<'action', 'public', { returnUrl?: string }, { url: string }>
  changeCurrentSubscription?: FunctionReference<'action', 'public', { productId: string }, null>
  cancelCurrentSubscription?: FunctionReference<'action', 'public', { revokeImmediately?: boolean }, null>
  getFeatures?: Query<Features | null>
  getCredits?: Query<Credits | null>
  syncEntitlements?: FunctionReference<'action', 'public', EmptyArgs, null>
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
  /** Generate a Polar checkout for the given product(s) and open it (returns the URL). */
  checkout: (productIds: string | string[], options?: CheckoutOptions) => Promise<string>
  /** Open the Polar customer portal (returns the URL). */
  portal: (options?: { returnUrl?: string, redirect?: boolean }) => Promise<string>
  /** Switch the active subscription to another product (upgrade/downgrade). */
  changePlan: (productId: string) => Promise<void>
  /** Cancel the active subscription (at period end, or immediately with `revokeImmediately`). */
  cancel: (options?: { revokeImmediately?: boolean }) => Promise<void>
}

function notConfigured(action: string): never {
  throw new Error(
    `[nuxt-backend] Billing ${action} is unavailable — ensure \`backend/billing.ts\` exports the `
    + `Polar api (setupBilling) and POLAR_ORGANIZATION_TOKEN is set, or pass \`{ api }\` to useBilling().`,
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

/**
 * Reactive billing state plus checkout/portal/plan actions for the
 * {@link https://www.convex.dev/components/polar | Polar} component, linked to
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
  const billing = (options.api ?? useBackendNamespace<BillingApi>('billing') ?? {}) as BillingApi

  const products = billing.getConfiguredProducts
    ? useQuery(billing.getConfiguredProducts)
    : computed(() => undefined)

  // The user-scoped subscription queries resolve the current user server-side, so
  // they throw ("Unauthenticated") when run before the Convex client is
  // authenticated — signed out, or the SSR / pre-auth window. Gate them on auth
  // state, read via `inject` (not `useConvexAuth`, which throws) so `useBilling`
  // still works without the auth integration. When signed out, the user is simply
  // on the free plan (no subscriptions).
  const auth = inject(ConvexAuthStateKey, null)
  const signedOut = computed(() => auth != null && !auth.isAuthenticated)
  const userScopedArgs = () => (signedOut.value ? 'skip' : {})

  const rawSubscriptions = billing.listAllSubscriptions
    ? useQuery(billing.listAllSubscriptions, userScopedArgs)
    : computed<PolarSubscription[] | undefined>(() => undefined)
  const subscriptions = computed<PolarSubscription[] | undefined>(() =>
    signedOut.value ? [] : rawSubscriptions.value,
  )

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

/** @public */
export const useConvexBilling = useBilling
