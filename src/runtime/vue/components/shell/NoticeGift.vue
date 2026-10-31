<script setup lang="ts">
import { computed, h, nextTick, ref, useId, watch, type Ref } from 'vue'
import { busyAttributes } from '../../a11y'
import { formatBillingDate } from '../../composables/billing-format'
import type { ReceivedGift } from '../../composables/use-billing'
import { useGifts } from '../../composables/use-gifts'
import { refusalText, useLabels } from '../../composables/use-labels'
import { focusDropped, holdsFocus, returnFocus } from '../../utils/focus-return'
import { VNodes } from '../../utils/vnodes'
import { type GiftNoticeContext, turnedOff } from './notices'

/**
 * `<BackendNotices>`' gift notice: the signed-in person's unclaimed gifts,
 * each with a "Receive" button. Nothing when there is nothing to claim:
 * what stays is an empty live region the notice appears in, so a screen
 * reader announces it. A gift is claimed only when its recipient clicks:
 * the credits land on their own billing account.
 *
 * @internal
 */
defineOptions({ name: 'NoticeGift' })
const props = defineProps<{
  /** The `gift` slot of `<BackendNotices>`, which replaces the whole notice. */
  slotContent?: (context: GiftNoticeContext) => unknown
}>()
const emit = defineEmits({
  claimed: (_count: number) => true,
  error: (_message: string) => true,
})

const gifts = useGifts()
const labels = useLabels('gift')
const { t, rich, locale } = labels
const uid = useId()
const partId = (key: string, part: string) => `${uid}-${key}-${part}`
// The gift being received, what the last claim left to say.
const claiming: Ref<string | null> = ref(null)
const received = ref(false)
const failed: Ref<(() => string) | null> = ref(null)
const busy = () => claiming.value !== null || gifts.isPending.value

// A claimed gift leaves the list, and its button with it, once the gifts
// read catches up. If the person was on it, focus moves to the gift that
// took its place in the list (the one before it, when it was the last), or
// to the note that says the gift arrived, never to the top of the page.
// Someone who moved on meanwhile keeps their place.
const region = ref<HTMLElement | null>(null)
let keepFocus = false
/** Where the claimed gift stood in the list. */
let claimedAt = 0
function settleFocus(): void {
  if (!keepFocus || !region.value) return
  if (!focusDropped()) {
    // Still on the notice (the list has not caught up yet), or elsewhere on purpose.
    if (!holdsFocus(region.value)) keepFocus = false
    return
  }
  keepFocus = false
  const buttons = region.value.querySelectorAll<HTMLElement>('[data-gift="claim"]')
  returnFocus(buttons[Math.min(claimedAt, buttons.length - 1)] ?? region.value.querySelector<HTMLElement>('[data-gift="claimed"]'))
}
// The ids, not the count: a gift that arrives as the claimed one leaves keeps the count.
watch(() => gifts.unclaimed.value.map(gift => gift.id).join('\n'), settleFocus, { flush: 'post' })

async function claim(giftId: string): Promise<void> {
  // A second press while a claim runs does nothing; the buttons keep focus (`aria-disabled`).
  if (busy()) return
  const hadFocus = holdsFocus(region.value)
  claimedAt = Math.max(0, gifts.unclaimed.value.findIndex(gift => gift.id === giftId))
  claiming.value = giftId
  received.value = false
  failed.value = null
  try {
    if (await gifts.claim(giftId)) {
      received.value = true
      emit('claimed', 1)
      keepFocus = hadFocus
      void nextTick(settleFocus)
    }
  }
  catch (error) {
    failed.value = () => refusalText(labels, error, t('claimFailed'))
    emit('error', failed.value())
  }
  finally {
    claiming.value = null
  }
}

const context = computed<GiftNoticeContext>(() => ({ gifts: gifts.unclaimed.value, claim, isPending: busy() }))
/** One gift's sentence, the sender in bold, in the reader's language. */
const sentence = (gift: ReceivedGift) => {
  const sender = h('strong', { 'data-gift': 'sender' }, gift.purchaserName || t('someone'))
  return gift.message ? rich('receivedWithMessage', { sender, message: gift.message }) : rich('received', { sender })
}
// A gift is a group named by its sentence and its date, so two gifts from one sender still read apart; its button is described by the same.
const named = (gift: ReceivedGift) => `${partId(gift.id, 'message')} ${partId(gift.id, 'date')}`

// In the template: The live region stays mounted, so the notice is announced
// when a gift lands in it, and so is a claim that went through; a failed
// claim is an alert beside it.
</script>

<template>
  <VNodes
    v-if="props.slotContent && !turnedOff(props.slotContent, context)"
    :nodes="props.slotContent(context) as never"
  />
  <div
    v-else-if="!props.slotContent"
    ref="region"
    data-gift="region"
  >
    <div
      data-gift="live"
      role="status"
      aria-live="polite"
    >
      <div
        v-if="gifts.unclaimed.value.length > 0"
        data-gift="banner"
        :aria-busy="busy() ? 'true' : undefined"
      >
        <div
          v-for="gift in gifts.unclaimed.value"
          :key="gift.id"
          data-gift="item"
          role="group"
          :aria-labelledby="named(gift)"
        >
          <p
            :id="partId(gift.id, 'message')"
            data-gift="message"
          >
            <!-- Decoration, not content: kept off the accessible name. -->
            <span
              data-gift="icon"
              aria-hidden="true"
            >🎁 </span><VNodes :nodes="sentence(gift)" />
          </p>
          <span
            :id="partId(gift.id, 'date')"
            data-gift="date"
          >{{ formatBillingDate(gift.createdAt, { dateStyle: 'medium' }, locale) }}</span>
          <button
            data-gift="claim"
            type="button"
            v-bind="busyAttributes(busy())"
            :aria-describedby="named(gift)"
            @click="claim(gift.id)"
          >
            {{ claiming === gift.id ? t('claiming') : t('claim') }}
          </button>
        </div>
      </div>
      <p
        v-if="received"
        data-gift="claimed"
        tabindex="-1"
      >
        {{ t('claimed') }}
      </p>
    </div>
    <p
      v-if="failed"
      data-gift="error"
      role="alert"
    >
      {{ failed() }}
    </p>
  </div>
</template>
