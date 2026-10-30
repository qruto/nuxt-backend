<script setup lang="ts">
import { computed } from 'vue'
import { busyAttributes } from '../../a11y'
import type { CancelConfirm } from '../../utils/cancel-confirm'

/**
 * The one-step cancellation's group, while it is open: what ends when, and
 * the one button that cancels. Escape closes it and gives focus back to the
 * button that opened it.
 *
 * @internal
 */
defineOptions({ name: 'CancelConfirmGroup' })
const props = defineProps<{ confirm: CancelConfirm }>()
const options = computed(() => props.confirm.options)
const hook = (value: string) => ({ [`data-${options.value.family}`]: value })
const busy = () => options.value.isBusy()
const ends = () => options.value.endsOn()

function keydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  event.stopPropagation()
  props.confirm.close()
}
</script>

<template>
  <div
    v-if="confirm.isOpen.value"
    :id="options.partId('confirm')"
    v-bind="hook('cancel-confirm')"
    role="group"
    data-state="open"
    :aria-labelledby="options.partId('title')"
    @keydown="keydown"
  >
    <component
      :is="options.titleTag"
      :id="options.partId('title')"
      v-bind="hook('confirm-title')"
    >
      {{ options.t('confirmTitle') }}
    </component>
    <p v-bind="hook('confirm-ends')">
      {{ ends() ? options.t('confirmEnds', { date: ends()! }) : options.t('confirmEndsPeriod') }}
    </p>
    <button
      v-bind="{ ...hook('confirm-cancel'), ...busyAttributes(busy()) }"
      type="button"
      @click="busy() ? undefined : options.confirm()"
    >
      {{ busy() ? options.t('canceling') : options.t('confirmCancel') }}
    </button>
  </div>
</template>
