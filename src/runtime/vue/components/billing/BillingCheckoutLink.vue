<script setup lang="ts">
import { createCheckout } from '../../composables/billing-provider'
import type { BillingApi, CampaignAttribution } from '../../composables/use-billing'
import { computed, ref } from 'vue'
import { useBillingAccess } from '../../utils/billing-access'
import { useBackendNamespace } from '../../utils/namespace'
import { type BillingLinkSlots, useClickSession } from './billing-links'

/**
 * A link that opens a checkout for the caller's billing entity. The session
 * is created on click, through the app's `generateCheckoutLink`, so the
 * server checks every input then — never on render, where each page view
 * would open a checkout nobody uses. It returns to the current page unless
 * `success-url` says otherwise, and opens in the same tab unless `redirect`
 * is `false`. A refusal (an off-catalog product, a signed-out visitor) is
 * emitted as `error`; read it with `getBackendError`. It renders nothing for
 * a caller the server says manages none of the billing (`useBilling().canManage`).
 * While a topic of the app's takes the EU soft opt-in
 * (`useBilling().softOptIn`), the soft opt-in's notice and its "Don't
 * email me" box (`PricingEmailOptOut`) follow the link, and its checkout
 * says whether the box was ticked.
 *
 * @example
 * ```vue
 * <BillingCheckoutLink :product-ids="[plan.id]" @error="error = getBackendError($event)">
 *   Upgrade
 * </BillingCheckoutLink>
 * ```
 */
defineOptions({ name: 'BillingCheckoutLink', inheritAttrs: false })

const props = withDefaults(defineProps<{
  /** The catalog product ids to sell. */
  productIds: string | string[]
  /** Upgrade this subscription of the entity instead of starting a new one. */
  subscriptionId?: string
  /** Your own metadata keys; the server refuses the ones the package reads back. */
  metadata?: Record<string, string>
  locale?: string
  /** A campaign's discount code, checked by the provider. */
  discountCode?: string
  /** A public promotion of the catalog, by its key. */
  discount?: string
  /** Campaign attribution, stored as `utm_*` metadata. */
  utm?: CampaignAttribution
  /** Where the buyer lands afterwards, on the site's own origin. Defaults to the current page. */
  successUrl?: string
  /**
   * Open in the same tab (the default). `false` opens a new tab, which a
   * browser may block: the tab opens only once the session exists.
   */
  redirect?: boolean
  /** Override the injected `api.billing` namespace. */
  api?: BillingApi
}>(), { subscriptionId: undefined, metadata: undefined, locale: undefined, discountCode: undefined, discount: undefined, utm: undefined, successUrl: undefined, redirect: true, api: undefined })

const emit = defineEmits({ error: (_error: unknown) => true })
defineSlots<BillingLinkSlots>()

const billing = useBackendNamespace<BillingApi>('billing', 'BillingCheckoutLink', props.api)
const checkout = createCheckout(billing)
const { canManage, softOptIn } = useBillingAccess(billing.getBillingAccess)
const emailOptOut = ref(false)
const { pending, onClick } = useClickSession(() => checkout(props.productIds, {
  subscriptionId: props.subscriptionId,
  metadata: props.metadata,
  locale: props.locale,
  discountCode: props.discountCode,
  discount: props.discount,
  utm: props.utm,
  successUrl: props.successUrl,
  redirect: props.redirect,
  ...(softOptIn.value ? { emailOptOut: emailOptOut.value } : {}),
}), emit)
// With the soft opt-in, the link and its box render in one group (`data-billing="checkout-group"`); the link alone otherwise.
/** The link's own attributes: its hook, and its state while the session is created. */
const link = computed(() => ({
  'href': '#',
  'data-billing': 'checkout-link',
  'aria-busy': pending.value || undefined,
  'aria-disabled': pending.value || undefined,
  'data-pending': pending.value || undefined,
  'data-state': pending.value ? 'pending' : 'idle',
}))
</script>

<template>
  <span
    v-if="canManage && softOptIn"
    data-billing="checkout-group"
  >
    <a
      v-bind="{ ...$attrs, ...link }"
      @click="onClick"
    ><slot :pending="pending" /></a>
    <PricingEmailOptOut v-model="emailOptOut" />
  </span>
  <a
    v-else-if="canManage"
    v-bind="{ ...$attrs, ...link }"
    @click="onClick"
  ><slot :pending="pending" /></a>
</template>
