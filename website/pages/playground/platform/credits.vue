<script setup lang="ts">
import { computed, ref } from 'vue'
import { api } from '#backend/api'

definePageMeta({ middleware: 'auth' })

const billing = useBilling()
const credits = useCredits()
const consumeCredit = useAction(api.billing.consumeCredit)

const creditPackId = computed(() => billing.products.value?.credits100?.id)
const spending = ref(false)

async function spendCredit() {
  if (!credits.meterId.value) return
  spending.value = true
  try {
    await consumeCredit({ meterId: credits.meterId.value })
  }
  finally { spending.value = false }
}

// Gift a credit pack to another email — the recipient receives the credits
// (attached automatically if they have an account, claimed on first sign-in
// otherwise; see the GiftClaimBanner above the metrics).
const giftEmail = ref('')
const giftMessage = ref('')
const gifting = ref(false)
const giftNotice = ref('')

async function sendGift() {
  if (!creditPackId.value || !giftEmail.value) return
  gifting.value = true
  giftNotice.value = ''
  try {
    await credits.gift(creditPackId.value, {
      recipientEmail: giftEmail.value,
      message: giftMessage.value || undefined,
    })
    giftNotice.value = `Checkout opened — once paid, ${giftEmail.value} receives the credits.`
    giftEmail.value = ''
    giftMessage.value = ''
  }
  catch (error) {
    giftNotice.value = error instanceof Error ? error.message : String(error)
  }
  finally { gifting.value = false }
}
</script>

<template>
  <div class="stack">
    <PageHeader
      tag="useCredits"
      title="Credits"
      live
    >
      The prepaid-credits model: a one-time pack grants units to a usage meter
      at checkout, you spend them server-side, and <code>useCredits</code> reads
      the live balance. Prepaid, so spending is blocked at zero.
    </PageHeader>

    <GiftClaimBanner class="gift-banner" />

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
          :product-ids="[creditPackId]"
          class="buy-btn"
        >
          Buy credit pack
        </CheckoutLink>
        <span
          v-else
          class="hint"
        >No credit pack configured (product key <code>credits100</code>).</span>

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

    <LabPanel
      label="gifts"
      title="Gift a credit pack"
    >
      <form
        class="row"
        @submit.prevent="sendGift"
      >
        <input
          v-model="giftEmail"
          class="gift-input"
          type="email"
          placeholder="recipient@example.com"
          required
        >
        <input
          v-model="giftMessage"
          class="gift-input"
          type="text"
          placeholder="Message (optional)"
        >
        <LabButton
          variant="signal"
          type="submit"
          :loading="gifting"
          :disabled="!creditPackId || !giftEmail"
        >
          Gift 100 credits
        </LabButton>
      </form>
      <p
        v-if="giftNotice"
        class="hint"
      >
        {{ giftNotice }}
      </p>
      <p class="hint">
        The recipient gets an email; if they don't have an account yet, the
        gift attaches automatically on their first sign-in
        (<code>useGifts</code> auto-claim).
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

.gift-input {
  flex: 1; min-width: 180px; padding: 0.5rem 0.7rem; border-radius: var(--r-sm);
  border: 1px solid var(--line); background: var(--sink); color: inherit; font-size: 0.85rem;
}

.gift-banner :deep([data-gift='item']) {
  display: flex; align-items: center; gap: 0.8rem; flex-wrap: wrap;
  padding: 0.7rem 0.9rem; border-radius: var(--r-sm);
  background: var(--sink); box-shadow: var(--inset-sm);
}
.gift-banner :deep([data-gift='claim']) {
  padding: 0.4rem 0.8rem; border-radius: var(--r-sm); border: none; cursor: pointer;
  background: var(--accent); color: var(--on-accent); font-weight: 600; font-size: 0.8rem;
}
</style>
