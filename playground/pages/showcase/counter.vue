<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { api } from '../../backend/_generated/api'

definePageMeta({ middleware: 'auth' })

const counter = useQuery(api.counter.get, { name: 'demo' })

// Two mutations: one without optimistic UI, one with — toggle to compare.
const incrementRaw = useMutation(api.counter.increment)
const incrementOptimistic = useMutation(api.counter.increment)
  .withOptimisticUpdate((localStore, args) => {
    const current = localStore.getQuery(api.counter.get, { name: 'demo' })
    if (current === undefined) return
    localStore.setQuery(api.counter.get, { name: 'demo' }, {
      ...current,
      value: current.value + (args.by ?? 1),
    })
  })
const reset = useMutation(api.counter.reset)

const optimistic = ref(true)
const inflight = ref(0)
const lastError = ref<string | null>(null)
const timeline = ref<Array<{ at: number, type: 'optimistic' | 'confirmed' | 'reset' }>>([])

async function bump(by = 1) {
  inflight.value++
  lastError.value = null
  const start = Date.now()
  if (optimistic.value) {
    timeline.value.unshift({ at: Date.now(), type: 'optimistic' })
  }
  try {
    if (optimistic.value) await incrementOptimistic({ name: 'demo', by })
    else await incrementRaw({ name: 'demo', by })
    timeline.value.unshift({ at: Date.now(), type: 'confirmed' })
    timeline.value = timeline.value.slice(0, 6)
    void start // avoid unused var warning
  }
  catch (cause) {
    lastError.value = cause instanceof Error ? cause.message : 'Mutation failed'
  }
  finally {
    inflight.value--
  }
}

async function doReset() {
  await reset({ name: 'demo' })
  timeline.value.unshift({ at: Date.now(), type: 'reset' })
  timeline.value = timeline.value.slice(0, 6)
}
</script>

<template>
  <div class="page">
    <header class="page-header">
      <div class="api-tag">useMutation · withOptimisticUpdate</div>
      <h1>Optimistic mutations</h1>
      <p class="subtitle">
        The server sleeps ~600 ms. Toggle optimistic mode to see the difference
        between instant local updates and waiting for the round-trip.
      </p>
    </header>

    <div class="layout">
      <!-- Counter card -->
      <div class="counter-card">
        <div class="counter-value">
          <span
            class="num"
            :class="{ pending: inflight > 0 }"
          >{{ counter?.value ?? 0 }}</span>
          <span
            v-if="inflight > 0"
            class="inflight-badge"
          >
            <span class="spinner" />
            {{ inflight }} in-flight
          </span>
        </div>

        <div class="controls">
          <button
            type="button"
            class="btn-accent"
            @click="bump(1)"
          >
            +1
          </button>
          <button
            type="button"
            class="btn-ghost"
            @click="bump(5)"
          >
            +5
          </button>
          <button
            type="button"
            class="btn-ghost"
            @click="bump(10)"
          >
            +10
          </button>
          <button
            type="button"
            class="btn-danger"
            @click="doReset()"
          >
            Reset
          </button>
        </div>

        <label class="toggle-row">
          <span class="toggle-switch">
            <input
              v-model="optimistic"
              type="checkbox"
            >
            <span class="track" />
          </span>
          <span class="toggle-label">
            <span :style="{ color: optimistic ? 'var(--success)' : 'var(--muted-color)' }">
              {{ optimistic ? 'Optimistic ON' : 'Optimistic OFF' }}
            </span>
            <span class="toggle-hint">{{ optimistic ? 'UI jumps instantly' : 'UI waits for server' }}</span>
          </span>
        </label>

        <p
          v-if="lastError"
          class="error"
        >
          {{ lastError }}
        </p>
      </div>

      <!-- Timeline -->
      <div class="timeline-card">
        <h3>Event log</h3>
        <div class="timeline">
          <div
            v-for="(ev, i) in timeline"
            :key="i"
            class="event fade-up"
            :class="ev.type"
          >
            <span class="event-dot" />
            <span class="event-label">{{ ev.type }}</span>
            <time>{{ new Date(ev.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) }}</time>
          </div>
          <div
            v-if="timeline.length === 0"
            class="no-events"
          >
            Click +1 to see events
          </div>
        </div>

        <div class="explainer">
          <p><strong>Optimistic ON</strong>: cache is patched instantly, server confirms ~600 ms later. You see two events.</p>
          <p><strong>Optimistic OFF</strong>: UI waits for the server — only one event appears after ~600 ms.</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page { max-width: 820px; }

