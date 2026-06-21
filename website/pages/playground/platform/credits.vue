<script setup lang="ts">
import { computed, ref } from 'vue'
import { api } from '#backend/api'

definePageMeta({ middleware: 'auth' })

const billing = useBilling()
const credits = useCredits()
const consumeCredit = useAction(api.billing.consumeCredit)

const creditPackId = computed(() => billing.products.value?.credits?.id)
const spending = ref(false)

async function spendCredit() {
  if (!credits.meterId.value) return
  spending.value = true
  try {
    await consumeCredit({ meterId: credits.meterId.value })
  }
  finally { spending.value = false }
}
</script>

<template>
  <div class="stack">
    <PageHeader
      tag="useCredits"
      title="Credits"
      live
    >
      Polar's prepaid-credits model: a one-time pack grants units to a usage meter
      at checkout, you spend them server-side, and <code>useCredits</code> reads
      the live balance. Prepaid, so spending is blocked at zero.
    </PageHeader>

    <div class="grid-auto">
      <MetricCard
        label="balance"
        :value="credits.balance.value ?? '—'"
        tone="accent"
        :loading="credits.isLoading.value"
        hint="available units"
      />
      <MetricCard
        label="credited"
        :value="credits.credited.value ?? '—'"
        tone="ok"
        hint="granted at checkout"
      />
      <MetricCard
        label="consumed"
        :value="credits.consumed.value ?? '—'"
        hint="spent so far"
      />
    </div>

    <LabPanel
      label="meter"
      title="Top up & spend"
      tone="accent"
    >
      <div class="row">
        <CheckoutLink
          v-if="creditPackId"
          :products="[creditPackId]"
          class="buy-btn"
        >
          Buy credit pack
        </CheckoutLink>
        <span
          v-else
          class="hint"
        >No credit pack configured (product key <code>credits</code>).</span>

        <LabButton
          variant="signal"
          :loading="spending"
          :disabled="!credits.meterId.value || (credits.balance.value ?? 0) <= 0"
          @click="spendCredit"
        >
          Spend 1 credit
        </LabButton>
        <LabButton
          variant="ghost"
          @click="credits.refresh()"
        >
          Refresh
        </LabButton>
      </div>

      <div
        class="meter"
        aria-hidden="true"
      >
        <div
          class="meter-fill"
          :style="{ width: `${Math.min(100, ((credits.balance.value ?? 0) / Math.max(1, credits.credited.value ?? 1)) * 100)}%` }"
        />
      </div>
      <p class="hint">
        <code>meterId</code>: {{ credits.meterId.value ?? '—' }}
      </p>
    </LabPanel>
  </div>
</template>

<style scoped>
.buy-btn {
  display: inline-flex; align-items: center; justify-content: center;
  padding: 0.5rem 0.9rem; border-radius: var(--r-sm);
  font-size: 0.82rem; font-weight: 600; text-decoration: none; cursor: pointer;
  background: var(--accent); color: var(--on-accent); box-shadow: var(--raise-accent);
}
.buy-btn:hover { background: var(--accent-press); }

.meter { height: 12px; border-radius: 99px; background: var(--sink); box-shadow: var(--inset-sm); overflow: hidden; margin: 1.1rem 0 0.6rem; }
.meter-fill { height: 100%; background: var(--accent); border-radius: 99px; transition: width 0.3s var(--ease-out); }
</style>
