<script setup lang="ts">
import { computed } from 'vue'
import { busyAttributes } from '../../a11y'
import type { PricingPackCardProps } from '../../parts'
import { usePricingView } from './pricing-table'
import PricingPromotion from './PricingPromotion.vue'

/** One credit pack of `<PricingTable>`: its credits, price and price per credit, its promotion, and the button that buys it. */
defineOptions({ name: 'PricingPackCard' })
const props = defineProps<PricingPackCardProps>()
const view = usePricingView('PricingPackCard')
const { t } = view.labels
const nameId = computed(() => view.nameId('pack', props.pack.key))
const busy = computed(() => props.pricing.pending.value === props.pack.key)
const promotion = computed(() => view.packPromotion(props.pack))
</script>

<template>
  <article
    data-pricing="pack"
    :data-best-value="pack.isBestValue || undefined"
    :aria-labelledby="nameId"
  >
    <div
      :id="nameId"
      data-pricing="pack-name"
    >
      {{ pack.name }}<span
        v-if="pack.isBestValue"
        data-pricing="best-value"
      >{{ t('bestValue') }}</span>
    </div>
    <div data-pricing="pack-price">
      {{ pack.price }}
    </div>
    <PricingPromotion
      v-if="promotion"
      hook="pack-promotion"
      :text="promotion"
    />
    <p
      v-if="pack.credits !== undefined"
      data-pricing="pack-credits"
    >
      {{ t('packCredits', { count: pack.credits }) }}
    </p>
    <p
      v-if="pack.perCredit !== undefined"
      data-pricing="pack-per-credit"
    >
      {{ t('perCredit', { price: pack.perCredit }) }}<span
        v-if="pack.lessPerCredit !== undefined"
        data-pricing="pack-saving"
      >{{ t('lessPerCredit', { percent: pack.lessPerCredit }) }}</span>
    </p>
    <p
      v-if="pack.blurb"
      data-pricing="pack-blurb"
    >
      {{ pack.blurb }}
    </p>
    <!-- Unavailable without a session; busy while its checkout opens. -->
    <button
      v-if="view.manages()"
      data-pricing="pack-action"
      type="button"
      :disabled="!view.context.value.isAuthenticated"
      :aria-describedby="nameId"
      v-bind="busyAttributes(busy)"
      @click="view.context.value.buyPack(pack.key)"
    >
      {{ busy ? t('checkingOut') : t('topUp') }}
    </button>
  </article>
</template>
