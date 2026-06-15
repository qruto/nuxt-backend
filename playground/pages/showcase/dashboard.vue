<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { Value } from 'convex/values'
import type { FunctionReference } from 'convex/server'
import { api } from '#backend/api'

definePageMeta({ middleware: 'auth' })

/**
 * Mission Control — the flagship demo. Instead of probing one composable in
 * isolation, this is a *real backend app surface*: a single screen that holds
 * many live Convex subscriptions open at once (`useConvexQueries`), a paginated
 * activity feed (`usePaginatedQuery`), live socket telemetry
 * (`useConvexConnectionState`), and coordinated optimistic mutations — all
 * reacting together in real time.
 */

// ── Connection telemetry ──────────────────────────────────────────
// Gate connection-derived UI behind a mounted flag so the client's first
// (hydration) render matches the server's — the socket isn't connected during
// SSR, so we treat everything as offline until after mount, then go live.
const mounted = ref(false)
onMounted(() => (mounted.value = true))
const conn = useConvexConnectionState()
const online = computed(() => mounted.value && conn.value.isWebSocketConnected)
const inflight = computed(() =>
  (conn.value.inflightMutations ?? 0) + (conn.value.inflightActions ?? 0))

// ── One reactive map → many live subscriptions ────────────────────
const queryMap = computed(() => {
  const map: Record<string, { query: FunctionReference<'query'>, args: Record<string, Value> }> = {
    counter: { query: api.counter.get, args: { name: 'demo' } },
    todos: { query: api.todos.list, args: {} },
    messages: { query: api.messages.list, args: {} },
  }
  return map
})
const live = useConvexQueries(queryMap)

const counterValue = computed(() => {
  const r = live.value.counter
  return r && !(r instanceof Error) ? (r as { value: number }).value : 0
})
const todos = computed(() => {
  const r = live.value.todos
  return Array.isArray(r) ? r as Array<{ _id: string, text: string, completed: boolean }> : []
})
const todosReady = computed(() => Array.isArray(live.value.todos))
const todoStats = computed(() => {
  const all = todos.value
  const done = all.filter(t => t.completed).length
  return { total: all.length, done, open: all.length - done }
})
const messages = computed(() => {
  const r = live.value.messages
  return Array.isArray(r) ? r as Array<{ _id: string, author: string, text: string, _creationTime: number }> : []
})
const recentMessages = computed(() => messages.value.slice(-5).reverse())

// ── Paginated activity feed ───────────────────────────────────────
const activity = usePaginatedQuery(api.logs.listPaginated, {}, { initialNumItems: 6 })
const activityRows = computed(() =>
  activity.value.results as Array<{ _id: string, level: 'info' | 'warn' | 'error', message: string, _creationTime: number }>)

// ── Mutations ─────────────────────────────────────────────────────
const increment = useMutation(api.counter.increment).withOptimisticUpdate((store, args) => {
  const current = store.getQuery(api.counter.get, { name: 'demo' })
  if (current === undefined) return
  store.setQuery(api.counter.get, { name: 'demo' }, { ...current, value: current.value + (args.by ?? 1) })
})
const createTodo = useMutation(api.todos.create)
const toggleTodo = useMutation(api.todos.toggle)
const sendMessage = useMutation(api.messages.send)
const addLog = useMutation(api.logs.add)

const newTodo = ref('')
const newMessage = ref('')

async function addTodo() {
  const text = newTodo.value.trim()
  if (!text) return
  newTodo.value = ''
  await createTodo({ text })
  await addLog({ level: 'info', message: `Task created — "${text.slice(0, 32)}"` })
}

async function broadcast() {
  const text = newMessage.value.trim()
  if (!text) return
  newMessage.value = ''
  await sendMessage({ text })
}

// ── Coordinated "diagnostics pulse" — lights up several tiles at once.
const pulsing = ref(false)
async function runDiagnostics() {
  pulsing.value = true
  try {
    await Promise.all([
      increment({ name: 'demo', by: 1 }),
      addLog({ level: 'info', message: `Diagnostics pulse @ ${clock(Date.now())}` }),
    ])
  }
  finally {
    pulsing.value = false
  }
}

function clock(at: number) {
  return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}
</script>

