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
  history.value = history.value.slice(0, 10)
}, { immediate: true, deep: true })

const metrics = computed(() => [
  { key: 'isWebSocketConnected', value: String(connection.value.isWebSocketConnected), highlight: connection.value.isWebSocketConnected },
  { key: 'hasInflightRequests',  value: String(connection.value.hasInflightRequests), highlight: false },
  { key: 'inflightMutations',    value: String(connection.value.inflightMutations), highlight: false },
  { key: 'inflightActions',      value: String(connection.value.inflightActions), highlight: false },
  { key: 'oldestInflightAt', value: connection.value.timeOfOldestInflightRequest
    ? new Date(connection.value.timeOfOldestInflightRequest).toISOString()
    : '—', highlight: false },
])
</script>

<template>
  <div class="page">
    <header class="page-header">
      <div class="api-tag">useConvexConnectionState</div>
      <h1>Connection state</h1>
      <p class="subtitle">
        Live WebSocket metrics from <code>useConvexConnectionState()</code>.
        Toggle offline in DevTools → Network to see the state transition.
      </p>
    </header>

    <!-- Big status indicator -->
    <div :class="['status-banner', { ok: connection.isWebSocketConnected }]">
      <span class="status-dot" />
      <div class="status-text">
        <strong>{{ connection.isWebSocketConnected ? 'Connected' : 'Disconnected' }}</strong>
        <span>WebSocket status</span>
      </div>
    </div>

    <div class="layout">
      <!-- Metrics grid -->
      <div class="metrics">
        <h3>Live metrics</h3>
        <div
          v-for="m in metrics"
          :key="m.key"
          class="metric-row"
        >
          <span class="metric-key">{{ m.key }}</span>
          <span
            class="metric-val"
            :style="{ color: m.highlight ? 'var(--success)' : 'var(--text-color)' }"
          >{{ m.value }}</span>
        </div>
      </div>

      <!-- Transition history -->
      <div class="history">
        <h3>State transitions</h3>
        <div
          v-if="history.length === 0"
          class="no-history"
        >
          No transitions recorded yet.
        </div>
        <div
          v-for="(ev, i) in history"
          :key="i"
          class="history-row fade-up"
        >
          <span :class="['h-dot', { ok: ev.connected }]" />
          <span :class="['h-label', { ok: ev.connected }]">
            {{ ev.connected ? 'connected' : 'disconnected' }}
          </span>
          <time>{{ ev.at }}</time>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page { max-width: 820px; }

.page-header { margin-bottom: 1.25rem; }
.api-tag {
  font-size: 0.68rem; font-weight: 600;
  font-family: ui-monospace, SFMono-Regular, monospace;
  letter-spacing: 0.06em; color: var(--muted-color); text-transform: uppercase; margin-bottom: 0.4rem;
}
h1 { font-size: 1.4rem; font-weight: 700; margin: 0 0 0.3rem; letter-spacing: -0.02em; }
.subtitle { color: var(--muted-color); font-size: 0.875rem; margin: 0; }
code {
  font-family: ui-monospace, SFMono-Regular, monospace; font-size: 0.85em;
  color: var(--accent); background: var(--accent-dim); padding: 0.1rem 0.35rem; border-radius: 3px;
}

/* Status banner */
.status-banner {
  display: flex; align-items: center; gap: 1rem;
  padding: 1rem 1.25rem;
  border-radius: var(--radius-lg);
  border: 1px solid var(--danger-color);
  background: var(--danger-dim);
  margin-bottom: 1.25rem;
  transition: border-color 0.4s, background 0.4s;
}
.status-banner.ok { border-color: rgba(52,211,153,0.5); background: rgba(52,211,153,0.08); }
.status-dot {
  width: 14px; height: 14px; border-radius: 50%;
  background: var(--danger-color); flex-shrink: 0;
  transition: background 0.4s;
}
.status-banner.ok .status-dot { background: var(--success); animation: pulse-dot 2s infinite; }
.status-text { display: flex; flex-direction: column; gap: 0.1rem; }
.status-text strong { font-size: 1rem; }
.status-text span { font-size: 0.78rem; color: var(--muted-color); }

.layout { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; align-items: start; }

/* Metrics */
.metrics {
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  background: var(--card-bg);
  overflow: hidden;
}
.metrics h3 {
  margin: 0; padding: 0.75rem 1rem;
  font-size: 0.78rem; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.06em;
  color: var(--muted-color);
  border-bottom: 1px solid var(--border-color);
  background: var(--sidebar-bg);
}
.metric-row {
  display: flex; justify-content: space-between; align-items: center;
  padding: 0.55rem 1rem;
  border-bottom: 1px solid var(--border-color);
  gap: 1rem;
}
.metric-row:last-child { border-bottom: none; }
.metric-key { font-family: ui-monospace, SFMono-Regular, monospace; font-size: 0.75rem; color: var(--muted-color); }
.metric-val { font-family: ui-monospace, SFMono-Regular, monospace; font-size: 0.8rem; font-weight: 600; }

/* History */
.history {
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  background: var(--card-bg);
  overflow: hidden;
}
.history h3 {
  margin: 0; padding: 0.75rem 1rem;
  font-size: 0.78rem; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.06em;
  color: var(--muted-color);
  border-bottom: 1px solid var(--border-color);
  background: var(--sidebar-bg);
}
.no-history { padding: 1.5rem; text-align: center; color: var(--muted-color); font-size: 0.8rem; }
.history-row {
  display: flex; align-items: center; gap: 0.625rem;
  padding: 0.55rem 1rem;
  border-bottom: 1px solid var(--border-color);
  font-size: 0.8rem;
}
.history-row:last-child { border-bottom: none; }
.h-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--danger-color); flex-shrink: 0; }
.h-dot.ok { background: var(--success); }
.h-label { flex: 1; font-family: ui-monospace, SFMono-Regular, monospace; color: var(--muted-color); }
.h-label.ok { color: var(--success); }
time { font-size: 0.7rem; color: var(--muted-color); font-family: ui-monospace, SFMono-Regular, monospace; }

@media (max-width: 600px) { .layout { grid-template-columns: 1fr; } }
</style>
