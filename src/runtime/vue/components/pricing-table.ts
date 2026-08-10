import { computed, defineComponent, h, ref, type ComputedRef, type PropType, type Ref, type VNodeChild } from 'vue'
import { useRuntimeConfig } from '#imports'
import { useBilling, type BillingProduct, type UseBillingReturn } from '../composables/use-billing'
import { useCredits, type UseCreditsReturn } from '../composables/use-credits'
import { useAuth } from '../composables/use-auth'
import { useBackendConfig } from '../composables/use-backend-config'
import type { CreditPack, PricingPlan } from '../../config'

/** A catalog plan joined with its live billing product. */
export interface ResolvedPlan extends PricingPlan {
  product?: BillingProduct
  /** Formatted price (from the live product), `'—'` while unknown. */
  price: string
  isCurrent: boolean
}

/** A credit pack joined with its live billing product. */
export interface ResolvedPack extends CreditPack {
  product?: BillingProduct
  price: string
}

export interface PricingSlotContext {
  billing: UseBillingReturn
  credits: UseCreditsReturn
  plans: ResolvedPlan[]
  packs: ResolvedPack[]
  currentPlan: ResolvedPlan | null
  /** Key of the plan/pack whose action is in flight, `null` when idle. */
  pending: string | null
  error: string | null
  isAuthenticated: boolean
  loginPath: string
  subscribe: (key: string) => Promise<void>
  switchTo: (key: string) => Promise<void>
  cancelPlan: (key: string) => Promise<void>
  buyPack: (key: string) => Promise<void>
  openPortal: () => Promise<void>
}

function formatPrice(product?: BillingProduct): string {
  // The billing provider's product payload is loosely typed on the client —
  // dig out the fixed price defensively.
  const prices = product?.prices as Array<{ priceAmount?: number, priceCurrency?: string }> | undefined
  const first = prices?.[0]
  if (first?.priceAmount == null) return '—'
  const amount = first.priceAmount / 100
  if (first.priceCurrency) {
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: first.priceCurrency,
        maximumFractionDigits: amount % 1 ? 2 : 0,
      }).format(amount)
    }
    catch {
      // Unknown currency code — fall through to the bare amount.
    }
  }
  return amount % 1 ? amount.toFixed(2) : String(amount)
}

/**
 * A complete pricing table as one headless component: plan cards resolved
 * live from the configured billing products, subscribe / switch / cancel
 * actions, one-time credit packs, and a customer-portal link. The catalog
 * (keys, blurbs, feature lists) comes from `appConfig.backend.billing` or the
 * `plans` / `packs` props; names and prices always resolve live from billing
 * so the page cannot drift from the source of truth.
 *
 * Headless markup: every element carries a `data-pricing` attribute; replace
 * any region via its slot — each slot receives {@link PricingSlotContext}.
 * Signed-out visitors get a sign-in link (with a return redirect) instead of
 * checkout actions.
 */