<template>
  <div class="mc">
    <PageHeader
      tag="useConvexQueries · usePaginatedQuery · useMutation · connectionState"
      title="Mission Control"
      :live="true"
    >
      One screen, many live subscriptions. Everything below is wired to a real
      Convex deployment and updates the instant the backend changes — open a
      second tab and watch both consoles move together.
    </PageHeader>

    <!-- Telemetry banner -->
    <section
      class="telemetry"
      :class="{ off: !online }"
    >
      <div class="tele-main">
        <div class="tele-status">
          <SignalDot
            :tone="online ? 'ok' : 'err'"
            :pulse="online"
          />
          <div>
            <div class="tele-title">
              {{ online ? 'All systems nominal' : 'Link down' }}
            </div>
            <div class="tele-sub">
              ws://convex · {{ inflight }} inflight · counter {{ counterValue }}
            </div>
          </div>
        </div>
        <LabButton
          variant="signal"
          size="sm"
          :loading="pulsing"
          :disabled="!online"
          @click="runDiagnostics"
        >
          ◇ Run diagnostics pulse
        </LabButton>
      </div>
      <Oscilloscope
        :live="online"
        :tone="online ? 'signal' : 'err'"
        :height="64"
        :speed="5"
        :grid="false"
      />
    </section>

    <div class="grid">
      <!-- Counter gauge -->
      <LabPanel
        label="gauge"
        title="counter.get"
        tone="signal"
      >
        <div class="gauge">
          <div class="gauge-val tnum">
            {{ counterValue }}
          </div>
          <LabButton
            variant="ghost"
            size="sm"
            :disabled="!online"
            @click="increment({ name: 'demo', by: 1 })"
          >
            PING +1
          </LabButton>
        </div>
        <p class="hint">
          Optimistic <code>useMutation</code> — the gauge jumps before the server confirms.
        </p>
      </LabPanel>

      <!-- Tasks -->
      <LabPanel
        label="store"
        title="todos.list"
      >
        <div class="stat-row">
          <div class="stat">
            <span class="stat-n tnum">{{ todoStats.total }}</span><span class="stat-l">total</span>
          </div>
          <div class="stat">
            <span class="stat-n tnum ok">{{ todoStats.done }}</span><span class="stat-l">done</span>
          </div>
          <div class="stat">
            <span class="stat-n tnum">{{ todoStats.open }}</span><span class="stat-l">open</span>
          </div>
        </div>
        <form
          class="quick"
          @submit.prevent="addTodo"
        >
          <input
            v-model="newTodo"
            class="input"
            placeholder="Add a task…"
          >
          <LabButton
            variant="ghost"
            size="sm"
            type="submit"
          >
            Add
          </LabButton>
        </form>
        <ul class="mini-list">
          <li
            v-for="t in todos.slice(0, 4)"
            :key="t._id"
          >
            <button
              type="button"
              class="check"
              :class="{ on: t.completed }"
              :aria-pressed="t.completed"
              :aria-label="t.completed ? 'Mark task incomplete' : 'Mark task complete'"
              @click="toggleTodo({ id: t._id as any })"
            >
              {{ t.completed ? '✓' : '' }}
            </button>
            <span :class="{ done: t.completed }">{{ t.text }}</span>
          </li>
          <li
            v-if="todosReady && todos.length === 0"
            class="empty"
          >
            No tasks yet.
          </li>
        </ul>
      </LabPanel>

      <!-- Stream -->
      <LabPanel
        label="stream"
        title="messages.list"
        tone="signal"
      >
        <ul class="feed">
          <li
            v-for="m in recentMessages"
            :key="m._id"
          >
            <span class="feed-author">{{ m.author.split(/[\s@]+/)[0] }}</span>
            <span class="feed-text">{{ m.text }}</span>
            <time class="feed-time">{{ clock(m._creationTime) }}</time>
          </li>
          <li
            v-if="recentMessages.length === 0"
            class="empty"
          >
            No messages yet.
          </li>
        </ul>
        <form
          class="quick"
          @submit.prevent="broadcast"
        >
          <input
            v-model="newMessage"
            class="input"
            placeholder="Broadcast a message…"
          >
          <LabButton
            variant="ghost"
            size="sm"
            type="submit"
          >
            Send
          </LabButton>
        </form>
      </LabPanel>

      <!-- Activity -->
      <LabPanel
        label="trace"
        title="logs.listPaginated"
        tone="warn"
      >
        <ul class="activity">
          <li
            v-for="row in activityRows"
            :key="row._id"
            class="fade-up"
          >
            <span
              class="lbadge"
              :class="row.level"
            >{{ row.level }}</span>
            <span class="act-msg">{{ row.message }}</span>
            <time class="act-time">{{ clock(row._creationTime) }}</time>
          </li>
          <li
            v-if="activity.status === 'LoadingFirstPage'"
            class="empty"
          >
            <span class="spin" /> loading…
          </li>
          <li
            v-else-if="activityRows.length === 0"
            class="empty"
          >
            Quiet — no activity logged yet.
          </li>
        </ul>
        <div class="act-foot">
          <LabButton
            variant="ghost"
            size="sm"
            @click="addLog({ level: 'info', message: `Manual event @ ${clock(Date.now())}` })"
          >
            Emit event
          </LabButton>
          <LabButton
            variant="ghost"
            size="sm"
            :disabled="activity.status !== 'CanLoadMore'"
            @click="activity.loadMore(6)"
          >
            {{ activity.status === 'Exhausted' ? 'All loaded' : 'Load more' }}
          </LabButton>
        </div>
      </LabPanel>
    </div>
  </div>
