<script setup lang="ts">
import { ref } from 'vue'
import { api } from '#backend/api'

definePageMeta({ middleware: 'auth' })

const ping = useMutation(api.rateLimiter.ping)
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
  </div>
</template>

<style scoped>
.throttled { margin: 0; font-size: 0.82rem; color: var(--warn); }
.log { list-style: none; margin: 1rem 0 0; padding: 0; display: flex; flex-direction: column; gap: 0.35rem; }
.log li { display: flex; align-items: center; justify-content: space-between; padding: 0.4rem 0.6rem; border-radius: var(--r-sm); background: var(--surface); box-shadow: var(--raise-sm); }
time { font-size: 0.68rem; color: var(--ink-dim); font-family: var(--mono); }
</style>
