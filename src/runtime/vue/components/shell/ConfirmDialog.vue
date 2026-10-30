<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import type { Confirmation } from '../../utils/confirmation'
import { useModalFocus } from '../../utils/focus-return'

/**
 * The question a component asks before a destructive or far-reaching
 * action, when the app passes no `confirm` of its own: a native modal
 * `<dialog>` named by the question, with Cancel and the button that goes
 * ahead. Focus moves to Cancel as it opens (the step that changes nothing),
 * stays inside, and goes back to the control that had it once it closes.
 * Escape and Cancel answer `false`. Rendered by the component that asks,
 * driven by its `useConfirmation`; the words are the component's labels.
 *
 * @internal
 */
defineOptions({ name: 'ConfirmDialog' })

const props = defineProps<{
  confirmation: Confirmation
  /** The button that goes ahead. */
  acceptLabel: string
  /** The button that changes nothing. */
  cancelLabel: string
}>()

const id = useId()
const textId = `${id}-text`
const dialog = ref<HTMLDialogElement | null>(null)
const question = computed(() => props.confirmation.question.value)

// Focus opens on Cancel; the dialog leaves the page as it closes, and focus goes back where it was.
const modal = useModalFocus(dialog)

watch(question, (now, before) => {
  if (now && !before) void modal.show('[data-confirm="cancel"]')
  else if (!now && before) void modal.hide()
})

const answer = (ok: boolean) => props.confirmation.answer(ok)
</script>

<template>
  <dialog
    v-if="question"
    ref="dialog"
    data-confirm="dialog"
    data-state="open"
    role="alertdialog"
    :aria-labelledby="textId"
    @cancel.prevent="answer(false)"
  >
    <p
      :id="textId"
      data-confirm="text"
    >
      {{ question.text }}
    </p>
    <div data-confirm="actions">
      <button
        data-confirm="cancel"
        type="button"
        @click="answer(false)"
      >
        {{ cancelLabel }}
      </button>
      <button
        data-confirm="accept"
        type="button"
        @click="answer(true)"
      >
        {{ acceptLabel }}
      </button>
    </div>
  </dialog>
</template>
