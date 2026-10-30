<script setup lang="ts">
/**
 * The live half of ::demo-pricing: usePricing() read in the browser, in the
 * visitor's currency, with the currency switch the catalog's currencies
 * make. It renders only inside <DemoBlock>, once the backend client has
 * loaded. Nothing here buys: the playground's pricing page does.
 */
const pricing = usePricing({ server: false })
const id = useId()

/** A price as the reader's locale writes it, in its currency. */
function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: amount % 100 ? 2 : 0 }).format(amount / 100)
  }
  catch {
    return `${amount / 100} ${currency.toUpperCase()}`
  }
}

const plans = computed(() => (pricing.plans.value ?? []).filter(plan => !plan.retired).map((plan) => {
  const price = plan.prices.month ?? plan.prices.year
  const currency = pricing.currency.value ?? price?.currency ?? 'usd'
  return {
    key: plan.key,
    name: plan.name,
    free: plan.free === true,
    price: price ? money(plan.free ? 0 : price.amount, plan.free ? currency : price.currency) : '—',
    per: plan.prices.month ? '/ month' : '/ year',
    credits: price?.credits?.units,
  }
}))
</script>

<template>
  <div class="grid gap-3">
    <label
      v-if="pricing.currencies.value.length > 1"
      :for="id"
      class="flex flex-wrap items-center gap-2 text-sm text-(--ink-dim)"
    >
      Currency
      <select
        :id="id"
        class="rounded border border-(--line) bg-(--panel) px-2 py-1 font-mono text-(--ink)"
        :value="pricing.currency.value"
        @change="pricing.setCurrency(($event.target as HTMLSelectElement).value)"
      >
        <option
          v-for="code in pricing.currencies.value"
          :key="code"
          :value="code"
        >
          {{ code.toUpperCase() }}
        </option>
      </select>
    </label>
    <p
      v-if="pricing.isLoading.value"
      class="m-0 text-sm text-(--ink-dim)"
    >
      Reading the prices…
    </p>
    <p
      v-else-if="pricing.error.value"
      role="alert"
      class="m-0 text-sm text-(--err)"
    >
      The prices could not be read: {{ pricing.error.value.message }}
    </p>
    <Lcd
      v-else
      label="getPricing"
      live
    >
      <div
        v-for="plan in plans"
        :key="plan.key"
        class="lcd-row flex flex-wrap items-baseline gap-x-3"
      >
        <span
          class="pxled"
          :class="plan.free ? 'led-ok' : 'led-warn'"
        />
        <span class="min-w-20 font-semibold">{{ plan.name }}</span>
        <span class="tabular-nums">{{ plan.price }} {{ plan.per }}</span>
        <span
          v-if="plan.credits"
          class="text-(--ink-dim)"
        >{{ plan.credits }} credits</span>
      </div>
    </Lcd>
  </div>
</template>
