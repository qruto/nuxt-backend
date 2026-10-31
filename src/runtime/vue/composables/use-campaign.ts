import { computed, type ComputedRef } from 'vue'
import { useRoute } from '#imports'
import { DISCOUNT_CODE } from '../../../convex/catalog.js'
import type { CampaignAttribution, CheckoutOptions } from './use-billing'

/** The UTM parameters a campaign link carries, by the attribution field each fills. */
const UTM_FIELDS = ['source', 'medium', 'campaign', 'term', 'content'] as const

/** What {@link useCampaign} returns. */
export interface UseCampaignReturn {
  /**
   * The discount code the address carries (`?discount=` or the provider's
   * own `?discount_code=`), when it could be a code at all. The checkout
   * applies it; a page never repeats it, and whether it is valid is the
   * provider's to say, at checkout.
   */
  discountCode: ComputedRef<string | undefined>
  /** The address's `utm_*` parameters, trimmed, or `undefined` without any. */
  attribution: ComputedRef<CampaignAttribution | undefined>
  /** Both, as checkout options: spread them into `checkout` or `topUp`. */
  checkoutOptions: ComputedRef<Pick<CheckoutOptions, 'discountCode' | 'utm'>>
}

/** A query value as one string: the first of a repeated parameter. */
function single(value: unknown): string | undefined {
  const first = Array.isArray(value) ? value[0] : value
  return typeof first === 'string' && first.trim() !== '' ? first.trim() : undefined
}

/**
 * The `utm_*` parameters of an address's query, trimmed; `undefined`
 * without any.
 *
 * @internal
 */
export function attributionOf(query: Record<string, unknown>): CampaignAttribution | undefined {
  const entries = UTM_FIELDS.flatMap((field) => {
    const value = single(query[`utm_${field}`])
    return value ? [[field, value] as const] : []
  })
  return entries.length > 0 ? Object.fromEntries(entries) as CampaignAttribution : undefined
}

/**
 * The campaign a visitor arrived with, read from the address: a campaign
 * link's discount code and its UTM attribution, ready for checkout. Read
 * only, and nothing is stored on the device — the values live in the URL,
 * which the sign-in redirect keeps, so a visitor who signs in on the way
 * still checks out with them. The provider stores the attribution on the
 * order and the subscription as `utm_*` metadata.
 *
 * `<PricingTable>` reads it on its own; call it for a checkout button of
 * your own.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * // /pricing?discount=LAUNCH20&utm_source=newsletter
 * const { checkoutOptions } = useCampaign()
 * const { checkout } = useBilling()
 * </script>
 * <template>
 *   <button @click="checkout(productId, checkoutOptions)">Subscribe</button>
 * </template>
 * ```
 */
export function useCampaign(): UseCampaignReturn {
  const route = useRoute()
  const discountCode = computed(() => {
    const code = single(route.query.discount) ?? single(route.query.discount_code)
    return code && DISCOUNT_CODE.test(code) ? code : undefined
  })
  const attribution = computed(() => attributionOf(route.query))
  return {
    discountCode,
    attribution,
    checkoutOptions: computed(() => ({
      ...(discountCode.value ? { discountCode: discountCode.value } : {}),
      ...(attribution.value ? { utm: attribution.value } : {}),
    })),
  }
}
