<script setup lang="ts">
import { computed, ref } from 'vue'
import { api } from '#backend/api'

definePageMeta({ middleware: 'auth' })

// ── Auth preload → live subscription (the Todos surface) ──────────
const { data: preloadedTodos } = await useFetch('/api/todos.preload', { key: 'todos.preload' })
const todos = usePreloadedAuthQuery(preloadedTodos.value!)
const createTodo = useMutation(api.todos.create)
const toggleTodo = useMutation(api.todos.toggle)
const removeTodo = useMutation(api.todos.remove)
const newTodo = ref('')
const total = computed(() => (todos.value ?? []).length)
const done = computed(() => (todos.value ?? []).filter(t => t.completed).length)
async function addTodo() {
  if (!newTodo.value.trim()) return
  await createTodo({ text: newTodo.value.trim() })
  newTodo.value = ''
}

// ── Non-auth preload → usePreloadedQuery ──────────────────────────
const { data: preloaded } = await useFetch('/api/flaky.preload', { key: 'flaky.preload' })
const flaky = usePreloadedQuery(preloaded.value!)

// ── Server functions: backendAuth + fetchAuth* on Nitro ───────────
interface ServerRun {
  authenticated: boolean
  counterBefore: number
  counterAfter: number
  echo: { reversed: string, length: number, receivedAt: string }
  elapsedMs: number
  ranAt: string
}
const pending = ref(false)
const result = ref<ServerRun | null>(null)
const serverError = ref<string | null>(null)
async function run() {
  pending.value = true
  serverError.value = null
  try {
    result.value = await $fetch<ServerRun>('/api/server-demo', { method: 'POST' })
  }
  catch (cause) {
    serverError.value = cause instanceof Error ? cause.message : 'Server call failed'
  }
  finally {
    pending.value = false
  }
}
</script>

<template>
  <div class="stack">
    <PageHeader
      tag="preloadAuthQuery · usePreloadedQuery · backendAuth · fetchAuth*"
      title="SSR & preload"
    >
      Convex runs on the server too. Preload a query in a Nitro route, hydrate it
      with no loading flash, then keep it live on the client — for both public
      (<code>usePreloadedQuery</code>) and authenticated
      (<code>usePreloadedAuthQuery</code>) data. Or run functions entirely
      server-side via <code>backendAuth(event)</code>.
    </PageHeader>

    <LabPanel
      label="auth preload · live"
      title="todos.list"
      tone="accent"
    >
      <template #actions>
        <span class="mono stat"><b>{{ total }}</b> total · <b class="ok">{{ done }}</b> done</span>
      </template>
      <p
        class="hint"
        style="margin-bottom: 0.85rem"
      >
        Preloaded on the server with <code>preloadAuthQuery(api.todos.list)</code>,
        rendered correctly on first paint, then hydrated into a live per-user
        subscription. Mutations write straight through.
      </p>
      <form
        class="row"
        @submit.prevent="addTodo"
      >
        <input
          v-model="newTodo"
          class="input"
          placeholder="What needs doing?"
          maxlength="200"
          style="flex: 1"
        >
        <LabButton
          variant="signal"
          type="submit"
          :disabled="!newTodo.trim()"
        >
          Add
        </LabButton>
      </form>
      <ul
        v-if="(todos ?? []).length"
        class="todos"
      >
        <li
          v-for="todo in todos ?? []"
          :key="todo._id"
          :class="{ completed: todo.completed }"
        >
          <button
            type="button"
            class="check"
            :class="{ on: todo.completed }"
            :aria-pressed="todo.completed"
            :aria-label="todo.completed ? 'Mark incomplete' : 'Mark complete'"
            @click="toggleTodo({ id: todo._id })"
          >
            {{ todo.completed ? '✓' : '' }}
          </button>
          <span :class="{ doneitem: todo.completed }">{{ todo.text }}</span>
          <button
            type="button"
            class="remove"
            aria-label="Remove todo"
            @click="removeTodo({ id: todo._id })"
          >
            ×
          </button>
        </li>
      </ul>
      <p
        v-else-if="todos !== undefined"
        class="empty"
      >
        Nothing to do — add your first task.
      </p>
    </LabPanel>

    <div class="grid-2">
      <LabPanel
        label="control"
        title="POST /api/server-demo"
        tone="warn"
      >
        <p class="hint">
          One request runs four Convex calls on Nitro in sequence:
        </p>
        <ol class="steps">
          <li><code>fetchAuthQuery(counter.get)</code></li>
          <li><code>fetchAuthMutation(counter.increment)</code></li>
          <li><code>fetchAuthQuery(counter.get)</code> again</li>
          <li><code>fetchAuthAction(demo.echo)</code></li>
        </ol>
        <LabButton
          variant="signal"
          :loading="pending"
          @click="run"
        >
          {{ pending ? 'Running on server…' : 'Run on server' }}
        </LabButton>
        <div
          v-if="result"
          class="row"
          style="margin-top: 0.85rem"
        >
          <StatusRing tone="ok">
            authenticated
          </StatusRing>
          <span class="mono delta">counter {{ result.counterBefore }} → <b>{{ result.counterAfter }}</b></span>
        </div>
        <p
          v-if="serverError"
          class="err-text"
        >
          {{ serverError }}
        </p>
      </LabPanel>

      <LabPanel
        label="output"
        title="Server response"
        variant="well"
        aria-live="polite"
      >
        <StateReadout
          v-if="result"
          :value="result"
          tone="ok"
          label="$fetch('/api/server-demo')"
        />
        <p
          v-else
          class="hint"
        >
          Run the server demo to see the JSON it returns.
        </p>
      </LabPanel>
    </div>

    <LabPanel
      label="public preload"
      title="usePreloadedQuery"
    >
      <p
        class="hint"
        style="margin-bottom: 0.75rem"
      >
        The public <code>demo.flaky</code> query was run on the server with
        <code>preloadQuery</code> and handed to <code>usePreloadedQuery</code> —
        no first-paint flash, live thereafter.
      </p>
      <StateReadout
        :value="flaky"
        tone="accent"
        label="usePreloadedQuery(...).value"
      />
    </LabPanel>
  </div>
