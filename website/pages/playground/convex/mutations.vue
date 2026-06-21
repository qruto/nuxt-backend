<script setup lang="ts">
import { ref } from 'vue'
import { api } from '#backend/api'

definePageMeta({ middleware: 'auth' })

// ── Mutations: optimistic vs confirmed ────────────────────────────
const counter = useQuery(api.counter.get, { name: 'demo' })
const incrementRaw = useMutation(api.counter.increment)
const incrementOptimistic = useMutation(api.counter.increment).withOptimisticUpdate((store, args) => {
  const current = store.getQuery(api.counter.get, { name: 'demo' })
  if (current === undefined) return
  store.setQuery(api.counter.get, { name: 'demo' }, { ...current, value: current.value + (args.by ?? 1) })
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

// ── Actions: a server round-trip that can call out / fail ─────────
const echo = useAction(api.demo.echo)
const text = ref('Hello, Convex!')
const delay = ref(600)
const failRate = ref(0)
const actionPending = ref(false)
const actionResult = ref<{ reversed: string, length: number, receivedAt: string } | null>(null)
const actionError = ref<string | null>(null)
const elapsed = ref<number | null>(null)

async function runAction() {
  actionPending.value = true
  actionError.value = null
  actionResult.value = null
  elapsed.value = null
  const start = Date.now()
  try {
    actionResult.value = await echo({ text: text.value, delayMs: delay.value, failRate: failRate.value })
    elapsed.value = Date.now() - start
  }
  catch (cause) {
    actionError.value = cause instanceof Error ? cause.message : 'Action failed'
    elapsed.value = Date.now() - start
  }
  finally {
    actionPending.value = false
  }
}

function clock(at: number) {
  return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}
</script>

<template>
  <div class="stack">
    <PageHeader
      tag="useMutation · withOptimisticUpdate · useAction"
      title="Mutations & actions"
      live
    >
      <code>useMutation</code> writes data and can patch the query cache
      <em>optimistically</em> before the round-trip resolves;
      <code>useAction</code> runs server logic that may call third-party APIs or
      fail. Throttle the network in DevTools to watch optimism in action.
    </PageHeader>

    <div class="grid-2">
      <LabPanel
        label="gauge"
        title="counter.get"
        tone="accent"
      >
        <div class="gauge">
          <span
            class="num mono"
            :class="{ pending: inflight > 0 }"
          >{{ counter?.value ?? 0 }}</span>
          <span
            v-if="inflight > 0"
            class="pill"
          ><span class="spinner" /> {{ inflight }} in-flight</span>
        </div>
        <div class="row controls">
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
          :hint="optimistic ? 'UI jumps instantly, then the server confirms' : 'UI waits for the server'"
        />
        <p
          v-if="lastError"
          class="err-text"
        >
          {{ lastError }}
        </p>
      </LabPanel>

      <LabPanel
        label="trace"
        title="Event log"
        variant="well"
      >
        <div class="timeline">
          <div
            v-for="(ev, i) in timeline"
            :key="i"
            class="event fade-up"
          >
            <SignalDot
              :tone="ev.type === 'optimistic' ? 'accent' : ev.type === 'confirmed' ? 'ok' : 'muted'"
              :pulse="false"
            />
            <span
              class="event-label"
              :class="ev.type"
            >{{ ev.type }}</span>
            <time>{{ clock(ev.at) }}</time>
          </div>
          <div
            v-if="timeline.length === 0"
            class="empty"
          >
            Click +1 to record optimistic → confirmed events.
          </div>
        </div>
      </LabPanel>
    </div>

    <LabPanel
      label="action"
      title="useAction · demo.echo"
      tone="warn"
    >
      <div class="grid-2">
        <div
          class="stack"
          style="gap: 0.85rem"
        >
          <LabField label="text">
            <input
              v-model="text"
              class="input"
            >
          </LabField>
          <div class="row">
            <LabField
              label="delayMs"
              style="flex: 1"
            >
              <input
                v-model.number="delay"
                class="input"
                type="number"
                min="0"
                max="5000"
                step="100"
              >
            </LabField>
            <LabField
              label="failRate 0–1"
              style="flex: 1"
            >
              <input
                v-model.number="failRate"
                class="input"
                type="number"
                min="0"
                max="1"
                step="0.1"
              >
            </LabField>
          </div>
          <LabButton
            variant="signal"
            :loading="actionPending"
            @click="runAction"
          >
            {{ actionPending ? `Running… (~${delay}ms)` : 'Run action' }}
          </LabButton>
        </div>

        <div
          class="output"
          aria-live="polite"
        >
          <div
            v-if="actionPending"
            class="state"
          >
            <span class="spinner big" /> waiting for server…
          </div>
          <div
            v-else-if="actionResult"
            class="stack"
            style="gap: 0.6rem; align-items: flex-start"
          >
            <div class="row">
              <StatusRing tone="ok">
                success
              </StatusRing>
              <span
                v-if="elapsed !== null"
                class="mono elapsed"
              >{{ elapsed }}ms</span>
            </div>
            <StateReadout
              :value="actionResult"
              tone="ok"
              label="action return value"
            />
          </div>
          <div
            v-else-if="actionError"
            class="stack"
            style="gap: 0.5rem; align-items: flex-start"
          >
            <StatusRing tone="err">
              error
            </StatusRing>
            <p class="err-text mono">
              {{ actionError }}
            </p>
            <p class="hint">
              Set failRate to 0 and run again to recover.
            </p>
          </div>
          <div
            v-else
            class="state idle"
          >
            Click <em>Run action</em> to call the server.
          </div>
        </div>
      </div>
    </LabPanel>
  </div>
</template>

<style scoped>
.gauge { display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem; }
.num { font-size: 3rem; font-weight: 700; line-height: 1; letter-spacing: -0.03em; color: var(--ink); transition: color 0.15s; }
.num.pending { color: var(--accent-soft); }
.controls { margin-bottom: 1rem; }

.timeline { display: flex; flex-direction: column; gap: 0.35rem; min-height: 150px; }
.event { display: flex; align-items: center; gap: 0.55rem; padding: 0.45rem 0.6rem; border-radius: var(--r-sm); background: var(--surface); box-shadow: var(--raise-sm); font-size: 0.8rem; }
.event-label { flex: 1; font-family: var(--mono); }
.event-label.optimistic { color: var(--accent-soft); }
.event-label.confirmed { color: var(--ok); }
.event-label.reset { color: var(--ink-dim); }
time { font-size: 0.68rem; color: var(--ink-dim); font-family: var(--mono); }

.output { min-height: 150px; }
.state { display: flex; align-items: center; gap: 0.6rem; justify-content: center; min-height: 150px; color: var(--ink-dim); font-size: 0.85rem; }
.state.idle { font-style: italic; }
.elapsed { font-size: 0.72rem; color: var(--ink-dim); }
.err-text { color: var(--err); font-size: 0.82rem; margin: 0; word-break: break-word; }
.empty { color: var(--ink-dim); font-size: 0.8rem; text-align: center; padding: 1.25rem 0; }

.spinner { display: inline-block; width: 12px; height: 12px; border: 1.5px solid var(--edge-hi); border-top-color: var(--accent); border-radius: 50%; animation: spin 0.7s linear infinite; }
.spinner.big { width: 24px; height: 24px; border-width: 2px; }
</style>
