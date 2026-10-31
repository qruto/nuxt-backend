<script setup lang="ts">
import { usePricingView } from './pricing-table'

/**
 * A price's promotion, in words: its name, its terms and the regular price
 * after it, and its end as a date. No struck-through price and no countdown.
 *
 * @internal
 */
defineOptions({ name: 'PricingPromotion' })
defineProps<{ hook: 'plan-promotion' | 'pack-promotion', text: string }>()
const view = usePricingView('PricingPromotion')
</script>

<template>
  <p :data-pricing="hook">
    <span data-pricing="promotion-name">{{ view.context.value.promotion?.name }}</span>
    {{ text }}
    <span
      v-if="view.promotionEnds()"
      data-pricing="promotion-ends"
    >{{ view.promotionEnds() }}</span>
  </p>
</template>
