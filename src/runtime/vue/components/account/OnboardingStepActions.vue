<script setup lang="ts">
import { busyAttributes } from '../../a11y'
import type { OnboardingStepProps } from '../../parts'

/**
 * A step's two buttons: "Next" (or "Finish" on the last step) and "Skip".
 * A step that saves a form submits it with "Next"; any other step moves on.
 */
defineOptions({ name: 'OnboardingStepActions' })
const props = defineProps<OnboardingStepProps & {
  /** The step is a form: "Next" submits it, and the form's own handler moves on. */
  submit?: boolean
  /** The step's save is running: "Next" says so and is marked busy. */
  pending?: boolean
}>()
const { t } = props.onboarding.labels
</script>

<template>
  <div data-onboarding="step-actions">
    <button
      v-if="submit"
      type="submit"
      data-onboarding="next"
      v-bind="busyAttributes(pending === true)"
    >
      {{ pending ? t('saving') : onboarding.isLast.value ? t('finish') : t('next') }}
    </button>
    <button
      v-else
      type="button"
      data-onboarding="next"
      @click="onboarding.next()"
    >
      {{ onboarding.isLast.value ? t('finish') : t('next') }}
    </button>
    <button
      type="button"
      data-onboarding="skip"
      @click="onboarding.skip()"
    >
      {{ t('skip') }}
    </button>
  </div>
</template>