.page-header { margin-bottom: 1.5rem; }
.api-tag {
  font-size: 0.68rem; font-weight: 600;
  font-family: ui-monospace, SFMono-Regular, monospace;
  letter-spacing: 0.06em; color: var(--muted-color); text-transform: uppercase; margin-bottom: 0.4rem;
}
h1 { font-size: 1.4rem; font-weight: 700; margin: 0 0 0.3rem; letter-spacing: -0.02em; }
.subtitle { color: var(--muted-color); font-size: 0.875rem; margin: 0; }

.layout {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  align-items: start;
}

/* Counter card */
.counter-card {
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  background: var(--card-bg);
  padding: 1.75rem 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}
.counter-value {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
}
.num {
  font-size: 5rem;
  font-weight: 800;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.04em;
  transition: color 0.15s;
}
.num.pending { color: var(--accent); }
.inflight-badge {
  display: inline-flex; align-items: center; gap: 0.35rem;
  font-size: 0.75rem; color: var(--muted-color);
  background: var(--accent-dim);
  padding: 0.2rem 0.6rem;
  border-radius: 99px;
}

.controls {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  justify-content: center;
}
button {
  padding: 0.5rem 0.875rem;
  border-radius: var(--radius);
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 500;
  transition: background var(--transition), border-color var(--transition), color var(--transition);
}
.btn-accent {
  background: var(--accent); color: white;
  border: 1px solid var(--accent); font-size: 1rem; padding: 0.5rem 1.25rem;
}
.btn-accent:hover { background: var(--accent-hover); border-color: var(--accent-hover); }
.btn-ghost {
  background: transparent; color: var(--text-color);
  border: 1px solid var(--border-color);
}
.btn-ghost:hover { background: var(--card-hover); border-color: var(--border-hover); }
.btn-danger {
  background: transparent; color: var(--danger-color);
  border: 1px solid var(--border-color);
}
.btn-danger:hover { background: var(--danger-dim); border-color: var(--danger-color); }

/* Toggle */
.toggle-row {
  display: flex; align-items: center; gap: 0.75rem; cursor: pointer;
}
.toggle-switch { position: relative; }
.toggle-switch input { position: absolute; opacity: 0; width: 0; height: 0; }
.track {
  display: block;
  width: 36px; height: 20px;
  background: var(--border-color);
  border-radius: 99px;
  transition: background var(--transition);
}
.track::after {
  content: '';
  position: absolute;
  top: 3px; left: 3px;
  width: 14px; height: 14px;
  border-radius: 50%;
  background: white;
  transition: transform var(--transition);
}
.toggle-switch input:checked ~ .track { background: var(--success); }
.toggle-switch input:checked ~ .track::after { transform: translateX(16px); }
.toggle-label { display: flex; flex-direction: column; font-size: 0.875rem; font-weight: 500; }
.toggle-hint { font-size: 0.75rem; color: var(--muted-color); }
.error { margin: 0; font-size: 0.8rem; color: var(--danger-color); text-align: center; }

/* Timeline card */
.timeline-card {
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  background: var(--card-bg);
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.timeline-card h3 { margin: 0; font-size: 0.875rem; font-weight: 600; }
.timeline {
  display: flex; flex-direction: column; gap: 0.35rem;
  min-height: 140px;
}
.event {
  display: flex; align-items: center; gap: 0.625rem;
  padding: 0.35rem 0.5rem;
  border-radius: var(--radius);
  font-size: 0.8rem;
  border: 1px solid var(--border-color);
  background: var(--bg-color);
}
.event-dot {
  width: 7px; height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}
.event.optimistic .event-dot { background: var(--accent); }
.event.confirmed .event-dot { background: var(--success); }
.event.reset .event-dot { background: var(--muted-color); }
.event-label {
  flex: 1;
  font-family: ui-monospace, SFMono-Regular, monospace;
  font-weight: 500;
}
.event.optimistic .event-label { color: var(--accent); }
.event.confirmed .event-label { color: var(--success); }
.event.reset .event-label { color: var(--muted-color); }
time { font-size: 0.7rem; color: var(--muted-color); font-family: ui-monospace, SFMono-Regular, monospace; }
.no-events { color: var(--muted-color); font-size: 0.8rem; text-align: center; padding: 1rem 0; }

.explainer {
  border-top: 1px solid var(--border-color);
  padding-top: 0.75rem;
  display: flex; flex-direction: column; gap: 0.25rem;
}
.explainer p { margin: 0; font-size: 0.78rem; color: var(--muted-color); line-height: 1.5; }
.explainer strong { color: var(--text-color); }

/* Spinner */
.spinner {
  display: inline-block; width: 10px; height: 10px;
  border: 1.5px solid var(--border-color);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@media (max-width: 600px) {
  .layout { grid-template-columns: 1fr; }
}
</style>
