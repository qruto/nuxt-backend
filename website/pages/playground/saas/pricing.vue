<script setup lang="ts">
import { computed } from 'vue'
import { api } from '#backend/api'

definePageMeta({ middleware: 'auth' })

// The page itself is the packaged <PricingTable> — catalog from
// appConfig.backend.billing, names/prices live from Polar sandbox, restyled
// via the `.bk-depth` token bridge (rung 2 of the customization ladder).
const billing = useBilling()
const credits = useCredits()
const features = useFeatures()
const events = useQuery(api.billing.listWebhookEvents)

const planLabel = computed(() => {
  if (billing.isLoading.value) return '…'
  const productId = billing.subscription.value?.productId
  if (!productId) return 'free'
  const products = billing.products.value ?? {}
  return Object.entries(products).find(([, p]) => p?.id === productId)?.[0] ?? 'free'
})

function timeAgo(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000))
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.round(s / 60)}m ago`
  return `${Math.round(s / 3600)}h ago`
}
</script>

<template>
  <div class="stack bk-depth">
    <PageHeader
      tag="PricingTable · useBilling · useCredits"
      title="Pricing"
      live
    >
      The packaged <code>&lt;PricingTable&gt;</code> as a real pricing page:
      the plan catalog comes from <code>app.config.ts</code>, names and prices
      resolve live from Polar, and the site's look is pure token overrides —
      compare the untouched version under
      <NuxtLink to="/playground/vanilla/pricing">Vanilla</NuxtLink>.
    </PageHeader>

    <div class="grid-auto">
      <MetricCard
        label="current plan"
        :value="planLabel"
        :tone="billing.isSubscribed.value ? 'ok' : 'neutral'"
        :loading="billing.isLoading.value"
        :hint="billing.isSubscribed.value ? 'active subscription' : 'no active subscription'"
      />
      <MetricCard
        label="credits"
        :value="credits.balance.value ?? '—'"
        tone="accent"
        :loading="credits.isLoading.value"
        hint="prepaid balance"
      />
    </div>

    <LabPanel
      label="plans · PricingTable"
      title="Choose a plan"
      tone="accent"
    >
      <PricingTable :title="undefined">
        <template #footer>
          <div class="row footer-row">
            <StatusPill
              :tone="features.has('premium') ? 'ok' : 'muted'"
              dot
            >
              premium
            </StatusPill>
            <StatusPill
              :tone="features.has('ultra') ? 'ok' : 'muted'"
              dot
            >
              ultra
            </StatusPill>
            <LabButton
              variant="ghost"
              @click="credits.refresh()"
            >
              Refresh entitlements
            </LabButton>
          </div>
        </template>
      </PricingTable>
    </LabPanel>

    <LabPanel
      label="webhooks · live"
      title="Billing activity"
      variant="well"
    >
      <p
        v-if="!events?.length"
        class="hint"
      >
        No events yet — subscribe or top up and watch the billing webhooks
        arrive.
      </p>
      <div
        v-else
        class="feed"
      >
        <div
          v-for="event in events"
          :key="event._id"
          class="feed-row"
        >
          <SignalDot
            :tone="event.source === 'auth' ? 'accent' : 'ok'"
            :pulse="false"
          />
          <span class="feed-type mono">{{ event.type }}</span>
          <span class="feed-summary">{{ event.summary }}</span>
          <span class="feed-time mono">{{ timeAgo(event.createdAt) }}</span>
        </div>
      </div>
    </LabPanel>
  </div>
</template>

<style scoped>
.footer-row { margin-top: 1rem; }

.feed { display: flex; flex-direction: column; gap: 0.45rem; }
.feed-row { display: flex; align-items: center; gap: 0.6rem; font-size: 0.78rem; }
.feed-type { color: var(--ink); font-size: 0.72rem; }
.feed-summary { color: var(--ink-dim); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.feed-time { color: var(--ink-faint); font-size: 0.68rem; }
</style>
