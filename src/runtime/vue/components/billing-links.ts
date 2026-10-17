import { defineComponent, h, ref, type PropType } from 'vue'
import { useAction } from 'nuxt-convex-module/client'
import { createCheckout, notConfigured } from '../composables/billing-provider'
import type { BillingApi, CampaignAttribution } from '../composables/use-billing'
import { useBackendNamespace } from '../utils/namespace'
import { openProviderUrl } from '../utils/open-url'

/**
 * Run one click's provider session: ignore clicks while one is in flight,
 * and hand a refusal to the `error` listener instead of an unhandled
 * rejection — the link has no place of its own to show it.
 */
function useClickSession(open: () => Promise<unknown>, emit: (event: 'error', error: unknown) => void) {
  const pending = ref(false)
  const onClick = async (event: MouseEvent) => {
    event.preventDefault()
    if (pending.value) return
    pending.value = true
    try {
      await open()
    }
    catch (error) {
      emit('error', error)
    }
    finally {
      pending.value = false
    }
  }
  return { pending, onClick }
}

/**
 * A link that opens a checkout for the caller's billing entity. The session
 * is created on click, through the app's `generateCheckoutLink`, so the
 * server checks every input then — never on render, where each page view
 * would open a checkout nobody uses. It returns to the current page unless
 * `success-url` says otherwise, and opens in the same tab unless `redirect`
 * is `false`. A refusal (an off-catalog product, a signed-out visitor) is emitted
 * as `error`; read it with `getBackendError`.
 *
 * @example
 * ```vue
 * <BillingCheckoutLink :product-ids="[plan.id]" @error="error = getBackendError($event)">
 *   Upgrade
 * </BillingCheckoutLink>
 * ```
 */
export const BillingCheckoutLink = /* @__PURE__ */ defineComponent({
  name: 'BillingCheckoutLink',
  props: {
    /** The catalog product ids to sell. */
    productIds: { type: [String, Array] as PropType<string | string[]>, required: true },
    /** Upgrade this subscription of the entity instead of starting a new one. */
    subscriptionId: { type: String, default: undefined },
    /** Your own metadata keys; the server refuses the ones the package reads back. */
    metadata: { type: Object as PropType<Record<string, string>>, default: undefined },
    locale: { type: String, default: undefined },
    /** A campaign's discount code, checked by the provider. */
    discountCode: { type: String, default: undefined },
    /** Campaign attribution, stored as `utm_*` metadata. */
    utm: { type: Object as PropType<CampaignAttribution>, default: undefined },
    /** Where the buyer lands afterwards, on the site's own origin. Defaults to the current page. */
    successUrl: { type: String, default: undefined },
    /**
     * Open in the same tab (the default). `false` opens a new tab, which a
     * browser may block: the tab opens only once the session exists.
     */
    redirect: { type: Boolean, default: true },
    /** Override the injected `api.billing` namespace. */
    api: { type: Object as PropType<BillingApi>, default: undefined },
  },
  emits: { error: (_error: unknown) => true },
  setup(props, { slots, emit }) {
    const checkout = createCheckout(useBackendNamespace<BillingApi>('billing', 'BillingCheckoutLink', props.api))
    const { pending, onClick } = useClickSession(() => checkout(props.productIds, {
      subscriptionId: props.subscriptionId,
      metadata: props.metadata,
      locale: props.locale,
      discountCode: props.discountCode,
      utm: props.utm,
      successUrl: props.successUrl,
      redirect: props.redirect,
    }), emit)
    return () => h('a', { 'href': '#', 'aria-busy': pending.value || undefined, 'data-pending': pending.value || undefined, onClick }, slots.default?.({ pending: pending.value }))
  },
})

/**
 * A link that opens the billing customer portal for the caller's billing
 * entity, through the app's `generateCustomerPortalUrl`, on click. With
 * workspaces the portal is the caller's own member of the workspace's
 * billing customer: anyone but its owner or a billing manager is refused
 * (`forbidden`, reason `not_billing_manager`), and an entity that never paid
 * has no portal yet (`not_ready`, reason `no_customer`) — both emitted as
 * `error`.
 *
 * @example
 * ```vue
 * <BillingPortalLink return-url="/app/billing">Manage billing</BillingPortalLink>
 * ```
 */
export const BillingPortalLink = /* @__PURE__ */ defineComponent({
  name: 'BillingPortalLink',
  props: {
    /** Where the portal's back link returns to, on the site's own origin. Defaults to the current page. */
    returnUrl: { type: String, default: undefined },
    /**
     * Open in the same tab (the default). `false` opens a new tab, which a
     * browser may block: the tab opens only once the session exists.
     */
    redirect: { type: Boolean, default: true },
    /** Override the injected `api.billing` namespace. */
    api: { type: Object as PropType<BillingApi>, default: undefined },
  },
  emits: { error: (_error: unknown) => true },
  setup(props, { slots, emit }) {
    const billing = useBackendNamespace<BillingApi>('billing', 'BillingPortalLink', props.api)
    const runPortal = billing.generateCustomerPortalUrl ? useAction(billing.generateCustomerPortalUrl) : null
    const { pending, onClick } = useClickSession(async () => {
      if (!runPortal) notConfigured('portal')
      const here = typeof window === 'undefined' ? undefined : window.location.href
      const returnUrl = props.returnUrl && typeof window !== 'undefined' ? new URL(props.returnUrl, window.location.href).href : here
      const { url } = await runPortal({ returnUrl })
      openProviderUrl(url, props.redirect)
    }, emit)
    return () => h('a', { 'href': '#', 'aria-busy': pending.value || undefined, 'data-pending': pending.value || undefined, onClick }, slots.default?.({ pending: pending.value }))
  },
})