export const PricingTable = defineComponent({
  name: 'PricingTable',
  props: {
    /** Plan catalog. Default: `appConfig.backend.billing.plans`. */
    plans: { type: Array as PropType<PricingPlan[]>, default: undefined },
    /** Credit packs. Default: `appConfig.backend.billing.packs`. */
    packs: { type: Array as PropType<CreditPack[]>, default: undefined },
    title: { type: String, default: undefined },
    /** Billing-period suffix rendered after prices. */
    period: { type: String, default: '/mo' },
    showPacks: { type: Boolean, default: true },
    showPortal: { type: Boolean, default: true },
    /** Same-tab redirect checkout (billing returns here). Default `true`. */
    redirect: { type: Boolean, default: true },
  },
  emits: {
    'checkout': (_url: string) => true,
    'plan-changed': (_key: string) => true,
    'canceled': () => true,
    'topped-up': (_key: string) => true,
    'error': (_message: string) => true,
  },
  setup(props, { slots, emit }) {
    const billing = useBilling()
    const credits = useCredits()
    const { isAuthenticated } = useAuth()
    const config = useBackendConfig()
    const labels = { ...config.labels.pricing }
    const runtime = useRuntimeConfig().public as { backend?: { pages?: Record<string, string> } }
    const loginPath = runtime.backend?.pages?.login || '/login'

    const pending: Ref<string | null> = ref(null)
    const error: Ref<string | null> = ref(null)

    const catalogPlans = computed(() => props.plans ?? config.billing.plans)
    const catalogPacks = computed(() => props.packs ?? config.billing.packs)
    const products = computed(() => billing.products.value ?? {})

    const plans: ComputedRef<ResolvedPlan[]> = computed(() => catalogPlans.value.map((plan) => {
      const product = products.value[plan.key]
      return {
        ...plan,
        product,
        price: formatPrice(product),
        isCurrent: product != null && product.id === billing.subscription.value?.productId,
      }
    }))
    const packs: ComputedRef<ResolvedPack[]> = computed(() => catalogPacks.value.map(pack => ({
      ...pack,
      product: products.value[pack.key],
      price: formatPrice(products.value[pack.key]),
    })))
    const currentPlan = computed(() => plans.value.find(plan => plan.isCurrent) ?? null)

    async function run(key: string, action: () => Promise<unknown>) {
      error.value = null
      pending.value = key
      try {
        await action()
      }
      catch (e) {
        error.value = e instanceof Error ? e.message : 'Something went wrong'
        emit('error', error.value)
      }
      finally {
        pending.value = null
      }
    }

    const productId = (key: string) => products.value[key]?.id

    const subscribe = (key: string) => run(key, async () => {
      const id = productId(key)
      if (!id) return
      const url = await billing.checkout(id, { redirect: props.redirect })
      if (!props.redirect && url) emit('checkout', url)
    })
    const switchTo = (key: string) => run(key, async () => {
      const id = productId(key)
      if (!id) return
      await billing.changePlan(id)
      emit('plan-changed', key)
    })
    const cancelPlan = (key: string) => run(key, async () => {
      await billing.cancel()
      emit('canceled')
    })
    const buyPack = (key: string) => run(key, async () => {
      const id = productId(key)
      if (!id) return
      const url = await credits.topUp(id, { redirect: props.redirect })
      if (!props.redirect && url) emit('checkout', url)
      emit('topped-up', key)
    })
    const openPortal = () => run('portal', async () => {
      await billing.portal({ redirect: true })
    })

    const context = (): PricingSlotContext => ({
      billing,
      credits,
      plans: plans.value,
      packs: packs.value,
      currentPlan: currentPlan.value,
      pending: pending.value,
      error: error.value,
      isAuthenticated: isAuthenticated.value,
      loginPath,
      subscribe,
      switchTo,
      cancelPlan,
      buyPack,
      openPortal,
    })

    const signInHref = () => {
      const target = typeof window === 'undefined' ? '' : window.location.pathname
      return target ? `${loginPath}?redirect=${encodeURIComponent(target)}` : loginPath
    }

    const planAction = (plan: ResolvedPlan): VNodeChild => {
      const ctx = { ...context(), plan }
      if (slots['plan-action']) return slots['plan-action'](ctx)
      if (!isAuthenticated.value) {
        return h('a', { 'data-pricing': 'plan-action', 'data-intent': 'sign-in', 'href': signInHref() }, labels.signIn ?? 'Sign in to subscribe')
      }
      const busy = pending.value === plan.key
      if (plan.isCurrent) {
        return h('button', { 'data-pricing': 'plan-action', 'data-intent': 'cancel', 'type': 'button', 'disabled': busy, 'onClick': () => cancelPlan(plan.key) }, busy ? '…' : labels.cancel ?? 'Cancel plan')
      }
      if (billing.isSubscribed.value) {
        return h('button', { 'data-pricing': 'plan-action', 'data-intent': 'switch', 'type': 'button', 'disabled': busy, 'onClick': () => switchTo(plan.key) }, busy ? '…' : `${labels.switch ?? 'Switch to'} ${plan.product?.name ?? plan.key}`)
      }
      return h('button', { 'data-pricing': 'plan-action', 'data-intent': 'subscribe', 'type': 'button', 'disabled': busy || billing.isLoading.value, 'onClick': () => subscribe(plan.key) }, busy ? '…' : labels.subscribe ?? 'Subscribe')
    }

    const planCard = (plan: ResolvedPlan): VNodeChild => {
      const ctx = { ...context(), plan }
      if (slots.plan) return slots.plan(ctx)
      return h('article', {
        'data-pricing': 'plan',
        'data-current': plan.isCurrent || undefined,
        'data-highlight': plan.highlight || undefined,
        'key': plan.key,
      }, [
        h('div', { 'data-pricing': 'plan-name' }, [
          plan.product?.name ?? plan.key,
          plan.isCurrent ? h('span', { 'data-pricing': 'current-badge' }, labels.current ?? 'Current') : null,
        ]),
        h('div', { 'data-pricing': 'plan-price' }, [
          plan.price,
          h('span', { 'data-pricing': 'plan-period' }, props.period),
        ]),
        plan.blurb ? h('p', { 'data-pricing': 'plan-blurb' }, plan.blurb) : null,
        h('ul', { 'data-pricing': 'plan-features' }, [
          plan.credits != null ? h('li', { 'data-pricing': 'plan-feature' }, `${plan.credits} credits / month`) : null,
          ...(plan.features ?? []).map(feature => h('li', { 'data-pricing': 'plan-feature' }, feature)),
        ]),
        planAction(plan),
      ])
    }

    const packCard = (pack: ResolvedPack): VNodeChild => {
      const ctx = { ...context(), pack }
      if (slots.pack) return slots.pack(ctx)
      const busy = pending.value === pack.key
      return h('article', { 'data-pricing': 'pack', 'key': pack.key }, [
        h('div', { 'data-pricing': 'pack-name' }, pack.product?.name ?? pack.key),
        h('div', { 'data-pricing': 'pack-price' }, pack.price),
        h('button', {
          'data-pricing': 'pack-action',
          'type': 'button',
          'disabled': busy || !pack.product || !isAuthenticated.value,
          'onClick': () => buyPack(pack.key),
        }, busy ? '…' : labels.topUp ?? 'Top up'),
      ])
    }

    return () => {
      const ctx = context()
      const title = props.title ?? labels.title
      return h('div', { 'data-pricing': 'table' }, [
        slots.header?.(ctx) ?? (title ? h('h2', { 'data-pricing': 'header' }, title) : null),
        plans.value.length === 0 || Object.keys(products.value).length === 0
          ? slots.empty?.(ctx) ?? h('p', { 'data-pricing': 'empty' }, 'No plans are configured yet.')
          : h('div', { 'data-pricing': 'plans' }, plans.value.map(planCard)),
        props.showPacks && packs.value.length > 0
          ? slots.packs?.(ctx) ?? h('div', { 'data-pricing': 'packs' }, packs.value.map(packCard))
          : null,
        props.showPortal && billing.isSubscribed.value
          ? slots.portal?.(ctx) ?? h('button', {
            'data-pricing': 'portal',
            'type': 'button',
            'disabled': pending.value === 'portal',
            'onClick': openPortal,
          }, 'Manage subscription')
          : null,
        error.value
          ? slots.error?.(ctx) ?? h('p', { 'data-pricing': 'error', 'role': 'alert' }, error.value)
          : null,
        slots.footer?.(ctx) ?? null,
      ])
    }
  },
})