</template>

<style scoped>
.stat { font-size: 0.74rem; color: var(--ink-dim); }
.stat b { color: var(--ink); }
.stat b.ok { color: var(--ok); }

.todos { list-style: none; padding: 0; margin: 0.85rem 0 0; display: flex; flex-direction: column; gap: 0.4rem; }
.todos li { display: flex; align-items: center; gap: 0.6rem; padding: 0.5rem 0.65rem; border-radius: var(--r-sm); background: var(--surface); box-shadow: var(--raise-sm); }
.todos li.completed { opacity: 0.6; }
.check {
  width: 19px; height: 19px; flex-shrink: 0; border: 0; border-radius: 5px;
  background: var(--sink); box-shadow: var(--inset-sm); color: var(--on-accent); cursor: pointer;
  font-size: 0.7rem; line-height: 1; display: inline-flex; align-items: center; justify-content: center;
  transition: background var(--transition), box-shadow var(--transition);
}
.check.on { background: var(--accent); box-shadow: var(--raise-sm); }
.todos span { flex: 1; font-size: 0.86rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.doneitem { text-decoration: line-through; color: var(--ink-dim); }
.remove { width: 26px; height: 26px; border: 0; background: transparent; color: var(--ink-dim); cursor: pointer; font-size: 1.15rem; line-height: 1; border-radius: 6px; flex-shrink: 0; }
.remove:hover { color: var(--err); }
.empty { padding: 1.25rem 0; text-align: center; color: var(--ink-dim); font-size: 0.84rem; }

.steps { margin: 0 0 1rem; padding-left: 1.2rem; display: flex; flex-direction: column; gap: 0.3rem; }
.steps li { font-size: 0.8rem; color: var(--ink-dim); }
.steps code { font-family: var(--mono); font-size: 0.82em; color: var(--warn); }
.delta { font-size: 0.8rem; color: var(--ink-dim); }
.delta b { color: var(--ok); }
.err-text { color: var(--err); font-size: 0.82rem; margin: 0.75rem 0 0; word-break: break-word; }
</style>
