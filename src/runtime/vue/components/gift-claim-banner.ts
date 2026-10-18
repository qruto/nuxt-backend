import { defineComponent, h } from 'vue'
import { useGifts } from '../composables/use-gifts'
import { refusalMessage } from '../utils/backend-error'

/**
 * A banner listing the signed-in user's unclaimed gifts with a "Receive"
 * button per gift. Renders nothing when there is nothing to claim, so it can
 * sit permanently in a layout or dashboard page. A gift is claimed only when
 * its recipient clicks: the credits land on their own billing account.
 *
 * `claimed` fires once the server confirmed a claim (the credits arrive a
 * moment later); a pack that asks for checkout fields opens the provider's
 * $0 checkout instead, and fires nothing.
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
export const GiftClaimBanner = /* @__PURE__ */ defineComponent({
  name: 'GiftClaimBanner',
  emits: {
    claimed: (_count: number) => true,
    error: (_message: string) => true,
  },
  setup(_props, { slots, emit }) {
    const gifts = useGifts()

    const claim = async (giftId: string): Promise<void> => {
      try {
        if (await gifts.claim(giftId)) emit('claimed', 1)
      }
      catch (error) {
        emit('error', refusalMessage(error, String(error)))
      }
    }

    return () => {
      const unclaimed = gifts.unclaimed.value
      if (slots.default) {
        return slots.default({ gifts: unclaimed, claim, isClaiming: gifts.isClaiming.value })
      }
      if (unclaimed.length === 0) return null
      // A polite live region: the banner appears when a gift lands, and a
      // screen reader should hear that without the page moving focus.
      return h('div', {
        'data-gift': 'banner',
        'role': 'status',
        'aria-live': 'polite',
        'aria-busy': gifts.isClaiming.value ? 'true' : undefined,
      }, unclaimed.map(gift =>
        h('div', { 'data-gift': 'item', 'key': gift.id }, [
          h('p', { 'data-gift': 'message' }, [
            // Decoration, not content — keep it off the accessible name.
            h('span', { 'aria-hidden': 'true' }, '🎁 '),
            h('strong', gift.purchaserName || 'Someone'),
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
