<script setup lang="ts">
import { computed } from 'vue'
import type { PricingCurrencySelectProps } from '../../parts'
import { usePricingView } from './pricing-table'

/**
 * `<PricingTable>`'s currency switch: a select of every currency the
 * catalog prices in, each named in the reader's language. A checkout then
 * pays in the one chosen.
 */
defineOptions({ name: 'PricingCurrencySelect' })
const props = defineProps<PricingCurrencySelectProps>()
const view = usePricingView('PricingCurrencySelect')
const { t, locale } = view.labels

/** A currency's name in the reader's language, with its code (`Euro (EUR)`); the code alone where `Intl` has no name for it. */
const names = computed(() => {
  let display: Intl.DisplayNames | undefined
  try {
    display = new Intl.DisplayNames(locale.value ? [locale.value] : undefined, { type: 'currency' })
  }
  catch {
    display = undefined
  }
  return (code: string) => {
    const upper = code.toUpperCase()
    const name = display?.of(upper)
    return name && name !== upper ? `${name} (${upper})` : upper
  }
})
const choose = (event: Event) => props.pricing.setCurrency((event.target as HTMLSelectElement).value)
</script>

<template>
  <label data-pricing="currency">
    <span data-pricing="currency-legend">{{ t('currency') }}</span>
    <select
      data-pricing="currency-select"
      :value="pricing.currency.value"
      @change="choose"
    >
      <option
        v-for="code in pricing.currencies.value"
        :key="code"
        data-pricing="currency-option"
        :value="code"
        :selected="code === pricing.currency.value"
      >
        {{ names(code) }}
      </option>
    </select>
  </label>
</template>
