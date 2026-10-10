<script setup lang="ts">
import { subscriptionSignal } from '~/utils/signal'

const state = usePanelState()
const panel = usePanel()

onMounted(() => {
  void panel.loadCatalog()
  panel.request('gifts')
})
watch(() => state.bridge, bridge => bridge === 'attached' && panel.request('gifts'))

const billing = computed(() => state.snapshot?.billing)
const entitlements = computed(() => state.snapshot?.entitlements)
const credits = computed(() => state.snapshot?.credits ?? [])
const gifts = computed(() => state.snapshot?.gifts)
const catalog = computed(() => state.catalog)
const display = computed(() => state.snapshot?.config)

const subscriptionText = computed(() => {
  const current = billing.value
  if (!current || current.isLoading) return 'Loading'
  if (!current.status) return 'Free plan'
  return current.status
})

/** Display-catalog keys (app.config) that the billing catalog does not declare. */
const unknownKeys = computed(() => {
  if (catalog.value?.status !== 'ok' || !display.value) return []
  const declared = new Set([...catalog.value.plans, ...catalog.value.packs])
  return [...display.value.plans, ...display.value.packs].filter(key => !declared.has(key))
})

const environmentOnDeployment = computed(() => state.info?.env.deployment?.names?.optional.BILLING_ENVIRONMENT
  ?? state.info?.env.visible.optional.BILLING_ENVIRONMENT)
const day = (time: number | undefined) => time ? new Date(time).toLocaleDateString() : '—'
</script>

<template>
  <NCard class="p4 flex items-center gap-3 flex-wrap">
    <SignalBadge :signal="subscriptionSignal(billing)">
      {{ subscriptionText }}
    </SignalBadge>
    <span v-if="billing?.productName">{{ billing.productName }}</span>
    <span
      v-if="billing?.productId"
      class="font-mono text-xs op50"
    >{{ billing.productId }}</span>
    <span class="ml-auto flex gap-1">
      <NButton
        n="xs"
        icon="carbon-launch"
        title="Open billing.ts in the editor"
        @click="openBackendFile('billing.ts')"
      >
        billing.ts
      </NButton>
    </span>
  </NCard>

  <div
    v-if="billing?.status"
    class="flex gap-2 flex-wrap text-xs"
  >
    <SignalBadge
      v-if="billing.cancelAtPeriodEnd"
      signal="warn"
    >
      ends with the paid period
    </SignalBadge>
    <SignalBadge
      v-if="billing.isPaused"
      signal="warn"
    >
      paused
    </SignalBadge>
    <SignalBadge
      v-if="billing.trialEnd"
      signal="off"
    >
      trial ends {{ day(billing.trialEnd) }}
    </SignalBadge>
    <SignalBadge
      v-if="billing.pendingProductId"
      signal="off"
    >
      switches to {{ billing.pendingProductId }} next period
    </SignalBadge>
    <span
      v-if="billing.subscriptions"
      class="op50"
    >{{ billing.subscriptions }} subscription{{ billing.subscriptions === 1 ? '' : 's' }} on record</span>
  </div>

  <PanelCard title="Entitlements">
    <div
      v-if="entitlements?.features.length"
      class="flex gap-2 flex-wrap"
    >
      <SignalBadge
        v-for="key of entitlements.features"
        :key="key"
        signal="ok"
      >
        {{ key }}
      </SignalBadge>
    </div>
    <div
      v-else
      class="op50"
    >
      No features granted. <code>useFeatures().has(key)</code> is false for every key until a plan grants one.
    </div>
  </PanelCard>

  <PanelCard title="Credit meters">
    <div
      v-if="!credits.length"
      class="op50"
    >
      No credit meters yet. Grants appear after a plan subscription or a credit-pack purchase.
    </div>
    <div
      v-else
      class="grid grid-cols-2 md:grid-cols-3 gap-3"
    >
      <div
        v-for="meter of credits"
        :key="meter.meterId"
      >
        <div class="op50 text-xs">
          {{ meter.name ?? meter.meterId }}
        </div>
        <div class="font-mono text-lg">
          {{ meter.balance }}
        </div>
        <div class="op50 text-xs font-mono">
          {{ meter.credited }} credited · {{ meter.consumed }} consumed
        </div>
      </div>
    </div>
  </PanelCard>

  <PanelCard title="Gifts to this account">
    <div
      v-if="!gifts || gifts.isLoading"
      class="op50"
    >
      Loading…
    </div>
    <div
      v-else
      class="flex gap-2 flex-wrap text-xs"
    >
      <SignalBadge :signal="gifts.unclaimed ? 'warn' : 'off'">
        {{ gifts.unclaimed }} ready to receive
      </SignalBadge>
      <SignalBadge signal="off">
        {{ gifts.pending }} awaiting payment
      </SignalBadge>
      <span class="op50">{{ gifts.received }} in total</span>
    </div>
  </PanelCard>

  <PanelCard title="Catalog as code">
    <template #actions>
      <NButton
        n="xs"
        icon="carbon-launch"
        title="Open billing.catalog.ts in the editor"
        @click="openBackendFile('billing.catalog.ts')"
      >
        billing.catalog.ts
      </NButton>
      <NButton
        n="xs"
        icon="carbon-renew"
        title="Read the catalog again"
        @click="panel.loadCatalog()"
      />
    </template>
    <div
      v-if="!catalog"
      class="op50"
    >
      Reading…
    </div>
    <div
      v-else-if="catalog.status === 'missing'"
      class="op50"
    >
      No <code>billing.catalog.ts</code>. <code>npx nuxt-backend init</code> scaffolds one.
    </div>
    <NTip
      v-else-if="catalog.status === 'error'"
      n="red"
      icon="carbon-warning"
    >
      <code>billing.catalog.ts</code> does not load: {{ catalog.error }}
    </NTip>
    <template v-else>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        <div
          v-for="group of [['Meters', catalog.meters], ['Plans', catalog.plans], ['Packs', catalog.packs], ['Features', catalog.features]] as const"
          :key="group[0]"
        >
          <div class="op50">
            {{ group[0] }}
          </div>
          <div class="font-mono">
            {{ group[1].length ? group[1].join(', ') : '—' }}
          </div>
        </div>
      </div>
      <div class="flex items-center gap-2 flex-wrap text-xs">
        <SignalBadge
          v-for="environment of ['sandbox', 'production']"
          :key="environment"
          :signal="catalog.synced.includes(environment) ? 'ok' : 'off'"
        >
          {{ environment }} {{ catalog.synced.includes(environment) ? 'synced' : 'not synced' }}
        </SignalBadge>
        <span
          v-if="!catalog.synced.length && catalog.plans.length + catalog.packs.length"
          class="op65"
        >Run <code>npx nuxt-backend billing sync</code>, then <code>npx convex run billing:syncProducts</code>.</span>
      </div>
      <div
        v-if="unknownKeys.length"
        class="text-xs op65"
      >
        <code>appConfig.backend.billing</code> lists {{ unknownKeys.join(', ') }}, which the catalog does not declare:
        the pricing page has no product for {{ unknownKeys.length === 1 ? 'it' : 'them' }}.
      </div>
    </template>
    <div class="text-xs op65">
      <template v-if="environmentOnDeployment">
        <code>BILLING_ENVIRONMENT</code> is set: check its value to know whether checkouts charge real cards.
      </template>
      <template v-else>
        Billing runs against the provider's sandbox until <code>BILLING_ENVIRONMENT=production</code> is set on the
        deployment. Checkouts here never charge real cards.
      </template>
    </div>
  </PanelCard>
</template>
