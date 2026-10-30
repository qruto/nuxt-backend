<script setup lang="ts">
import { computed } from 'vue'
import type { BackendLabels, LabelKey } from '../../composables/use-labels'
import type { PricingPeriodSwitchProps } from '../../parts'
import { usePricingView } from './pricing-table'

/**
 * `<PricingTable>`'s monthly / yearly switch: a radio group, so the arrow
 * keys move between the two and the choice is announced. The yearly option
 * says what it saves, at most.
 */
defineOptions({ name: 'PricingPeriodSwitch' })
const props = defineProps<PricingPeriodSwitchProps>()
const view = usePricingView('PricingPeriodSwitch')
const { t } = view.labels
const best = computed(() => {
  const savings = view.context.value.plans.flatMap(plan => plan.offer.prices.year?.savings ?? [])
  return savings.length > 0 ? Math.max(...savings) : undefined
})
const name = (option: string) => t(`intervals.${option}` as LabelKey<BackendLabels['pricing']>)
const pick = (option: 'month' | 'year') => props.pricing.setInterval(option)
</script>

<template>
  <fieldset data-pricing="interval">
    <legend data-pricing="interval-legend">
      {{ t('interval') }}
    </legend>
    <label
      v-for="option in pricing.intervals.value"
      :key="option"
      data-pricing="interval-option"
      :data-interval="option"
      :data-checked="option === pricing.interval.value || undefined"
      :data-state="option === pricing.interval.value ? 'checked' : 'unchecked'"
    >
      <input
        type="radio"
        :name="`${view.uid}-interval`"
        :value="option"
        :checked="option === pricing.interval.value"
        data-pricing="interval-input"
        @change="pick(option)"
      >
      <span data-pricing="interval-name">{{ name(option) }}</span>
      <span
        v-if="option === 'year' && best !== undefined"
        data-pricing="interval-savings"
      >{{ t('save', { percent: best }) }}</span>
    </label>
  </fieldset>
</template>
