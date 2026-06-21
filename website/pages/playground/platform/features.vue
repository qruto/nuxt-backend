<script setup lang="ts">
import { computed } from 'vue'
import { api } from '#backend/api'

definePageMeta({ middleware: 'auth' })

const features = useFeatures()
const syncEntitlements = useAction(api.billing.syncEntitlements)

const hasPremium = computed(() => features.has('premium'))
const benefits = computed(() => features.benefits.value ?? [])
const plans = computed(() => features.plans.value ?? [])
</script>

<template>
  <div class="stack">
    <PageHeader
      tag="useFeatures"
      title="Feature gates"
      live
    >
      <code>useFeatures().has(key)</code> reads webhook-synced benefit grants —
      match by a friendly metadata key (e.g. <code>premium</code>), grant id, or
      type. Gate UI reactively; it flips the instant entitlements change.
    </PageHeader>

    <div class="grid-2">
      <LabPanel
        label="entitlement"
        title="has('premium')"
        :tone="hasPremium ? 'ok' : 'neutral'"
      >
        <div class="gatestate">
          <StatusRing
            :tone="hasPremium ? 'ok' : 'muted'"
            :pulse="hasPremium"
          >
            {{ hasPremium ? 'premium unlocked' : 'premium locked' }}
          </StatusRing>
        </div>
        <p
          class="hint"
          style="margin: 0.85rem 0"
        >
          {{ features.isLoading.value ? 'resolving entitlements…' : hasPremium
            ? 'A granted benefit carries metadata { key: "premium" }.'
            : 'Subscribe on the Billing page, then sync to unlock.' }}
        </p>
        <LabButton
          variant="ghost"
          @click="syncEntitlements({})"
        >
          Sync entitlements
        </LabButton>
      </LabPanel>

      <!-- The gated surface — depth makes the lock literal. -->
      <LabPanel
        label="gated"
        title="Pro analytics"
        :tone="hasPremium ? 'accent' : 'neutral'"
      >
        <div
          class="gated"
          :class="{ locked: !hasPremium }"
        >
          <div class="gated-content">
            <MetricCard
              label="conversion"
              value="4.8"
              unit="%"
              tone="accent"
            />
            <p
              class="hint"
              style="margin-top: 0.75rem"
            >
              This panel is rendered only when <code>has('premium')</code> is true.
            </p>
          </div>
          <div
            v-if="!hasPremium"
            class="lock"
          >
            <Icon
              name="key"
              :size="22"
            />
            <span>Locked — Pro only</span>
          </div>
        </div>
      </LabPanel>
    </div>

    <LabPanel
      label="grants"
      title="benefits & plans"
      variant="well"
    >
      <div class="meta-row">
        <span class="lab-label">plans</span>
        <div class="chips">
          <StatusPill
            v-for="p in plans"
            :key="p"
            tone="signal"
            :dot="false"
          >
            {{ p }}
          </StatusPill>
          <span
            v-if="plans.length === 0"
            class="hint"
          >none</span>
        </div>
      </div>
      <div class="meta-row">
        <span class="lab-label">benefits</span>
        <div class="chips">
          <StatusPill
            v-for="b in benefits"
            :key="b.id"
            tone="ok"
            :dot="false"
          >
            {{ b.type }}{{ b.metadata?.key ? `:${b.metadata.key}` : '' }}
          </StatusPill>
          <span
            v-if="benefits.length === 0"
            class="hint"
          >none granted</span>
        </div>
      </div>
    </LabPanel>
  </div>
</template>

<style scoped>
.gatestate { display: flex; }
.gated { position: relative; }
.gated.locked .gated-content { filter: blur(3px); opacity: 0.5; pointer-events: none; user-select: none; }
.lock {
  position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.4rem;
  color: var(--ink-dim); font-family: var(--mono); font-size: 0.72rem; letter-spacing: 0.06em; text-transform: uppercase;
}

.meta-row { display: flex; align-items: flex-start; gap: 1rem; padding: 0.6rem 0; }
.meta-row + .meta-row { border-top: 1px solid var(--edge); }
.meta-row .lab-label { min-width: 5rem; padding-top: 0.2rem; }
.chips { display: flex; flex-wrap: wrap; gap: 0.4rem; }
</style>
