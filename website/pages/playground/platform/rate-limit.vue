<script setup lang="ts">
import { computed, ref } from 'vue'
import { api } from '#backend/api'

definePageMeta({ middleware: 'auth' })

const ping = useMutation(api.rateLimiter.ping)

// The pre-seeded limits (emailOtp per email / ai per billing entity) —
// reactive, so requesting an OTP or running a metered AI call from a second
// tab drains the meter live.
const authLimits = useQuery(api.rateLimiter.authLimits)
const authMeters = computed(() => {
  const data = authLimits.value
  if (!data?.email) return []
  return (['emailOtp', 'ai'] as const)
    .map((name) => {
      const entry = data[name]
      if (!entry) return null
      const capacity = entry.config.capacity ?? entry.config.rate
      return { name, value: Math.max(0, Math.floor(entry.value)), capacity }
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
})
const pending = ref(false)
const allowed = ref(0)
const blocked = ref(0)
const retryAfter = ref<number | null>(null)
const log = ref<Array<{ ok: boolean, at: number }>>([])

async function runPing() {
  pending.value = true
  try {
    const { ok, retryAfter: ra } = await ping({})
    if (ok) {
      allowed.value++
      retryAfter.value = null
    }
    else {
      blocked.value++
      retryAfter.value = ra ?? null
    }
    log.value.unshift({ ok, at: Date.now() })
    log.value = log.value.slice(0, 10)
  }
  finally { pending.value = false }
}

function clock(at: number) {
  return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}
</script>

<template>
  <div class="stack">
    <PageHeader
      tag="rateLimiter"
      title="Rate limiting"
    >
      A token bucket of 5 requests / minute per user. Click rapidly to drain it —
      the endpoint returns <code>retryAfter</code> instead of throwing, so you can
      build a graceful "slow down" UX.
    </PageHeader>

    <div class="grid-auto">
      <MetricCard
        label="allowed"
        :value="allowed"
        tone="ok"
      />
      <MetricCard
        label="blocked"
        :value="blocked"
        :tone="blocked ? 'err' : 'neutral'"
      />
      <MetricCard
        label="retry after"
        :value="retryAfter != null ? Math.ceil(retryAfter / 1000) : '—'"
        :unit="retryAfter != null ? 's' : ''"
        :tone="retryAfter != null ? 'warn' : 'neutral'"
      />
    </div>

    <LabPanel
      label="bucket"
      title="rateLimiter.ping · 5/min"
      tone="accent"
    >
      <div class="row">
        <LabButton
          variant="signal"
          :loading="pending"
          @click="runPing"
        >
          Ping
        </LabButton>
        <p
          v-if="retryAfter != null"
          class="throttled"
        >
          Throttled — retry in {{ Math.ceil(retryAfter / 1000) }}s.
        </p>
      </div>

      <ul
        v-if="log.length"
        class="log"
      >
        <li
          v-for="(e, i) in log"
          :key="i"
          class="fade-up"
        >
          <StatusRing
            :tone="e.ok ? 'ok' : 'err'"
            size="sm"
          >
            {{ e.ok ? 'allowed' : 'blocked' }}
          </StatusRing>
          <time>{{ clock(e.at) }}</time>
        </li>
      </ul>
    </LabPanel>

    <LabPanel
      label="seeded auth limits · live"
      title="Auth rate limits"
      variant="well"
    >
      <p
        v-if="!authMeters.length"
        class="hint"
      >
        Sign in to see your per-email auth buckets.
      </p>
      <div
        v-for="meter in authMeters"
        :key="meter.name"
        class="auth-meter"
      >
        <span class="mono auth-meter-name">{{ meter.name }}</span>
        <div
          class="meter"
          aria-hidden="true"
        >
          <div
            class="meter-fill"
            :style="{ width: `${(meter.value / Math.max(1, meter.capacity)) * 100}%` }"
          />
        </div>
        <span class="mono auth-meter-count">{{ meter.value }}/{{ meter.capacity }}</span>
      </div>
      <p class="hint">
        These buckets ship with the package (<code>DEFAULT_AUTH_LIMITS</code>)
        and throttle OTP sends and sign-ins per email. Request a code from a
        second tab at <code>/login</code> and watch <code>emailOtp</code> drain.
      </p>
    </LabPanel>
  </div>
</template>

<style scoped>
.throttled { margin: 0; font-size: 0.82rem; color: var(--warn); }
.auth-meter { display: flex; align-items: center; gap: 0.7rem; margin-bottom: 0.5rem; }
.auth-meter-name { font-size: 0.75rem; width: 5.5rem; }
.auth-meter-count { font-size: 0.7rem; color: var(--ink-dim); }
.meter { flex: 1; height: 10px; border-radius: 99px; background: var(--sink); box-shadow: var(--inset-sm); overflow: hidden; }
.meter-fill { height: 100%; background: var(--accent); border-radius: 99px; transition: width 0.3s var(--ease-out); }
.log { list-style: none; margin: 1rem 0 0; padding: 0; display: flex; flex-direction: column; gap: 0.35rem; }
.log li { display: flex; align-items: center; justify-content: space-between; padding: 0.4rem 0.6rem; border-radius: var(--r-sm); background: var(--surface); box-shadow: var(--raise-sm); }
time { font-size: 0.68rem; color: var(--ink-dim); font-family: var(--mono); }
</style>
