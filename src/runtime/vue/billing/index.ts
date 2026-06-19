import { defineComponent, h, onMounted, type PropType, ref, type SlotsType, type VNode, watch } from 'vue'
import { useAction } from '../composables/use-action'
import type { BillingApi, CheckoutArgs } from '../composables/use-billing'
import { useBackendNamespace } from '../provide'

type CheckoutTheme = 'dark' | 'light'
type TrialInterval = 'day' | 'week' | 'month' | 'year' | null

/**
 * Renders a Polar checkout link — embedded modal (default) or redirect — with
 * optional lazy generation and trial configuration. A Vue port of
 * `@convex-dev/polar/react`'s `CheckoutLink`.
 *
 * The `generateCheckoutLink` action comes from the auto-provided `api.billing`
 * namespace; pass `:api` to override.
 *
 * @example
 * ```vue
 * <CheckoutLink :products="[productId]" :trial-interval-count="7" trial-interval="day">
 *   Start free trial
 * </CheckoutLink>
 * ```
 */
export const CheckoutLink = defineComponent({
  name: 'CheckoutLink',
  inheritAttrs: false,
  props: {
    products: { type: Array as PropType<string[]>, required: true },
    subscriptionId: { type: String, default: undefined },
    metadata: { type: Object as PropType<Record<string, string>>, default: undefined },
    trialInterval: { type: String as PropType<TrialInterval>, default: undefined },
    trialIntervalCount: { type: Number as PropType<number | null>, default: undefined },
    locale: { type: String, default: undefined },
    theme: { type: String as PropType<CheckoutTheme>, default: 'dark' },
    embed: { type: Boolean, default: true },
    lazy: { type: Boolean, default: false },
    api: { type: Object as PropType<BillingApi>, default: undefined },
  },
  slots: Object as SlotsType<{ default: () => VNode[] }>,
  setup(props, { slots, attrs }) {
    const billing = props.api ?? useBackendNamespace<BillingApi>('billing')
    const actionRef = billing?.generateCheckoutLink
    const generate = actionRef ? useAction(actionRef) : null

    const checkoutLink = ref<string>()
    const isLoading = ref(false)

    const buildArgs = (): CheckoutArgs => ({
      productIds: props.products,
      subscriptionId: props.subscriptionId,
      metadata: props.metadata,
      origin: window.location.origin,
      successUrl: window.location.href,
      trialInterval: props.trialInterval,
      trialIntervalCount: props.trialIntervalCount,
      locale: props.locale,
    })

    if (import.meta.client && generate) {
      const prepare = async () => {
        if (props.lazy) return
        if (props.embed) {
          const { PolarEmbedCheckout } = await import('@polar-sh/checkout/embed')
          PolarEmbedCheckout.init()
        }
        const { url } = await generate(buildArgs())
        checkoutLink.value = url
      }
      onMounted(prepare)
      watch(
        () => [props.products, props.subscriptionId, props.embed, props.trialInterval, props.trialIntervalCount, props.locale],
        prepare,
      )
    }

    const handleClick = async (event: MouseEvent) => {
      if (!props.lazy || !generate) return
      event.preventDefault()
      if (isLoading.value) return
      isLoading.value = true
      try {
        const { url } = await generate(buildArgs())
        if (props.embed) {
          const { PolarEmbedCheckout } = await import('@polar-sh/checkout/embed')
          await PolarEmbedCheckout.create(url, { theme: props.theme })
        }
        else {
          window.open(url, '_blank')
        }
      }
      finally {
        isLoading.value = false
      }
    }

    return () => h('a', {
      ...attrs,
      'href': checkoutLink.value ?? (props.lazy ? '#' : undefined),
      'onClick': props.lazy ? handleClick : undefined,
      'data-polar-checkout-theme': props.theme,
      ...(!props.lazy && props.embed ? { 'data-polar-checkout': '' } : {}),
    }, slots.default?.())
  },
})

/**
 * Renders a link to the Polar customer portal (subscription management). A Vue
 * port of `@convex-dev/polar/react`'s `CustomerPortalLink` — renders nothing
 * until the portal URL resolves. Uses the auto-provided `api.billing` namespace;
 * pass `:api` to override.
 */
export const CustomerPortalLink = defineComponent({
  name: 'CustomerPortalLink',
  inheritAttrs: false,
  props: {
    returnUrl: { type: String, default: undefined },
    api: { type: Object as PropType<BillingApi>, default: undefined },
  },
  slots: Object as SlotsType<{ default: () => VNode[] }>,
  setup(props, { slots, attrs }) {
    const billing = props.api ?? useBackendNamespace<BillingApi>('billing')
    const actionRef = billing?.generateCustomerPortalUrl
    const generate = actionRef ? useAction(actionRef) : null

    const portalUrl = ref<string>()

    if (import.meta.client && generate) {
      const load = async () => {
        const result = await generate({ returnUrl: props.returnUrl })
        if (result) portalUrl.value = result.url
      }
      onMounted(load)
      watch(() => props.returnUrl, load)
    }

    return () => portalUrl.value
      ? h('a', { ...attrs, href: portalUrl.value, target: '_blank' }, slots.default?.())
      : null
  },
})
