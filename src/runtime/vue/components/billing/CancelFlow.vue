<script setup lang="ts">
import { computed } from 'vue'
import type { BackendLabels, LabelOverrides } from '../../composables/use-labels'
import { type CancelFlowSlots, useCancelFlow } from './cancel-flow'

/**
 * Cancelling takes one step; a save offer is one optional step (LIFECYCLE).
 * The flow asks one optional question, the main reason with a comment, and
 * shows at most the one offer the server answers for it (a pause, a cheaper
 * plan or a discount, by its real terms), then the end: the date the plan
 * ends and a "Keep my plan" button until then. "Cancel my plan" is on every
 * screen and finishes at once, a button of the same size and style as the
 * offer's. Which offer, and whether one may be made at all (none in the
 * withdrawal period, on a past-due plan or a trial, one per customer in 12
 * months), is the server's: `setupBilling({ lifecycle: { saveOffers } })`.
 *
 * Its steps are the parts `CancelFlowQuestion`, `CancelFlowOffer` and
 * `CancelFlowEnd`, each given `useCancelFlow()`; slots of the same names
 * replace them here. Its words are the `cancelFlow` labels.
 *
 * @example
 * ```vue
 * <CancelFlow v-if="open" @close="open = false" @canceled="navigateTo('/settings')" />
 * ```
 */
defineOptions({ name: 'CancelFlow' })
const props = withDefaults(defineProps<{
  /** Which subscription, with `multipleSubscriptions`. */
  subscriptionId?: string
  /** Copy for this flow, over `appConfig.backend.labels.cancelFlow` and the translations. */
  labels?: LabelOverrides<BackendLabels['cancelFlow']>
}>(), { subscriptionId: undefined, labels: undefined })
const emit = defineEmits({
  /** The person closed the flow without cancelling, or after it ended. */
  close: () => true,
  /** The plan is canceled: it ends at `endsAt` (epoch ms), `null` when the server did not say. */
  canceled: (_endsAt: number | null) => true,
  /** The plan stays: the offer was accepted, or the cancellation undone. */
  kept: () => true,
  /** A step failed: the words the flow shows. */
  error: (_message: string) => true,
})
defineSlots<CancelFlowSlots>()

const flow = useCancelFlow({
  labels: () => props.labels,
  subscriptionId: () => props.subscriptionId,
  onCanceled: endsAt => emit('canceled', endsAt),
  onKept: () => emit('kept'),
  onError: message => emit('error', message),
})
const { t } = flow.labels
const step = computed(() => flow.step.value)

function keydown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || flow.running.value) return
  event.stopPropagation()
  emit('close')
}
</script>

<template>
  <section
    data-cancel-flow="root"
    :data-step="step"
    :aria-labelledby="flow.id('title')"
    :aria-busy="flow.running.value ? 'true' : undefined"
    @keydown="keydown"
  >
    <h3
      :id="flow.id('title')"
      data-cancel-flow="title"
    >
      {{ step === 'offer' ? t('offerTitle') : t('title') }}
    </h3>
    <slot
      v-if="step === 'question'"
      name="question"
      v-bind="flow"
    >
      <CancelFlowQuestion :flow="flow" />
    </slot>
    <slot
      v-else-if="step === 'offer'"
      name="offer"
      v-bind="flow"
    >
      <CancelFlowOffer :flow="flow" />
    </slot>
    <slot
      v-else
      name="end"
      v-bind="flow"
    >
      <CancelFlowEnd :flow="flow" />
    </slot>
    <!-- "Cancel my plan" on every step before the end, finishing at once; "Close" after it. -->
    <button
      v-if="step === 'question' || step === 'offer'"
      data-cancel-flow="cancel"
      type="button"
      v-bind="flow.busy('cancel')"
      @click="flow.cancelNow()"
    >
      {{ flow.running.value === 'cancel' ? t('canceling') : t('cancel') }}
    </button>
    <button
      v-else
      data-cancel-flow="close"
      type="button"
      @click="emit('close')"
    >
      {{ t('close') }}
    </button>
    <p
      v-if="flow.error.value"
      data-cancel-flow="error"
      role="alert"
    >
      {{ flow.error.value }}
    </p>
  </section>
</template>
