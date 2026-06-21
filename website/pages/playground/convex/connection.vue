<script setup lang="ts">
import { computed, ref, watch } from 'vue'

definePageMeta({ middleware: 'auth' })

const connection = useConvexConnectionState()
const isOnline = computed(() => connection.value.isWebSocketConnected)

const history = ref<Array<{ at: string, connected: boolean }>>([])
const inflightHistory = ref<number[]>(Array.from({ length: 40 }, () => 0))

watch(connection, (state) => {
  history.value.unshift({
    at: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    connected: state.isWebSocketConnected,
  })
  history.value = history.value.slice(0, 12)
  const total = (state.inflightMutations ?? 0) + (state.inflightActions ?? 0) + (state.hasInflightRequests ? 1 : 0)
  inflightHistory.value = [...inflightHistory.value.slice(1), total]
}, { immediate: true, deep: true })

const metrics = computed(() => [
  { key: 'isWebSocketConnected', value: String(connection.value.isWebSocketConnected), ok: connection.value.isWebSocketConnected },
  { key: 'hasInflightRequests', value: String(connection.value.hasInflightRequests) },
  { key: 'inflightMutations', value: String(connection.value.inflightMutations) },
  { key: 'inflightActions', value: String(connection.value.inflightActions) },
  {
    key: 'timeOfOldestInflightRequest',
    value: connection.value.timeOfOldestInflightRequest
      ? new Date(connection.value.timeOfOldestInflightRequest).toISOString().split('T')[1]!.replace('Z', '')
      : '—',
  },
])
</script>

<template>
  <div class="stack">
    <PageHeader
      tag="useConvexConnectionState"
      title="Connection"
      live
    >
      Live WebSocket + inflight telemetry. Toggle <em>Offline</em> in DevTools →
      Network to watch the link drop and the transition log record it.
    </PageHeader>

    <ClientOnly>
      <LabPanel
        :tone="isOnline ? 'ok' : 'err'"
        :label="isOnline ? 'link · up' : 'link · down'"
        :title="isOnline ? 'WebSocket connected' : 'WebSocket disconnected'"
      >
        <template #actions>
          <StatusRing
            :tone="isOnline ? 'ok' : 'err'"
            :pulse="isOnline"
            size="sm"
          >
            {{ isOnline ? 'online' : 'offline' }}
          </StatusRing>
        </template>
        <LiveTrace
          :values="inflightHistory"
          :tone="isOnline ? 'accent' : 'err'"
          :live="isOnline"
          :height="72"
        />
        <p
          class="hint"
          style="margin-top: 0.6rem"
        >
          Trace plots inflight request activity over time, sampled on every
          connection-state change.
        </p>
      </LabPanel>

      <div class="grid-2">
        <LabPanel
          label="telemetry"
          title="Live metrics"
          variant="well"
          flush
        >
          <div
            v-for="m in metrics"
            :key="m.key"
            class="metric"
          >
            <span class="mkey mono">{{ m.key }}</span>
            <span
              class="mval mono"
              :class="{ ok: m.ok }"
            >{{ m.value }}</span>
          </div>
        </LabPanel>

        <LabPanel
          label="trace"
          title="State transitions"
          variant="well"
          flush
        >
          <div
            v-if="history.length === 0"
            class="empty"
          >
            No transitions recorded yet.
          </div>
          <div
            v-for="(ev, i) in history"
            :key="i"
            class="hrow fade-up"
          >
            <SignalDot
              :tone="ev.connected ? 'ok' : 'err'"
              :pulse="false"
            />
            <span
              class="hlabel mono"
              :class="{ ok: ev.connected }"
            >{{ ev.connected ? 'connected' : 'disconnected' }}</span>
            <time>{{ ev.at }}</time>
          </div>
        </LabPanel>
      </div>

      <template #fallback>
        <LabPanel
          label="telemetry"
          title="Connection"
        >
          <p class="hint">
            Establishing telemetry link…
          </p>
        </LabPanel>
      </template>
    </ClientOnly>
  </div>
</template>

<style scoped>
.metric { display: flex; justify-content: space-between; align-items: center; gap: 1rem; padding: 0.6rem 0.95rem; border-bottom: 1px solid var(--edge); }
.metric:last-child { border-bottom: none; }
.mkey { font-size: 0.72rem; color: var(--ink-dim); }
.mval { font-size: 0.78rem; font-weight: 600; color: var(--ink); word-break: break-all; }
.mval.ok { color: var(--ok); }

.empty { padding: 1.5rem; text-align: center; color: var(--ink-dim); font-size: 0.8rem; }
.hrow { display: flex; align-items: center; gap: 0.6rem; padding: 0.55rem 0.95rem; border-bottom: 1px solid var(--edge); font-size: 0.8rem; }
.hrow:last-child { border-bottom: none; }
.hlabel { flex: 1; color: var(--ink-dim); }
.hlabel.ok { color: var(--ok); }
time { font-size: 0.68rem; color: var(--ink-dim); font-family: var(--mono); }
</style>
