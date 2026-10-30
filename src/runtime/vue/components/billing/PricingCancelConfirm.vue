<script setup lang="ts">
import type { PricingCancelConfirmProps } from '../../parts'
import CancelConfirmGroup from './CancelConfirmGroup.vue'
import { usePricingView } from './pricing-table'

/** The one-step confirmation of the current plan's cancellation: what ends when, and the one button that cancels. */
defineOptions({ name: 'PricingCancelConfirm' })
defineProps<PricingCancelConfirmProps>()
const view = usePricingView('PricingCancelConfirm')
</script>

<template>
  <CancelConfirmGroup :confirm="view.confirm" />
</template>
