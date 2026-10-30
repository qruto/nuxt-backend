<script setup lang="ts">
/**
 * The dialog of `<ConsentPrompt>`: the consents still to accept, the age
 * question and the button. It is modal, so what is behind it is inert, and
 * Escape does not close it while a consent is required.
 *
 * Internal: a part of `<ConsentPrompt>`.
 *
 * @internal
 */
import { nextTick, ref, useId, watch } from 'vue'
import type { LabelGroupOverrides } from '../../composables/use-labels'
import { useLabels } from '../../composables/use-labels'
import type { ConsentAsk } from '../../composables/use-consents'
import ConsentPromptAge from './ConsentPromptAge.vue'
import ConsentPromptItem from './ConsentPromptItem.vue'

const props = defineProps<{
  asks: ConsentAsk[]
  ticked: Record<string, boolean>
  /** Whether the age is asked too. */
  needsAge: boolean
  /** A required consent or the age is unanswered: the dialog cannot be dismissed. */
  blocking: boolean
  /** Every required box is ticked and the age is typed. */
  ready: boolean
  saving: boolean
  /** The refusal to show, in words. */
  error: string | null
  /** The age field is the refused field. */
  ageInvalid: boolean
  labels?: LabelGroupOverrides<'consent'>
}>()

const age = defineModel<string>('age', { required: true })

const emit = defineEmits<{
  tick: [kind: string, value: boolean]
  submit: []
  later: []
}>()

defineSlots<{
  consent?: (props: ConsentAsk & { granted: boolean, grant: () => void, withdraw: () => void }) => unknown
  footer?: () => unknown
}>()

/** What the `consent` slot receives for one kind: the line, and the box a slot ticks and unticks. */
const contextOf = (ask: ConsentAsk) => ({
  ...ask,
  granted: props.ticked[ask.kind] === true,
  grant: () => emit('tick', ask.kind, true),
  withdraw: () => emit('tick', ask.kind, false),
})

const { t } = useLabels('consent', () => props.labels)
const id = useId()

const dialog = ref<HTMLDialogElement | null>(null)
watch(dialog, async (element) => {
  if (!element || element.open) return
  await nextTick()
  element.showModal()
}, { flush: 'post' })

const onCancel = (event: Event) => {
  if (props.blocking) event.preventDefault()
}
// The browser may close it past a cancel it cannot refuse (a second Escape
// with no click between, under Chromium's close watcher): while a consent
// is required it opens again; otherwise a close is "later".
const onClose = () => {
  if (props.blocking) dialog.value?.showModal()
  else emit('later')
}
</script>

<template>
  <dialog
    ref="dialog"
    data-consent="dialog"
    :data-state="saving ? 'pending' : 'ready'"
    :aria-labelledby="`${id}-title`"
    :aria-busy="saving || undefined"
    @cancel="onCancel"
    @close="onClose"
  >
    <form
      data-consent="form"
      @submit.prevent="emit('submit')"
    >
      <h2
        :id="`${id}-title`"
        data-consent="title"
      >
        {{ t('title') }}
      </h2>
      <ul
        v-if="asks.length > 0"
        data-consent="list"
      >
        <ConsentPromptItem
          v-for="ask in asks"
          :key="ask.kind"
          :ask="ask"
          :ticked="ticked[ask.kind] === true"
          :saving="saving"
          :labels="labels"
          @tick="value => emit('tick', ask.kind, value)"
        >
          <slot
            v-if="$slots.consent"
            name="consent"
            v-bind="contextOf(ask)"
          />
        </ConsentPromptItem>
      </ul>
      <ConsentPromptAge
        v-if="needsAge"
        v-model="age"
        :invalid="ageInvalid"
        :labels="labels"
      />
      <p
        v-if="error"
        data-consent="error"
        role="alert"
      >
        {{ error }}
      </p>
      <div data-consent="actions">
        <button
          type="submit"
          data-consent="submit"
          :aria-disabled="saving || !ready ? 'true' : undefined"
        >
          {{ saving ? t('saving') : t('submit') }}
        </button>
        <button
          v-if="!blocking"
          type="button"
          data-consent="later"
          @click="emit('later')"
        >
          {{ t('later') }}
        </button>
      </div>
      <slot name="footer" />
    </form>
  </dialog>
</template>
