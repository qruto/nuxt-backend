<script setup lang="ts">
import type { CancelFlowOfferProps } from '../../parts'

/** `<CancelFlow>`'s one offer, by its real terms, and the button that accepts it: the same size and style as the flow's "Cancel my plan" beside it, no countdown. */
defineOptions({ name: 'CancelFlowOffer' })
const props = defineProps<CancelFlowOfferProps>()
const { t } = props.flow.labels
</script>

<template>
  <div
    data-cancel-flow="offer"
    :data-kind="flow.offer.value?.kind"
  >
    <p
      data-cancel-flow="offer-terms"
      role="status"
    >
      {{ flow.offerText.value }}
    </p>
    <button
      data-cancel-flow="accept"
      type="button"
      v-bind="flow.busy('accept')"
      @click="flow.accept()"
    >
      {{ flow.running.value === 'accept' ? t('accepting') : flow.acceptText.value }}
    </button>
  </div>
</template>
