<script setup lang="ts">
import { ref } from 'vue'
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
  if (optimistic.value) timeline.value.unshift({ at: Date.now(), type: 'optimistic' })
  try {
    if (optimistic.value) await incrementOptimistic({ name: 'demo', by })
    else await incrementRaw({ name: 'demo', by })
    timeline.value.unshift({ at: Date.now(), type: 'confirmed' })
    timeline.value = timeline.value.slice(0, 7)
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
  timeline.value = timeline.value.slice(0, 7)
}

function clock(at: number) {
  return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}
</script>

<template>
  <div class="page">
    <PageHeader
      tag="useMutation · withOptimisticUpdate"
      title="Optimistic counter"
      live
    >
      Optimistic mode patches the query cache the instant you click, before the
      mutation round-trip resolves. Toggle it off to update only once the server
      confirms — the event log records both phases.
    </PageHeader>

    <div class="layout">
      <LabPanel
        label="gauge"
        title="counter.get"
        tone="signal"
      >
        <div class="readout">
          <span
            class="num mono"
            :class="{ pending: inflight > 0 }"
          >{{ counter?.value ?? 0 }}</span>
          <span
            v-if="inflight > 0"
            class="inflight"
          >
            <span class="spinner" /> {{ inflight }} in-flight
          </span>
        </div>

        <div class="controls">
          <LabButton @click="bump(1)">
            +1
          </LabButton>
          <LabButton
            variant="ghost"
            @click="bump(5)"
          >
            +5
          </LabButton>
          <LabButton
            variant="ghost"
            @click="bump(10)"
          >
            +10
          </LabButton>
          <LabButton
            variant="danger"
            @click="doReset()"
          >
            Reset
          </LabButton>
        </div>

        <LabToggle
          v-model="optimistic"
          tone="ok"
          :label="optimistic ? 'Optimistic ON' : 'Optimistic OFF'"
          :hint="optimistic ? 'UI jumps instantly' : 'UI waits for the server'"
        />

        <p
          v-if="lastError"
          class="error"
        >
          {{ lastError }}
        </p>
      </LabPanel>

      <LabPanel
        label="trace"
        title="Event log"
      >
        <div class="timeline">
          <div
            v-for="(ev, i) in timeline"
            :key="i"
            class="event fade-up"
            :class="ev.type"
          >
            <SignalDot
              :tone="ev.type === 'optimistic' ? 'signal' : ev.type === 'confirmed' ? 'ok' : 'muted'"
              :pulse="false"
            />
            <span class="event-label">{{ ev.type }}</span>
            <time>{{ clock(ev.at) }}</time>
          </div>
          <div
            v-if="timeline.length === 0"
            class="no-events"
          >
            Click +1 to record events
          </div>
        </div>

        <div class="explain">
          <p><b>Optimistic ON</b> — cache patches instantly, then the server confirms: two events.</p>
          <p><b>Optimistic OFF</b> — the UI waits for the server: one event when it lands.</p>
          <p class="tip">
            On localhost the round-trip is sub-millisecond, so both feel instant.
            Throttle the network in <b>DevTools → Network → Slow 4G</b> to watch the
            optimistic value jump ahead while the confirmation lands a beat later.
          </p>
        </div>
      </LabPanel>
    </div>
  </div>
</template>

<style scoped>
.page { max-width: 820px; }
.layout { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; align-items: start; }

.readout { display: flex; flex-direction: column; align-items: center; gap: 0.5rem; margin-bottom: 1.25rem; }
.num {
  font-size: 4.5rem;
  font-weight: 800;
  line-height: 1;
  letter-spacing: -0.04em;
  font-variant-numeric: tabular-nums;
  color: var(--ink);
  transition: color 0.15s;
}
.num.pending { color: var(--signal); }
.inflight {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.72rem;
  color: var(--ink-dim);
  background: var(--signal-dim);
  padding: 0.2rem 0.6rem;
  border-radius: 99px;
}
.controls { display: flex; gap: 0.5rem; flex-wrap: wrap; justify-content: center; margin-bottom: 1.25rem; }
.error { margin: 1rem 0 0; font-size: 0.8rem; color: var(--err); text-align: center; }

.timeline { display: flex; flex-direction: column; gap: 0.3rem; min-height: 150px; }
.event {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  padding: 0.35rem 0.55rem;
  border: 1px solid var(--edge);
  border-radius: var(--radius);
  background: var(--panel);
  font-size: 0.8rem;
}
.event-label { flex: 1; font-family: var(--mono); }
.event.optimistic .event-label { color: var(--signal); }
.event.confirmed .event-label { color: var(--ok); }
.event.reset .event-label { color: var(--ink-dim); }
time { font-size: 0.68rem; color: var(--ink-dim); font-family: var(--mono); }
.no-events { color: var(--ink-dim); font-size: 0.8rem; text-align: center; padding: 1.25rem 0; }

.explain { border-top: 1px solid var(--edge); margin-top: 0.85rem; padding-top: 0.85rem; display: flex; flex-direction: column; gap: 0.3rem; }
.explain p { margin: 0; font-size: 0.78rem; color: var(--ink-dim); line-height: 1.5; }
.explain b { color: var(--ink); }
.explain .tip {
  margin-top: 0.2rem;
  padding-top: 0.55rem;
  border-top: 1px dashed var(--edge);
  font-size: 0.76rem;
}

.spinner {
  display: inline-block;
  width: 10px;
  height: 10px;
  border: 1.5px solid var(--edge);
  border-top-color: var(--signal);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@media (max-width: 640px) { .layout { grid-template-columns: 1fr; } }
</style>
