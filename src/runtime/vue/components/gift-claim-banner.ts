import { defineComponent, h } from 'vue'
import { useGifts } from '../composables/use-gifts'

/**
 * A banner listing the signed-in user's unclaimed gifts with a "Receive"
 * button per gift. Renders nothing when there is nothing to claim, so it can
 * sit permanently in a layout or dashboard page.
 *
 * By default gifts stay unclaimed until the user clicks (explicit-consent UX);
 * pass `auto-claim` to attach them automatically on load instead — the banner
 * then only flashes while claiming.
 *
 * Headless like `AuthForm`: semantic markup with `data-gift` attributes for
 * styling, or replace the rendering wholesale via the default slot (receives
 * the gift list and the claim action).
 *
 * @example
 * ```vue
 * <GiftClaimBanner />
 * ```
 */
export const GiftClaimBanner = defineComponent({
  name: 'GiftClaimBanner',
  props: {
    /** Claim gifts automatically instead of waiting for a click. Default `false`. */
    autoClaim: { type: Boolean, default: false },
  },
  emits: {
    claimed: (_count: number) => true,
    error: (_message: string) => true,
  },
  setup(props, { slots, emit }) {
    const gifts = useGifts({ autoClaim: props.autoClaim })

    const claim = async (giftId?: string): Promise<void> => {
      try {
        const count = await gifts.claim(giftId)
        if (count > 0) emit('claimed', count)
      }
      catch (error) {
        emit('error', error instanceof Error ? error.message : String(error))
      }
    }

    return () => {
      const unclaimed = gifts.unclaimed.value
      if (slots.default) {
        return slots.default({ gifts: unclaimed, claim, isClaiming: gifts.isClaiming.value })
      }
      if (unclaimed.length === 0) return null
      return h('div', { 'data-gift': 'banner' }, unclaimed.map(gift =>
        h('div', { 'data-gift': 'item', 'key': gift.id }, [
          h('p', { 'data-gift': 'message' }, [
            '🎁 ',
            h('strong', gift.purchaserName || gift.purchaserEmail || 'Someone'),
            ' sent you a gift',
            gift.message ? `: “${gift.message}”` : '.',
          ]),
          h('button', {
            'data-gift': 'claim',
            'type': 'button',
            'disabled': gifts.isClaiming.value,
            'onClick': () => claim(gift.id),
          }, gifts.isClaiming.value ? 'Receiving…' : 'Receive gift'),
        ])))
    }
  },
})
