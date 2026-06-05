<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Value } from 'convex/values'
import type { FunctionReference } from 'convex/server'
import { api } from '../../backend/_generated/api'

definePageMeta({ middleware: 'auth' })

const includeCounter = ref(true)
const includeTodos = ref(true)
const includeMessages = ref(true)

// The query map is reactive: toggling a source adds/removes the subscription.
const queryMap = computed(() => {
  const map: Record<string, { query: FunctionReference<'query'>, args: Record<string, Value> }> = {}
  if (includeCounter.value) map.counter = { query: api.counter.get, args: { name: 'demo' } }
  if (includeTodos.value) map.todos = { query: api.todos.list, args: {} }
  if (includeMessages.value) map.messages = { query: api.messages.list, args: {} }
  return map
})

const results = useConvexQueries(queryMap)

const sources = computed(() => {
  const list: Array<{ key: string, label: string, api: string }> = []
  if (includeCounter.value) list.push({ key: 'counter', label: 'Counter', api: 'counter.get' })
  if (includeTodos.value) list.push({ key: 'todos', label: 'Todos', api: 'todos.list' })
  if (includeMessages.value) list.push({ key: 'messages', label: 'Messages', api: 'messages.list' })
  return list
})

function statusOf(r: unknown): 'pending' | 'error' | 'success' {
  return r === undefined ? 'pending' : r instanceof Error ? 'error' : 'success'
}
function toneOf(r: unknown) {
  return statusOf(r) === 'success' ? 'ok' : statusOf(r) === 'error' ? 'err' : 'signal'
}
function summarize(key: string, r: unknown): string {
  if (r === undefined) return 'loading…'
  if (r instanceof Error) return r.message
  if (key === 'counter') return `value = ${(r as { value: number }).value}`
  if (Array.isArray(r)) return `${r.length} row${r.length === 1 ? '' : 's'}`
  return String(r)
}

const overview = computed(() =>
  Object.fromEntries(
    sources.value.map(s => [s.key, statusOf(results.value[s.key])]),
  ),
)
</script>

<template>
  <div>
    <PageHeader
      tag="useQueries · useConvexQueries"
      title="Multi-query subscriptions"
    >
      One reactive call subscribes to a whole map of queries and returns a record
      of results keyed the same way. Each entry resolves independently to a value,
      <code>undefined</code> (loading), or an <code>Error</code>. Toggle a source
      to watch the subscription set update live.
    </PageHeader>

    <div class="grid">
      <LabPanel
        label="control"
        title="Query map"
      >
        <div class="controls">
          <LabToggle
            v-model="includeCounter"
            label="counter.get"
            hint="{ name: 'demo' }"
          />
          <LabToggle
            v-model="includeTodos"
            label="todos.list"
            hint="{}"
          />
          <LabToggle
            v-model="includeMessages"
            label="messages.list"
            hint="{}"
          />
        </div>
        <StateReadout
          :value="overview"
          label="status by key"
          tone="signal"
        />
      </LabPanel>

      <LabPanel
        label="output"
        title="Results"
        tone="signal"
      >
        <div
          v-if="sources.length === 0"
          class="empty"
        >
          No queries selected — toggle one on.
        </div>
        <div
          v-else
          class="results"
        >
          <div
            v-for="s in sources"
            :key="s.key"
            class="rcard"
          >
            <div class="rcard-head">
              <code class="rcard-api">{{ s.api }}</code>
              <StatusPill :tone="toneOf(results[s.key])">
                {{ statusOf(results[s.key]) }}
              </StatusPill>
            </div>
            <div
              class="rcard-val mono"
              :class="{ err: statusOf(results[s.key]) === 'error' }"
            >
              {{ summarize(s.key, results[s.key]) }}
            </div>
          </div>
        </div>
      </LabPanel>
    </div>
  </div>
</template>

<style scoped>
.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  align-items: start;
}
.controls { display: flex; flex-direction: column; gap: 0.85rem; margin-bottom: 1rem; }

.results { display: flex; flex-direction: column; gap: 0.55rem; }
.rcard {
  border: 1px solid var(--edge);
  border-radius: var(--radius);
  background: var(--panel);
  padding: 0.65rem 0.75rem;
}
.rcard-head { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; margin-bottom: 0.4rem; }
.rcard-api { font-family: var(--mono); font-size: 0.74rem; color: var(--signal); }
.rcard-val { font-size: 0.82rem; color: var(--ink); word-break: break-word; }
.rcard-val.err { color: var(--err); }
.empty { padding: 1.5rem; text-align: center; color: var(--ink-dim); font-size: 0.85rem; }

code {
  font-family: var(--mono);
  font-size: 0.85em;
  color: var(--signal);
  background: var(--signal-dim);
  padding: 0.06rem 0.32rem;
  border-radius: 4px;
}

@media (max-width: 720px) { .grid { grid-template-columns: 1fr; } }
</style>
