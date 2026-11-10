<script setup lang="ts">
import type { PricingChangeConfirmProps } from '../../parts'
import PlanChangeConfirmGroup from './PlanChangeConfirmGroup.vue'
import { usePricingView } from './pricing-table'

/**
 * A subscriber's switch to one plan's price, confirmed in one step: the
 * price it moves to, when the switch happens and how the period's
 * difference is settled, then the button that switches. Shown under the
 * card whose button opened it.
 */
defineOptions({ name: 'PricingChangeConfirm' })
const props = defineProps<PricingChangeConfirmProps>()
const view = usePricingView('PricingChangeConfirm')
</script>

<template>
  <PlanChangeConfirmGroup
    v-if="view.change.target.value?.key === props.plan.key"
    :confirm="view.change"
  />
</template>
