<script setup lang="ts">
import { useId } from 'vue'
import type { OnboardingPlanProps } from '../../parts'

/**
 * `<OnboardingFlow>`'s plan step, shown only when the catalog sells a plan:
 * the pricing table, and a way to decide later. Choosing a plan goes to the
 * billing provider's checkout and back; the person may also stay on the free
 * plan.
 */
defineOptions({ name: 'OnboardingPlan' })
const props = defineProps<OnboardingPlanProps>()
const { t } = props.onboarding.labels
const id = useId()
</script>

<template>
  <div data-onboarding="plan">
    <h2
      :id="`${id}-title`"
      data-onboarding="step-title"
    >
      {{ t('plan.heading') }}
    </h2>
    <p data-onboarding="intro">
      {{ t('plan.intro') }}
    </p>
    <PricingTable
      :show-packs="false"
      :show-portal="false"
    />
    <div data-onboarding="step-actions">
      <button
        type="button"
        data-onboarding="skip"
        @click="onboarding.next()"
      >
        {{ t('plan.later') }}
      </button>
    </div>
  </div>
</template>