</template>

<style scoped>
.mc { display: flex; flex-direction: column; gap: 1rem; }

/* Telemetry banner */
.telemetry {
  border: 1px solid color-mix(in srgb, var(--signal) 24%, var(--edge));
  border-radius: var(--radius-lg);
  background:
    radial-gradient(130% 160% at 100% 0%, var(--signal-dim), transparent 55%),
    var(--panel);
  overflow: hidden;
  box-shadow: var(--shadow-sm);
}
.telemetry.off { border-color: color-mix(in srgb, var(--err) 26%, var(--edge)); }
.tele-main {
  display: flex; align-items: center; justify-content: space-between;
  gap: 1rem; padding: 0.85rem 1rem 0.7rem;
}
.tele-status { display: flex; align-items: center; gap: 0.7rem; }
.tele-title { font-size: 0.95rem; font-weight: 600; color: var(--ink); }
.tele-sub { font-family: var(--mono); font-size: 0.68rem; color: var(--ink-dim); letter-spacing: 0.02em; }

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(270px, 1fr));
  gap: 1rem;
  align-items: start;
}

.hint { font-size: 0.74rem; color: var(--ink-dim); margin: 0.7rem 0 0; }
.hint code {
  font-family: var(--mono); font-size: 0.9em; color: var(--signal);
  background: var(--signal-dim); padding: 0.02rem 0.28rem; border-radius: 3px;
}

/* gauge */
.gauge { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
.gauge-val {
  font-family: var(--mono); font-size: 2.8rem; font-weight: 700;
  line-height: 1; color: var(--signal);
}

/* stat row */
.stat-row { display: flex; gap: 1.3rem; margin-bottom: 0.85rem; }
.stat { display: flex; flex-direction: column; line-height: 1.1; }
.stat-n { font-family: var(--mono); font-size: 1.5rem; font-weight: 700; color: var(--ink); }
.stat-n.ok { color: var(--ok); }
.stat-l { font-size: 0.64rem; text-transform: uppercase; letter-spacing: 0.12em; color: var(--ink-faint); font-family: var(--mono); }

/* quick add forms */
.quick { display: flex; gap: 0.5rem; margin-bottom: 0.7rem; }
.quick .input { font-size: 0.82rem; padding: 0.42rem 0.6rem; }

/* mini list (todos) */
.mini-list, .feed, .activity { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.4rem; }
.mini-list li { display: flex; align-items: center; gap: 0.55rem; font-size: 0.82rem; }
.check {
  width: 18px; height: 18px; flex-shrink: 0;
  border: 1px solid var(--edge-hi); border-radius: 4px;
  background: transparent; color: var(--on-signal); cursor: pointer;
  font-size: 0.7rem; line-height: 1; display: inline-flex; align-items: center; justify-content: center;
  transition: background var(--transition), border-color var(--transition), transform var(--press) var(--ease-out);
}
.check.on { background: var(--signal); border-color: var(--signal); }
.check:active { transform: scale(0.9); }
.mini-list .done { color: var(--ink-faint); text-decoration: line-through; }

/* messages feed */
.feed li { display: flex; align-items: baseline; gap: 0.5rem; font-size: 0.8rem; }
.feed-author { font-family: var(--mono); font-size: 0.7rem; color: var(--signal); flex-shrink: 0; }
.feed-text { color: var(--ink); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.feed-time { font-family: var(--mono); font-size: 0.62rem; color: var(--ink-faint); flex-shrink: 0; }

/* activity */
.activity li { display: grid; grid-template-columns: 44px 1fr auto; gap: 0.6rem; align-items: center; font-size: 0.76rem; }
.lbadge {
  font-family: var(--mono); font-size: 0.56rem; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.04em; padding: 0.12rem 0.3rem; border-radius: 3px; text-align: center;
}
.lbadge.info { color: var(--info); background: rgba(94, 200, 255, 0.13); }
.lbadge.warn { color: var(--warn); background: var(--warn-dim); }
.lbadge.error { color: var(--err); background: var(--err-dim); }
.act-msg { color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.act-time { font-family: var(--mono); font-size: 0.62rem; color: var(--ink-faint); }
.act-foot { display: flex; justify-content: space-between; gap: 0.5rem; margin-top: 0.8rem; }

.empty { color: var(--ink-dim); font-size: 0.8rem; display: flex; align-items: center; gap: 0.5rem; }

.spin {
  display: inline-block; width: 12px; height: 12px;
  border: 1.5px solid var(--edge); border-top-color: var(--signal);
  border-radius: 50%; animation: spin 0.7s linear infinite;
}
</style>
