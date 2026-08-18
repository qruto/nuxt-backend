<script setup lang="ts">
const state = usePanelState()

const billing = computed(() => state.snapshot?.billing)
const credits = computed(() => state.snapshot?.credits ?? [])
const catalog = computed(() => state.info?.appConfig.billing)

const subscriptionBadge = computed(() => {
  if (!billing.value || billing.value.isLoading) return { n: 'gray', text: 'Loading' }
  if (!billing.value.status) return { n: 'gray', text: 'Free plan' }
  return {
    n: billing.value.status === 'active' || billing.value.status === 'trialing' ? 'green' : 'orange',
    text: billing.value.status,
  }
})

/** Environment badge from env presence — the value itself stays server-side. */
const environmentSet = computed(() => state.info?.env.optional.BILLING_ENVIRONMENT === true)
</script>

<template>
  <div class="flex flex-col gap-4">
    <NTip
      v-if="state.bridgeAvailable === false"
      n="orange"
      icon="carbon-warning"
    >
      No backend bridge found in this app — live billing state is unavailable.
      Reload the inspected page (the bridge attaches from a dev-only plugin).
    </NTip>

    <NCard class="p4 flex items-center gap-3 flex-wrap">
      <NBadge :n="subscriptionBadge.n">
        {{ subscriptionBadge.text }}
      </NBadge>
      <span
        v-if="billing?.productId"
        class="font-mono text-xs op65"
      >product: {{ billing.productId }}</span>
      <span
        v-if="billing?.plans?.length"
        class="op65 text-xs"
      >plans: {{ billing.plans.join(', ') }}</span>
      <span class="ml-auto flex gap-1">
        <NButton
          n="xs"
          icon="carbon-launch"
          title="Open billing.ts in editor"
          @click="openBackendFile('billing.ts')"
        >
          billing.ts
        </NButton>
        <NButton
          n="xs"
          icon="carbon-launch"
          title="Open billing.catalog.ts in editor"
          @click="openBackendFile('billing.catalog.ts')"
        >
          catalog
        </NButton>
      </span>
    </NCard>

    <NCard class="p4 flex flex-col gap-2">
      <div class="op50 text-xs">
        Credit meters
      </div>
      <div
        v-if="!credits.length"
        class="op50"
      >
        No credit meters yet — grants appear after a plan subscription or a credit-pack purchase.
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
    </NCard>

    <NCard class="p4 flex flex-col gap-2">
      <div class="op50 text-xs">
        Catalog (appConfig.backend.billing — display layer; live prices come from the provider)
      </div>
      <div
        v-if="!catalog || (!catalog.plans.length && !catalog.packs.length)"
        class="op50"
      >
        No plans or packs declared in <code>app.config.ts</code> yet.
      </div>
      <template v-else>
        <div
          v-for="plan of catalog.plans"
          :key="plan.key"
          class="flex items-center gap-2 flex-wrap"
        >
          <NBadge :n="plan.highlight ? 'green' : 'gray'">
            plan
          </NBadge>
          <span class="font-mono">{{ plan.key }}</span>
          <span
            v-if="plan.credits"
            class="op65 text-xs"
          >{{ plan.credits }} credits</span>
          <span
            v-if="plan.blurb"
            class="op50 text-xs"
          >{{ plan.blurb }}</span>
          <span
            v-if="plan.features?.length"
            class="op50 text-xs font-mono"
          >{{ plan.features.join(' · ') }}</span>
        </div>
        <div
          v-for="pack of catalog.packs"
          :key="pack.key"
          class="flex items-center gap-2 flex-wrap"
        >
          <NBadge n="blue">
            pack
          </NBadge>
          <span class="font-mono">{{ pack.key }}</span>
          <span
            v-if="pack.credits"
            class="op65 text-xs"
          >{{ pack.credits }} credits</span>
          <span
            v-if="pack.blurb"
            class="op50 text-xs"
          >{{ pack.blurb }}</span>
        </div>
      </template>
    </NCard>

    <NTip
      n="blue"
      icon="carbon-information"
    >
      <template v-if="environmentSet">
        <code>BILLING_ENVIRONMENT</code> is set — check the deployment value to know
        whether this app bills against sandbox or production.
      </template>
      <template v-else>
        Billing runs against the provider's <b>sandbox</b> environment until
        <code>BILLING_ENVIRONMENT=production</code> is set on the deployment —
        checkouts here never charge real cards.
      </template>
    </NTip>
  </div>
</template>
