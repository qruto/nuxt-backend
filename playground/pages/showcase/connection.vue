<script setup lang="ts">
import { computed, ref, watch } from 'vue'

definePageMeta({ middleware: 'auth' })

const connection = useConvexConnectionState()

const history = ref<Array<{ at: string, connected: boolean }>>([])

watch(connection, (state) => {
  history.value.unshift({
    at: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    connected: state.isWebSocketConnected,
  })
  history.value = history.value.slice(0, 12)
}, { immediate: true, deep: true })

const metrics = computed(() => [
  { key: 'isWebSocketConnected', value: String(connection.value.isWebSocketConnected), ok: connection.value.isWebSocketConnected },
  { key: 'hasInflightRequests', value: String(connection.value.hasInflightRequests) },
  { key: 'inflightMutations', value: String(connection.value.inflightMutations) },
  { key: 'inflightActions', value: String(connection.value.inflightActions) },
  {
    key: 'timeOfOldestInflightRequest',
    value: connection.value.timeOfOldestInflightRequest
      ? new Date(connection.value.timeOfOldestInflightRequest).toISOString()
      : '—',
  },
])

const isOnline = computed(() => connection.value.isWebSocketConnected)
</script>

<template>
  <div class="page">
    <PageHeader
      tag="useConvexConnectionState"
      title="Connection state"
      live
    >
      Live WebSocket + inflight metrics. Toggle <em>Offline</em> in DevTools →
      Network to watch the link drop and the transition log record it.
    </PageHeader>

    <ClientOnly>
      <div
        class="banner"
        :class="{ ok: isOnline }"
      >
        <SignalDot
          :tone="isOnline ? 'ok' : 'err'"
          :pulse="isOnline"
        />
        <div class="banner-text">
          <strong>{{ isOnline ? 'WebSocket connected' : 'WebSocket disconnected' }}</strong>
          <span class="mono">ws://convex · realtime sync</span>
        </div>
        <StatusPill :tone="isOnline ? 'ok' : 'err'">
          {{ isOnline ? 'online' : 'offline' }}
        </StatusPill>
      </div>

      <div class="layout">
        <LabPanel
          label="telemetry"
          title="Live metrics"
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
          <p class="boot">
            Establishing telemetry link…
          </p>
        </LabPanel>
      </template>
    </ClientOnly>
  </div>
</template>

<style scoped>
.page { max-width: 820px; }
.boot { margin: 0; padding: 0.5rem; color: var(--ink-dim); font-size: 0.85rem; }

.banner {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  padding: 0.95rem 1.1rem;
  border-radius: var(--radius-lg);
  border: 1px solid color-mix(in srgb, var(--err) 35%, var(--edge));
  background: var(--err-dim);
  margin-bottom: 1.25rem;
  transition: border-color 0.4s, background 0.4s;
}
.banner.ok { border-color: color-mix(in srgb, var(--ok) 35%, var(--edge)); background: var(--ok-dim); }
.banner-text { display: flex; flex-direction: column; gap: 0.1rem; flex: 1; }
.banner-text strong { font-size: 0.95rem; }
.banner-text span { font-size: 0.68rem; color: var(--ink-dim); }

.layout { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; align-items: start; }

.metric {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  padding: 0.55rem 0.9rem;
  border-bottom: 1px solid var(--edge);
}
.metric:last-child { border-bottom: none; }
.mkey { font-size: 0.72rem; color: var(--ink-dim); }
.mval { font-size: 0.78rem; font-weight: 600; color: var(--ink); word-break: break-all; }
.mval.ok { color: var(--ok); }

.empty { padding: 1.5rem; text-align: center; color: var(--ink-dim); font-size: 0.8rem; }
.hrow {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.5rem 0.9rem;
  border-bottom: 1px solid var(--edge);
  font-size: 0.8rem;
}
.hrow:last-child { border-bottom: none; }
.hlabel { flex: 1; color: var(--ink-dim); }
.hlabel.ok { color: var(--ok); }
time { font-size: 0.68rem; color: var(--ink-dim); font-family: var(--mono); }

@media (max-width: 640px) { .layout { grid-template-columns: 1fr; } }
</style>
