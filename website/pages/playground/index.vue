<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import type { Value } from 'convex/values'
import type { FunctionReference } from 'convex/server'
import { api } from '#backend/api'
import type { Id } from '#backend/dataModel'

definePageMeta({ middleware: 'auth' })

/**
 * Mission Control — the flagship surface. Instead of probing one composable, it
 * composes many: a map of live subscriptions (`useConvexQueries`), a paginated
 * activity feed (`usePaginatedQuery`), socket telemetry
 * (`useConvexConnectionState`), credits (`useCredits`) and coordinated optimistic
 * mutations — all reacting together in real time.
 */

// Mounted-gate connection-derived UI so SSR (always "offline") matches the
// client's first paint, then goes live.
const mounted = ref(false)
onMounted(() => (mounted.value = true))
const conn = useConvexConnectionState()
const online = computed(() => mounted.value && conn.value.isWebSocketConnected)
const inflight = computed(() => (conn.value.inflightMutations ?? 0) + (conn.value.inflightActions ?? 0))
const inflightHistory = ref<number[]>(Array.from({ length: 40 }, () => 0))
watch(conn, (s) => {
  const total = (s.inflightMutations ?? 0) + (s.inflightActions ?? 0) + (s.hasInflightRequests ? 1 : 0)
  inflightHistory.value = [...inflightHistory.value.slice(1), total]
}, { deep: true })

// One reactive map → many live subscriptions.
const queryMap = computed(() => ({
  counter: { query: api.counter.get as FunctionReference<'query'>, args: { name: 'demo' } as Record<string, Value> },
  todos: { query: api.todos.list as FunctionReference<'query'>, args: {} as Record<string, Value> },
  messages: { query: api.messages.list as FunctionReference<'query'>, args: {} as Record<string, Value> },
}))
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
const openTodos = computed(() => todos.value.filter(t => !t.completed).length)
const messages = computed(() => {
  const r = live.value.messages
  return Array.isArray(r) ? r as Array<{ _id: string, author: string, text: string, _creationTime: number }> : []
})
const recentMessages = computed(() => messages.value.slice(-5).reverse())

const credits = useCredits()

// Paginated activity feed.
const activity = usePaginatedQuery(api.logs.listPaginated, {}, { initialNumItems: 6 })
const activityRows = computed(() =>
  activity.value.results as Array<{ _id: string, level: 'info' | 'warn' | 'error', message: string, _creationTime: number }>)

// Mutations.
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

const pulsing = ref(false)
async function runDiagnostics() {
  pulsing.value = true
  try {
    await Promise.all([
      increment({ name: 'demo', by: 1 }),
      addLog({ level: 'info', message: `Diagnostics pulse @ ${clock(Date.now())}` }),
    ])
  }
  finally { pulsing.value = false }
}

function clock(at: number) {
  return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}
</script>

<template>
  <div class="stack">
    <PageHeader
      tag="useConvexQueries · usePaginatedQuery · useMutation · useCredits"
      title="Mission Control"
      :live="true"
    >
      One screen, many live subscriptions, wired to a real Convex deployment.
      Everything updates the instant the backend changes — open a second tab and
      watch both move together.
    </PageHeader>

    <!-- Telemetry banner -->
    <LabPanel
      :tone="online ? 'accent' : 'err'"
      :label="online ? 'telemetry · live' : 'telemetry · down'"
      :title="online ? 'All systems nominal' : 'Link down'"
    >
      <template #actions>
        <LabButton
          variant="signal"
          size="sm"
          :loading="pulsing"
          :disabled="!online"
          @click="runDiagnostics"
        >
          Run diagnostics pulse
        </LabButton>
      </template>
      <div class="tele">
        <div class="tele-meta">
          <StatusRing
            :tone="online ? 'ok' : 'err'"
            :pulse="online"
            size="sm"
          >
            ws://convex
          </StatusRing>
          <span class="mono tele-sub">{{ inflight }} inflight · counter {{ counterValue }}</span>
        </div>
        <LiveTrace
          :values="inflightHistory"
          :tone="online ? 'accent' : 'err'"
          :live="online"
          :height="56"
        />
      </div>
    </LabPanel>

    <!-- Live metrics -->
    <div class="grid-auto">
      <MetricCard
        label="counter"
        :value="counterValue"
        tone="accent"
        hint="optimistic useMutation"
      />
      <MetricCard
        label="open tasks"
        :value="todosReady ? openTodos : '—'"
        hint="todos.list"
      />
      <MetricCard
        label="messages"
        :value="messages.length"
        hint="messages.list"
      />
      <MetricCard
        label="credits"
        :value="credits.balance.value ?? '—'"
        tone="ok"
        hint="useCredits"
      />
    </div>

    <!-- Working tiles -->
    <div class="grid-auto tiles">
      <LabPanel
        label="store"
        title="Tasks"
      >
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
              :aria-label="t.completed ? 'Mark incomplete' : 'Mark complete'"
              @click="toggleTodo({ id: t._id as Id<'todos'> })"
            >
              {{ t.completed ? '✓' : '' }}
            </button>
            <span :class="{ done: t.completed }">{{ t.text }}</span>
          </li>
          <li
            v-if="todosReady && todos.length === 0"
            class="muted"
          >
            No tasks yet.
          </li>
        </ul>
      </LabPanel>

      <LabPanel
        label="stream"
        title="Broadcast"
        tone="accent"
      >
        <ul class="feed">
          <li
            v-for="m in recentMessages"
            :key="m._id"
          >
            <span class="feed-author">{{ m.author.split(/[\s@]+/)[0] }}</span>
            <span class="feed-text">{{ m.text }}</span>
          </li>
          <li
            v-if="recentMessages.length === 0"
            class="muted"
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
            placeholder="Broadcast…"
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

      <LabPanel
        label="trace"
        title="Activity"
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
          </li>
          <li
            v-if="activity.status === 'LoadingFirstPage'"
            class="muted"
          >
            loading…
          </li>
          <li
            v-else-if="activityRows.length === 0"
            class="muted"
          >
            Quiet — no activity yet.
          </li>
        </ul>
        <LabButton
          variant="ghost"
          size="sm"
          :disabled="activity.status !== 'CanLoadMore'"
          @click="activity.loadMore(6)"
        >
          {{ activity.status === 'Exhausted' ? 'All loaded' : 'Load more' }}
        </LabButton>
      </LabPanel>
    </div>

    <!-- Two pillars -->
    <div class="grid-2 pillars">
      <NuxtLink
        to="/playground/convex/queries"
        class="pillar"
      >
        <div class="pillar-icon">
          <Icon
            name="database"
            :size="20"
          />
        </div>
        <div class="pillar-body">
          <h3>Convex client</h3>
          <p>The reactive Vue/Nuxt port — queries, mutations, actions, pagination,
            storage, connection, SSR and the subscription primitive.</p>
        </div>
        <Icon
          name="external"
          :size="16"
          class="pillar-go"
        />
      </NuxtLink>

      <NuxtLink
        to="/playground/platform/account"
        class="pillar"
      >
        <div class="pillar-icon alt">
          <Icon
            name="bolt"
            :size="20"
          />
        </div>
        <div class="pillar-body">
          <h3>Backend platform</h3>
          <p>The batteries-included layer — auth, billing, feature gates, prepaid
            credits, email, durable workflows and rate limiting.</p>
        </div>
        <Icon
          name="external"
          :size="16"
          class="pillar-go"
        />
      </NuxtLink>
    </div>
  </div>
