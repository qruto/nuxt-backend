<script setup lang="ts">
import { nextTick, useId, useTemplateRef, watch } from 'vue'
import { type LabelGroupOverrides, useLabels } from '../../composables/use-labels'
import { useHowDidYouHear } from '../../composables/use-how-did-you-hear'
import { busyAttributes } from '../../a11y'
import { type HowDidYouHearSlots, optionKey } from './how-did-you-hear'

/**
 * One optional question after sign-up: "How did you hear about us?". The
 * answer is kept next to the first campaign link the person arrived
 * through, so the admin console's Growth view shows what they said beside
 * what was tracked. `ai-assistant` makes visible the channel no referrer
 * shows. One question, a Skip button, and a field for "Somewhere else";
 * nobody is asked twice: someone who answered or skipped it before sees
 * nothing, and `done` is emitted at once. Renders nothing for a signed-out
 * visitor.
 *
 * @example
 * ```vue
 * <HowDidYouHear
 *   :options="['friend', 'search', 'ai-assistant', 'social', 'podcast', 'other']"
 *   @done="next"
 * />
 * ```
 */
defineOptions({ name: 'HowDidYouHear' })

const props = defineProps<{
  /** The answers offered, in order, by name: each reads its label `source.options.<name in camel case>`, or its name. Default: friend, search, ai-assistant, social, podcast, other. */
  options?: readonly string[]
  /** Copy for the question, over `appConfig.backend.labels.source` and the translations. */
  labels?: LabelGroupOverrides<'source'>
}>()

const emit = defineEmits({
  /** The answer was kept (its name), the question skipped (`null`), or it was answered before. */
  done: (_answer: string | null) => true,
  /** Keeping the answer failed: the message, in the person's language. */
  error: (_message: string) => true,
})

defineSlots<HowDidYouHearSlots>()

const question = useHowDidYouHear({ options: () => props.options })
const labels = useLabels('source', () => props.labels)
const { t } = labels
const id = useId()
const closed = useTemplateRef<HTMLElement>('closed')
// Set while this form answers: the answer reaching the live query is not "asked before".
let answering = false

/** An answer's text: its label, or its own name for an answer of the app's with none. */
const labelOf = (option: string): string => labels.lookup(optionKey(option)) ?? option

// Asked before: nothing to ask, and the flow moves on.
watch(question.isAnswered, (answered) => {
  if (answered && !answering && !question.isDone.value) emit('done', null)
}, { immediate: true })

async function finish(skip: boolean): Promise<void> {
  if (question.isPending.value) return
  answering = true
  try {
    if (skip) await question.skip()
    else await question.submit()
    emit('done', skip ? null : question.chosen.value)
    // The fieldset holding the focused button is gone: focus moves to the heading that replaced it.
    await nextTick()
    closed.value?.focus()
  }
  catch (error) {
    emit('error', labels.errorMessage(error))
  }
  finally {
    answering = false
  }
}
</script>

<template>
  <form
    v-if="!question.isSignedOut.value || question.isLoading.value"
    data-source="root"
    :data-state="question.isDone.value ? 'done' : question.isAnswered.value ? 'answered' : 'open'"
    :aria-busy="question.isLoading.value || question.isPending.value ? 'true' : undefined"
    :aria-labelledby="`${id}-title`"
    novalidate
    @submit.prevent="finish(false)"
  >
    <template v-if="!question.isLoading.value && !question.isAnswered.value && !question.isDone.value">
      <fieldset data-source="question">
        <legend
          :id="`${id}-title`"
          data-source="title"
        >
          {{ t('title') }}
        </legend>
        <p
          :id="`${id}-hint`"
          data-source="hint"
        >
          {{ t('hint') }}
        </p>
        <label
          v-for="option in question.options.value"
          :key="option"
          data-source="option"
          :data-option="option"
        >
          <input
            v-model="question.chosen.value"
            data-source="choice"
            type="radio"
            :name="`${id}-answer`"
            :value="option"
            :aria-describedby="`${id}-hint`"
          >
          <slot
            name="option"
            :option="option"
            :label="labelOf(option)"
          >
            <span data-source="label">{{ labelOf(option) }}</span>
          </slot>
        </label>
        <label
          v-if="question.chosen.value === 'other'"
          data-source="other"
        >
          <span data-source="label">{{ t('otherLabel') }}</span>
          <input
            v-model="question.detail.value"
            data-source="detail"
            type="text"
            autocomplete="off"
            :maxlength="question.detailMax"
          >
        </label>
      </fieldset>
      <p
        v-if="question.error.value"
        data-source="error"
        role="alert"
      >
        {{ labels.errorMessage(question.error.value) }}
      </p>
      <div data-source="actions">
        <button
          data-source="submit"
          type="submit"
          v-bind="busyAttributes(question.isPending.value)"
        >
          {{ question.isPending.value ? t('saving') : t('submit') }}
        </button>
        <button
          data-source="skip"
          type="button"
          :aria-disabled="question.isPending.value ? 'true' : undefined"
          @click="finish(true)"
        >
          {{ t('skip') }}
        </button>
      </div>
    </template>
    <h2
      v-else
      :id="`${id}-title`"
      ref="closed"
      tabindex="-1"
      data-source="title"
      data-state="closed"
    >
      {{ t('title') }}
    </h2>
    <p
      data-source="status"
      role="status"
      aria-live="polite"
    >
      {{ question.isLoading.value ? t('loading') : question.isDone.value ? t('thanks') : question.isAnswered.value ? t('answered') : '' }}
    </p>
  </form>
</template>
