<script setup lang="ts">
import type { CancelFlowQuestionProps } from '../../parts'

/** `<CancelFlow>`'s optional question: the main reason, a comment and "Continue". "Cancel my plan" is the flow's own, beside every step. */
defineOptions({ name: 'CancelFlowQuestion' })
const props = defineProps<CancelFlowQuestionProps>()
const { t } = props.flow.labels
</script>

<template>
  <form
    data-cancel-flow="question"
    @submit.prevent="flow.submit()"
  >
    <fieldset data-cancel-flow="reasons">
      <legend data-cancel-flow="question-title">
        {{ t('question') }}
      </legend>
      <label
        v-for="option in flow.reasons.value"
        :key="option.value"
        data-cancel-flow="reason"
        :data-checked="flow.reason.value === option.value ? '' : undefined"
      >
        <input
          v-model="flow.reason.value"
          data-cancel-flow="reason-input"
          type="radio"
          :name="flow.id('reason')"
          :value="option.value"
        >
        {{ option.label }}
      </label>
    </fieldset>
    <label data-cancel-flow="comment-label">
      {{ t('comment') }}
      <textarea
        v-model="flow.comment.value"
        data-cancel-flow="comment"
        maxlength="500"
        rows="3"
      />
    </label>
    <button
      data-cancel-flow="continue"
      type="submit"
      v-bind="flow.busy('continue')"
    >
      {{ flow.running.value === 'continue' ? t('canceling') : t('continue') }}
    </button>
  </form>
</template>
