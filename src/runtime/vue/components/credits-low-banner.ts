import { computed, defineComponent, h, ref, type PropType, type Ref, type VNodeChild } from 'vue'
import { useRuntimeConfig } from '#imports'
import { backendAppConfigDefaults } from '../../config'
import { useBilling } from '../composables/use-billing'
import { useBackendConfig } from '../composables/use-backend-config'
import { useCredits, type UseCreditsReturn } from '../composables/use-credits'

export interface CreditsLowBannerSlotContext {
  credits: UseCreditsReturn
  /** Remaining credits (the banner only renders once this is known). */
  balance: number
  /** The balance the banner appears below. */
  threshold: number
  /** Where the default action sends the customer when no `pack` is set. */
  pricingPath: string
  /** Whether a top-up checkout is in flight. */
  pending: boolean
  /** Buy the configured `pack` (no-op without one). */
  topUp: () => Promise<void>
  /** Hide the banner for the rest of the session. */
  dismiss: () => void
}

/**
 * A running-low nudge: appears once the prepaid credit balance drops under the
 * configured threshold (`appConfig.backend.billing.lowCreditsThreshold`, or the
 * `threshold` prop) and offers the way back to more credits — a top-up checkout
 * when a `pack` is named, the pricing page otherwise.
 *
 * Renders nothing while the balance is loading, when it is healthy, when
 * billing is unconfigured, or once dismissed — so it can sit permanently in a
 * layout. Dismissal lasts for the life of the component instance; it returns
 * on the next page load if the balance is still low, because the customer
 * still needs to know.
 *
 * Headless: `data-credits` attributes for styling, slots for every region, and
 * copy overridable through `appConfig.backend.labels.credits`.
 *
 * @example
 * ```vue
 * <CreditsLowBanner meter="credits" pack="credits100" :threshold="25" />
 * ```
 */
export const CreditsLowBanner = defineComponent({
  name: 'CreditsLowBanner',
  props: {
    /** Credit-meter name (or raw meter id). Defaults to the primary meter. */
    meter: { type: String as PropType<string | undefined>, default: undefined },
    /** Show below this balance. Default: `appConfig.backend.billing.lowCreditsThreshold`. */
    threshold: { type: Number as PropType<number | undefined>, default: undefined },
    /** A credit-pack product key: turns the action into a top-up checkout. */
    pack: { type: String as PropType<string | undefined>, default: undefined },
    /** Offer a dismiss control. Default `true`. */
    dismissible: { type: Boolean, default: true },
    /** Same-tab redirect checkout (billing returns here). Default `true`. */
    redirect: { type: Boolean, default: true },
  },
  emits: {
    'dismissed': () => true,
    'topped-up': (_url: string) => true,
    'error': (_message: string) => true,
  },
  setup(props, { slots, emit }) {
    const credits = useCredits(() => props.meter ?? '')
    const billing = useBilling()
    const config = useBackendConfig()
    const labels = { ...config.labels.credits }
    const runtime = useRuntimeConfig().public as { backend?: { pages?: Record<string, string> } }
    const pricingPath = runtime.backend?.pages?.pricing || '/pricing'

    const dismissed = ref(false)
    const pending: Ref<boolean> = ref(false)
    // The package default is the last word: a config missing the key must not
    // leave the threshold `undefined`, which would compare false and turn the
    // nudge into a permanent banner.
    const threshold = computed(() =>
      props.threshold ?? config.billing.lowCreditsThreshold ?? backendAppConfigDefaults.billing.lowCreditsThreshold)

    const dismiss = () => {
      dismissed.value = true
      emit('dismissed')
    }

    async function topUp(): Promise<void> {
      const productId = props.pack ? billing.products.value?.[props.pack]?.id : undefined
      if (!productId) return
      pending.value = true
      try {
        const url = await credits.topUp(productId, { redirect: props.redirect })
        if (url) emit('topped-up', url)
      }
      catch (failure) {
        emit('error', failure instanceof Error ? failure.message : 'Could not start the top-up')
      }
      finally {
        pending.value = false
      }
    }

    return () => {
      const balance = credits.balance.value
      // `undefined` is "not loaded yet" — never flash the nudge at a customer
      // whose balance turns out to be fine.
      if (balance === undefined || dismissed.value || balance >= threshold.value) return null

      const ctx: CreditsLowBannerSlotContext = {
        credits,
        balance,
        threshold: threshold.value,
        pricingPath,
        pending: pending.value,
        topUp,
        dismiss,
      }
      if (slots.default) return slots.default(ctx)

      // `{balance}` becomes its own element so the number can be styled apart
      // from the sentence — and a label without the token simply has none.
      const message: VNodeChild[] = []
      for (const [index, segment] of (labels.low ?? '{balance} credits left.').split('{balance}').entries()) {
        if (index > 0) message.push(h('span', { 'data-credits': 'balance' }, String(balance)))
        if (segment) message.push(segment)
      }

      // Busy while the top-up checkout is being created, so the "…" in the
      // button is not the only sign that something is happening.
      return h('div', { 'data-credits': 'banner', 'role': 'status', 'aria-live': 'polite', 'aria-busy': pending.value ? 'true' : undefined }, [
        slots.message?.(ctx) ?? h('p', { 'data-credits': 'message' }, message),
        slots.action?.(ctx) ?? (props.pack
          ? h('button', {
              'data-credits': 'action',
              'type': 'button',
              'disabled': pending.value,
              'onClick': topUp,
            }, pending.value ? '…' : labels.topUp ?? 'Top up')
          : h('a', { 'data-credits': 'action', 'href': pricingPath }, labels.topUp ?? 'Top up')),
        props.dismissible
          ? slots.dismiss?.(ctx) ?? h('button', {
            'data-credits': 'dismiss',
            'type': 'button',
            'aria-label': labels.dismiss ?? 'Dismiss',
            'onClick': dismiss,
          }, '×')
          : null,
      ])
    }
  },
})
