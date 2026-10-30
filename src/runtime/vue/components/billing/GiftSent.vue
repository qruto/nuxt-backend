<script setup lang="ts">
// One gift the person sent, with what they can still do until it is
// claimed: send the notice again, give it to someone else, move its date,
// cancel it for a refund. A new address or date is typed in a form that
// opens below; the page's `<GiftList>` runs the actions.
import { nextTick, ref } from 'vue'
import { busyAttributes } from '../../a11y'
import type { SentGiftView } from '../../composables/use-gift-list'
import type { UseLabelsReturn } from '../../composables/use-labels'
import { focusDropped, returnFocus } from '../../utils/focus-return'

const props = defineProps<{
  gift: SentGiftView
  /** The element that names the gift, which its buttons describe. */
  nameId: string
  /** The element that explains a cancel, which its button describes too. */
  hintId: string
  /** Whether an action runs for this gift. */
  busy: boolean
  /** Whether any action runs, for any gift: a form saves once at a time. */
  anyBusy: boolean
  /** Give the gift to a new address; whether it went through. */
  changeRecipient: (email: string) => Promise<boolean>
  /** Move the gift's date; whether it went through. */
  reschedule: (date: string) => Promise<boolean>
  t: UseLabelsReturn<'gift'>['t']
}>()
defineEmits<{ resend: [], cancel: [] }>()

const editing = ref<'recipient' | 'date' | null>(null)
const value = ref('')
const root = ref<HTMLElement | null>(null)

function open(kind: 'recipient' | 'date'): void {
  editing.value = editing.value === kind ? null : kind
  value.value = ''
}

async function save(): Promise<void> {
  const kind = editing.value
  if (!kind || props.anyBusy || !value.value) return
  if (!await (kind === 'recipient' ? props.changeRecipient(value.value) : props.reschedule(value.value))) return
  editing.value = null
  await nextTick()
  // The form went: focus goes back to the button that opened it, never to the top of the page.
  if (focusDropped()) returnFocus(root.value?.querySelector<HTMLElement>(`[data-gift="entry-${kind}"]`) ?? root.value)
}
</script>

<template>
  <li
    ref="root"
    data-gift="entry"
    :data-status="gift.status"
    role="group"
    :aria-labelledby="nameId"
  >
    <p
      :id="nameId"
      data-gift="entry-what"
    >
      {{ gift.what }}
    </p>
    <p data-gift="entry-meta">
      {{ t('to', { recipient: gift.recipient }) }} · {{ gift.dateText }} · {{ gift.statusText }}
    </p>
    <p
      v-if="gift.message"
      data-gift="entry-message"
    >
      {{ gift.message }}
    </p>
    <div
      v-if="gift.canChange"
      data-gift="entry-actions"
    >
      <button
        v-if="gift.canResend"
        type="button"
        data-gift="entry-resend"
        v-bind="busyAttributes(busy)"
        :aria-describedby="nameId"
        @click="$emit('resend')"
      >
        {{ busy ? t('resending') : t('resend') }}
      </button>
      <button
        type="button"
        data-gift="entry-recipient"
        :aria-expanded="editing === 'recipient'"
        :aria-describedby="nameId"
        @click="open('recipient')"
      >
        {{ t('changeRecipient') }}
      </button>
      <button
        v-if="gift.canReschedule"
        type="button"
        data-gift="entry-date"
        :aria-expanded="editing === 'date'"
        :aria-describedby="nameId"
        @click="open('date')"
      >
        {{ t('reschedule') }}
      </button>
      <button
        type="button"
        data-gift="entry-cancel"
        v-bind="busyAttributes(busy)"
        :aria-describedby="`${nameId} ${hintId}`"
        @click="$emit('cancel')"
      >
        {{ busy ? t('canceling') : t('cancel') }}
      </button>
    </div>
    <form
      v-if="editing"
      data-gift="entry-form"
      @submit.prevent="save"
    >
      <label>
        <span>{{ editing === 'recipient' ? t('newRecipient') : t('newDate') }}</span>
        <input
          v-model="value"
          :type="editing === 'recipient' ? 'email' : 'datetime-local'"
          :autocomplete="editing === 'recipient' ? 'off' : undefined"
          required
        >
      </label>
      <button
        type="submit"
        v-bind="busyAttributes(busy)"
      >
        {{ editing === 'recipient' ? (busy ? t('savingRecipient') : t('saveRecipient')) : (busy ? t('savingDate') : t('saveDate')) }}
      </button>
    </form>
  </li>
</template>
