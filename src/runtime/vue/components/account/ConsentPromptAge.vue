<script setup lang="ts">
/**
 * The age question of `<ConsentPrompt>`, for an account that never answered
 * it: an empty field with a visible label, and no word of the minimum, so the
 * answer is not steered.
 *
 * Internal: a part of `<ConsentPrompt>`.
 *
 * @internal
 */
import type { LabelGroupOverrides } from '../../composables/use-labels'
import { useLabels } from '../../composables/use-labels'

const props = defineProps<{
  /** The refusal names this field. */
  invalid: boolean
  labels?: LabelGroupOverrides<'consent'>
}>()

const age = defineModel<string>({ required: true })

const { t } = useLabels('consent', () => props.labels)
</script>

<template>
  <label data-consent="age">
    <span data-consent="age-intro">{{ t('ageIntro') }}</span>
    <span data-consent="age-question">{{ t('ageQuestion') }}</span>
    <input
      v-model="age"
      type="text"
      inputmode="numeric"
      autocomplete="off"
      pattern="[0-9]*"
      required
      data-consent="age-input"
      :aria-invalid="invalid ? 'true' : undefined"
    >
  </label>
</template>