</template>

<style scoped>
.tele { display: flex; flex-direction: column; gap: 0.7rem; }
.tele-meta { display: flex; align-items: center; gap: 0.8rem; }
.tele-sub { font-size: 0.7rem; color: var(--ink-dim); }

.tiles { align-items: start; }
.quick { display: flex; gap: 0.5rem; margin-bottom: 0.7rem; }
.quick .input { font-size: 0.82rem; padding: 0.45rem 0.6rem; }

.mini-list, .feed, .activity { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.45rem; }
.mini-list li { display: flex; align-items: center; gap: 0.55rem; font-size: 0.82rem; }
.check {
  width: 18px; height: 18px; flex-shrink: 0; border: 0; border-radius: 5px;
  background: var(--sink); box-shadow: var(--inset-sm); color: var(--on-accent); cursor: pointer;
  font-size: 0.7rem; line-height: 1; display: inline-flex; align-items: center; justify-content: center;
  transition: background var(--transition), box-shadow var(--transition);
}
.check.on { background: var(--accent); box-shadow: var(--raise-sm); }
.mini-list .done { color: var(--ink-faint); text-decoration: line-through; }
.muted { color: var(--ink-faint); font-size: 0.8rem; }

.feed li { display: flex; align-items: baseline; gap: 0.5rem; font-size: 0.8rem; }
.feed-author { font-family: var(--mono); font-size: 0.7rem; color: var(--accent-soft); flex-shrink: 0; }
.feed-text { color: var(--ink); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.activity li { display: grid; grid-template-columns: 44px 1fr; gap: 0.6rem; align-items: center; font-size: 0.76rem; }
.lbadge { font-family: var(--mono); font-size: 0.54rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; padding: 0.14rem 0.3rem; border-radius: 4px; text-align: center; }
.lbadge.info { color: var(--info); background: var(--info-dim); }
.lbadge.warn { color: var(--warn); background: var(--warn-dim); }
.lbadge.error { color: var(--err); background: var(--err-dim); }
.act-msg { color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.pillars { margin-top: 0.25rem; }
.pillar {
  display: flex; align-items: center; gap: 1rem; padding: 1.1rem 1.2rem;
  border-radius: var(--r-lg); background: var(--surface); box-shadow: var(--raise);
  text-decoration: none; color: inherit;
  transition: box-shadow var(--transition), transform var(--press) var(--ease-out);
}
.pillar:hover { box-shadow: var(--raise-lg); }
.pillar:active { transform: translateY(1px); }
.pillar-icon {
  width: 42px; height: 42px; border-radius: 12px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  background: var(--accent); color: var(--on-accent); box-shadow: var(--raise-accent);
}
.pillar-icon.alt { background: var(--ink); }
.pillar-body { flex: 1; min-width: 0; }
.pillar-body h3 { margin: 0 0 0.2rem; font-family: var(--display); font-size: 1rem; font-weight: 600; }
.pillar-body p { margin: 0; font-size: 0.78rem; color: var(--ink-dim); line-height: 1.5; }
.pillar-go { color: var(--ink-faint); flex-shrink: 0; }
.pillar:hover .pillar-go { color: var(--accent); }
</style>
